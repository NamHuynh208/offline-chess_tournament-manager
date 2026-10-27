"use client";
import { useEffect, useRef, useState } from "react";
import type { ResultType } from "@prisma/client";
import type { ClientMatch } from "@/lib/matches";
import { RESULT_DISPLAY, STATUS_LABEL } from "@/lib/results";
import { useLiveTournament } from "@/lib/use-live-tournament";
import { readyToPublish, toState, type TechnicalAction } from "@/lib/match-state";
import SyncStatus from "../components/SyncStatus";
import TournamentSettings, { type TournamentConfig } from "./TournamentSettings";
import PairingImport from "./PairingImport";
import { ClipboardPen, LogOut, Plus, Settings, Trash2 } from "lucide-react";

const button = "rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50";
const input = "rounded-lg border border-slate-300 bg-white px-3 py-2";
const headerAction = "inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold";
type Board = ClientMatch & { round: number };
type Log = { id: string; roundNumber: number | null; board: number | null; action: string; oldValue: string | null; newValue: string | null; reason: string | null; createdAt: string; user: { fullName: string; username: string }; match: { board: number; round: { number: number } } | null };

export default function TechnicalApp({ tournaments: initialTournaments, fullName }: { tournaments: { id: string; name: string }[]; fullName: string }) {
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [tid, setTid] = useState(tournaments[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const current = tournaments.find((t) => t.id === tid);
  const created = (t: TournamentConfig) => { setTournaments((ts) => [{ id: t.id, name: t.name }, ...ts]); setTid(t.id); setCreating(false); };
  return <div className="min-h-dvh">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-white px-6 py-4">
      <div className="min-w-0"><h1 className="text-xl font-bold">Điều hành kỹ thuật</h1><p className="break-words text-sm text-slate-500">{fullName}</p></div>
      <div role="group" aria-label="Quản lý giải đấu" className="flex w-full min-w-0 flex-wrap items-end gap-3 xl:w-auto">
        {!!tournaments.length && <label className="flex w-full min-w-0 flex-col gap-1 text-sm font-semibold sm:w-auto">Giải đấu<select aria-label="Giải đấu" className={`${input} h-11 w-full sm:w-72`} value={tid} onChange={(e) => setTid(e.target.value)}>{tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
        <button aria-label="+ Tạo giải mới" className={`${headerAction} bg-slate-900 text-white`} onClick={() => setCreating(true)}><Plus aria-hidden="true" size={18} className="shrink-0" />Tạo giải mới</button>
        {current && <><button className={`${headerAction} border border-slate-300 bg-white`} onClick={() => { document.getElementById("tournament-settings")?.scrollIntoView({ behavior: "smooth", block: "start" }); document.querySelector<HTMLInputElement>('#tournament-settings input[name="name"]')?.focus({ preventScroll: true }); }}><Settings aria-hidden="true" size={18} className="shrink-0" />Cấu hình / Sửa giải</button><button className={`${headerAction} border border-red-300 text-red-800`} onClick={() => setDeleting(true)}><Trash2 aria-hidden="true" size={18} className="shrink-0" />Xoá giải đấu</button></>}
      </div>
      <nav className="flex flex-wrap items-center gap-2"><a className={headerAction} href="/record"><ClipboardPen aria-hidden="true" size={18} className="shrink-0" />Ghi kết quả tại bàn</a><button className={headerAction} onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/login"; }}><LogOut aria-hidden="true" size={18} className="shrink-0" />Đăng xuất</button></nav>
    </header>
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      {tid ? <TournamentDashboard key={tid} tid={tid} onRename={(t) => setTournaments((ts) => ts.map((x) => x.id === t.id ? { ...x, name: t.name } : x))} /> : <section className="space-y-4 rounded-xl border bg-white p-8 text-center"><h2 className="text-2xl font-bold">Chào mừng đến với USCC</h2><p className="text-slate-600">Chưa có giải đấu. Tạo giải đầu tiên để bắt đầu nhập bốc thăm và ghi kết quả.</p><button className={button} onClick={() => setCreating(true)}>Tạo giải đấu đầu tiên</button></section>}
    </main>
    {creating && <Modal label="Tạo giải đấu mới" onClose={() => setCreating(false)}><TournamentSettings onSaved={created} onCancel={() => setCreating(false)} /></Modal>}
    {deleting && current && <DeleteTournament tournament={current} onCancel={() => setDeleting(false)} onDeleted={() => { const remaining = tournaments.filter((t) => t.id !== tid); setTournaments(remaining); setTid(remaining[0]?.id ?? ""); setDeleting(false); }} />}
  </div>;
}

function TournamentDashboard({ tid, onRename }: { tid: string; onRename: (t: TournamentConfig) => void }) {
  const { data, lastSync, error, updateTournament } = useLiveTournament(tid);
  const [tab, setTab] = useState("attention");
  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<Board | null>(null);
  const [history, setHistory] = useState<Board | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const t = data?.tournament;
  const boards: Board[] = data?.rounds.flatMap((r) => r.matches.map((m) => ({ ...m, round: r.number }))) ?? [];
  const ready = boards.filter((m) => readyToPublish(toState(m)));
  const attention = boards.filter((m) => m.status === "DISPUTED" || !!m.exceptionReason || readyToPublish(toState(m)));
  const visible = (tab === "attention" ? attention : boards).filter((m) => !round || m.round === round);
  async function publish(matches: Board[]) {
    setPublishing(true); setPublishMessage("");
    let count = 0;
    try {
      for (const m of matches) {
        const r = await fetch(`/api/matches/${m.id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: { type: "APPROVE_PUBLICATION" }, expectedUpdatedAt: m.updatedAt }), signal: AbortSignal.timeout(10000) });
        const b = await r.json();
        if (!r.ok) throw new Error(`Bàn ${m.board}: ${b.error ?? "Không duyệt được"}`);
        count++;
      }
      setPublishMessage(`Đã duyệt công bố ${count} bàn.`);
    } catch (e) { setPublishMessage(`Đã duyệt ${count} bàn; dừng: ${e instanceof Error ? e.message : "Lỗi mạng"}. Kiểm tra dữ liệu mới trước khi thử lại.`); }
    finally { setPublishing(false); }
  }
  return <>
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm" style={{ borderTop: `4px solid ${t?.primaryColor ?? "#38bdf8"}` }}>
      <div><h2 className="text-xl font-bold">{t?.name ?? "Đang tải giải..."}</h2><p className="text-sm text-slate-500">{boards.filter((m) => m.status === "OFFICIAL").length}/{boards.length} bàn chính thức · {attention.length} cần xử lý</p></div>
      <SyncStatus lastSync={lastSync} error={error} timezone={t?.timezone ?? "Asia/Ho_Chi_Minh"} />
      <a className={button} href={`/projector/${tid}`} target="_blank" rel="noopener noreferrer">Mở màn hình trình chiếu ↗</a>
    </div>
    <div id="tournament-settings"><TournamentSettings tid={tid} onSaved={(t) => { updateTournament(t); onRename(t); }} /></div>
    <PairingImport tid={tid} />
    {(ready.length > 0 || publishMessage) && <section className="space-y-2 rounded-xl border border-sky-300 bg-sky-50 p-4"><p className="font-semibold">{ready.length} bàn đủ xác nhận, chờ TTKT duyệt công bố</p><button disabled={publishing || !ready.length} className={button} onClick={() => void publish(ready)}>Duyệt nhanh tất cả bàn đã đủ xác nhận</button>{publishMessage && <p role="status">{publishMessage}</p>}</section>}
    <div className="flex flex-wrap gap-3" role="group" aria-label="Chế độ xem">
      {[{ id: "attention", label: `⚠ Cần xử lý (${attention.length})` }, { id: "all", label: "Tất cả bàn" }, { id: "audit", label: "Lịch sử toàn giải" }].map((x) => <button key={x.id} aria-pressed={tab === x.id} onClick={() => setTab(x.id)} className={`rounded-lg border px-4 py-3 font-bold ${tab === x.id ? x.id === "attention" ? "border-orange-400 bg-orange-100 text-orange-900" : "bg-slate-900 text-white" : "bg-white"}`}>{x.label}</button>)}
    </div>
    {tab === "audit" ? <AuditHistory key={tid} tid={tid} timezone={t?.timezone ?? "Asia/Ho_Chi_Minh"} /> : <>
      <label className="flex items-center gap-3">Vòng <select className={input} value={round} onChange={(e) => setRound(Number(e.target.value))}><option value={0}>Toàn giải</option>{data?.rounds.map((r) => <option key={r.number} value={r.number}>Vòng {r.number}</option>)}</select></label>
      <div className="grid gap-4 lg:grid-cols-2">{visible.map((m) => <article key={m.id} className={`space-y-3 rounded-xl border bg-white p-5 ${m.status === "DISPUTED" || m.exceptionReason ? "border-orange-300" : "border-slate-200"}`}>
        <div className="flex justify-between gap-3"><h3 className="text-lg font-bold">Vòng {m.round} · Bàn {m.board}</h3><span className={m.status === "DISPUTED" ? "font-semibold text-red-700" : "text-slate-600"}>{STATUS_LABEL[m.status]}</span></div>
        <p>○ {m.white.fullName} <span className="text-slate-400">—</span> ● {m.black?.fullName ?? "Miễn đấu"}</p>
        <p className="text-xl font-bold">{m.result ? RESULT_DISPLAY[m.result].score : "Chưa có kết quả"} {m.status !== "OFFICIAL" && m.result && <span className="text-sm font-normal text-orange-800">(Chưa chính thức)</span>}</p>
        {m.exceptionReason && <p className="rounded-lg bg-orange-50 p-3 text-orange-900">Yêu cầu ngoại lệ: {m.exceptionReason}</p>}
        {readyToPublish(toState(m)) && <div className="space-y-2 rounded-lg bg-sky-50 p-3"><p>Đã đủ xác nhận kỳ thủ — chờ duyệt công bố</p><button disabled={publishing} className={button} onClick={() => void publish([m])}>Duyệt công bố</button></div>}
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => setSelected(m)}>Xử lý / Sửa kết quả</button><button className={`${input} font-semibold`} onClick={() => setHistory(m)}>Lịch sử bàn</button></div>
      </article>)}</div>
      {!visible.length && <p className="rounded-xl border bg-white p-10 text-center text-slate-500">{data ? "Không có bàn nào trong danh sách này." : "Đang tải dữ liệu..."}</p>}
    </>}
    {selected && <EditDialog match={selected} onClose={() => setSelected(null)} />}
    {history && <Modal label="Lịch sử bàn" onClose={() => setHistory(null)}><div className="mb-4 flex justify-between"><h2 className="text-xl font-bold">Lịch sử vòng {history.round} · bàn {history.board}</h2><button className={button} autoFocus onClick={() => setHistory(null)}>Đóng</button></div><AuditHistory tid={tid} matchId={history.id} timezone={t?.timezone ?? "Asia/Ho_Chi_Minh"} /></Modal>}
  </>;
}

function EditDialog({ match, onClose }: { match: Board; onClose: () => void }) {
  const [m, setM] = useState(match);
  const [operation, setOperation] = useState<Exclude<TechnicalAction["type"], "APPROVE_PUBLICATION">>(m.status === "OFFICIAL" ? "EDIT_RESULT" : m.result ? "APPROVE_EXCEPTION" : "EDIT_RESULT");
  const [result, setResult] = useState<ResultType>(m.result ?? (m.black ? "WHITE_WIN" : "BYE"));
  const [mode, setMode] = useState<"CONFIRM" | "EXCEPTION">("CONFIRM");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const action: TechnicalAction = operation === "EDIT_RESULT" ? { type: operation, result, reason, mode } : { type: operation, reason };
    try {
      const res = await fetch(`/api/matches/${m.id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, expectedUpdatedAt: m.updatedAt }), signal: AbortSignal.timeout(10000) });
      const body = await res.json();
      if (!res.ok) { if (body.match) setM({ ...body.match, round: m.round }); throw new Error(body.error ?? "Không lưu được kết quả"); }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Mất kết nối. Hãy kiểm tra trạng thái trước khi thử lại."); }
    finally { setBusy(false); }
  }
  return <Modal label="Xử lý kết quả" onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit} className="mx-auto flex max-w-xl flex-col gap-4">
    <h2 id="edit-title" className="text-xl font-bold">Vòng {m.round} · Bàn {m.board}</h2><p>{m.white.fullName} — {m.black?.fullName ?? "Miễn đấu"}</p>
    <p>{STATUS_LABEL[m.status]} · {m.result ? RESULT_DISPLAY[m.result].score : "Chưa có kết quả"}</p>
    <label className="flex flex-col gap-1 font-semibold">Thao tác<select autoFocus className={input} value={operation} onChange={(e) => setOperation(e.target.value as typeof operation)}>
      <option value="EDIT_RESULT">Nhập / Sửa kết quả</option>
      {m.status !== "OFFICIAL" && m.result && <option value="APPROVE_EXCEPTION">Duyệt ngoại lệ → Chính thức</option>}
      {m.status === "OFFICIAL" && <><option value="REOPEN">Mở lại kết quả → REOPENED</option><option value="CANCEL_RESULT">Hủy kết quả → REOPENED, xóa tỷ số</option></>}
    </select></label>
    {operation === "EDIT_RESULT" && <>
      <label className="flex flex-col gap-1 font-semibold">Kết quả<select className={input} value={result} onChange={(e) => setResult(e.target.value as ResultType)}>{(Object.keys(RESULT_DISPLAY) as ResultType[]).filter((r) => (r === "BYE") === !m.black).map((r) => <option key={r} value={r}>{RESULT_DISPLAY[r].score} · {RESULT_DISPLAY[r].text}</option>)}</select></label>
      <fieldset className="space-y-2 rounded-lg border p-3"><legend className="px-1 font-semibold">Sau khi sửa (xóa mọi xác nhận cũ)</legend><label className="flex gap-2"><input type="radio" name="mode" checked={mode === "CONFIRM"} onChange={() => setMode("CONFIRM")} />Yêu cầu kỳ thủ xác nhận lại tại bàn{!m.black && " (chỉ Trắng cho BYE)"}</label><label className="flex gap-2"><input type="radio" name="mode" checked={mode === "EXCEPTION"} onChange={() => setMode("EXCEPTION")} />TTKT duyệt ngoại lệ ngay → Chính thức</label></fieldset>
    </>}
    <label className="flex flex-col gap-1 font-semibold">Lý do bắt buộc<textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} min-h-24`} placeholder="Nêu lý do phân xử / sửa / hủy / mở lại" /></label>
    <p className="text-sm text-slate-500">Thao tác được lưu cùng tài khoản, thời gian, giá trị trước và sau trong AuditLog.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" className={input} disabled={busy} onClick={onClose}>Đóng</button><button className={button} disabled={busy || !reason.trim()}>{busy ? "Đang lưu..." : "Xác nhận thao tác"}</button></div>
  </form></Modal>;
}

function DeleteTournament({ tournament, onCancel, onDeleted }: { tournament: { id: string; name: string }; onCancel: () => void; onDeleted: () => void }) {
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch(`/api/tournaments/${tournament.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmName }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error ?? "Không xóa được giải");
      onDeleted();
    } catch (e) { setError(e instanceof Error ? e.message : "Mất kết nối"); }
    finally { setBusy(false); }
  }
  return <Modal label="Xác nhận xoá giải đấu" onClose={() => { if (!busy) onCancel(); }}><form onSubmit={remove} className="space-y-4"><h2 className="text-xl font-bold text-red-800">Xoá vĩnh viễn: {tournament.name}</h2><p>Toàn bộ kỳ thủ, vòng đấu, bàn đấu, lịch sử import và AuditLog của giải sẽ bị xóa. Không thể hoàn tác. Các giải khác và tài khoản trọng tài không bị ảnh hưởng.</p><label className="flex flex-col gap-2 font-semibold">Nhập đúng tên giải để xác nhận<input autoFocus className={input} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} /></label>{error && <p role="alert" className="text-red-800">{error}</p>}<div className="flex justify-end gap-3"><button type="button" className={input} disabled={busy} onClick={onCancel}>Hủy</button><button className="rounded-lg bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-50" disabled={busy || confirmName !== tournament.name}>{busy ? "Đang xóa..." : "Xác nhận xoá vĩnh viễn"}</button></div></form></Modal>;
}

