import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWorkbook } from "@/lib/excelParser";
import { sha256 } from "@/lib/hash";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Файл не получен (ожидается поле file)." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = sha256(buffer);

    // дедуп: если уже загружали этот же файл — вернём существующий снимок
    const existing = await prisma.report.findUnique({ where: { fileHash } });
    if (existing) {
      return NextResponse.json({ reportId: existing.id, deduped: true });
    }

    const parsed = parseWorkbook(buffer);
    if (!parsed.length) {
      return NextResponse.json(
        { error: "Не удалось найти месяцы/данные в файле." },
        { status: 400 }
      );
    }

    // 1) создаём снимок
    const report = await prisma.report.create({
      data: { filename: file.name, fileHash },
      select: { id: true },
    });

    // 2) собираем уникальные периоды и категории
    const periodsMap = new Map<string, { year: number; month: number; periodKey: string }>();
    const categoriesMap = new Map<string, { code: number; name: string }>();

    for (const row of parsed) {
      periodsMap.set(`${row.year}-${row.month}`, {
        year: row.year,
        month: row.month,
        periodKey: row.periodKey,
      });

      if (row.scopeType === "category" && row.category) {
        categoriesMap.set(`${row.category.code}|${row.category.name}`, {
          code: row.category.code,
          name: row.category.name,
        });
      }
    }

    const periods = Array.from(periodsMap.values());
    const categories = Array.from(categoriesMap.values());

    // 3) вставляем периоды пачкой
    await prisma.period.createMany({
      data: periods.map((p) => ({
        reportId: report.id,
        year: p.year,
        month: p.month,
        periodKey: p.periodKey,
      })),
    });

    // 4) вставляем категории пачкой (если есть)
    if (categories.length) {
      await prisma.category.createMany({
        data: categories.map((c) => ({ code: c.code, name: c.name })),
        skipDuplicates: true,
      });
    }

    // 5) получаем id периодов и категорий (для связей)
    const dbPeriods = await prisma.period.findMany({
      where: { reportId: report.id },
      select: { id: true, year: true, month: true },
    });

    const periodIdByKey = new Map<string, string>();
    for (const p of dbPeriods) periodIdByKey.set(`${p.year}-${p.month}`, p.id);

    let categoryIdByKey = new Map<string, string>();
    if (categories.length) {
      const codes = Array.from(new Set(categories.map((c) => c.code)));
      const dbCategories = await prisma.category.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true, name: true },
      });
      categoryIdByKey = new Map(dbCategories.map((c) => [`${c.code}|${c.name}`, c.id]));
    }

    // 6) вставляем метрики пачкой
    const metricValues = parsed
      .map((row) => {
        const periodId = periodIdByKey.get(`${row.year}-${row.month}`);
        if (!periodId) return null;

        const categoryId =
          row.scopeType === "category" && row.category
            ? categoryIdByKey.get(`${row.category.code}|${row.category.name}`) ?? null
            : null;

        return {
          periodId,
          scopeType: row.scopeType,
          categoryId,
          metricKey: "return_rate" as const,
          numerator: row.repeatClients,
          denominator: row.allClients,
          value: row.value,
        };
      })
      .filter(Boolean) as any[];

    if (!metricValues.length) {
      return NextResponse.json(
        { error: "Данные распарсились, но не удалось сформировать метрики." },
        { status: 400 }
      );
    }

    await prisma.metricValue.createMany({
      data: metricValues,
    });

    return NextResponse.json({ reportId: report.id, deduped: false });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Неизвестная ошибка" },
      { status: 500 }
    );
  }
}
