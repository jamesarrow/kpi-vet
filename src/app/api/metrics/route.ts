import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type MetricKey = "return_rate" | "repeat_visit_rate" | "churn_rate";

function metricFromParam(v?: string): MetricKey {
  if (v === "repeat_visit_rate") return "repeat_visit_rate";
  if (v === "churn_rate") return "churn_rate";
  return "return_rate";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const reportId = searchParams.get("reportId") ?? undefined;
  const metricKey = metricFromParam(searchParams.get("metric") ?? undefined);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json({ error: "Нужны параметры year и month" }, { status: 400 });
  }

  const period = reportId
    ? await prisma.period.findFirst({
        where: { year, month, reportId },
        include: { report: true },
      })
    : await prisma.period.findFirst({
        where: { year, month },
        orderBy: { report: { uploadedAt: "desc" } },
        include: { report: true },
      });

  if (!period) {
    return NextResponse.json({ error: "Нет данных за этот период" }, { status: 404 });
  }

  const overall = await prisma.metricValue.findFirst({
    where: { periodId: period.id, metricKey, scopeType: "overall" },
    select: { value: true, numerator: true, denominator: true },
  });

  const categories = await prisma.metricValue.findMany({
    where: { periodId: period.id, metricKey, scopeType: "category" },
    include: { category: true },
    orderBy: { value: "desc" },
  });

  return NextResponse.json({
    period: {
      id: period.id,
      year: period.year,
      month: period.month,
      periodKey: period.periodKey,
      report: {
        id: period.report.id,
        filename: period.report.filename,
        uploadedAt: period.report.uploadedAt,
      },
    },
    metricKey,
    overall,
    categories: categories.map((r) => ({
      id: r.id,
      name: r.category?.name ?? "—",
      code: r.category?.code ?? null,
      numerator: r.numerator,
      denominator: r.denominator,
      value: r.value,
    })),
  });
}
