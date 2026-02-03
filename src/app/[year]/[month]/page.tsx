import { prisma } from "@/lib/prisma";
import { SnapshotPicker } from "@/components/SnapshotPicker";
import { UploadExcel } from "@/components/UploadExcel";

type MetricKey = "return_rate" | "repeat_visit_rate" | "churn_rate";

function metricFromParam(v?: string): MetricKey {
  if (v === "repeat_visit_rate") return "repeat_visit_rate";
  if (v === "churn_rate") return "churn_rate";
  return "return_rate";
}

function meta(metricKey: MetricKey) {
  if (metricKey === "repeat_visit_rate") {
    return {
      title: "Отчёт по частоте повторных визитов",
      tabLabel: "Частота повторных визитов",
      formula:
        "(КЛ. Новые Записанные + КЛ. Продолжение Записанные) / КЛ. Новые Записанные",
      formatMain: (v: number) => `${v.toFixed(2)}×`,
    };
  }

  return {
    title: "Отчёт по возвращаемости",
    tabLabel: "Возвращаемость",
    formula: "КЛ. Повторные / КЛ.Все Записанные × 100%",
    formatMain: (v: number) => `${v.toFixed(2)}%`,
  };
}

async function getSnapshotsForPeriod(year: number, month: number) {
  const periods = await prisma.period.findMany({
    where: { year, month },
    orderBy: { report: { uploadedAt: "desc" } },
    include: { report: true },
  });
  return periods.map((p) => ({ id: p.reportId, uploadedAt: p.report.uploadedAt, filename: p.report.filename }));
}

