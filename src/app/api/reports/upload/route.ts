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
      return NextResponse.json({ error: "Файл не получен (ожидается поле file)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = sha256(buffer);

    const existing = await prisma.report.findUnique({ where: { fileHash } });
    if (existing) {
      return NextResponse.json({ reportId: existing.id, deduped: true });
    }

    const parsed = parseWorkbook(buffer);
    if (!parsed.length) {
      return NextResponse.json({ error: "Не удалось найти месяцы/данные в файле." }, { status: 400 });
    }

    const report = await prisma.report.create({
      data: { filename: file.name, fileHash },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      const periodMap = new Map<string, { id: string }>();

      const uniquePeriods = new Map<string, { year: number; month: number; periodKey: string }>();
      for (const row of parsed) {
        const key = `${row.year}-${row.month}`;
        if (!uniquePeriods.has(key)) {
          uniquePeriods.set(key, { year: row.year, month: row.month, periodKey: row.periodKey });
        }
      }

      for (const p of uniquePeriods.values()) {
        const created = await tx.period.create({
          data: {
            reportId: report.id,
            year: p.year,
            month: p.month,
            periodKey: p.periodKey,
          },
          select: { id: true },
        });
        periodMap.set(`${p.year}-${p.month}`, created);
      }

      const categoryIdByKey = new Map<string, string>();

      for (const row of parsed) {
        if (row.scopeType !== "category" || !row.category) continue;
        const key = `${row.category.code}|${row.category.name}`;
        if (categoryIdByKey.has(key)) continue;

        const cat = await tx.category.upsert({
          where: { code_name: { code: row.category.code, name: row.category.name } },
          update: {},
          create: { code: row.category.code, name: row.category.name },
          select: { id: true },
        });
        categoryIdByKey.set(key, cat.id);
      }

      for (const row of parsed) {
        const period = periodMap.get(`${row.year}-${row.month}`);
        if (!period) continue;

        const categoryId =
          row.scopeType === "category" && row.category
            ? categoryIdByKey.get(`${row.category.code}|${row.category.name}`) ?? null
            : null;

        await tx.metricValue.create({
          data: {
            periodId: period.id,
            scopeType: row.scopeType,
            categoryId,
            metricKey: "return_rate",
            numerator: row.repeatClients,
            denominator: row.allClients,
            value: row.value,
          },
        });
      }
    });

    return NextResponse.json({ reportId: report.id, deduped: false });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Неизвестная ошибка" },
      { status: 500 }
    );
  }
}
