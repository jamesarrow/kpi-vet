import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWorkbook } from "@/lib/excelParser";
import { sha256 } from "@/lib/hash";

export const runtime = "nodejs";

type MetricKey = "return_rate" | "repeat_visit_rate" | "churn_rate";

function repeatVisitValue(newClients: number, continueClients: number) {
  const denom = newClients;
  const numer = newClients + continueClients;
  const value = denom > 0 ? numer / denom : 0; // коэффициент
  return { numerator: numer, denominator: denom, value };
}

function churnValue(prevRepeat: number, currRepeat: number) {
  const denom = prevRepeat;
  const numer = prevRepeat - currRepeat; // ушло (может быть отрицательным, если выросло)
  const value = denom > 0 ? (numer / denom) * 100 : 0; // процент
  return { numerator: numer, denominator: denom, value };
}

function buildChurnRows(
  parsed: any[],
  periodIdByYm: Map<string, string>,
  catIdByKey: Map<string, string>
) {
  const periods = [...periodIdByYm.entries()]
    .map(([ym, periodId]) => {
      const [y, m] = ym.split("-").map((x) => Number(x));
      return { ym, year: y, month: m, periodId };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);

  const overallCounts = new Map<string, number>();
  const catCounts = new Map<string, Map<string, number>>();

  for (const r of parsed) {
    const ym = `${r.year}-${r.month}`;
    if (r.scopeType === "overall") {
      overallCounts.set(ym, Number(r.repeatClients ?? 0));
      continue;
    }
    if (r.scopeType === "category" && r.category) {
      const key = `${r.category.code}|${r.category.name}`;
      if (!catCounts.has(key)) catCounts.set(key, new Map());
      catCounts.get(key)!.set(ym, Number(r.repeatClients ?? 0));
    }
  }

  const rows: Array<{
    periodId: string;
    scopeType: "overall" | "category";
    categoryId: string | null;
    metricKey: MetricKey;
    numerator: number;
    denominator: number;
    value: number;
  }> = [];

  // overall
  for (let i = 1; i < periods.length; i++) {
    const prev = overallCounts.get(periods[i - 1].ym) ?? 0;
    const curr = overallCounts.get(periods[i].ym) ?? 0;
    if (prev <= 0) continue;

    const { numerator, denominator, value } = churnValue(prev, curr);
    rows.push({
      periodId: periods[i].periodId,
      scopeType: "overall",
      categoryId: null,
      metricKey: "churn_rate",
      numerator,
      denominator,
      value,
    });
  }

  // categories
  for (const [catKey, counts] of catCounts.entries()) {
    const categoryId = catIdByKey.get(catKey);
    if (!categoryId) continue;

    for (let i = 1; i < periods.length; i++) {
      const prev = counts.get(periods[i - 1].ym) ?? 0;
      const curr = counts.get(periods[i].ym) ?? 0;
      if (prev <= 0) continue;

      const { numerator, denominator, value } = churnValue(prev, curr);
      rows.push({
        periodId: periods[i].periodId,
        scopeType: "category",
        categoryId,
        metricKey: "churn_rate",
        numerator,
        denominator,
        value,
      });
    }
  }

  return rows;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не получен (ожидается поле file)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = sha256(buffer);

    const parsed = parseWorkbook(buffer);
    if (!parsed.length) {
      return NextResponse.json({ error: "Не удалось найти месяцы/данные в файле." }, { status: 400 });
    }

    const wantedMetrics: MetricKey[] = ["return_rate", "repeat_visit_rate", "churn_rate"];

    const existing = await prisma.report.findUnique({ where: { fileHash } });

    // Если файл уже есть, но после апдейта кода добавились новые метрики — дописываем их в существующий снимок.
    if (existing) {
      // Если снимок битый (без периодов) — удаляем и импортируем заново
      const hasAnyPeriod = await prisma.period.findFirst({ where: { reportId: existing.id }, select: { id: true } });
      if (!hasAnyPeriod) {
        await prisma.report.delete({ where: { id: existing.id } });
      } else {
        const presentMetric = new Set<MetricKey>();
        for (const mk of wantedMetrics) {
          const any = await prisma.metricValue.findFirst({
            where: { metricKey: mk, period: { reportId: existing.id } },
            select: { id: true },
          });
          if (any) presentMetric.add(mk);
        }

        const missing = wantedMetrics.filter((m) => !presentMetric.has(m));
        if (missing.length === 0) {
          return NextResponse.json({ reportId: existing.id, deduped: true });
        }

        await prisma.$transaction(async (tx) => {
          // 1) Периоды (на всякий случай — если раньше что-то не записалось)
          const uniquePeriods = new Map<string, { year: number; month: number; periodKey: string }>();
          for (const row of parsed) {
            const key = `${row.year}-${row.month}`;
            if (!uniquePeriods.has(key)) uniquePeriods.set(key, { year: row.year, month: row.month, periodKey: row.periodKey });
          }

          await tx.period.createMany({
            data: Array.from(uniquePeriods.values()).map((p) => ({
              reportId: existing.id,
              year: p.year,
              month: p.month,
              periodKey: p.periodKey,
            })),
            skipDuplicates: true,
          });

          const periods = await tx.period.findMany({ where: { reportId: existing.id }, select: { id: true, year: true, month: true } });
          const periodIdByYm = new Map(periods.map((p) => [`${p.year}-${p.month}`, p.id] as const));

          // 2) Категории
          const uniqueCats = new Map<string, { code: number; name: string }>();
          for (const row of parsed) {
            if (row.scopeType !== "category" || !row.category) continue;
            const key = `${row.category.code}|${row.category.name}`;
            if (!uniqueCats.has(key)) uniqueCats.set(key, { code: row.category.code, name: row.category.name });
          }

          if (uniqueCats.size > 0) {
            await tx.category.createMany({
              data: Array.from(uniqueCats.values()),
              skipDuplicates: true,
            });
          }

          const cats = await tx.category.findMany({ select: { id: true, code: true, name: true } });
          const catIdByKey = new Map(cats.map((c) => [`${c.code}|${c.name}`, c.id] as const));

          // 3) Метрики (только недостающие)
          const metricRows: Array<any> = [];
          for (const row of parsed) {
            const periodId = periodIdByYm.get(`${row.year}-${row.month}`);
            if (!periodId) continue;

            const categoryId =
              row.scopeType === "category" && row.category
                ? catIdByKey.get(`${row.category.code}|${row.category.name}`) ?? null
                : null;

            if (missing.includes("return_rate")) {
              metricRows.push({
                periodId,
                scopeType: row.scopeType,
                categoryId,
                metricKey: "return_rate" as const,
                numerator: row.repeatClients,
                denominator: row.allClients,
                value: row.returnRateValue,
              });
            }

            if (missing.includes("repeat_visit_rate")) {
              const rvr = repeatVisitValue(row.newClients, row.continueClients);
              metricRows.push({
                periodId,
                scopeType: row.scopeType,
                categoryId,
                metricKey: "repeat_visit_rate" as const,
                numerator: rvr.numerator,
                denominator: rvr.denominator,
                value: rvr.value,
              });
            }
          }

          const churnRows = missing.includes("churn_rate")
            ? buildChurnRows(parsed as any[], periodIdByYm, catIdByKey)
            : [];

          const rowsToInsert = [...metricRows, ...churnRows];
          if (rowsToInsert.length > 0) {
            await tx.metricValue.createMany({ data: rowsToInsert, skipDuplicates: true });
          }
        });

        return NextResponse.json({ reportId: existing.id, deduped: false, updated: true });
      }
    }

    // Новый снимок (хэш не найден)
    const report = await prisma.report.create({
      data: { filename: file.name, fileHash },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      // 1) Периоды
      const uniquePeriods = new Map<string, { year: number; month: number; periodKey: string }>();
      for (const row of parsed) {
        const key = `${row.year}-${row.month}`;
        if (!uniquePeriods.has(key)) uniquePeriods.set(key, { year: row.year, month: row.month, periodKey: row.periodKey });
      }

      await tx.period.createMany({
        data: Array.from(uniquePeriods.values()).map((p) => ({
          reportId: report.id,
          year: p.year,
          month: p.month,
          periodKey: p.periodKey,
        })),
      });

      const periods = await tx.period.findMany({ where: { reportId: report.id }, select: { id: true, year: true, month: true } });
      const periodIdByYm = new Map(periods.map((p) => [`${p.year}-${p.month}`, p.id] as const));

      // 2) Категории
      const uniqueCats = new Map<string, { code: number; name: string }>();
      for (const row of parsed) {
        if (row.scopeType !== "category" || !row.category) continue;
        const key = `${row.category.code}|${row.category.name}`;
        if (!uniqueCats.has(key)) uniqueCats.set(key, { code: row.category.code, name: row.category.name });
      }

      if (uniqueCats.size > 0) {
        await tx.category.createMany({
          data: Array.from(uniqueCats.values()),
          skipDuplicates: true,
        });
      }

      const cats = await tx.category.findMany({ select: { id: true, code: true, name: true } });
      const catIdByKey = new Map(cats.map((c) => [`${c.code}|${c.name}`, c.id] as const));

      // 3) Метрики
      const metricRows: Array<any> = [];
      for (const row of parsed) {
        const periodId = periodIdByYm.get(`${row.year}-${row.month}`);
        if (!periodId) continue;

        const categoryId =
          row.scopeType === "category" && row.category
            ? catIdByKey.get(`${row.category.code}|${row.category.name}`) ?? null
            : null;

        // Возвращаемость (%)
        metricRows.push({
          periodId,
          scopeType: row.scopeType,
          categoryId,
          metricKey: "return_rate" as const,
          numerator: row.repeatClients,
          denominator: row.allClients,
          value: row.returnRateValue,
        });

        // Частота повторных визитов (коэффициент)
        const rvr = repeatVisitValue(row.newClients, row.continueClients);
        metricRows.push({
          periodId,
          scopeType: row.scopeType,
          categoryId,
          metricKey: "repeat_visit_rate" as const,
          numerator: rvr.numerator,
          denominator: rvr.denominator,
          value: rvr.value,
        });
      }

      // Churn (отток постоянных клиентов)
      metricRows.push(...buildChurnRows(parsed as any[], periodIdByYm, catIdByKey));

      await tx.metricValue.createMany({ data: metricRows });
    });

    return NextResponse.json({ reportId: report.id, deduped: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Неизвестная ошибка" }, { status: 500 });
  }
}
