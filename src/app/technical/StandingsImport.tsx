"use client";
import { useState } from "react";
import type { StandingRow } from "@/lib/swiss-manager";
type Preview = { previewToken: string; title: string; round: number | null; canCommit: boolean; tiebreakLabels: string[]; rows: StandingRow[]; replaces: { title: string; fileName: string } | null; errors: { row?: number; column?: string; message: string }[] };

// Cùng bố cục/luồng với PairingImport: Xem trước -> (xác nhận thay bảng cũ) -> Nhập
export default function StandingsImport({ tid }: { tid: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function send(commit: boolean) {
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(); form.set("file", file); form.set("mode", commit ? "commit" : "preview");
    if (commit && preview) { form.set("previewToken", preview.previewToken); form.set("confirmOverwrite", String(confirmed)); }
    try {
      const r = await fetch(`/api/tournaments/${tid}/import/standings`, { method: "POST", body: form });
      const b = await r.json();
      if (!r.ok) { if (r.status === 409) { setPreview(null); setConfirmed(false); } throw new Error(b.error ?? "Không nhập được file"); }
      if (commit) { setPreview(null); setConfirmed(false); setMessage(`Đã nhập ${b.title}: ${b.rows.length} kỳ thủ. Màn hình trình chiếu cập nhật trong vài giây.`); }
      else { setPreview(b); setConfirmed(false); }
    } catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ"); }
    finally { setBusy(false); }
  }
  return <section className="import-section app-card space-y-4 rounded-sm"><h2 className="font-semibold">Nhập bảng xếp hạng</h2><p className="text-sm leading-relaxed text-slate-500">Tải file Xếp hạng tạm thời / chung cuộc từ Swiss-Manager để chiếu lên màn hình. Hệ thống không tự tính hạng.</p>
    <label className="flex flex-col gap-2 font-semibold">File xếp hạng (.xls / .xlsx)<input disabled={busy} type="file" accept=".xls,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setConfirmed(false); setError(""); setMessage(""); }} /></label>
    <button disabled={busy || !file} onClick={() => void send(false)} className="ui-primary disabled:opacity-50">Xem trước bảng xếp hạng</button>
    {error && <p role="alert" className="text-red-800">{error}</p>}{message && <p className="font-semibold text-emerald-800">{message}</p>}
    {preview && <div className="space-y-3"><h3 className="font-bold">{preview.title} · {preview.rows.length} kỳ thủ</h3>
      {preview.errors.map((e, i) => <p key={i} className="text-red-800">Lỗi {e.row ? `dòng ${e.row}` : ""} {e.column ?? ""}: {e.message}</p>)}
      {preview.replaces && <div className="rounded-sm bg-orange-50 p-3 text-orange-900"><p className="font-bold">Cảnh báo ghi đè: bảng hiện tại “{preview.replaces.title}” ({preview.replaces.fileName}) sẽ được thay</p><label className="mt-2 flex gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />Tôi xác nhận thay bảng xếp hạng</label></div>}
      <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Hạng</th><th>Tên (STT)</th><th>CLB</th><th>Điểm</th>{preview.tiebreakLabels.map((l) => <th key={l}>{l}</th>)}</tr></thead><tbody>{preview.rows.map((r) => <tr key={r.row} className="border-t"><td className="py-2">{r.rank}</td><td>{r.name}{r.startNo !== null && ` (${r.startNo})`}</td><td>{r.club ?? ""}</td><td>{r.points}</td>{r.tiebreaks.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody></table></div>
      <button disabled={busy || !preview.canCommit || (!!preview.replaces && !confirmed)} onClick={() => void send(true)} className="ui-primary disabled:opacity-50">Nhập bảng xếp hạng đã xem trước</button>
    </div>}
  </section>;
}
