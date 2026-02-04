import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

type MonthCell = {
  month: number;
  value: number | null;
  reportId: string;
  uploadedAtISO: string;
};

function monthShort(m: number) {
  const names = ["", "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  return names[m] ?? `M${m}`;
}

async function getLatestNav() {
  const periods = await prisma.period.findMany({
    include: {
      report: true,
      metricValues: {
        where: { metricKey: "return_rate", scopeType: "overall" },
        select: { value: true },
      },
    },
    orderBy: { report: { uploadedAt: "desc" } },
  });

  const byYear = new Map<number, MonthCell[]>();
  const seen = new Set<string>();

  for (const p of periods) {
    const key = `${p.year}-${p.month}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const val = p.metricValues[0]?.value ?? null;
    const cell: MonthCell = {
      month: p.month,
      value: val,
      reportId: p.reportId,
      uploadedAtISO: p.report.uploadedAt.toISOString(),
    };

    if (!byYear.has(p.year)) byYear.set(p.year, []);
    byYear.get(p.year)!.push(cell);
  }

  const years = Array.from(byYear.keys()).sort((a, b) => b - a);
  return years.map((y) => ({
    year: y,
    months: byYear.get(y)!.sort((a, b) => a.month - b.month),
  }));
}

const getLatestNavCached = unstable_cache(getLatestNav, ["sidebar-nav"], {
  revalidate: 3600,
  tags: ["nav", "periods"],
});

export async function Sidebar() {
  const nav = await getLatestNavCached();

  return (
    <aside className="w-full md:w-72 shrink-0 border-r bg-white p-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="block text-lg font-semibold">
          Vet Metrics
        </Link>
      </div>

      <div className="mt-4">
        <div className="text-sm font-medium text-neutral-600">Периоды</div>
        <div className="mt-2 space-y-3">
          {nav.map((y) => (
            <div key={y.year} className="rounded-xl border bg-neutral-50 p-3">
              <div className="text-sm font-medium">{y.year}</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {y.months.map((m) => (
                  <Link
                    key={`${y.year}-${m.month}`}
                    href={`/${y.year}/${m.month}?reportId=${m.reportId}`}
                    className="rounded-lg border bg-white px-2 py-2 text-xs hover:bg-neutral-50 shadow-sm"
                    title={`Загружено: ${new Date(m.uploadedAtISO).toLocaleString("ru-RU")}`}
                    prefetch
                  >
                    <div className="font-medium">{monthShort(m.month)}</div>
                    <div className="text-neutral-500 mt-0.5">{m.value == null ? "—" : `${m.value.toFixed(1)}%`}</div>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {nav.length === 0 && (
            <div className="text-sm text-neutral-600">Пока нет данных. Загрузите Excel.</div>
          )}
        </div>
      </div>

      <div className="mt-6 border-t pt-4">
        <Link href="/reports" className="text-sm hover:underline" prefetch>
          История загрузок
        </Link>
      </div>
    </aside>
  );
}
