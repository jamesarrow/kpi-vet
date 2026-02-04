import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type MetricKey = "return_rate" | "repeat_visit_rate" | "churn_rate";

function metricFromParam(v?: string | null): MetricKey {
  if (v === "repeat_visit_rate") return "repeat_visit_rate";
  if (v === "churn_rate") return "churn_rate";
  return "return_rate";
}

const getMetricsPayloadCached = unstable_cache(
  async (year: number, month: number, reportId: string | null, metricKey: MetricKey) => {
    const period = reportId
      ? await prisma.period.findFirst({ where: { year, month, reportId }, select: { id: true } })
      : await prisma.period.findFirst({ where: { year, month }, orderBy: { report: { uploadedAt: "desc" } }, select: { id: true } });

    if (!period) {
      return { overall: null, categories: [] as any[] };
    }

    const [overall, rows] = await Promise.all([
      prisma.metricValue.findFirst({
        where: { periodId: period.id, metricKey, scopeType: "overall" },
        select: { value: true, numerator: true, denominator: true },
      }),
      prisma.metricValue.findMany({
        where: { periodId: period.id, metricKey, scopeType: "category" },
        include: { category: true },
        orderBy: { value: "desc" },
      }),
    ]);

    return {
      overall: overall ? { value: overall.value, numerator: overall.numerator, denominator: overall.denominator } : null,
      categories: rows.map((r) => ({
        id: r.id,
        name: r.category?.name ?? "—",
        code: r.category?.code ?? null,
        numerator: r.numerator,
        denominator: r.denominator,
        value: r.value,
      })),
    };
  },
  ["metrics-payload"],
  { revalidate: 3600, tags: ["metrics", "periods", "nav"] }
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const reportId = searchParams.get("reportId");
  const metricKey = metricFromParam(searchParams.get("metric"));

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Неверные параметры year/month" }, { status: 400 });
  }

  const payload = await getMetricsPayloadCached(year, month, reportId, metricKey);

  return NextResponse.json(payload, {
    headers: {
      // Ускоряем повторные открытия и сравнения на Vercel.
      "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
    },
  });
}
