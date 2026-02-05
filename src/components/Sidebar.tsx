import { prisma } from "@/lib/prisma";
import { isVetSpecialization } from "@/lib/categoryFilter";

export async function Sidebar() {
  const categories = await prisma.category.findMany({
    // Убираем «пустые»/служебные дубли (например, «Терапия» без данных)
    // — показываем только те категории, где есть хоть какие-то значения.
    where: {
      metricValues: {
        some: {
          scopeType: "category",
          metricKey: "return_rate",
          denominator: { gt: 0 },
        },
      },
    },
    orderBy: { name: "asc" },
    select: { code: true, name: true },
  });
  const safeCategories = categories.filter(
    (c): c is typeof c & { code: number } => c.code != null && isVetSpecialization(c.name)
  );

  return (
    <aside className="w-72 shrink-0 bg-white border-r min-h-screen">
      <div className="p-5 space-y-4">
        <div className="space-y-1">
          <div className="text-lg font-semibold">Метрики ветклиники</div>
          <div className="text-xs text-neutral-600">
            Сначала выбери специализацию, затем смотри динамику по месяцам и итог за год.
          </div>
        </div>

        <div className="flex gap-2">
          <a
            href="/"
            className="flex-1 text-center text-sm rounded-xl border px-3 py-2 hover:bg-neutral-50"
          >
            Специализации
          </a>
          <a
            href="/overall"
            className="flex-1 text-center text-sm rounded-xl border px-3 py-2 hover:bg-neutral-50"
          >
            Общий
          </a>
        </div>

        <div className="border-t" />

        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
            Специализации
          </div>

          {safeCategories.length === 0 ? (
            <div className="text-sm text-neutral-600">
              Пока нет данных. Загрузите Excel — появится список специализаций.
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto pr-1 space-y-1">
              {safeCategories.map((c) => (
                <a
                  key={c.code as number}
                  href={`/specializations/${c.code}`}
                  className="block rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
                  title={`Код: ${c.code}`}
                >
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-neutral-500">Код: {c.code}</div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="border-t" />

        <a
          href="/reports"
          className="block text-sm text-neutral-700 hover:text-neutral-900 hover:underline"
        >
          История загрузок
        </a>
      </div>
    </aside>
  );
}
