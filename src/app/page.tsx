import { prisma } from "@/lib/prisma";
import { UploadExcel } from "@/components/UploadExcel";

type MetricKey = "return_rate" | "repeat_visit_rate" | "churn_rate";

function metricFromParam(v?: string): MetricKey {
  if (v === "repeat_visit_rate") return "repeat_visit_rate";
  if (v === "churn_rate") return "churn_rate";
  return "return_rate";
}

function metricMeta(metricKey: MetricKey) {
  if (metricKey === "repeat_visit_rate") {
    return {
      title: "Частота повторных визитов",
      desc: "Формула: (КЛ. Новые Записанные + КЛ. Продолжение Записанные) / КЛ. Новые Записанные",
      pill: "Частота = (Новые + Продолжение) / Новые",
    };
  }
  if (metricKey === "churn_rate") {
    return {
      title: "Доля ушедших клиентов",
      desc: "Формула: (Постоянные в прошлом периоде − Постоянные в текущем) / Постоянные в прошлом периоде × 100%",
      pill: "Churn = (Прошлые − Текущие) / Прошлые × 100%",
    };
  }
  return {
    title: "Возвращаемость",
    desc: "Формула: КЛ. Повторные / КЛ.Все Записанные × 100%",
    pill: "Возвращаемость = Повторные / Все × 100%",
  };
}

function tabHref(metricKey: MetricKey, next: MetricKey) {
  if (next === "return_rate") return "/";
  return `/?metric=${next}`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: { metric?: string };
}) {
  const metricKey = metricFromParam(searchParams?.metric);
  const meta = metricMeta(metricKey);

  const cats = await prisma.category.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, code: true, name: true },
  });
  const safeCats = cats.filter(
    (c): c is typeof c & { code: number } => c.code != null
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold">Метрики ветклиники</div>
            <div className="text-sm text-neutral-600 mt-1">{meta.title}. {meta.desc}</div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/reports"
              className="text-sm text-neutral-700 hover:text-neutral-900 hover:underline"
            >
              История загрузок
            </a>
            <UploadExcel />
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs text-indigo-800 ring-1 ring-indigo-100 w-fit">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
          {meta.pill}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {([
          ["return_rate", "Возвращаемость"],
          ["repeat_visit_rate", "Частота повторных визитов"],
          ["churn_rate", "Churn Rate"],
        ] as Array<[MetricKey, string]>).map(([k, label]) => (
          <a
            key={k}
            href={tabHref(metricKey, k)}
            className={
              "rounded-full border px-4 py-2 text-sm transition " +
              (k === metricKey
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white hover:bg-neutral-50")
            }
          >
            {label}
          </a>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Специализации</div>
            <div className="text-sm text-neutral-600">Выбери специализацию — внутри будут месяцы и итог за год.</div>
          </div>
          <a
            href={metricKey === "return_rate" ? "/overall" : `/overall?metric=${metricKey}`}
            className="text-sm text-indigo-700 hover:text-indigo-900 hover:underline"
          >
            Открыть общий отчёт по клинике
          </a>
        </div>

        {safeCats.length === 0 ? (
          <div className="mt-4 rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-700">
            Данных пока нет. Нажми “Загрузить Excel” — после загрузки появятся специализации.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {safeCats.map((c) => {
              const href =
                metricKey === "return_rate"
                  ? `/specializations/${c.code}`
                  : `/specializations/${c.code}?metric=${metricKey}`;

              return (
                <a
                  key={c.id}
                  href={href}
                  className="rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md hover:border-neutral-300 transition"
                >
                  <div className="text-sm text-neutral-500">Специализация</div>
                  <div className="mt-1 text-lg font-semibold leading-snug">{c.name}</div>
                  <div className="mt-2 inline-flex items-center gap-2 text-sm text-indigo-700">
                    <span className="h-2 w-2 rounded-full bg-indigo-600" />
                    Открыть
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs text-neutral-500">
        Подсказка: если обновили Excel — просто загрузите файл ещё раз. Сервис хранит историю снимков и берёт самый свежий для каждого месяца.
      </div>
    </div>
  );
}
