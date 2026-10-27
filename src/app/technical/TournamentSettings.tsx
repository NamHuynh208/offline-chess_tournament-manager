"use client";
import { useEffect, useState } from "react";
import { textOn } from "@/lib/colors";

export type TournamentConfig = { id: string; name: string; startDate: string | null; endDate: string | null; location: string | null; organizer: string | null; totalRounds: number; logoUrl: string | null; primaryColor: string; timezone: string; requireTechnicalApproval: boolean };
const input = "min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal";
const dateValue = (value: string | null, timezone: string) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
};

export default function TournamentSettings({ tid, onSaved, onCancel }: { tid?: string; onSaved: (t: TournamentConfig) => void; onCancel?: () => void }) {
  const [config, setConfig] = useState<TournamentConfig | null>(tid ? null : { id: "new", name: "", startDate: null, endDate: null, location: null, organizer: null, totalRounds: 7, logoUrl: null, primaryColor: "#38bdf8", timezone: "Asia/Ho_Chi_Minh", requireTechnicalApproval: false });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!tid) return;
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
      const r = await fetch(tid ? `/api/tournaments/${tid}` : "/api/tournaments", { method: tid ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), startDate: date("startDate"), endDate: date("endDate"), location: form.get("location"), organizer: form.get("organizer"), totalRounds: Number(form.get("totalRounds")), logoUrl: form.get("logoUrl"), primaryColor: form.get("primaryColor"), requireTechnicalApproval: form.get("requireTechnicalApproval") === "on" }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.errors ? Object.values(b.errors).join(" · ") : b.error ?? "Không lưu được cấu hình");
      setConfig(b); onSaved(b); setMessage("Đã lưu cấu hình giải");
    } catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="text-lg font-bold">{tid ? "Cấu hình giải đấu" : "Tạo giải đấu mới"}</h2>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {message && <p className="font-semibold text-emerald-800">{message}</p>}
    {config && <form key={config.id} onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 font-semibold sm:col-span-2">Tên giải<input autoFocus={!tid} required name="name" maxLength={200} defaultValue={config.name} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Bắt đầu ({config.timezone})<input type="datetime-local" name="startDate" defaultValue={dateValue(config.startDate, config.timezone)} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Kết thúc ({config.timezone})<input type="datetime-local" name="endDate" defaultValue={dateValue(config.endDate, config.timezone)} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Địa điểm<input name="location" maxLength={200} defaultValue={config.location ?? ""} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Đơn vị tổ chức<input name="organizer" maxLength={200} defaultValue={config.organizer ?? ""} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Số vòng<input required type="number" min={1} max={30} name="totalRounds" defaultValue={config.totalRounds} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">URL logo<input name="logoUrl" defaultValue={config.logoUrl ?? ""} placeholder="https://... hoặc /logo.png" className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Màu sắc nhận diện<input aria-label="Màu sắc nhận diện" type="color" name="primaryColor" defaultValue={config.primaryColor} className="h-11 w-full rounded border" /></label>
      <div className="space-y-2 rounded-lg bg-slate-50 p-3 sm:col-span-2"><label className="flex items-start gap-3 font-semibold"><input type="checkbox" name="requireTechnicalApproval" defaultChecked={config.requireTechnicalApproval} className="mt-1" />Trọng tài kỹ thuật duyệt trước khi lên máy chiếu</label><p className="text-sm text-slate-600">Mặc định tắt: đủ xác nhận thì chính thức ngay. Khi bật: đủ xác nhận vẫn chờ TTKT duyệt công bố. Ngoại lệ/BYE do TTKT duyệt vẫn chính thức. Đổi tùy chọn không tự công bố các bàn đang chờ và không thu hồi kết quả đã chính thức.</p></div>
      <div className="flex items-end gap-3"><button disabled={busy} className="rounded-lg px-4 py-3 font-bold disabled:opacity-50" style={{ background: config.primaryColor, color: textOn(config.primaryColor) }}>{busy ? "Đang lưu..." : tid ? "Lưu cấu hình giải" : "Tạo giải đấu"}</button>{onCancel && <button type="button" disabled={busy} className={input} onClick={onCancel}>Hủy</button>}</div>
    </form>}
  </section>;
}
