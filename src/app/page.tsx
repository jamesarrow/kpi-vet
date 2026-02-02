import { prisma } from "@/lib/prisma";
import { UploadExcel } from "@/components/UploadExcel";

function monthNameRu(m: number) {
  const names = ["", "Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  return names[m] ?? `Месяц ${m}`;
}

async function getLatestNav() {
  const periods = await prisma.period.findMany({
    include: {
      report: { select: { id: true, uploadedAt: true, filename: true } },
      metricValues: {
        where: { metricKey: "return_rate", scopeType: "overall" },
        select: { value: true, numerator: true, denominator: true },
      },
    },
    orderBy: [{ report: { uploadedAt: "desc" } }],
  });

  const latest = new Map<string, any>();
  for (const p of periods) {
    const key = `${p.year}-${p.month}`;
    if (latest.has(key)) continue;
    const overall = p.metricValues[0] ?? null;
    latest.set(key, {
      year: p.year,
      month: p.month,
      value: overall?.value ?? null,
      all: overall?.denominator ?? null,
      repeat: overall?.numerator ?? null,
      reportId: p.report.id,
      uploadedAt: p.report.uploadedAt,
      filename: p.report.filename,
    });
  }

  const yearsMap = new Map<number, any[]>();
  for (const v of latest.values()) {
    if (!yearsMap.has(v.year)) yearsMap.set(v.year, []);
    yearsMap.get(v.year)!.push(v);
  }

  return Array.from(yearsMap.entries())
    .map(([year, months]) => ({
      year,
      months: months.sort((a, b) => a.month - b.month),
    }))
    .sort((a, b) => b.year - a.year);
}

export default async function HomePage() {
  const years = await getLatestNav();

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Отчёты по возвращаемости</h1>
          <div className="text-sm text-neutral-600 mt-1">
            Формула: <span className="font-medium">КЛ. Повторные / КЛ.Все Записанные × 100%</span>
          </div>
          <div className="text-sm text-neutral-600">
            Загрузи новую выгрузку — появится новый <span className="font-medium">снимок</span> в истории.
          </div>
        </div>
        <UploadExcel />
      </div>

      {years.length === 0 ? (
        <div className="rounded-xl border bg-white p-6">
          <div className="text-lg font-medium">Данных пока нет</div>
          <div className="text-sm text-neutral-600 mt-1 leading-relaxed">
            Нажми <span className="font-medium">“Загрузить Excel”</span> и выбери файл выгрузки. После загрузки появятся года и месяцы.
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {years.map((y) => (
            <div key={y.year} className="rounded-xl border bg-white">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="font-medium text-lg">{y.year}</div>
                <a href="/reports" className="text-sm text-neutral-600 hover:underline">История загрузок</a>
              </div>

              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const cell = y.months.find((x: any) => x.month === m);
                  const href = `/${y.year}/${m}`;

                  return (
                    <a
                      key={m}
                      href={href}
                      className={
                        "rounded-xl border p-4 hover:bg-neutral-50 transition " +
                        (cell ? "bg-white" : "bg-neutral-50 text-neutral-400")
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{monthNameRu(m)}</div>
                          <div className="text-xs text-neutral-500 mt-1">
                            {cell ? `Обновлено: ${new Date(cell.uploadedAt).toLocaleDateString()}` : "Нет данных"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-semibold">
                            {cell?.value != null ? `${cell.value.toFixed(2)}%` : "—"}
                          </div>
                          {cell ? (
                            <div className="text-xs text-neutral-500 mt-1">{Math.round(cell.repeat)} / {Math.round(cell.all)}</div>
                          ) : null}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
