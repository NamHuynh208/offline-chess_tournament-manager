"use client";
export default function SyncStatus({ lastSync, error, timezone }: { lastSync: string | null; error: string; timezone: string }) {
  const time = lastSync ? new Intl.DateTimeFormat("vi-VN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(lastSync)) : "—";
  return <div role="status" className={`rounded-lg px-3 py-2 text-sm font-semibold ${error ? "bg-orange-100 text-orange-900" : "bg-emerald-100 text-emerald-900"}`}>
    {error || (lastSync ? "Đã đồng bộ" : "Đang kết nối")} (Cập nhật cuối: {time})
  </div>;
}
