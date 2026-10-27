"use client";
import { useEffect, useState } from "react";
import { textOn } from "@/lib/colors";

export type TournamentConfig = { id: string; name: string; startDate: string | null; endDate: string | null; location: string | null; organizer: string | null; totalRounds: number; logoUrl: string | null; primaryColor: string; timezone: string };
const input = "min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal";
const dateValue = (value: string | null, timezone: string) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
};

export default function TournamentSettings({ tid, onSaved }: { tid: string; onSaved: (t: TournamentConfig) => void }) {
  const [config, setConfig] = useState<TournamentConfig | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tournaments/${tid}`, { cache: "no-store", signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error("Không tải được cấu hình"); setConfig(await r.json()); }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [tid]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!config) return;
    const form = new FormData(e.currentTarget);
    setBusy(true); setError(""); setMessage("");
    const date = (key: string) => {
      const value = String(form.get(key) ?? "");
      if (!value) return null;
      // Giải hiện dùng Asia/Ho_Chi_Minh, không phụ thuộc múi giờ máy trọng tài.
      const offset = new Intl.DateTimeFormat("en", { timeZone: config.timezone, timeZoneName: "longOffset" }).formatToParts(new Date(`${value}Z`)).find((p) => p.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
      return new Date(`${value}${offset}`).toISOString();
    };
    try {
      const r = await fetch(`/api/tournaments/${tid}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), startDate: date("startDate"), endDate: date("endDate"), location: form.get("location"), organizer: form.get("organizer"), totalRounds: Number(form.get("totalRounds")), logoUrl: form.get("logoUrl"), primaryColor: form.get("primaryColor") }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.errors ? Object.values(b.errors).join(" · ") : b.error ?? "Không lưu được cấu hình");
      setConfig(b); onSaved(b); setMessage("Đã lưu cấu hình giải");
    } catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="text-lg font-bold">Cấu hình giải đấu</h2>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {message && <p className="font-semibold text-emerald-800">{message}</p>}
    {config && <form key={config.id} onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 font-semibold sm:col-span-2">Tên giải<input required name="name" maxLength={200} defaultValue={config.name} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Bắt đầu ({config.timezone})<input type="datetime-local" name="startDate" defaultValue={dateValue(config.startDate, config.timezone)} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Kết thúc ({config.timezone})<input type="datetime-local" name="endDate" defaultValue={dateValue(config.endDate, config.timezone)} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Địa điểm<input name="location" maxLength={200} defaultValue={config.location ?? ""} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Đơn vị tổ chức<input name="organizer" maxLength={200} defaultValue={config.organizer ?? ""} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Số vòng<input required type="number" min={1} max={30} name="totalRounds" defaultValue={config.totalRounds} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">URL logo<input name="logoUrl" defaultValue={config.logoUrl ?? ""} placeholder="https://... hoặc /logo.png" className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Màu sắc nhận diện<input aria-label="Màu sắc nhận diện" type="color" name="primaryColor" defaultValue={config.primaryColor} className="h-11 w-full rounded border" /></label>
      <button disabled={busy} className="self-end rounded-lg px-4 py-3 font-bold disabled:opacity-50" style={{ background: config.primaryColor, color: textOn(config.primaryColor) }}>{busy ? "Đang lưu..." : "Lưu cấu hình giải"}</button>
    </form>}
  </section>;
}
