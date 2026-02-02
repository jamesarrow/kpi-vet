import * as XLSX from "xlsx";

export type ParsedMetricRow = {
  year: number;
  month: number;           // 1..12
  periodKey: string;       // "M10.2025"
  scopeType: "overall" | "category";
  category?: { code: number; name: string };

  allClients: number;      // Клиенты / КЛ.Все Записанные
  repeatClients: number;   // Клиенты / КЛ. Повторные
  value: number;           // repeat / all * 100
};

const COL_GROUP_NAME = "Группа / Название";
const COL_ALL = "Клиенты / КЛ.Все Записанные";
const COL_REPEAT = "Клиенты / КЛ. Повторные";

const monthRe = /^M(\d{1,2})\.(\d{4})$/;
const categoryRe = /^(\d+)\s*,\s*(.+)$/;

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const s = v.replace(/\s+/g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function parseWorkbook(buffer: Buffer): ParsedMetricRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const out: ParsedMetricRow[] = [];

  for (const sheetName of wb.SheetNames) {
    if (!/^\d{4}$/.test(sheetName)) continue;

    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][];

    if (!rows.length) continue;

    const header = (rows[0] ?? []).map((h) => String(h ?? "").trim());
    const idxName = header.indexOf(COL_GROUP_NAME);
    const idxAll = header.indexOf(COL_ALL);
    const idxRepeat = header.indexOf(COL_REPEAT);

    if (idxName < 0 || idxAll < 0 || idxRepeat < 0) {
      throw new Error(
        `На листе ${sheetName} не найдены нужные колонки: "${COL_GROUP_NAME}", "${COL_ALL}", "${COL_REPEAT}".`
      );
    }

    let current: { year: number; month: number; periodKey: string } | null = null;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const nameRaw = r[idxName];
      const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
      if (!name) continue;

      // Месяц (итог)
      const m = name.match(monthRe);
      if (m) {
        const month = Number(m[1]);
        const year = Number(m[2]);
        current = { year, month, periodKey: name };

        const all = toNumber(r[idxAll]);
        const repeat = toNumber(r[idxRepeat]);
        const value = all > 0 ? (repeat / all) * 100 : 0;

        out.push({
          year,
          month,
          periodKey: name,
          scopeType: "overall",
          allClients: all,
          repeatClients: repeat,
          value,
        });
        continue;
      }

      // Специализация
      if (!current) continue;

      const c = name.match(categoryRe);
      if (!c) continue;

      const code = Number(c[1]);
      const catName = c[2].trim();
      if (!Number.isFinite(code) || !catName) continue;

      const all = toNumber(r[idxAll]);
      const repeat = toNumber(r[idxRepeat]);
      const value = all > 0 ? (repeat / all) * 100 : 0;

      out.push({
        year: current.year,
        month: current.month,
        periodKey: current.periodKey,
        scopeType: "category",
        category: { code, name: catName },
        allClients: all,
        repeatClients: repeat,
        value,
      });
    }
  }

  return out;
}
