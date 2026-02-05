import { prisma } from "@/lib/prisma";
import { isVetSpecialization } from "@/lib/categoryFilter";
import { UploadExcel } from "@/components/UploadExcel";

type MetricKey = "return_rate" | "repeat_visit_rate" | "churn_rate";

function metricFromParam(v?: string): MetricKey {
  if (v === "repeat_visit_rate") return "repeat_visit_rate";
  if (v === "churn_rate") return "churn_rate";
  return "return_rate";
}

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

function formatPct(v: number) {
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}

function formatX(v: number) {
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}×`;
}

function meta(metricKey: MetricKey) {
  if (metricKey === "repeat_visit_rate") {
    return {
      tabLabel: "Частота повторных визитов",
      title: "Частота повторных визитов",
      formula: "(КЛ. Новые Записанные + КЛ. Продолжение Записанные) / КЛ. Новые Записанные",
    };
  }

  if (metricKey === "churn_rate") {
    return {
      tabLabel: "Доля ушедших клиентов",
      title: "Доля ушедших клиентов",
      formula:
        "(КЛ. Повторные (прошлый период) − КЛ. Повторные (текущий период)) / КЛ. Повторные (прошлый период) × 100%",
    };
  }

  return {
    tabLabel: "Возвращаемость",
    title: "Возвращаемость",
    formula: "КЛ. Повторные / КЛ.Все Записанные × 100%",
  };
}

type Point = {
  year: number;
  month: number;
  metric?: { value: number; numerator: number; denominator: number };
  ret?: { numerator: number; denominator: number }; // return_rate for repeatClients
};

async function getSeries(categoryCode: number, metricKey: MetricKey): Promise<Point[]> {
  const keys: MetricKey[] = metricKey === "churn_rate" ? ["churn_rate", "return_rate"] : [metricKey];

  const periods = await prisma.period.findMany({
    where: {
      metricValues: {
        some: {
          scopeType: "category",
          metricKey: { in: keys },
          category: { code: categoryCode },
        },
      },
    },
    orderBy: [{ year: "asc" }, { month: "asc" }, { report: { uploadedAt: "desc" } }],
    include: {
      report: true,
      metricValues: {
        where: {
          scopeType: "category",
          metricKey: { in: keys },
          category: { code: categoryCode },
        },
        select: { metricKey: true, value: true, numerator: true, denominator: true },
      },
    },
  });

  // Дедуп по (год, месяц): берём самый свежий снимок (по uploadedAt DESC внутри orderBy)
  const picked = new Map<string, Point>();
  for (const p of periods) {
    const key = `${p.year}-${p.month}`;
    if (picked.has(key)) continue;

    const point: Point = { year: p.year, month: p.month };

    for (const mv of p.metricValues) {
      if (mv.metricKey === metricKey) {
        point.metric = { value: mv.value, numerator: mv.numerator, denominator: mv.denominator };
      }
      if (mv.metricKey === "return_rate") {
        point.ret = { numerator: mv.numerator, denominator: mv.denominator };
      }
    }

    picked.set(key, point);
  }

  return Array.from(picked.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
}

function groupByYear(points: Point[]) {
  const years = new Map<number, Point[]>();
  for (const p of points) {
    if (!years.has(p.year)) years.set(p.year, []);
    years.get(p.year)!.push(p);
  }
  return Array.from(years.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({ year, items: items.sort((a, b) => a.month - b.month) }));
}

function safeDiv(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}

export default async function SpecializationPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { metric?: string };
}) {
  const categoryCode = Number(params.code);
  const metricKey = metricFromParam(searchParams?.metric);
  const m = meta(metricKey);

  const category = await prisma.category.findFirst({
    where: { code: categoryCode },
    select: { id: true, code: true, name: true },
  });

  if (!category) {
    return (
      <div className="p-6 space-y-4">
        <div className="text-sm text-neutral-600">
          Не нашёл специализацию с кодом <span className="font-medium">{params.code}</span>.
        </div>
        <a href="/" className="text-indigo-700 hover:underline">
          ← К специализациям
        </a>
      </div>
    );
  }


  if (!isVetSpecialization(category.name)) {
    return (
      <div className="p-6 space-y-4">
        <div className="text-sm text-neutral-600">Эта категория не является специализацией клиники (служебная/финансовая).</div>
        <a className="text-sm text-blue-600 hover:underline" href="/">← На главную</a>
      </div>
    );
  }

  const points = await getSeries(categoryCode, metricKey);
  const years = groupByYear(points);

  const tabWrap = "inline-flex rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 p-1";
  const tabBase = "px-3 py-2 text-sm rounded-lg transition";

  function tabHref(key: MetricKey) {
    if (key === "return_rate") return `/specializations/${categoryCode}`;
    return `/specializations/${categoryCode}?metric=${key}`;
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

          <div className="space-y-1">
            <div className="text-sm text-indigo-700">
              <a href="/" className="hover:underline">← Специализации</a>
              <span className="text-neutral-400"> / </span>
              <a href="/overall" className="hover:underline">Общий отчёт</a>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{category.name}</h1>
            <div className="text-sm text-neutral-600">
              <span className="font-medium">{m.title}.</span> Формула: <span className="font-medium">{m.formula}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
            Загрузите Excel — появятся месяцы и итоги по годам.
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          {years.map((y) => {
            // Годовые итоги
            let yearNumer = 0;
            let yearDenom = 0;
            let yearValue: number | null = null;

            if (metricKey === "churn_rate") {
              // Нетто-изменение постоянных за год: (первый месяц − последний месяц) / первый месяц
              const rep = y.items
                .map((p) => ({ month: p.month, repeat: p.ret?.numerator }))
                .filter((x): x is { month: number; repeat: number } => typeof x.repeat === "number");

              if (rep.length >= 2) {
                const first = rep[0].repeat;
                const last = rep[rep.length - 1].repeat;
                yearDenom = first;
                yearNumer = first - last;
                const v = safeDiv(yearNumer, yearDenom);
                yearValue = v === null ? null : v * 100;
              }
            } else {
              for (const p of y.items) {
                if (!p.metric) continue;
                yearNumer += p.metric.numerator;
                yearDenom += p.metric.denominator;
              }
              const v = safeDiv(yearNumer, yearDenom);
              if (v !== null) {
                yearValue = metricKey === "return_rate" ? v * 100 : v;
              }
            }

            return (
              <div key={y.year} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">{y.year}</div>
                  <div className="text-sm text-neutral-500">Код: {category.code}</div>
                </div>

                <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    {metricKey === "return_rate" ? (
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 text-neutral-600">
                          <tr>
                            <th className="text-left font-medium p-3">Месяц</th>
                            <th className="text-right font-medium p-3">Возвращаемость</th>
                            <th className="text-right font-medium p-3">КЛ. Повторные</th>
                            <th className="text-right font-medium p-3">КЛ. Все записанные</th>
                          </tr>
                        </thead>
                        <tbody>
                          {y.items.map((p) => {
                            const label = `${monthNameRu(p.month)} ${p.year}`;
                            const v = p.metric?.value;
                            return (
                              <tr key={`${p.year}-${p.month}`} className="border-t">
                                <td className="p-3">{label}</td>
                                <td className="p-3 text-right font-medium">
                                  {typeof v === "number" ? formatPct(v) : "—"}
                                </td>
                                <td className="p-3 text-right">
                                  {p.metric ? Math.round(p.metric.numerator) : "—"}
                                </td>
                                <td className="p-3 text-right">
                                  {p.metric ? Math.round(p.metric.denominator) : "—"}
                                </td>
                              </tr>
                            );
                          })}

                          <tr className="border-t bg-neutral-50">
                            <td className="p-3 font-medium">Итого за {y.year}</td>
                            <td className="p-3 text-right font-semibold">
                              {yearValue === null ? "—" : formatPct(yearValue)}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {yearDenom === 0 ? "—" : Math.round(yearNumer)}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {yearDenom === 0 ? "—" : Math.round(yearDenom)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    ) : null}

                    {metricKey === "repeat_visit_rate" ? (
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 text-neutral-600">
                          <tr>
                            <th className="text-left font-medium p-3">Месяц</th>
                            <th className="text-right font-medium p-3">Частота</th>
                            <th className="text-right font-medium p-3">КЛ. Новые</th>
                            <th className="text-right font-medium p-3">КЛ. Продолжение</th>
                            <th className="text-right font-medium p-3">КЛ. Всего</th>
                          </tr>
                        </thead>
                        <tbody>
                          {y.items.map((p) => {
                            const label = `${monthNameRu(p.month)} ${p.year}`;
                            const v = p.metric?.value;
                            const denom = p.metric?.denominator ?? null;
                            const numer = p.metric?.numerator ?? null;
                            const cont = denom === null || numer === null ? null : Math.max(0, Math.round(numer - denom));
                            return (
                              <tr key={`${p.year}-${p.month}`} className="border-t">
                                <td className="p-3">{label}</td>
                                <td className="p-3 text-right font-medium">
                                  {typeof v === "number" ? formatX(v) : "—"}
                                </td>
                                <td className="p-3 text-right">{denom === null ? "—" : Math.round(denom)}</td>
                                <td className="p-3 text-right">{cont === null ? "—" : cont}</td>
                                <td className="p-3 text-right">{numer === null ? "—" : Math.round(numer)}</td>
                              </tr>
                            );
                          })}

                          <tr className="border-t bg-neutral-50">
                            <td className="p-3 font-medium">Итого за {y.year}</td>
                            <td className="p-3 text-right font-semibold">
                              {yearValue === null ? "—" : formatX(yearValue)}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {yearDenom === 0 ? "—" : Math.round(yearDenom)}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {yearDenom === 0 ? "—" : Math.round(yearNumer - yearDenom)}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {yearDenom === 0 ? "—" : Math.round(yearNumer)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    ) : null}

                    {metricKey === "churn_rate" ? (
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 text-neutral-600">
                          <tr>
                            <th className="text-left font-medium p-3">Месяц</th>
                            <th className="text-right font-medium p-3">Churn</th>
                            <th className="text-right font-medium p-3">Постоянные (прошлый)</th>
                            <th className="text-right font-medium p-3">Постоянные (текущий)</th>
                            <th className="text-right font-medium p-3">Изменение</th>
                          </tr>
                        </thead>
                        <tbody>
                          {y.items.map((p) => {
                            const label = `${monthNameRu(p.month)} ${p.year}`;
                            const mv = p.metric;
                            if (!mv) {
                              return (
                                <tr key={`${p.year}-${p.month}`} className="border-t">
                                  <td className="p-3">{label}</td>
                                  <td className="p-3 text-right text-neutral-500">—</td>
                                  <td className="p-3 text-right text-neutral-500">—</td>
                                  <td className="p-3 text-right text-neutral-500">—</td>
                                  <td className="p-3 text-right text-neutral-500">—</td>
                                </tr>
                              );
                            }

                            const prev = mv.denominator;
                            const lost = mv.numerator;
                            const curr = prev - lost;
                            const sign = lost >= 0 ? "−" : "+";
                            return (
                              <tr key={`${p.year}-${p.month}`} className="border-t">
                                <td className="p-3">{label}</td>
                                <td className="p-3 text-right font-medium">{formatPct(mv.value)}</td>
                                <td className="p-3 text-right">{Math.round(prev)}</td>
                                <td className="p-3 text-right">{Math.round(curr)}</td>
                                <td className="p-3 text-right">{sign}{Math.round(Math.abs(lost))}</td>
                              </tr>
                            );
                          })}

                          <tr className="border-t bg-neutral-50">
                            <td className="p-3 font-medium">Итого за {y.year}</td>
                            <td className="p-3 text-right font-semibold">
                              {yearValue === null ? "—" : formatPct(yearValue)}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {yearDenom === 0 ? "—" : Math.round(yearDenom)}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {yearDenom === 0 ? "—" : Math.round(yearDenom - yearNumer)}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {yearDenom === 0 ? "—" : `−${Math.round(yearNumer)}`}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                </div>

                {metricKey === "churn_rate" ? (
                  <div className="text-xs text-neutral-500">
                    Примечание: «Итого за год» для churn считается как нетто-изменение постоянных клиентов от первого месяца года к последнему.
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
