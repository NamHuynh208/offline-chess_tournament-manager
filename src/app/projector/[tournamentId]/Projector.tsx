"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLiveTournament } from "@/lib/use-live-tournament";
import { DEFAULT_PROJECTOR_SETTINGS, hasImportedPoints, parseProjectorSettings, projectorPages, projectorScore, type ProjectorSettings } from "@/lib/projector";
import SyncStatus from "../../components/SyncStatus";
import { textOn } from "@/lib/colors";

export default function Projector({ tournamentId }: { tournamentId: string }) {
  const { data, lastSync, error } = useLiveTournament(tournamentId, true);
  const [settings, setSettings] = useState({ ...DEFAULT_PROJECTOR_SETTINGS });
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [fullscreenError, setFullscreenError] = useState("");
  const spaceRef = useRef<HTMLDivElement>(null);
  const boardsRef = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const [boardSpace, setBoardSpace] = useState({ width: 0, height: 0 });
  const key = `uscc:projector:${tournamentId}`;
  useEffect(() => {
    try { setSettings(parseProjectorSettings(JSON.parse(localStorage.getItem(key) ?? "null"))); }
    catch { setSettings({ ...DEFAULT_PROJECTOR_SETTINGS }); }
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(key, JSON.stringify(settings)); setStorageError(""); }
    catch { setStorageError("Không lưu được cấu hình trên trình duyệt này; tải lại sẽ dùng mặc định."); }
  }, [settings, key, loaded]);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const size = { width: entry.contentRect.width, height: entry.contentRect.height };
        if (entry.target === spaceRef.current) setSpace(size);
        if (entry.target === boardsRef.current) setBoardSpace(size);
      }
    });
    if (spaceRef.current) observer.observe(spaceRef.current);
    if (boardsRef.current) observer.observe(boardsRef.current);
    return () => observer.disconnect();
  }, []);
  const change = (patch: Partial<ProjectorSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const t = data?.tournament;
  const current = data?.rounds.find((r) => r.number === settings.round) ?? data?.rounds.at(-1);
  const matches = current?.matches ?? [];
  const pages = projectorPages(matches, settings);
  const activePage = Math.min(settings.page, pages.length - 1);
  const visible = pages[activePage];
  const rows = Math.max(1, Math.ceil(visible.length / settings.columns));
  const points = hasImportedPoints(matches);
  const ratio = settings.aspect === "auto" ? null : Number(settings.aspect.split(":")[0]) / Number(settings.aspect.split(":")[1]);
  const width = ratio ? Math.min(space.width, space.height * ratio) : space.width;
  const height = ratio ? width / ratio : space.height;
  const scale = settings.scale / 100;
  const rowHeight = settings.scroll ? Math.max(44 * scale, (boardSpace.height - 24) / rows) : Math.max(1, (boardSpace.height - 24) / rows);
  const columnWidth = Math.max(1, (boardSpace.width - 8 * (settings.columns - 1)) / settings.columns);
  const desiredFont = Math.min(30, Math.max(14, columnWidth / 32)) * scale;
  const font = settings.scroll ? desiredFont : Math.min(desiredFont, rowHeight * 0.4, columnWidth / (points ? 24 : 20));
  const gridColumns = points ? "7% minmax(0,1fr) 7% 24% 7% minmax(0,1fr)" : "8% minmax(0,1fr) 25% minmax(0,1fr)";
  useEffect(() => {
    if (!loaded || !settings.auto || pages.length < 2) return;
    const timer = setInterval(() => setSettings((s) => ({ ...s, page: (Math.min(s.page, pages.length - 1) + 1) % pages.length })), settings.seconds * 1000);
    return () => clearInterval(timer);
  }, [loaded, settings.auto, settings.seconds, pages.length, current?.number]);
  return <main className="projector flex h-screen h-dvh w-screen flex-col overflow-hidden" style={{ borderTop: `4px solid ${t?.primaryColor ?? "#38bdf8"}` }}>
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#d2d2d7] px-3 py-1 text-xs">
      <a href="/technical" className="underline">← Dashboard</a>
      <button className="projector-toggle" aria-expanded={!settings.controlsHidden} onClick={() => change({ controlsHidden: !settings.controlsHidden })}>{settings.controlsHidden ? "Hiện thanh điều khiển" : "Ẩn thanh điều khiển"}</button>
    </div>
    {!settings.controlsHidden && <section aria-label="Thiết lập trình chiếu" className="projector-controls flex max-h-[28dvh] shrink-0 flex-wrap items-center gap-x-4 gap-y-2 overflow-y-auto border-b border-[#d2d2d7] px-3 py-2 text-xs">
      <label>Vòng <select aria-label="Vòng đang chiếu" value={current?.number ?? ""} onChange={(e) => change({ round: Number(e.target.value), page: 0 })}>{data?.rounds.map((r) => <option key={r.number} value={r.number}>{r.number}</option>)}</select></label>
      <label>Tỉ lệ khung hình <select aria-label="Tỉ lệ khung hình" value={settings.aspect} onChange={(e) => change({ aspect: e.target.value as ProjectorSettings["aspect"] })}><option value="auto">Vừa khít màn hình (Auto Fullscreen)</option>{["16:9", "16:10", "4:3"].map((r) => <option key={r}>{r}</option>)}</select></label>
      <label>Cỡ hiển thị <select aria-label="Cỡ hiển thị" value={settings.scale} onChange={(e) => change({ scale: Number(e.target.value) })}>{[75, 85, 90, 100, 110, 125].map((s) => <option key={s} value={s}>{s}%</option>)}</select></label>
      <label>Chia trang theo <select aria-label="Chia trang theo" value={settings.pagination} onChange={(e) => change({ pagination: e.target.value as ProjectorSettings["pagination"], page: 0 })}><option value="boards">Số bàn mỗi trang</option><option value="pages">Số trang muốn chia</option></select></label>
      {settings.pagination === "pages" ? <label>Số trang <select aria-label="Số trang muốn chia" value={settings.pageCount} onChange={(e) => change({ pageCount: Number(e.target.value), page: 0 })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 1 ? "Gộp tất cả vào 1 trang" : `Chia ${n} trang`}</option>)}</select></label> : <label>Bàn/trang <select aria-label="Số bàn mỗi trang" value={settings.perPage} onChange={(e) => change({ perPage: Number(e.target.value), page: 0 })}>{[10, 16, 20, 24, 30, 40].map((n) => <option key={n} value={n}>{n} bàn/trang</option>)}</select></label>}
      <label>Số cột <select aria-label="Số cột" value={settings.columns} onChange={(e) => change({ columns: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} cột</option>)}</select></label>
      <label><input type="checkbox" checked={settings.scroll} onChange={(e) => change({ scroll: e.target.checked })} />Cho phép cuộn dọc (giữ chữ lớn)</label>
      <label><input aria-label="Tự động lật trang" type="checkbox" checked={settings.auto} onChange={(e) => change({ auto: e.target.checked })} />Tự động chuyển trang</label>
      <label>Chuyển sau <select aria-label="Số giây chuyển trang" value={settings.seconds} onChange={(e) => change({ seconds: Number(e.target.value) })}>{[5, 10, 15, 20].map((s) => <option key={s} value={s}>{s} giây</option>)}</select></label>
      <button disabled={pages.length < 2} onClick={() => change({ page: (activePage - 1 + pages.length) % pages.length })}>Trang trước</button>
      <button disabled={pages.length < 2} onClick={() => change({ page: (activePage + 1) % pages.length })}>Trang sau</button>
      <nav aria-label="Trang trình chiếu" className="flex flex-wrap gap-1">{pages.map((_, i) => <button key={i} aria-pressed={i === activePage} onClick={() => change({ page: i, auto: false })} style={i === activePage ? { background: "#1d1d1f", color: "#fff" } : undefined}>Trang {i + 1}</button>)}</nav>
      <button onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setFullscreenError(""); } catch { setFullscreenError("Không bật được toàn màn hình. Hãy dùng F11."); } }}>Toàn màn hình (F11)</button>
      <span className="text-[#515154]">Vừa khít tự thu chữ theo số dòng; bật cuộn để giữ cỡ lớn.</span>
      {(fullscreenError || storageError) && <p role="alert">{fullscreenError || storageError}</p>}
    </section>}
    <div ref={spaceRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
      <div data-testid="projector-frame" className="projector-frame flex min-h-0 shrink-0 flex-col overflow-hidden" style={{ width: width || "100%", height: height || "100%" }}>
        <header className="app-header relative z-10 flex shrink-0 items-center justify-between gap-3 px-3 py-2" style={{ borderTop: `3px solid ${t?.primaryColor ?? "#38bdf8"}` }}>
          <div className="flex min-w-0 items-center gap-3">{t?.logoUrl && <img src={t.logoUrl} alt="Logo giải" className="size-12 shrink-0 object-contain" />}<div className="min-w-0"><h1 title={t?.name} className="truncate font-semibold" style={{ fontSize: `clamp(14px, ${2.5 * scale}cqw, ${36 * scale}px)` }}>{t?.name ?? "Đang tải giải đấu..."}</h1><p className="text-sm text-[#515154]">Vòng {current?.number ?? "—"} · Kết quả chính thức</p></div></div>
          <div className="min-w-0 max-w-[48%] text-right"><SyncStatus lastSync={lastSync} error={error} timezone={t?.timezone ?? "Asia/Ho_Chi_Minh"} /><p className="mt-1 text-sm">Trang {activePage + 1}/{pages.length}</p></div>
        </header>
        <div ref={boardsRef} data-testid="projector-boards" className={`min-h-0 flex-1 p-2 ${settings.scroll ? "overflow-y-auto" : "overflow-hidden"}`}>
          {visible.length > 0 ? <div className="grid min-h-full gap-2" style={{ gridTemplateColumns: `repeat(${settings.columns}, minmax(0, 1fr))`, height: settings.scroll ? `${Math.max(boardSpace.height, rows * rowHeight + 24)}px` : "100%", "--board-font": `${font}px`, "--score-font": `${settings.scroll ? desiredFont * 1.15 : Math.min(font * 1.15, rowHeight * 0.52)}px` } as CSSProperties}>
            {Array.from({ length: settings.columns }, (_, i) => visible.slice(i * rows, (i + 1) * rows)).map((column, i) => <table key={i} className="projector-table text-left" aria-label={`Bàn đấu cột ${i + 1}`}>
              <thead><tr style={{ gridTemplateColumns: gridColumns }}><th>Bàn</th><th>Trắng</th>{points && <th>Điểm</th>}<th className="text-center">Kết quả</th>{points && <th>Điểm</th>}<th>Đen</th></tr></thead>
              <tbody style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>{column.map((m) => <tr key={m.id} style={{ gridTemplateColumns: gridColumns }}><td className="font-semibold">{m.board}</td><td title={m.white.fullName} className="projector-player font-semibold">{m.white.fullName}</td>{points && <td>{m.white.points ?? "—"}</td>}<td className="text-center">{projectorScore(m) ? <strong className="rounded-sm px-1" style={{ background: t?.primaryColor, color: textOn(t?.primaryColor ?? "#38bdf8") }}>{projectorScore(m)}</strong> : <span className="projector-state">{m.status === "PENDING_RESULT" ? "Đang thi đấu" : "Chờ chốt"}</span>}</td>{points && <td>{m.black?.points ?? "—"}</td>}<td title={m.black?.fullName ?? "Miễn đấu"} className="projector-player font-semibold">{m.black?.fullName ?? "Miễn đấu"}</td></tr>)}</tbody>
            </table>)}
          </div> : <p className="p-4 text-center">{data ? "Chưa có bàn đấu trong vòng này." : "Đang kết nối..."}</p>}
        </div>
        <footer className="shrink-0 border-t border-[#d2d2d7] px-3 py-2 text-center text-xs text-[#515154]">{points ? "Điểm hiển thị từ dữ liệu đầu vòng (Tạm tính) - Hệ thống không tự tính bảng xếp hạng" : "Chỉ công bố tỷ số đã được chốt chính thức"}</footer>
      </div>
    </div>
  </main>;
}
