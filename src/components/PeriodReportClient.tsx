"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SnapshotPicker } from "@/components/SnapshotPicker";
import { UploadExcel } from "@/components/UploadExcel";

type MetricKey = "return_rate" | "repeat_visit_rate" | "churn_rate";

type Overall = { value: number; numerator: number; denominator: number } | null;

type CategoryRow = {
  id: string;
  name: string;
  code: number | null;
  numerator: number;
  denominator: number;
  value: number;
};

type SnapshotOption = { reportId: string; label: string };

type Available = Array<{ year: number; months: number[] }>;

function metricFromParam(v?: string | null): MetricKey {
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

function formatMonthYear(year: number, month: number) {
  return `${monthNameRu(month)} ${year}`;
}

function formatMetric(metricKey: MetricKey, v: number) {
  return metricKey === "repeat_visit_rate" ? `${v.toFixed(2)}×` : `${v.toFixed(2)}%`;
}

function formatDelta(metricKey: MetricKey, d: number) {
  const sign = d > 0 ? "+" : "";
  return metricKey === "repeat_visit_rate" ? `${sign}${d.toFixed(2)}×` : `${sign}${d.toFixed(2)} п.п.`;
}

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function useAnimatedNumber(value: number, durationMs = 450) {
  const [v, setV] = useState(value);

  useEffect(() => {
    let raf = 0;
    const from = v;
    const to = value;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setV(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return v;
}

function meta(metricKey: MetricKey) {
  if (metricKey === "repeat_visit_rate") {
    return {
      title: "Отчёт по частоте повторных визитов",
      formula: "(КЛ. Новые Записанные + КЛ. Продолжение Записанные) / КЛ. Новые Записанные",
    };
  }
  if (metricKey === "churn_rate") {
    return {
      title: "Отчёт по доле ушедших клиентов",
      formula:
        "(КЛ. Повторные (прошлый период) − КЛ. Повторные (текущий период)) / КЛ. Повторные (прошлый период) × 100%",
    };
  }
  return {
    title: "Отчёт по возвращаемости",
    formula: "КЛ. Повторные / КЛ.Все Записанные × 100%",
  };
}

type RemoteMetrics = {
  overall: Overall;
  categories: CategoryRow[];
};

async function fetchMetrics(params: {
  year: number;
  month: number;
  metricKey: MetricKey;
  reportId?: string;
}): Promise<RemoteMetrics> {
  const sp = new URLSearchParams();
  sp.set("year", String(params.year));
  sp.set("month", String(params.month));
  if (params.metricKey !== "return_rate") sp.set("metric", params.metricKey);
  if (params.reportId) sp.set("reportId", params.reportId);
  const res = await fetch(`/api/metrics?${sp.toString()}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Ошибка загрузки метрик");
  return {
    overall: json?.overall ?? null,
    categories: Array.isArray(json?.categories) ? json.categories : [],
  };
}

function deltaTone(metricKey: MetricKey, d: number) {
  if (Math.abs(d) <= 0.00001) return "neu";
  const positiveIsGood = metricKey !== "churn_rate";
  const isPos = d > 0;
  if (positiveIsGood) return isPos ? "pos" : "neg";
  return isPos ? "neg" : "pos";
}

function DeltaBadge({ metricKey, delta }: { metricKey: MetricKey; delta: number | null }) {
  if (delta == null) return <span className="text-neutral-400">—</span>;
  const tone = deltaTone(metricKey, delta);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1",
        tone === "pos" && "bg-emerald-50 text-emerald-700 ring-emerald-100",
        tone === "neg" && "bg-rose-50 text-rose-700 ring-rose-100",
        tone === "neu" && "bg-neutral-50 text-neutral-700 ring-neutral-200"
      )}
    >
      {formatDelta(metricKey, delta)}
    </span>
  );
}

function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/20 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl ring-1 ring-neutral-200",
          "transition-transform duration-250 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function PeriodReportClient({
  year,
  month,
  metricKey,
  currentReportId,
  snapshots,
  overall,
  categories,
  available,
}: {
  year: number;
  month: number;
  metricKey: MetricKey;
  currentReportId: string;
  snapshots: SnapshotOption[];
  overall: Overall;
  categories: CategoryRow[];
  available: Available;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const m = meta(metricKey);

  const compareYear0 = Number(sp.get("compareYear"));
  const compareMonth0 = Number(sp.get("compareMonth"));
  const compareActive = Number.isFinite(compareYear0) && Number.isFinite(compareMonth0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cy, setCy] = useState<number>(compareActive ? compareYear0 : year);
  const [cm, setCm] = useState<number>(compareActive ? compareMonth0 : month);

  const [b, setB] = useState<RemoteMetrics | null>(null);
  const [bLoading, setBLoading] = useState(false);
  const [bErr, setBErr] = useState<string | null>(null);

  // подстраховка, если URL меняется (переключение табов/снимков)
  useEffect(() => {
    if (compareActive) {
      setCy(compareYear0);
      setCm(compareMonth0);
    } else {
      setB(null);
      setBErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.get("compareYear"), sp.get("compareMonth"), metricKey]);

  useEffect(() => {
    let alive = true;
    if (!compareActive) return;
    if (compareYear0 === year && compareMonth0 === month) {
      setB(null);
      setBErr("Периоды A и B совпадают");
      return;
    }
    setBLoading(true);
    setBErr(null);
    fetchMetrics({ year: compareYear0, month: compareMonth0, metricKey })
      .then((data) => {
        if (!alive) return;
        setB(data);
      })
      .catch((e: any) => {
        if (!alive) return;
        setB(null);
        setBErr(e?.message ?? "Не удалось загрузить период для сравнения");
      })
      .finally(() => {
        if (!alive) return;
        setBLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [compareActive, compareYear0, compareMonth0, metricKey, year, month]);

  const aOverall = overall;
  const bOverall = b?.overall ?? null;

  const mainA = aOverall?.value ?? 0;
  const mainB = bOverall?.value ?? 0;
  const mainDelta = aOverall && bOverall ? mainA - mainB : null;
  const mainAnimated = useAnimatedNumber(mainA || 0);

  function pushWithParams(next: URLSearchParams) {
    const qs = next.toString();
    router.push(`/${year}/${month}${qs ? `?${qs}` : ""}`);
  }

  function onApplyCompare() {
    const next = new URLSearchParams(sp.toString());
    // сохраним выбранный снимок и метрику, добавим compare
    next.set("compareYear", String(cy));
    next.set("compareMonth", String(cm));
    pushWithParams(next);
    setDrawerOpen(false);
  }

  function onClearCompare() {
    const next = new URLSearchParams(sp.toString());
    next.delete("compareYear");
    next.delete("compareMonth");
    pushWithParams(next);
    setDrawerOpen(false);
  }

  function tabHref(key: MetricKey) {
    const next = new URLSearchParams(sp.toString());
    if (key === "return_rate") next.delete("metric");
    else next.set("metric", key);
    return `/${year}/${month}?${next.toString()}`;
  }

  const years = useMemo(() => available.map((x) => x.year).sort((a, b) => b - a), [available]);
  const monthsForYear = useMemo(() => {
    const found = available.find((x) => x.year === cy);
    return (found?.months ?? []).slice().sort((a, b) => a - b);
  }, [available, cy]);

  // для таблицы сравнения: объединяем категории
  const table = useMemo(() => {
    const aMap = new Map<string, CategoryRow>();
    for (const r of categories) aMap.set(`${r.code ?? "x"}|${r.name}`, r);
    const bMap = new Map<string, CategoryRow>();
    for (const r of b?.categories ?? []) bMap.set(`${r.code ?? "x"}|${r.name}`, r);
    const keys = Array.from(new Set([...aMap.keys(), ...bMap.keys()]));
    return keys
      .map((k) => {
        const a = aMap.get(k) ?? null;
        const bb = bMap.get(k) ?? null;
        const delta = a && bb ? a.value - bb.value : null;
        return { key: k, name: a?.name ?? bb?.name ?? "—", a, b: bb, delta };
      })
      .sort((x, y) => {
        // дефолт: сначала просадки
        const dx = x.delta ?? 0;
        const dy = y.delta ?? 0;
        return dx - dy;
      });
  }, [categories, b?.categories]);

  const [sortMode, setSortMode] = useState<"drops" | "growth">("drops");
  const sortedTable = useMemo(() => {
    const rows = [...table];
    rows.sort((x, y) => {
      const isChurn = metricKey === "churn_rate";

      // Пустые дельты — всегда внизу
      if (x.delta == null && y.delta == null) return 0;
      if (x.delta == null) return 1;
      if (y.delta == null) return -1;

      const dx = x.delta;
      const dy = y.delta;

      // Для churn рост (плюс) = хуже, падение (минус) = лучше
      if (sortMode === "drops") return isChurn ? dy - dx : dx - dy;
      return isChurn ? dx - dy : dy - dx;
    });
    return rows;
  }, [table, sortMode, metricKey]);

  const sortLabels = useMemo(
    () =>
      metricKey === "churn_rate"
        ? { drops: "По Δ: ухудшения", growth: "По Δ: улучшения" }
        : { drops: "По Δ: просадки", growth: "По Δ: рост" },
    [metricKey]
  );

  const tabWrap = "inline-flex rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 p-1";
  const tabBase = "px-3 py-2 text-sm rounded-lg transition";

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className={tabWrap}>
            <a
              href={tabHref("return_rate")}
              className={cn(
                tabBase,
                metricKey === "return_rate"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-neutral-700 hover:bg-neutral-50"
              )}
            >
              Возвращаемость
            </a>
            <a
              href={tabHref("repeat_visit_rate")}
              className={cn(
                tabBase,
                metricKey === "repeat_visit_rate"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-neutral-700 hover:bg-neutral-50"
              )}
            >
              Частота повторных визитов
            </a>
            <a
              href={tabHref("churn_rate")}
              className={cn(
                tabBase,
                metricKey === "churn_rate"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-neutral-700 hover:bg-neutral-50"
              )}
            >
              Доля ушедших клиентов
            </a>
          </div>

          <a href="/" className="text-sm text-neutral-600 hover:text-neutral-900 hover:underline">
            ← На главную
          </a>

          <h1 className="text-3xl font-semibold tracking-tight">
            {m.title} • {monthNameRu(month)} {year}
          </h1>
          <div className="text-sm text-neutral-600">
            Формула: <span className="font-medium">{m.formula}</span>
          </div>

          {compareActive && (
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm shadow-sm ring-1 ring-neutral-200">
              <span className="text-neutral-600">Сравнение:</span>
              <span className="font-medium">{formatMonthYear(year, month)}</span>
              <span className="text-neutral-400">vs</span>
              <span className="font-medium">{formatMonthYear(compareYear0, compareMonth0)}</span>
              <button
                onClick={onClearCompare}
                className="ml-1 rounded-full px-2 py-0.5 text-neutral-600 hover:bg-neutral-100"
                title="Сбросить сравнение"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <div className="flex items-start gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg border bg-white px-3 py-2 text-sm shadow-sm hover:shadow-md hover:border-neutral-300 transition"
          >
            Сравнить
          </button>

          <SnapshotPicker
            year={year}
            month={month}
            currentReportId={currentReportId}
            options={snapshots}
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
      ) : (
        <>
          {compareActive && (bLoading || bErr) && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-neutral-700">
                {bLoading ? "Загружаю данные для сравнения…" : `Сравнение недоступно: ${bErr}`}
              </div>
            </div>
          )}

          {metricKey === "repeat_visit_rate" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-indigo-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-neutral-500">Частота повторных визитов</div>
                  {compareActive && <DeltaBadge metricKey={metricKey} delta={mainDelta} />}
                </div>
                <div className="mt-1 text-3xl font-semibold text-indigo-700">
                  {formatMetric(metricKey, mainAnimated)}
                </div>
                <div className="mt-2 text-sm text-neutral-600">
                  {compareActive && bOverall ? (
                    <>
                      A: <span className="font-medium">{formatMetric(metricKey, mainA)}</span>
                      {"  •  "}
                      B: <span className="font-medium">{formatMetric(metricKey, mainB)}</span>
                    </>
                  ) : (
                    <>
                      Всего визитов (нов+продолж): <span className="font-medium">{Math.round(aOverall!.numerator)}</span>
                      {" • "}
                      Новые: <span className="font-medium">{Math.round(aOverall!.denominator)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-sm text-neutral-500">КЛ. Новые Записанные</div>
                <div className="mt-1 text-3xl font-semibold">{Math.round(aOverall!.denominator)}</div>
                {compareActive && bOverall && (
                  <div className="mt-2 text-sm text-neutral-600">
                    B: <span className="font-medium">{Math.round(bOverall.denominator)}</span>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-sm text-neutral-500">КЛ. Продолжение Записанные</div>
                <div className="mt-1 text-3xl font-semibold">
                  {Math.max(0, Math.round(aOverall!.numerator - aOverall!.denominator))}
                </div>
                {compareActive && bOverall && (
                  <div className="mt-2 text-sm text-neutral-600">
                    B: <span className="font-medium">{Math.max(0, Math.round(bOverall.numerator - bOverall.denominator))}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-indigo-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-neutral-500">{metricKey === "churn_rate" ? "Доля ушедших клиентов" : "Возвращаемость"}</div>
                  {compareActive && <DeltaBadge metricKey={metricKey} delta={mainDelta} />}
                </div>
                <div className="mt-1 text-3xl font-semibold text-indigo-700">
                  {formatMetric(metricKey, mainAnimated)}
                </div>
                <div className="mt-2 text-sm text-neutral-600">
                  {compareActive && bOverall ? (
                    <>
                      A: <span className="font-medium">{formatMetric(metricKey, mainA)}</span>
                      {"  •  "}
                      B: <span className="font-medium">{formatMetric(metricKey, mainB)}</span>
                    </>
                  ) : metricKey === "churn_rate" ? (
                    (() => {
                      const prev = Math.round(aOverall!.denominator);
                      const lost = Math.round(aOverall!.numerator);
                      const cur = Math.round(aOverall!.denominator - aOverall!.numerator);
                      const label = lost >= 0 ? `Ушло: ${lost}` : `Прирост: ${Math.abs(lost)}`;
                      return (
                        <>
                          <span className="font-medium">{label}</span>{" "}
                          <span className="text-neutral-500">из {prev}</span>
                          {"  •  "}
                          <span className="text-neutral-500">Постоянные:</span>{" "}
                          <span className="font-medium">{prev} → {cur}</span>
                        </>
                      );
                    })()
                  ) : null}
                </div>
              </div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-sm text-neutral-500">{metricKey === "churn_rate" ? "Постоянные (прошлый период)" : "КЛ.Все Записанные"}</div>
                <div className="mt-1 text-3xl font-semibold">{Math.round(aOverall!.denominator)}</div>
                {compareActive && bOverall && (
                  <div className="mt-2 text-sm text-neutral-600">
                    B: <span className="font-medium">{Math.round(bOverall.denominator)}</span>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-sm text-neutral-500">{metricKey === "churn_rate" ? "Постоянные (текущий период)" : "КЛ. Повторные"}</div>
                <div className="mt-1 text-3xl font-semibold">{metricKey === "churn_rate" ? Math.round(aOverall!.denominator - aOverall!.numerator) : Math.round(aOverall!.numerator)}</div>
                {compareActive && bOverall && (
                  <div className="mt-2 text-sm text-neutral-600">
                    B: <span className="font-medium">{metricKey === "churn_rate" ? Math.round(bOverall.denominator - bOverall.numerator) : Math.round(bOverall.numerator)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-neutral-50 flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">Разбивка по специализациям</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {compareActive ? "Сравнение A и B с подсветкой дельт." : "Сортировка по убыванию значения метрики."}
                </div>
              </div>

              {compareActive && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Сортировка</span>
                  <select
                    className="rounded-lg border bg-white px-2 py-1 text-sm"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as any)}
                  >
                    <option value="drops">{sortLabels.drops}</option>
                    <option value="growth">{sortLabels.growth}</option>
                  </select>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-neutral-600">
                  {!compareActive ? (
                    metricKey === "repeat_visit_rate" ? (
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
                        <th className="py-3 px-4 font-medium">{metricKey === "churn_rate" ? "Пост. прошл." : "Все записанные"}</th>
                        <th className="py-3 px-4 font-medium">{metricKey === "churn_rate" ? "Пост. тек." : "Повторные"}</th>
                        <th className="py-3 px-4 font-medium">{metricKey === "churn_rate" ? "Churn" : "Возвращаемость"}</th>
                      </tr>
                    )
                  ) : (
                    <>
                      <tr className="border-b bg-white">
                        <th className="py-3 px-4 font-medium" rowSpan={2}>
                          Специализация
                        </th>
                        <th className="py-3 px-4 font-medium text-neutral-500" colSpan={metricKey === "repeat_visit_rate" ? 4 : 3}>
                          A • {formatMonthYear(year, month)}
                        </th>
                        <th className="py-3 px-4 font-medium text-neutral-500" colSpan={metricKey === "repeat_visit_rate" ? 4 : 3}>
                          B • {formatMonthYear(compareYear0, compareMonth0)}
                        </th>
                        <th className="py-3 px-4 font-medium" rowSpan={2}>
                          Δ
                        </th>
                      </tr>
                      {metricKey === "repeat_visit_rate" ? (
                        <tr className="border-b bg-white">
                          <th className="py-2 px-4 font-medium">Новые</th>
                          <th className="py-2 px-4 font-medium">Продолжение</th>
                          <th className="py-2 px-4 font-medium">Всего</th>
                          <th className="py-2 px-4 font-medium">Частота</th>
                          <th className="py-2 px-4 font-medium">Новые</th>
                          <th className="py-2 px-4 font-medium">Продолжение</th>
                          <th className="py-2 px-4 font-medium">Всего</th>
                          <th className="py-2 px-4 font-medium">Частота</th>
                        </tr>
                      ) : (
                        <tr className="border-b bg-white">
                          <th className="py-2 px-4 font-medium">{metricKey === "churn_rate" ? "Пост. прошл." : "Все"}</th>
                          <th className="py-2 px-4 font-medium">{metricKey === "churn_rate" ? "Пост. тек." : "Повторные"}</th>
                          <th className="py-2 px-4 font-medium">{metricKey === "churn_rate" ? "Churn" : "Возвр."}</th>
                          <th className="py-2 px-4 font-medium">{metricKey === "churn_rate" ? "Пост. прошл." : "Все"}</th>
                          <th className="py-2 px-4 font-medium">{metricKey === "churn_rate" ? "Пост. тек." : "Повторные"}</th>
                          <th className="py-2 px-4 font-medium">{metricKey === "churn_rate" ? "Churn" : "Возвр."}</th>
                        </tr>
                      )}
                    </>
                  )}
                </thead>

                <tbody>
                  {!compareActive ? (
                    categories.map((row) => {
                      const name = row.name;
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

                      if (metricKey === "churn_rate") {
                        const prev = row.denominator;
                        const cur = row.denominator - row.numerator;
                        return (
                          <tr key={row.id} className="border-b last:border-b-0 hover:bg-neutral-50">
                            <td className="py-3 px-4">{name}</td>
                            <td className="py-3 px-4">{Math.round(prev)}</td>
                            <td className="py-3 px-4">{Math.round(cur)}</td>
                            <td className="py-3 px-4 font-medium">{row.value.toFixed(2)}%</td>
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
                    })
                  ) : (
                    sortedTable.map((r) => {
                      const a = r.a;
                      const bb = r.b;
                      const delta = r.delta;
                      const tone = delta == null ? "neu" : deltaTone(metricKey, delta);
                      const deltaCell = (
                        <DeltaBadge metricKey={metricKey} delta={delta} />
                      );

                      if (metricKey === "repeat_visit_rate") {
                        const aTotal = a ? a.numerator : null;
                        const aNew = a ? a.denominator : null;
                        const aCont = a ? Math.max(0, Math.round(a.numerator - a.denominator)) : null;
                        const bTotal = bb ? bb.numerator : null;
                        const bNew = bb ? bb.denominator : null;
                        const bCont = bb ? Math.max(0, Math.round(bb.numerator - bb.denominator)) : null;

                        return (
                          <tr key={r.key} className={cn("border-b last:border-b-0 hover:bg-neutral-50", tone === "neg" && "bg-rose-50/30", tone === "pos" && "bg-emerald-50/30")}>
                            <td className="py-3 px-4">{r.name}</td>
                            <td className="py-3 px-4">{aNew == null ? "—" : Math.round(aNew)}</td>
                            <td className="py-3 px-4">{aCont == null ? "—" : aCont}</td>
                            <td className="py-3 px-4">{aTotal == null ? "—" : Math.round(aTotal)}</td>
                            <td className="py-3 px-4 font-medium">{a ? `${a.value.toFixed(2)}×` : "—"}</td>
                            <td className="py-3 px-4">{bNew == null ? "—" : Math.round(bNew)}</td>
                            <td className="py-3 px-4">{bCont == null ? "—" : bCont}</td>
                            <td className="py-3 px-4">{bTotal == null ? "—" : Math.round(bTotal)}</td>
                            <td className="py-3 px-4 font-medium">{bb ? `${bb.value.toFixed(2)}×` : "—"}</td>
                            <td className="py-3 px-4">{deltaCell}</td>
                          </tr>
                        );
                      }


                      if (metricKey === "churn_rate") {
                        const aPrev = a ? a.denominator : null;
                        const aCur = a ? a.denominator - a.numerator : null;
                        const bPrev = bb ? bb.denominator : null;
                        const bCur = bb ? bb.denominator - bb.numerator : null;

                        return (
                          <tr key={r.key} className={cn("border-b last:border-b-0 hover:bg-neutral-50", tone === "neg" && "bg-rose-50/30", tone === "pos" && "bg-emerald-50/30")}>
                            <td className="py-3 px-4">{r.name}</td>
                            <td className="py-3 px-4">{aPrev == null ? "—" : Math.round(aPrev)}</td>
                            <td className="py-3 px-4">{aCur == null ? "—" : Math.round(aCur)}</td>
                            <td className="py-3 px-4 font-medium">{a ? `${a.value.toFixed(2)}%` : "—"}</td>
                            <td className="py-3 px-4">{bPrev == null ? "—" : Math.round(bPrev)}</td>
                            <td className="py-3 px-4">{bCur == null ? "—" : Math.round(bCur)}</td>
                            <td className="py-3 px-4 font-medium">{bb ? `${bb.value.toFixed(2)}%` : "—"}</td>
                            <td className="py-3 px-4">{deltaCell}</td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={r.key} className={cn("border-b last:border-b-0 hover:bg-neutral-50", tone === "neg" && "bg-rose-50/30", tone === "pos" && "bg-emerald-50/30")}>
                          <td className="py-3 px-4">{r.name}</td>
                          <td className="py-3 px-4">{a ? Math.round(a.denominator) : "—"}</td>
                          <td className="py-3 px-4">{a ? Math.round(a.numerator) : "—"}</td>
                          <td className="py-3 px-4 font-medium">{a ? `${a.value.toFixed(2)}%` : "—"}</td>
                          <td className="py-3 px-4">{bb ? Math.round(bb.denominator) : "—"}</td>
                          <td className="py-3 px-4">{bb ? Math.round(bb.numerator) : "—"}</td>
                          <td className="py-3 px-4 font-medium">{bb ? `${bb.value.toFixed(2)}%` : "—"}</td>
                          <td className="py-3 px-4">{deltaCell}</td>
                        </tr>
                      );
                    })
                  )}

                  {(!compareActive && categories.length === 0) && (
                    <tr>
                      <td className="py-6 px-4 text-neutral-600" colSpan={metricKey === "repeat_visit_rate" ? 5 : 4}>
                        Нет строк по специализациям для этого месяца.
                      </td>
                    </tr>
                  )}

                  {compareActive && sortedTable.length === 0 && (
                    <tr>
                      <td className="py-6 px-4 text-neutral-600" colSpan={metricKey === "repeat_visit_rate" ? 10 : 8}>
                        Нет данных для сравнения по специализациям.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Сравнить период">
        <div className="space-y-2">
          <div className="text-sm text-neutral-600">Период A</div>
          <div className="rounded-xl border bg-neutral-50 px-3 py-2 text-sm">
            {formatMonthYear(year, month)}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-neutral-600">Период B</div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="rounded-lg border bg-white px-3 py-2 text-sm"
              value={cy}
              onChange={(e) => {
                const ny = Number(e.target.value);
                setCy(ny);
                // если выбранный месяц недоступен — переключим на первый доступный
                const mm = (available.find((x) => x.year === ny)?.months ?? []).slice().sort((a, b) => a - b);
                if (mm.length && !mm.includes(cm)) setCm(mm[0]);
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <select
              className="rounded-lg border bg-white px-3 py-2 text-sm"
              value={cm}
              onChange={(e) => setCm(Number(e.target.value))}
            >
              {monthsForYear.map((m) => (
                <option key={m} value={m}>
                  {monthNameRu(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-neutral-500">
            Доступны только те месяцы, по которым уже есть данные в истории.
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            onClick={onClearCompare}
            className="rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Сбросить
          </button>
          <button
            onClick={onApplyCompare}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            Применить
          </button>
        </div>
      </Drawer>
    </div>
  );
}
