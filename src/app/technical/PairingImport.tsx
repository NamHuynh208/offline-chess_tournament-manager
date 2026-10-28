"use client";
import { useState } from "react";
type Preview = { previewToken: string; round: number; canCommit: boolean; summary: { boards: number; overwrittenBoards: number; overwrittenWithResult: number }; errors: { row?: number; column?: string; message: string }[]; warnings: { message: string }[]; overwrite: { board: number; change: string; hasResult: boolean }[]; rows: { board: number; white: { startNo: number; name: string }; black: { startNo: number; name: string } | null }[] };

export default function PairingImport({ tid }: { tid: string }) {
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
      const r = await fetch(`/api/tournaments/${tid}/import/pairing`, { method: "POST", body: form });
      const b = await r.json();
      if (!r.ok) { if (r.status === 409) { setPreview(null); setConfirmed(false); } throw new Error(b.error ?? "Không nhập được file"); }
      if (commit) { setPreview(null); setConfirmed(false); setMessage(`Đã nhập vòng ${b.round}: ${b.summary.boards} bàn`); }
      else { setPreview(b); setConfirmed(false); }
    } catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ"); }
    finally { setBusy(false); }
  }
  return <section className="app-card space-y-3 rounded-sm p-5"><h2 className="text-lg font-bold">Nhập bốc thăm</h2>
    <label className="flex flex-col gap-2 font-semibold">File bốc thăm (.xls / .xlsx)<input disabled={busy} type="file" accept=".xls,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setConfirmed(false); setError(""); setMessage(""); }} /></label>
    <button disabled={busy || !file} onClick={() => void send(false)} className="rounded-sm bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50">Xem trước bốc thăm</button>
    {error && <p role="alert" className="text-red-800">{error}</p>}{message && <p className="font-semibold text-emerald-800">{message}</p>}
    {preview && <div className="space-y-3"><h3 className="font-bold">Xem trước vòng {preview.round} · {preview.summary.boards} bàn</h3>
      {preview.errors.map((e, i) => <p key={i} className="text-red-800">Lỗi {e.row ? `dòng ${e.row}` : ""} {e.column ?? ""}: {e.message}</p>)}
      {preview.warnings.map((w, i) => <p key={i} className="text-orange-900">Cảnh báo: {w.message}</p>)}
      {preview.overwrite.length > 0 && <div className="rounded-sm bg-orange-50 p-3 text-orange-900"><p className="font-bold">Cảnh báo ghi đè {preview.summary.overwrittenBoards} bàn ({preview.summary.overwrittenWithResult} bàn đã có kết quả)</p>{preview.overwrite.map((o) => <p key={o.board}>Bàn {o.board}: {o.change}{o.hasResult && " — đã có kết quả"}</p>)}<label className="mt-2 flex gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />Tôi xác nhận ghi đè các bàn nêu trên</label></div>}
      <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Bàn</th><th>Trắng (STT)</th><th>Đen (STT)</th></tr></thead><tbody>{preview.rows.map((r) => <tr key={r.board} className="border-t"><td className="py-2">{r.board}</td><td>{r.white.name} ({r.white.startNo})</td><td>{r.black ? `${r.black.name} (${r.black.startNo})` : "Miễn đấu (BYE)"}</td></tr>)}</tbody></table></div>
      <button disabled={busy || !preview.canCommit || (!!preview.overwrite.length && !confirmed)} onClick={() => void send(true)} className="rounded-sm bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50">Nhập bốc thăm đã xem trước</button>
    </div>}
  </section>;
}
