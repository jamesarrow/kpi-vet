import { prisma } from "@/lib/prisma";
import { UploadExcel } from "@/components/UploadExcel";

type MetricKey = "return_rate" | "repeat_visit_rate" | "churn_rate";

function monthNameRu(m: number) {
  const names = [
    "",
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];
  return names[m] ?? `Месяц ${m}`;
}

function metricFromParam(v?: string): MetricKey {
  if (v === "repeat_visit_rate") return "repeat_visit_rate";
  if (v === "churn_rate") return "churn_rate";
  return "return_rate";
}

function meta(metricKey: MetricKey) {
  if (metricKey === "repeat_visit_rate") {
    return {
      title: "Отчёты по частоте повторных визитов",
      tabLabel: "Частота повторных визитов",
      formula: "(КЛ. Новые Записанные + КЛ. Продолжение Записанные) / КЛ. Новые Записанные",
      formatValue: (v: number) => `${v.toFixed(2)}×`,
      formatSub: (numer: number, denom: number) => {
        const cont = Math.max(0, Math.round(numer - denom));
        return `Продолж: ${cont} • Новые: ${Math.round(denom)}`;
      },
    };
  }

  if (metricKey === "churn_rate") {
    return {
      title: "Отчёты по доле ушедших клиентов",
      tabLabel: "Доля ушедших клиентов",
      formula:
        "(КЛ. Повторные (прошлый период) − КЛ. Повторные (текущий период)) / КЛ. Повторные (прошлый период) × 100%",
      formatValue: (v: number) => `${v.toFixed(2)}%`,
      formatSub: (numer: number, denom: number) => {
        const prev = Math.round(denom);
        const lost = Math.round(numer);
        const curr = Math.round(denom - numer);
        const sign = lost >= 0 ? `−${Math.abs(lost)}` : `+${Math.abs(lost)}`;
        return `${prev} → ${curr} (${sign})`;
      },
    };
  }

  return {
    title: "Отчёты по возвращаемости",
    tabLabel: "Возвращаемость",
    formula: "КЛ. Повторные / КЛ.Все Записанные × 100%",
    formatValue: (v: number) => `${v.toFixed(2)}%`,
    formatSub: (numer: number, denom: number) => `${Math.round(numer)} / ${Math.round(denom)}`,
  };
}

async function getLatestByPeriod(metricKey: MetricKey) {
  const periods = await prisma.period.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }, { report: { uploadedAt: "desc" } }],
    include: {
      report: true,
      metricValues: {
        where: { metricKey, scopeType: "overall" },
        select: { value: true, numerator: true, denominator: true },
      },
    },
  });

  // Берём только самый свежий "снимок" для каждого месяца
  const latest = new Map<
    string,
    { year: number; month: number; value: number; numerator: number; denominator: number }
  >();
  for (const p of periods) {
    const key = `${p.year}-${p.month}`;
    if (latest.has(key)) continue;

    const mv = p.metricValues[0] ?? null;
    if (!mv) continue;

    latest.set(key, {
      year: p.year,
      month: p.month,
      value: mv.value,
      numerator: mv.numerator,
      denominator: mv.denominator,
    });
  }

  const years = new Map<
    number,
    Array<{ month: number; value: number; numerator: number; denominator: number }>
  >();
  for (const item of latest.values()) {
    if (!years.has(item.year)) years.set(item.year, []);
    years.get(item.year)!.push({
      month: item.month,
      value: item.value,
      numerator: item.numerator,
      denominator: item.denominator,
    });
  }

  return Array.from(years.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: months.sort((a, b) => a.month - b.month),
    }));
}

export default async function OverallPage({
  searchParams,
}: {
  searchParams: { metric?: string };
}) {
  const metricKey = metricFromParam(searchParams?.metric);
  const m = meta(metricKey);

  const years = await getLatestByPeriod(metricKey);

  const tabWrap =
    "inline-flex rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 p-1";
  const tabBase = "px-3 py-2 text-sm rounded-lg transition";

  function tabHref(key: MetricKey) {
    if (key === "return_rate") return "/overall";
    return `/overall?metric=${key}`;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-3">
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
            <a
              href={tabHref("churn_rate")}
              className={
                tabBase +
                (metricKey === "churn_rate"
                  ? " bg-indigo-600 text-white shadow"
                  : " text-neutral-700 hover:bg-neutral-50")
              }
            >
              Доля ушедших клиентов
            </a>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">Общий отчёт по клинике</h1>
          <div className="text-sm text-neutral-600">
            <span className="font-medium">{m.title}.</span> Формула: {" "}
            <span className="font-medium">{m.formula}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/"
            className="text-sm text-indigo-700 hover:text-indigo-900 hover:underline"
          >
            ← К специализациям
          </a>
          <a
            href="/reports"
            className="text-sm text-neutral-600 hover:text-neutral-900 hover:underline"
          >
            История загрузок
          </a>
          <UploadExcel />
        </div>
      </div>

      {years.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-lg font-medium">Данных пока нет</div>
          <div className="text-sm text-neutral-600 mt-1">
            Нажми <span className="font-medium">"Загрузить Excel"</span> и выбери файл выгрузки.
            После загрузки появятся года и месяцы.
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {years.map((y) => (
            <div key={y.year} className="space-y-3">
              <div className="text-lg font-semibold">{y.year}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {y.months.map((p) => {
                  const href =
                    metricKey === "return_rate"
                      ? `/${y.year}/${p.month}`
                      : `/${y.year}/${p.month}?metric=${metricKey}`;

                  return (
                    <a
                      key={`${y.year}-${p.month}`}
                      href={href}
                      className="rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md transition"
                    >
                      <div className="text-sm text-neutral-500">
                        {monthNameRu(p.month)} {y.year}
                      </div>
                      <div className="mt-2 text-3xl font-semibold text-neutral-900">
                        {m.formatValue(p.value)}
                      </div>
                      <div className="mt-1 text-sm text-neutral-600">
                        {m.formatSub(p.numerator, p.denominator)}
                      </div>
                      <div className="mt-3 inline-flex items-center gap-2 text-sm text-indigo-700">
                        <span className="h-2 w-2 rounded-full bg-indigo-600" />
                        Открыть отчёт
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-neutral-500">
        Подсказка: если добавили новую метрику в сервис — просто загрузите тот же Excel ещё раз, и данные допишутся в текущий снимок.
      </div>
    </div>
  );
}
