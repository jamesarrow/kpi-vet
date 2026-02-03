"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function UploadExcel({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/reports/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Ошибка загрузки");

      router.refresh();
      if (!compact) {
        alert(json?.deduped ? "Этот файл уже загружали — открой нужный месяц в меню." : "Файл загружен. Данные обновлены.");
      }
    } catch (err: any) {
      alert(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={onPickFile}
      />

      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className={
          (compact ? "px-3 py-2 text-sm" : "px-4 py-2") +
          " rounded-lg bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
        }
      >
        {loading ? "Загружаю..." : "Загрузить Excel"}
      </button>
    </div>
  );
}
