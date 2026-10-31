"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLiveTournament } from "@/lib/use-live-tournament";
import { DEFAULT_PROJECTOR_SETTINGS, STANDINGS_PER_PAGE_OPTIONS, hasImportedPoints, parseProjectorSettings, projectorPages, projectorScore, type ProjectorSettings } from "@/lib/projector";
import SyncStatus from "../../components/SyncStatus";
import { ArrowLeft, CheckCheck, ChevronDown, LayoutGrid, Maximize2, SlidersHorizontal, Trophy } from "lucide-react";
import type { ClientMatch } from "@/lib/matches";
import type { StandingRow } from "@/lib/swiss-manager";

export default function Projector({ tournamentId, initialView }: { tournamentId: string; initialView?: ProjectorSettings["view"] }) {
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
    let stored = { ...DEFAULT_PROJECTOR_SETTINGS };
    try { stored = parseProjectorSettings(JSON.parse(localStorage.getItem(key) ?? "null")); } catch {}
    // link "Chiếu bảng xếp hạng" (?view=standings) ưu tiên hơn chế độ đã lưu
    setSettings(initialView ? { ...stored, view: initialView, page: 0 } : stored);
    setLoaded(true);
  }, [key, initialView]);
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
  const standings = data?.standings ?? null;
  const showStandings = settings.view === "standings";
  const items: unknown[] = showStandings ? standings?.rows ?? [] : matches;
  const pages = projectorPages(items, showStandings ? { ...settings, perPage: settings.standingsPerPage } : settings);
  const activePage = Math.min(settings.page, pages.length - 1);
  const visible = pages[activePage];
  const rows = Math.max(1, Math.ceil(visible.length / settings.columns));
  const points = showStandings || hasImportedPoints(matches);
  const ratio = settings.aspect === "auto" ? null : Number(settings.aspect.split(":")[0]) / Number(settings.aspect.split(":")[1]);
  const width = ratio ? Math.min(space.width, space.height * ratio) : space.width;
  const height = ratio ? width / ratio : space.height;
  const scale = settings.scale / 100;
  const columnWidth = Math.max(1, (boardSpace.width - 16 * (settings.columns - 1)) / settings.columns);
  const desiredFont = Math.min(30, Math.max(14, columnWidth / 40)) * scale;
  const headerHeight = Math.max(32, desiredFont * 1.55);
  const rowHeight = settings.scroll ? Math.max(44 * scale, (boardSpace.height - headerHeight) / rows) : Math.max(1, (boardSpace.height - headerHeight) / rows);
  const dense = rows > 14;
  const font = settings.scroll ? desiredFont : Math.min(desiredFont, rowHeight * (showStandings ? 0.8 : dense ? 0.64 : 0.4), columnWidth / (points ? 30 : 26)); // xếp hạng luôn 1 dòng/người nên dùng được 80% chiều cao dòng
  const gridColumns = showStandings
    // cột ngắn rộng theo cỡ chữ đang chiếu (không theo %) để "Hạng"/"Điểm"/hệ số phụ không bị cắt khi chữ thu nhỏ
    ? [3.6, 0, 5, 3.8, ...(standings?.tiebreakLabels ?? []).map((l) => Math.max(3.6, l.length * 0.7 + 1.2))].map((em) => (em ? `calc(var(--board-font) * ${em})` : "minmax(0,1fr)")).join(" ")
    : points ? "6% minmax(0,1fr) 8% 15% 8% minmax(0,1fr)" : "6% minmax(0,1fr) 19% minmax(0,1fr)";
  const officialCount = matches.filter((m) => m.status === "OFFICIAL").length;
  useEffect(() => {
    if (!loaded || !settings.auto || pages.length < 2) return;
    const timer = setInterval(() => setSettings((s) => ({ ...s, page: (Math.min(s.page, pages.length - 1) + 1) % pages.length })), settings.seconds * 1000);
    return () => clearInterval(timer);
  }, [loaded, settings.auto, settings.seconds, pages.length, current?.number, settings.view]);
  return <main className="projector flex h-screen h-dvh w-screen flex-col overflow-hidden" style={{ borderTop: `3px solid ${t?.primaryColor ?? "#38bdf8"}` }}>
    <div data-testid="projector-topbar" className={`projector-topbar flex shrink-0 items-center justify-between gap-2 px-4 py-1.5 text-xs ${settings.controlsHidden ? "projector-topbar--hidden" : ""}`}>
      <a href="/technical" className="projector-back inline-flex items-center gap-2 font-medium"><ArrowLeft aria-hidden size={15} />Điều hành giải đấu</a>
      <button className="projector-toggle ml-auto inline-flex items-center gap-2" aria-pressed={showStandings} onClick={() => change({ view: showStandings ? "boards" : "standings", page: 0 })}>{showStandings ? <LayoutGrid aria-hidden size={15} /> : <Trophy aria-hidden size={15} />}{showStandings ? "Xem bàn đấu" : "Xem bảng xếp hạng"}</button>
      <button className="projector-toggle inline-flex items-center gap-2" aria-expanded={!settings.controlsHidden} onClick={() => change({ controlsHidden: !settings.controlsHidden })}><SlidersHorizontal aria-hidden size={15} />{settings.controlsHidden ? "Hiện thanh điều khiển" : "Ẩn thanh điều khiển"}<ChevronDown aria-hidden size={14} /></button>
    </div>
    {!settings.controlsHidden && <section aria-label="Thiết lập trình chiếu" className="projector-controls flex max-h-[28dvh] shrink-0 flex-wrap items-center gap-x-4 gap-y-2 overflow-y-auto border-b border-[#d2d2d7] px-3 py-2 text-xs">
      <label hidden={showStandings}>Vòng <select aria-label="Vòng đang chiếu" value={current?.number ?? ""} onChange={(e) => change({ round: Number(e.target.value), page: 0 })}>{data?.rounds.map((r) => <option key={r.number} value={r.number}>{r.number}</option>)}</select></label>
      <label>Tỉ lệ khung hình <select aria-label="Tỉ lệ khung hình" value={settings.aspect} onChange={(e) => change({ aspect: e.target.value as ProjectorSettings["aspect"] })}><option value="auto">Vừa khít màn hình (Auto Fullscreen)</option>{["16:9", "16:10", "4:3"].map((r) => <option key={r}>{r}</option>)}</select></label>
      <label>Cỡ hiển thị <select aria-label="Cỡ hiển thị" value={settings.scale} onChange={(e) => change({ scale: Number(e.target.value) })}>{[75, 85, 90, 100, 110, 125].map((s) => <option key={s} value={s}>{s}%</option>)}</select></label>
      <label>Chia trang theo <select aria-label="Chia trang theo" value={settings.pagination} onChange={(e) => change({ pagination: e.target.value as ProjectorSettings["pagination"], page: 0 })}><option value="boards">{showStandings ? "Số người mỗi trang" : "Số bàn mỗi trang"}</option><option value="pages">Số trang muốn chia</option></select></label>
      {settings.pagination === "pages" ? <label>Số trang <select aria-label="Số trang muốn chia" value={settings.pageCount} onChange={(e) => change({ pageCount: Number(e.target.value), page: 0 })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 1 ? "Gộp tất cả vào 1 trang" : `Chia ${n} trang`}</option>)}</select></label> : showStandings ? <label>Người/trang <select aria-label="Số người mỗi trang" value={settings.standingsPerPage} onChange={(e) => change({ standingsPerPage: Number(e.target.value), page: 0 })}>{STANDINGS_PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} người/trang</option>)}</select></label> : <label>Bàn/trang <select aria-label="Số bàn mỗi trang" value={settings.perPage} onChange={(e) => change({ perPage: Number(e.target.value), page: 0 })}>{[10, 16, 20, 24, 30, 40].map((n) => <option key={n} value={n}>{n} bàn/trang</option>)}</select></label>}
      <label>Số cột <select aria-label="Số cột" value={settings.columns} onChange={(e) => change({ columns: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} cột</option>)}</select></label>
      <label><input type="checkbox" checked={settings.scroll} onChange={(e) => change({ scroll: e.target.checked })} />Cho phép cuộn dọc (giữ chữ lớn)</label>
      <label><input aria-label="Tự động lật trang" type="checkbox" checked={settings.auto} onChange={(e) => change({ auto: e.target.checked })} />Tự động chuyển trang</label>
      <label>Chuyển sau <select aria-label="Số giây chuyển trang" value={settings.seconds} onChange={(e) => change({ seconds: Number(e.target.value) })}>{[5, 10, 15, 20].map((s) => <option key={s} value={s}>{s} giây</option>)}</select></label>
      <button disabled={pages.length < 2} onClick={() => change({ page: (activePage - 1 + pages.length) % pages.length })}>Trang trước</button>
      <button disabled={pages.length < 2} onClick={() => change({ page: (activePage + 1) % pages.length })}>Trang sau</button>
      <nav aria-label="Trang trình chiếu" className="flex flex-wrap gap-1">{pages.map((_, i) => <button key={i} aria-pressed={i === activePage} onClick={() => change({ page: i, auto: false })} style={i === activePage ? { background: "#1d1d1f", color: "#fff" } : undefined}>Trang {i + 1}</button>)}</nav>
      <button className="inline-flex items-center gap-2" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setFullscreenError(""); } catch { setFullscreenError("Không bật được toàn màn hình. Hãy dùng F11."); } }}><Maximize2 aria-hidden size={15} />Toàn màn hình (F11)</button>
      <span className="text-[#515154]">Vừa khít tự thu chữ theo số dòng; bật cuộn để giữ cỡ lớn.</span>
      {(fullscreenError || storageError) && <p role="alert">{fullscreenError || storageError}</p>}
    </section>}
    <div ref={spaceRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
      <div data-testid="projector-frame" className="projector-frame flex min-h-0 shrink-0 flex-col overflow-hidden" style={{ width: ratio ? width || "100%" : "100%", height: ratio ? height || "100%" : "100%" }}>
        <header className="projector-titlebar relative z-10 flex shrink-0 items-center justify-between gap-4" style={{ borderTop: `2px solid ${t?.primaryColor ?? "#38bdf8"}` }}>
          <div className="flex min-w-0 items-center gap-4">{t?.logoUrl && <img src={t.logoUrl} alt="Logo giải" className="projector-logo shrink-0 object-contain" />}<div className="min-w-0"><h1 title={t?.name} className="truncate font-semibold" style={{ fontSize: `clamp(16px, ${2 * scale}cqw, ${30 * scale}px)` }}>{t?.name ?? "Đang tải giải đấu..."}</h1><p className="mt-1 text-sm text-[#515154]">{showStandings ? standings?.title ?? "Bảng xếp hạng" : `Vòng ${current?.number ?? "—"} · Kết quả chính thức`}</p></div></div>
          <div className="projector-sync min-w-0 text-right"><SyncStatus lastSync={lastSync} error={error} timezone={t?.timezone ?? "Asia/Ho_Chi_Minh"} /><p className="mt-1 text-xs text-muted">Trang {activePage + 1}/{pages.length}</p></div>
        </header>
        <div ref={boardsRef} data-testid="projector-boards" className={`projector-board-area min-h-0 flex-1 ${settings.scroll ? "overflow-y-auto" : "overflow-hidden"}`}>
          {visible.length > 0 ? <div className="grid min-h-full gap-4" style={{ gridTemplateColumns: `repeat(${settings.columns}, minmax(0, 1fr))`, height: settings.scroll ? `${Math.max(boardSpace.height, rows * rowHeight + headerHeight)}px` : "100%", "--table-header-height": `${headerHeight}px`, "--board-font": `${font}px`, "--score-font": `${settings.scroll ? desiredFont * 1.2 : Math.min(font * 1.2, rowHeight * 0.68)}px` } as CSSProperties}>
            {Array.from({ length: settings.columns }, (_, i) => visible.slice(i * rows, (i + 1) * rows)).map((column, i) => showStandings ? <table key={i} className={`projector-table text-left ${dense ? "projector-dense" : ""}`} aria-label={`Bảng xếp hạng cột ${i + 1}`}>
              <thead><tr style={{ gridTemplateColumns: gridColumns }}><th className="text-center">Hạng</th><th>Kỳ thủ</th><th>CLB</th><th className="text-center">Điểm</th>{standings?.tiebreakLabels.map((l) => <th key={l} className="text-center">{l}</th>)}</tr></thead>
              <tbody style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>{(column as StandingRow[]).map((r) => <tr key={r.row} style={{ gridTemplateColumns: gridColumns }}><td className="projector-board-number text-center">{r.rank}</td><td title={r.name} className="projector-player font-semibold">{r.name}</td><td title={r.club ?? ""}>{r.club ?? ""}</td><td className="text-center"><strong className="projector-result">{r.points}</strong></td>{r.tiebreaks.map((v, j) => <td key={j} className="projector-points">{v}</td>)}</tr>)}</tbody>
            </table> : <table key={i} className={`projector-table text-left ${dense ? "projector-dense" : ""}`} aria-label={`Bàn đấu cột ${i + 1}`}>
              <thead><tr style={{ gridTemplateColumns: gridColumns }}><th>Bàn</th><th>Trắng</th>{points && <th className="text-center" title="Điểm đầu vòng">Điểm</th>}<th className="text-center">Kết quả</th>{points && <th className="text-center" title="Điểm đầu vòng">Điểm</th>}<th>Đen</th></tr></thead>
              <tbody style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>{(column as ClientMatch[]).map((m) => <tr key={m.id} className={m.status === "OFFICIAL" ? "is-official" : ""} style={{ gridTemplateColumns: gridColumns }}><td className="projector-board-number">{m.board}</td><td title={m.white.fullName} className="projector-player font-semibold">{m.white.fullName}</td>{points && <td className="projector-points">{m.white.points ?? "—"}</td>}<td className="text-center">{projectorScore(m) ? <strong className="projector-result">{projectorScore(m)}</strong> : <span className="projector-state">{m.status === "PENDING_RESULT" ? "Đang thi đấu" : "Chờ chốt"}</span>}</td>{points && <td className="projector-points">{m.black?.points ?? "—"}</td>}<td title={m.black?.fullName ?? "Miễn đấu"} className="projector-player font-semibold">{m.black?.fullName ?? "Miễn đấu"}</td></tr>)}</tbody>
            </table>)}
          </div> : <p className="p-4 text-center">{!data ? "Đang kết nối..." : showStandings ? "Chưa nhập bảng xếp hạng. Nhập file Xếp hạng từ Swiss-Manager ở mục Thiết lập & bốc thăm." : "Chưa có bàn đấu trong vòng này."}</p>}
        </div>
        <footer className="projector-footer shrink-0">{showStandings ? <><span className="inline-flex items-center gap-2 whitespace-nowrap"><Trophy aria-hidden size={15} />{standings?.rows.length ?? 0} kỳ thủ</span><span>Bảng xếp hạng nhập từ Swiss-Manager - Hệ thống không tự tính hạng</span><span className="whitespace-nowrap tabular-nums">{visible.length} dòng · {settings.columns} cột</span></> : <><span className="inline-flex items-center gap-2 whitespace-nowrap"><CheckCheck aria-hidden size={15} />{officialCount}/{matches.length} bàn chính thức</span><span>{points ?"Điểm hiển thị từ dữ liệu đầu vòng (Tạm tính) - Hệ thống không tự tính bảng xếp hạng" : "Chỉ công bố tỷ số đã được chốt chính thức"}</span><span className="whitespace-nowrap tabular-nums">{visible.length} bàn · {settings.columns} cột</span></>}</footer>
      </div>
    </div>
  </main>;
}
