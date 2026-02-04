import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWorkbook } from "@/lib/excelParser";
import { sha256 } from "@/lib/hash";
import { revalidatePath, revalidateTag } from "next/cache";

export const runtime = "nodejs";

type MetricKey = "return_rate" | "repeat_visit_rate" | "churn_rate";

type ParsedRow = ReturnType<typeof parseWorkbook>[number];

type Db = typeof prisma;

type Tx = Parameters<typeof prisma.$transaction>[0] extends (...args: any) => any ? any : any;

function repeatVisitValue(newClients: number, continueClients: number) {
  const denom = newClients;
  const numer = newClients + continueClients;
  const value = denom > 0 ? numer / denom : 0; // коэффициент
  return { numerator: numer, denominator: denom, value };
}

function prevYm(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function scopeKey(row: ParsedRow) {
  if (row.scopeType === "overall") return "overall";
  if (!row.category) return "cat:unknown";
  return `cat:${row.category.code}|${row.category.name}`;
}

function buildRepeatIndex(rows: ParsedRow[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(`${r.year}-${r.month}|${scopeKey(r)}`, r.repeatClients);
  }
  return m;
}

function churnValue(prevRepeat: number | null | undefined, currRepeat: number) {
  const denom = prevRepeat ?? 0;
  if (denom <= 0) return null;
  const numer = Math.max(0, denom - currRepeat);
  const value = (numer / denom) * 100;
  return { numerator: numer, denominator: denom, value };
}

function invalidate(periods: Array<{ year: number; month: number }>) {
  // Тэги
  revalidateTag("nav");
  revalidateTag("home");
  revalidateTag("reports");
  revalidateTag("metrics");
  revalidateTag("periods");

  // Пути
  revalidatePath("/");
  revalidatePath("/reports");
  for (const p of periods) {
    revalidatePath(`/${p.year}/${p.month}`);
  }
}

async function upsertReportData(db: any, opts: {
  reportId: string;
  parsed: ParsedRow[];
  wantedMetrics: MetricKey[];
  missingOnly?: MetricKey[] | null;
}) {
  const { reportId, parsed, wantedMetrics, missingOnly } = opts;
  const metricsToWrite = missingOnly && missingOnly.length ? missingOnly : wantedMetrics;

  const uniquePeriods = new Map<string, { year: number; month: number; periodKey: string }>();
  for (const row of parsed) {
    const key = `${row.year}-${row.month}`;
    if (!uniquePeriods.has(key)) uniquePeriods.set(key, { year: row.year, month: row.month, periodKey: row.periodKey });
  }

  await db.period.createMany({
    data: Array.from(uniquePeriods.values()).map((p) => ({
      reportId,
      year: p.year,
      month: p.month,
      periodKey: p.periodKey,
    })),
    skipDuplicates: true,
  });

  const periods = await db.period.findMany({
    where: { reportId },
    select: { id: true, year: true, month: true },
  });
  const periodIdByYm = new Map(periods.map((p: any) => [`${p.year}-${p.month}`, p.id] as const));

  // Категории
  const uniqueCats = new Map<string, { code: number; name: string }>();
  for (const row of parsed) {
    if (row.scopeType !== "category" || !row.category) continue;
    const key = `${row.category.code}|${row.category.name}`;
    if (!uniqueCats.has(key)) uniqueCats.set(key, { code: row.category.code, name: row.category.name });
  }

  if (uniqueCats.size > 0) {
    await db.category.createMany({ data: Array.from(uniqueCats.values()), skipDuplicates: true });
  }

  const cats = await db.category.findMany({ select: { id: true, code: true, name: true } });
  const catIdByKey = new Map(cats.map((c: any) => [`${c.code}|${c.name}`, c.id] as const));

  const repeatIndex = buildRepeatIndex(parsed);

  const metricRows: Array<any> = [];

  for (const row of parsed) {
    const periodId = periodIdByYm.get(`${row.year}-${row.month}`);
    if (!periodId) continue;

    const categoryId =
      row.scopeType === "category" && row.category
        ? catIdByKey.get(`${row.category.code}|${row.category.name}`) ?? null
        : null;

    // Возвращаемость (%): КЛ. Повторные / КЛ.Все Записанные × 100
    if (metricsToWrite.includes("return_rate")) {
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

    // Частота повторных визитов: (Новые + Продолжение) / Новые
    if (metricsToWrite.includes("repeat_visit_rate")) {
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

    // Доля ушедших клиентов (%):
    // (Постоянные прошлый месяц − Постоянные текущий месяц) / Постоянные прошлый месяц × 100
    // где "Постоянные" = КЛ. Повторные.
    if (metricsToWrite.includes("churn_rate")) {
      const prev = prevYm(row.year, row.month);
      const prevRepeat = repeatIndex.get(`${prev.year}-${prev.month}|${scopeKey(row)}`);
      const churn = churnValue(prevRepeat, row.repeatClients);
      if (churn) {
        metricRows.push({
          periodId,
          scopeType: row.scopeType,
          categoryId,
          metricKey: "churn_rate" as const,
          numerator: churn.numerator,
          denominator: churn.denominator,
          value: churn.value,
        });
      }
    }
  }

  if (metricRows.length > 0) {
    await db.metricValue.createMany({ data: metricRows, skipDuplicates: true });
  }

  return Array.from(uniquePeriods.values()).map((p) => ({ year: p.year, month: p.month }));
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

    // Если файл уже был загружен — дописываем недостающие метрики (после обновлений кода).
    if (existing) {
      const hasAnyPeriod = await prisma.period.findFirst({ where: { reportId: existing.id }, select: { id: true } });

      // Если снимок битый (без периодов) — удаляем и импортируем заново
      if (!hasAnyPeriod) {
        await prisma.report.delete({ where: { id: existing.id } });
      } else {
        const present = new Set<MetricKey>();
        for (const mk of wantedMetrics) {
          const any = await prisma.metricValue.findFirst({
            where: { metricKey: mk, period: { reportId: existing.id } },
            select: { id: true },
          });
          if (any) present.add(mk);
        }

        const missing = wantedMetrics.filter((m) => !present.has(m));
        const touchedPeriods = Array.from(
          new Map(parsed.map((r) => [`${r.year}-${r.month}`, { year: r.year, month: r.month }] as const)).values()
        );

        if (missing.length === 0) {
          invalidate(touchedPeriods);
          return NextResponse.json({ reportId: existing.id, deduped: true });
        }

        const periods = await prisma.$transaction(async (tx) => {
          return upsertReportData(tx, { reportId: existing.id, parsed, wantedMetrics, missingOnly: missing });
        });

        invalidate(periods);
        return NextResponse.json({ reportId: existing.id, deduped: false, updated: true });
      }
    }

    // Новый снимок (хэш не найден)
    const report = await prisma.report.create({
      data: { filename: file.name, fileHash },
      select: { id: true },
    });

    const periods = await prisma.$transaction(async (tx) => {
      return upsertReportData(tx, { reportId: report.id, parsed, wantedMetrics });
    });

    invalidate(periods);

    return NextResponse.json({ reportId: report.id, deduped: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Неизвестная ошибка" }, { status: 500 });
  }
}