function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-label={label} onCancel={(e) => { e.preventDefault(); onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-auto rounded-xl bg-white p-6 text-slate-900 backdrop:bg-slate-900/60">{children}</dialog>;
}

function AuditHistory({ tid, matchId, timezone }: { tid: string; matchId?: string; timezone: string }) {
  const [page, setPage] = useState(0);
  const [logs, setLogs] = useState<Log[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/tournaments/${tid}/audit?page=${page}${matchId ? `&matchId=${matchId}` : ""}`, { cache: "no-store", signal: c.signal }).then(async (r) => {
      if (!r.ok) throw new Error("Không tải được lịch sử");
      const b = await r.json(); setLogs(b.logs); setMore(b.hasMore);
    }).catch((e) => { if (!c.signal.aborted) setError(e.message); }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [tid, matchId, page]);
  return <section className="space-y-3">
    <p className="text-sm text-slate-500">Thời gian theo {timezone}. Mới nhất trước.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p>Đang tải lịch sử...</p> : logs.map((l) => <article key={l.id} className="space-y-2 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap justify-between gap-2"><strong>{l.action} · Vòng {l.roundNumber ?? l.match?.round.number ?? "?"} / Bàn {l.board ?? l.match?.board ?? "?"}{!l.match && " (Ván đã xóa)"}</strong><time>{new Intl.DateTimeFormat("vi-VN", { timeZone: timezone, dateStyle: "short", timeStyle: "medium" }).format(new Date(l.createdAt))}</time></div>
      <p>{l.user.fullName} ({l.user.username})</p>{l.reason && <p className="font-semibold">Lý do: {l.reason}</p>}
      <details><summary className="cursor-pointer text-sky-800">Giá trị cũ / mới</summary><div className="mt-2 grid gap-3 md:grid-cols-2">{[["Trước", l.oldValue], ["Sau", l.newValue]].map(([label, value]) => <div key={label}><strong>{label}</strong><pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-100 p-3 text-xs">{value ? JSON.stringify(JSON.parse(value), null, 2) : "—"}</pre></div>)}</div></details>
    </article>)}
    {!loading && !logs.length && !error && <p>Chưa có lịch sử thay đổi.</p>}
    <div className="flex items-center gap-3"><button className={button} disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page + 1}</span><button className={button} disabled={!more || loading} onClick={() => setPage(page + 1)}>Tiếp</button></div>
  </section>;
}
