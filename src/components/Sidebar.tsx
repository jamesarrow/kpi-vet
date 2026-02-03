import { prisma } from "@/lib/prisma";

type MonthCell = {
  month: number;
  value: number | null;
  reportId: string;
  uploadedAt: Date;
};

function monthShort(m: number) {
  const names = ["", "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  return names[m] ?? `M${m}`;
}

async function getLatestNav(): Promise<Array<{ year: number; months: MonthCell[] }>> {
  const periods = await prisma.period.findMany({
    include: {
      report: { select: { id: true, uploadedAt: true } },
      metricValues: {
        where: { metricKey: "return_rate", scopeType: "overall" },
        select: { value: true },
      },
    },
    orderBy: [{ report: { uploadedAt: "desc" } }],
  });

  // latest per (year, month)
  const latest = new Map<string, MonthCell>();
  for (const p of periods) {
    const key = `${p.year}-${p.month}`;
    if (latest.has(key)) continue;
    latest.set(key, {
      month: p.month,
      value: p.metricValues[0]?.value ?? null,
      reportId: p.report.id,
      uploadedAt: p.report.uploadedAt,
    });
  }

  const yearsMap = new Map<number, MonthCell[]>();
  for (const [key, cell] of latest.entries()) {
    const year = Number(key.split("-")[0]);
    if (!yearsMap.has(year)) yearsMap.set(year, []);
    yearsMap.get(year)!.push(cell);
  }

  return Array.from(yearsMap.entries())
    .map(([year, months]) => ({
      year,
      months: months.sort((a, b) => a.month - b.month),
    }))
    .sort((a, b) => b.year - a.year);
}

export async function Sidebar() {
  const years = await getLatestNav();

  return (
    <div className="h-full p-4">
      <div className="mb-4">
        <a href="/" className="block text-lg font-semibold">Метрики ветклиники</a>
        <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-2 py-1 text-xs text-indigo-800 ring-1 ring-indigo-100">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
          Возвращаемость = Повторные / Все × 100%
        </div>
      </div>

      <div className="space-y-6">
        {years.length === 0 ? (
          <div className="text-sm text-neutral-600 leading-relaxed">
            Пока нет данных. Зайди на главную страницу и загрузи Excel — появятся года и месяцы.
          </div>
        ) : (
          years.map((y) => (
            <div key={y.year} className="space-y-2">
              <div className="text-sm font-medium">{y.year}</div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const cell = y.months.find((x) => x.month === m);
                  const href = `/${y.year}/${m}`;

                  return (
                    <a
                      key={m}
                      href={href}
                      className={
                        "rounded-xl border px-2 py-2 text-sm transition " +
                        (cell
                          ? "bg-white shadow-sm hover:shadow-md hover:border-neutral-300"
                          : "bg-neutral-100/70 text-neutral-400 border-dashed")
                      }
                      title={cell ? `Обновлено: ${cell.uploadedAt.toLocaleString()}` : "Нет данных"}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{monthShort(m)}</span>
                        <span className="text-xs text-neutral-500">{cell?.value != null ? `${cell.value.toFixed(1)}%` : "—"}</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div className="pt-2 border-t">
          <a href="/reports" className="text-sm hover:underline">История загрузок</a>
        </div>
      </div>
    </div>
  );
}
