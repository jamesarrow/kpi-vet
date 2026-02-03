import { prisma } from "@/lib/prisma";

function formatPeriods(periods: Array<{ year: number; month: number }>) {
  const map = new Map<number, number[]>();
  for (const p of periods) {
    if (!map.has(p.year)) map.set(p.year, []);
    map.get(p.year)!.push(p.month);
  }
  const years = Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  return years
    .map(([y, months]) => `${y}: ${months.sort((a, b) => a - b).join(",")}`)
    .join(" • ");
}

export default async function ReportsPage() {
  const reports = await prisma.report.findMany({
    orderBy: { uploadedAt: "desc" },
    include: {
      periods: { select: { year: true, month: true } },
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-sm text-neutral-500"><a href="/" className="hover:underline">← На главную</a></div>
        <h1 className="text-2xl font-semibold mt-2">История загрузок</h1>
        <div className="text-sm text-neutral-600 mt-1">
          Каждый файл = новый <span className="font-medium">снимок</span>. В отчётах можно переключать снимок для конкретного месяца.
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-auto">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="text-left text-neutral-500 border-b">
            <tr>
              <th className="p-3">Дата загрузки</th>
              <th className="p-3">Файл</th>
              <th className="p-3">Периоды в файле</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-b hover:bg-neutral-50">
                <td className="p-3 whitespace-nowrap">{new Date(r.uploadedAt).toLocaleString()}</td>
                <td className="p-3">{r.filename}</td>
                <td className="p-3 text-neutral-700">{formatPeriods(r.periods)}</td>
              </tr>
            ))}
            {reports.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-6 text-neutral-600">Пока нет загрузок.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
