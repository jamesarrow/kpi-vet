"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type SnapshotOption = {
  reportId: string;
  label: string;
};

export function SnapshotPicker({
  year,
  month,
  currentReportId,
  options,
}: {
  year: number;
  month: number;
  currentReportId: string;
  options: SnapshotOption[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  return (
    <select
      className="rounded-lg border bg-white px-3 py-2 text-sm"
      value={currentReportId}
      onChange={(e) => {
        const reportId = e.target.value;
        const params = new URLSearchParams(sp.toString());
        params.set("reportId", reportId);
        router.push(`/${year}/${month}?${params.toString()}`);
      }}
    >
      {options.map((o) => (
        <option key={o.reportId} value={o.reportId}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
