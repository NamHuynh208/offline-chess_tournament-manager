"use client";
export default function SyncStatus({ lastSync, error, timezone }: { lastSync: string | null; error: string; timezone: string }) {
  const time = lastSync ? new Intl.DateTimeFormat("vi-VN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(lastSync)) : "—";
  return <div role="status" className={`inline-flex items-center gap-2 rounded-sm px-3 py-2 text-xs font-medium ${error ? "bg-orange-100 text-orange-900" : "bg-emerald-50 text-emerald-900"}`}>
    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${error ? "bg-orange-600" : "bg-emerald-600"}`} />
    <span>{error || (lastSync ? "Đã đồng bộ" : "Đang kết nối")} (Cập nhật cuối: {time})</span>
  </div>;
}
