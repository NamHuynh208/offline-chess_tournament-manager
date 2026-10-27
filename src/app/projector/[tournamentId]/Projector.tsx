"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useLiveTournament } from "@/lib/use-live-tournament";
import { hasImportedPoints, PROJECTOR_PAGE_SIZE, projectorScore } from "@/lib/projector";
import SyncStatus from "../../components/SyncStatus";
import { textOn } from "@/lib/colors";

export default function Projector({ tournamentId }: { tournamentId: string }) {
  const { data, lastSync, error } = useLiveTournament(tournamentId, true);
  const [round, setRound] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [auto, setAuto] = useState(true);
  const [seconds, setSeconds] = useState(10);
  const [fullscreenError, setFullscreenError] = useState("");
  const t = data?.tournament;
  const current = data?.rounds.find((r) => r.number === round) ?? data?.rounds.at(-1);
  const matches = current?.matches ?? [];
  const pages = Math.max(1, Math.ceil(matches.length / PROJECTOR_PAGE_SIZE));
  const activePage = Math.min(page, pages - 1);
  const visible = matches.slice(activePage * PROJECTOR_PAGE_SIZE, (activePage + 1) * PROJECTOR_PAGE_SIZE);
  const points = hasImportedPoints(matches);
  useEffect(() => {
    if (!auto || pages < 2) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), seconds * 1000);
    return () => clearInterval(timer);
  }, [auto, pages, seconds, current?.number]);
  return <main className="projector flex min-h-dvh flex-col bg-slate-950 text-white" style={{ borderTop: `8px solid ${t?.primaryColor ?? "#38bdf8"}` }}>
    <header className="flex shrink-0 items-center justify-between gap-6 px-6 py-4">
      <div className="flex min-w-0 items-center gap-4">{t?.logoUrl && <img src={t.logoUrl} alt="Logo giải" className="size-20 shrink-0 rounded-lg bg-white object-contain p-1" />}<div><h1 className="text-3xl font-bold xl:text-4xl">{t?.name ?? "Đang tải giải đấu..."}</h1><p className="mt-1 text-xl text-slate-300">Vòng {current?.number ?? "—"} · Kết quả chính thức</p></div></div>
      <div className="shrink-0 text-right"><SyncStatus lastSync={lastSync} error={error} timezone={t?.timezone ?? "Asia/Ho_Chi_Minh"} /><p className="mt-2 text-lg">Trang {activePage + 1}/{pages}</p></div>
    </header>
    <div className="projector-controls flex flex-wrap items-center gap-4 border-y border-slate-700 px-6 py-2 text-sm">
      <a href="/technical" className="underline">← Dashboard</a>
      <label>Vòng <select aria-label="Vòng đang chiếu" className="rounded bg-slate-800 p-2" value={current?.number ?? ""} onChange={(e) => { setRound(Number(e.target.value)); setPage(0); }}>{data?.rounds.map((r) => <option key={r.number} value={r.number}>{r.number}</option>)}</select></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Tự động lật trang</label>
      <label>Chuyển sau <select aria-label="Số giây chuyển trang" className="rounded bg-slate-800 p-2" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>{[5, 8, 10, 15, 20, 30, 60].map((s) => <option key={s} value={s}>{s} giây</option>)}</select></label>
      <button className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40" disabled={pages < 2} onClick={() => setPage((activePage - 1 + pages) % pages)}>Trang trước</button>
      <button className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40" disabled={pages < 2} onClick={() => setPage((activePage + 1) % pages)}>Trang sau</button>
      <button className="rounded border border-slate-600 px-3 py-2" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setFullscreenError(""); } catch { setFullscreenError("Không bật được toàn màn hình. Hãy dùng F11."); } }}>Toàn màn hình</button>
      {fullscreenError && <span role="alert">{fullscreenError}</span>}
    </div>
    <div className="projector-boards grid flex-1 grid-cols-2 items-start gap-5 px-6 py-4">
      {[visible.slice(0, 10), visible.slice(10, 20)].map((column, i) => <table key={i} className="w-full table-fixed border-separate border-spacing-y-1 text-left">
        <colgroup><col className="w-[8%]" /><col className={points ? "w-[28%]" : "w-[34%]"} />{points && <col className="w-[6%]" />}<col className="w-[24%]" />{points && <col className="w-[6%]" />}<col className={points ? "w-[28%]" : "w-[34%]"} /></colgroup>
        <thead className="text-sm text-slate-400"><tr><th>Bàn</th><th>Trắng</th>{points && <th>Điểm</th>}<th className="text-center">Kết quả</th>{points && <th>Điểm</th>}<th>Đen</th></tr></thead>
        <tbody>{column.map((m) => <tr key={m.id} className="bg-slate-900"><td className="rounded-l-lg px-2 py-3 text-xl font-bold text-slate-400">{m.board}</td><td className="projector-name py-3 pr-2 font-semibold">{m.white.fullName}</td>{points && <td className="text-lg text-slate-400">{m.white.points ?? "—"}</td>}<td className="px-1 py-3 text-center">{projectorScore(m) ? <strong className="projector-score whitespace-nowrap rounded px-1" style={{ background: t?.primaryColor, color: textOn(t?.primaryColor ?? "#38bdf8") }}>{projectorScore(m)}</strong> : <span className="text-base leading-tight text-slate-400">{m.status === "PENDING_RESULT" ? "Đang thi đấu" : "Chờ chốt"}</span>}</td>{points && <td className="text-lg text-slate-400">{m.black?.points ?? "—"}</td>}<td className="projector-name rounded-r-lg py-3 pr-2 font-semibold">{m.black?.fullName ?? "Miễn đấu"}</td></tr>)}</tbody>
      </table>)}
    </div>
    {!matches.length && <p className="p-10 text-center text-2xl">{data ? "Chưa có bàn đấu trong vòng này." : "Đang kết nối..."}</p>}
    <footer className="shrink-0 border-t border-slate-800 px-6 py-3 text-center text-base text-slate-300">{points ? "Điểm hiển thị từ dữ liệu đầu vòng (Tạm tính) - Hệ thống không tự tính bảng xếp hạng" : "Chỉ công bố tỷ số đã được chốt chính thức"}</footer>
  </main>;
}
