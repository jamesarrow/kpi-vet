import { prisma } from "@/lib/prisma";
import { UploadExcel } from "@/components/UploadExcel";
import { SnapshotPicker, SnapshotOption } from "@/components/SnapshotPicker";

function monthNameRu(m: number) {
  const names = ["", "Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  return names[m] ?? `Месяц ${m}`;
}

export default async function PeriodPage({
  params,
  searchParams,
}: {
  params: { year: string; month: string };
  searchParams: { reportId?: string };
}) {
  const year = Number(params.year);
  const month = Number(params.month);
  const requestedReportId = searchParams.reportId;

  // Список доступных снимков для месяца
  const snapshotPeriods = await prisma.period.findMany({
    where: { year, month },
    orderBy: { report: { uploadedAt: "desc" } },
    include: { report: true },
  });

  const snapshotOptions: SnapshotOption[] = snapshotPeriods.map((p) => ({
    reportId: p.report.id,
    label: `${new Date(p.report.uploadedAt).toLocaleString()} • ${p.report.filename}`,
  }));

  const activeReportId = requestedReportId ?? snapshotOptions[0]?.reportId ?? null;

  const period = activeReportId
    ? await prisma.period.findFirst({
        where: { year, month, reportId: activeReportId },
        include: { report: true, metricValues: { include: { category: true } } },
      })
    : null;

  if (!period) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm text-neutral-500"><a href="/" className="hover:underline">← На главную</a></div>
            <div className="text-sm text-neutral-500 mt-2">{year} • {monthNameRu(month)}</div>
            <h1 className="text-2xl font-semibold">Отчёт за M{month}.{year}</h1>
            <div className="text-sm text-neutral-600 mt-1">Данных нет — загрузи Excel.</div>
          </div>
          <UploadExcel />
        </div>
      </div>
    );
  }

  const overall = period.metricValues.find((m) => m.metricKey === "return_rate" && m.scopeType === "overall") ?? null;

  const categories = period.metricValues
    .filter((m) => m.metricKey === "return_rate" && m.scopeType === "category" && m.category)
    .map((m) => ({
      code: m.category!.code,
      name: m.category!.name,
      all: m.denominator,
      repeat: m.numerator,
      value: m.value,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-sm text-neutral-500"><a href="/" className="hover:underline">← На главную</a></div>
          <div className="text-sm text-neutral-500 mt-2">{year} • {monthNameRu(month)}</div>
          <h1 className="text-2xl font-semibold">Отчёт за {period.periodKey}</h1>
          <div className="text-sm text-neutral-600 mt-1">
            Формула: <span className="font-medium">КЛ. Повторные / КЛ.Все Записанные × 100%</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {snapshotOptions.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="text-sm text-neutral-500">Снимок:</div>
              <SnapshotPicker year={year} month={month} currentReportId={period.reportId} options={snapshotOptions} />
            </div>
          ) : null}
          <UploadExcel compact />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Возвращаемость</div>
          <div className="text-3xl font-semibold">{overall ? `${overall.value.toFixed(2)}%` : "—"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Клиенты всего (записанные)</div>
          <div className="text-3xl font-semibold">{overall ? Math.round(overall.denominator) : "—"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Повторные клиенты</div>
          <div className="text-3xl font-semibold">{overall ? Math.round(overall.numerator) : "—"}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-medium">Специализации</div>
          <div className="text-sm text-neutral-500">Сортировка: по возвращаемости ↓</div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr className="border-b">
                <th className="p-3">Специализация</th>
                <th className="p-3">Все</th>
                <th className="p-3">Повторные</th>
                <th className="p-3">Возвращаемость</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={`${c.code}-${c.name}`} className="border-b hover:bg-neutral-50">
                  <td className="p-3">{c.name}</td>
                  <td className="p-3">{Math.round(c.all)}</td>
                  <td className="p-3">{Math.round(c.repeat)}</td>
                  <td className="p-3 font-medium">{c.value.toFixed(2)}%</td>
                </tr>
              ))}
              {!categories.length ? (
                <tr><td className="p-6 text-neutral-600" colSpan={4}>Нет данных по специализациям.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-neutral-500">
        Снимок: {new Date(period.report.uploadedAt).toLocaleString()} • {period.report.filename}
      </div>
    </div>
  );
}
