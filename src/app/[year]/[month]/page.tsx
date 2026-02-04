import { prisma } from "@/lib/prisma";
import { PeriodReportClient } from "@/components/PeriodReportClient";
import { UploadExcel } from "@/components/UploadExcel";

type MetricKey = "return_rate" | "repeat_visit_rate" | "churn_rate";

function metricFromParam(v?: string): MetricKey {
  if (v === "repeat_visit_rate") return "repeat_visit_rate";
  if (v === "churn_rate") return "churn_rate";
  return "return_rate";
}

async function getSnapshotsForPeriod(year: number, month: number) {
  const periods = await prisma.period.findMany({
    where: { year, month },
    orderBy: { report: { uploadedAt: "desc" } },
    include: { report: true },
  });
  return periods.map((p) => ({
    id: p.reportId,
    uploadedAt: p.report.uploadedAt,
    filename: p.report.filename,
  }));
}

async function getPeriodForReport(year: number, month: number, reportId?: string) {
  if (reportId) {
    return prisma.period.findFirst({
      where: { year, month, reportId },
      select: { id: true, reportId: true },
    });
  }
  return prisma.period.findFirst({
    where: { year, month },
    orderBy: { report: { uploadedAt: "desc" } },
    select: { id: true, reportId: true },
  });
}

async function getAvailablePeriods() {
  const rows = await prisma.period.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
  });

  const byYear = new Map<number, Set<number>>();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, new Set());
    byYear.get(r.year)!.add(r.month);
  }

  return Array.from(byYear.entries())
    .map(([year, months]) => ({ year, months: Array.from(months.values()) }))
    .sort((a, b) => b.year - a.year);
}

export default async function PeriodReportPage({
  params,
  searchParams,
}: {
  params: { year: string; month: string };
  searchParams: { reportId?: string; metric?: string };
}) {
  const year = Number(params.year);
  const month = Number(params.month);
  const metricKey = metricFromParam(searchParams?.metric);

  const snapshotsRaw = await getSnapshotsForPeriod(year, month);
  const activeReportId = searchParams?.reportId ?? snapshotsRaw[0]?.id;
  const period = await getPeriodForReport(year, month, activeReportId);

  if (!period) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-lg font-medium">Нет данных за этот месяц</div>
          <div className="text-sm text-neutral-600 mt-1">Загрузи Excel — появятся снимки и отчёты.</div>
          <div className="mt-4">
            <UploadExcel />
          </div>
        </div>
      </div>
    );
  }

  const overall = await prisma.metricValue.findFirst({
    where: { periodId: period.id, metricKey, scopeType: "overall" },
    select: { value: true, numerator: true, denominator: true },
  });

  const categoryRows = await prisma.metricValue.findMany({
    where: { periodId: period.id, metricKey, scopeType: "category" },
    include: { category: true },
    orderBy: { value: "desc" },
  });

  const available = await getAvailablePeriods();

  const snapshots = snapshotsRaw.map((s) => ({
    reportId: s.id,
    label:
      new Date(s.uploadedAt).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) + ` • ${s.filename}`,
  }));

  return (
    <PeriodReportClient
      year={year}
      month={month}
      metricKey={metricKey}
      currentReportId={activeReportId}
      snapshots={snapshots}
      overall={overall ? { value: overall.value, numerator: overall.numerator, denominator: overall.denominator } : null}
      categories={categoryRows.map((r) => ({
        id: r.id,
        name: r.category?.name ?? "—",
        code: r.category?.code ?? null,
        numerator: r.numerator,
        denominator: r.denominator,
        value: r.value,
      }))}
      available={available}
    />
  );
}