async function getPeriodForReport(year: number, month: number, reportId?: string) {
  if (reportId) {
    return prisma.period.findFirst({ where: { year, month, reportId }, select: { id: true, reportId: true } });
  }
  return prisma.period.findFirst({
    where: { year, month },
    orderBy: { report: { uploadedAt: "desc" } },
    select: { id: true, reportId: true },
  });
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
  const m = meta(metricKey);

  const snapshots = await getSnapshotsForPeriod(year, month);
  const activeReportId = searchParams?.reportId ?? snapshots[0]?.id;
  const period = await getPeriodForReport(year, month, activeReportId);

  const tabWrap = "inline-flex rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 p-1";
  const tabBase = "px-3 py-2 text-sm rounded-lg transition";

  function tabHref(key: MetricKey) {
    const qs = new URLSearchParams();
    if (activeReportId) qs.set("reportId", activeReportId);
    if (key !== "return_rate") qs.set("metric", key);
    const s = qs.toString();
    return `/${year}/${month}${s ? `?${s}` : ""}`;
  }

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className={tabWrap}>
            <a
              href={tabHref("return_rate")}
              className={
                tabBase +
                (metricKey === "return_rate"
                  ? " bg-indigo-600 text-white shadow"
                  : " text-neutral-700 hover:bg-neutral-50")
              }
            >
              Возвращаемость
            </a>
            <a
              href={tabHref("repeat_visit_rate")}
              className={
                tabBase +
                (metricKey === "repeat_visit_rate"
                  ? " bg-indigo-600 text-white shadow"
                  : " text-neutral-700 hover:bg-neutral-50")
              }
            >
              Частота повторных визитов
            </a>
            <span
              className={tabBase + " text-neutral-400 cursor-not-allowed select-none"}
              title="Сделаем на следующем этапе"
            >
              Churn Rate (скоро)
            </span>
          </div>

          <a href="/" className="text-sm text-neutral-600 hover:text-neutral-900 hover:underline">
            ← На главную
          </a>
          <h1 className="text-3xl font-semibold tracking-tight">
            {m.title} • M{month}.{year}
          </h1>
          <div className="text-sm text-neutral-600">
            Формула: <span className="font-medium">{m.formula}</span>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <SnapshotPicker
            year={year}
            month={month}
            currentReportId={activeReportId}
            options={snapshots.map((s) => ({
              reportId: s.id,
              label:
                new Date(s.uploadedAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }) + ` • ${s.filename}`,
            }))}
          />
          <UploadExcel compact />
        </div>
      </div>

      {!overall ? (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-lg font-medium">По этой метрике данных в снимке пока нет</div>
          <div className="text-sm text-neutral-600 mt-1">
            Загрузите Excel ещё раз (можно тот же файл) — сервис допишет недостающие метрики в текущий снимок.
          </div>
        </div>
      ) : metricKey === "repeat_visit_rate" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-indigo-100">
            <div className="text-sm text-neutral-500">Частота повторных визитов</div>
            <div className="mt-1 text-3xl font-semibold text-indigo-700">{m.formatMain(overall.value)}</div>
            <div className="mt-2 text-sm text-neutral-600">
              Всего визитов (нов+продолж): <span className="font-medium">{Math.round(overall.numerator)}</span>
              {" • "}
              Новые: <span className="font-medium">{Math.round(overall.denominator)}</span>
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-neutral-500">КЛ. Новые Записанные</div>
            <div className="mt-1 text-3xl font-semibold">{Math.round(overall.denominator)}</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-neutral-500">КЛ. Продолжение Записанные</div>
            <div className="mt-1 text-3xl font-semibold">
              {Math.max(0, Math.round(overall.numerator - overall.denominator))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-indigo-100">
            <div className="text-sm text-neutral-500">Возвращаемость</div>
            <div className="mt-1 text-3xl font-semibold text-indigo-700">{m.formatMain(overall.value)}</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-neutral-500">КЛ.Все Записанные</div>
            <div className="mt-1 text-3xl font-semibold">{Math.round(overall.denominator)}</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-neutral-500">КЛ. Повторные</div>
            <div className="mt-1 text-3xl font-semibold">{Math.round(overall.numerator)}</div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-neutral-50">
          <div className="font-medium">Разбивка по специализациям</div>
          <div className="text-xs text-neutral-500 mt-0.5">Сортировка по убыванию значения метрики.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-neutral-600">
              {metricKey === "repeat_visit_rate" ? (
                <tr className="border-b bg-white">
                  <th className="py-3 px-4 font-medium">Специализация</th>
                  <th className="py-3 px-4 font-medium">Новые</th>
                  <th className="py-3 px-4 font-medium">Продолжение</th>
                  <th className="py-3 px-4 font-medium">Всего (нов+продолж)</th>
                  <th className="py-3 px-4 font-medium">Частота</th>
                </tr>
              ) : (
                <tr className="border-b bg-white">
                  <th className="py-3 px-4 font-medium">Специализация</th>
                  <th className="py-3 px-4 font-medium">Все записанные</th>
                  <th className="py-3 px-4 font-medium">Повторные</th>
                  <th className="py-3 px-4 font-medium">Возвращаемость</th>
                </tr>
              )}
            </thead>
            <tbody>
              {categoryRows.map((row) => {
                const name = row.category?.name ?? "—";
                if (metricKey === "repeat_visit_rate") {
                  const total = row.numerator;
                  const newC = row.denominator;
                  const cont = Math.max(0, Math.round(total - newC));
                  return (
                    <tr key={row.id} className="border-b last:border-b-0 hover:bg-neutral-50">
                      <td className="py-3 px-4">{name}</td>
                      <td className="py-3 px-4">{Math.round(newC)}</td>
                      <td className="py-3 px-4">{cont}</td>
                      <td className="py-3 px-4">{Math.round(total)}</td>
                      <td className="py-3 px-4 font-medium">{row.value.toFixed(2)}×</td>
                    </tr>
                  );
                }

                return (
                  <tr key={row.id} className="border-b last:border-b-0 hover:bg-neutral-50">
                    <td className="py-3 px-4">{name}</td>
                    <td className="py-3 px-4">{Math.round(row.denominator)}</td>
                    <td className="py-3 px-4">{Math.round(row.numerator)}</td>
                    <td className="py-3 px-4 font-medium">{row.value.toFixed(2)}%</td>
                  </tr>
                );
              })}
              {categoryRows.length === 0 && (
                <tr>
                  <td className="py-6 px-4 text-neutral-600" colSpan={metricKey === "repeat_visit_rate" ? 5 : 4}>
                    Нет строк по специализациям для этого месяца.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
