"use client";
// Màn hình tra cứu bàn đấu của Trọng tài ghi kết quả (FR-03) + hàng đợi offline
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, LogOut, RefreshCw, Search, WifiOff } from "lucide-react";
import type { MatchStatus } from "@prisma/client";
import type { ClientMatch } from "@/lib/matches";
import { applyAction, toState, type RecorderAction } from "@/lib/match-state";
import { loadQueue, newOpId, saveQueue, type QueuedOp } from "@/lib/offline-queue";
import { RESULT_DISPLAY } from "@/lib/results";
import { defaultTournament } from "@/lib/tournament-selection";
import ResultFlow from "./ResultFlow";
import { ConfirmMarks, PlayerLine, StatusBadge, textOn } from "./ui";

type Tournament = { id: string; name: string; primaryColor: string; startDate: string | null; endDate: string | null; rounds: number[] };

const FILTERS: { label: string; has: (s: MatchStatus) => boolean }[] = [
  { label: "Tất cả", has: () => true },
  { label: "Chưa có KQ", has: (s) => s === "PENDING_RESULT" || s === "REOPENED" },
  { label: "Chờ xác nhận", has: (s) => s === "AWAITING_CONFIRMATION" },
  { label: "Có bất đồng", has: (s) => s === "DISPUTED" },
  { label: "Chính thức", has: (s) => s === "OFFICIAL" },
];

// tìm không dấu: "nguyen" khớp "Nguyễn"
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Áp các thao tác còn trong hàng đợi lên dữ liệu server để màn hình phản ánh đúng những gì đã bấm trên máy */
const withQueue = (ms: ClientMatch[], q: QueuedOp[]) =>
  ms.map((m) =>
    q
      .filter((o) => o.matchId === m.id && !o.error && !q.some((x) => x.matchId === m.id && x.error))
      .reduce((acc, o) => {
        if (o.expectedVersion !== acc.resultVersion) return acc;
        const r = applyAction(toState(acc), o.action, o.clientAt);
        return r.ok ? { ...acc, ...r.next } : acc;
      }, m),
  );

type SendResult = { kind: "ok"; match: ClientMatch } | { kind: "network" } | { kind: "auth" } | { kind: "rejected"; error: string; match?: ClientMatch };

async function sendOp(op: QueuedOp): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(`/api/matches/${op.matchId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ opId: op.opId, expectedVersion: op.expectedVersion, clientAt: op.clientAt, action: op.action }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { kind: "network" };
  }
  if (res.status === 401) return { kind: "auth" };
  if (res.status >= 500) return { kind: "network" };
  const body = await res.json().catch(() => ({}));
  return res.ok ? { kind: "ok", match: body.match } : { kind: "rejected", error: body.error ?? `Lỗi ${res.status}`, match: body.match };
}

export default function RecordApp({ user, tournaments }: { user: { id: string; fullName: string }; tournaments: Tournament[] }) {
  const [tid, setTid] = useState(() => defaultTournament(tournaments)?.id ?? "");
  const t = tournaments.find((x) => x.id === tid);
  const [round, setRound] = useState(t?.rounds.at(-1) ?? 0);
  const [serverMatches, setServerMatches] = useState<ClientMatch[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const queueRef = useRef<QueuedOp[]>([]);
  const flushing = useRef(false);
  const loadSeq = useRef(0);
  const [offline, setOffline] = useState(false);
  const [authLost, setAuthLost] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const matches = useMemo(() => withQueue(serverMatches, queue), [serverMatches, queue]);
  const selected = matches.find((m) => m.id === selectedId);

  const updateQueue = useCallback(
    (f: (q: QueuedOp[]) => QueuedOp[]) => {
      queueRef.current = f(queueRef.current);
      saveQueue(user.id, queueRef.current);
      setQueue(queueRef.current);
    },
    [user.id],
  );
  const mergeServer = (m?: ClientMatch | null) => m && setServerMatches((ms) => ms.map((x) => (x.id === m.id ? m : x)));

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    setSyncing(true);
    try {
      while (queueRef.current.length && !queueRef.current[0].error) {
        const op = queueRef.current[0];
        const r = await sendOp(op);
        if (r.kind === "network") {
          setOffline(true);
          break;
        }
        if (r.kind === "auth") {
          setAuthLost(true);
          break;
        }
        setOffline(false);
        setAuthLost(false);
        mergeServer(r.match);
        if (r.kind === "ok") updateQueue((q) => q.filter((o) => o.opId !== op.opId));
        else {
          updateQueue((q) => q.map((o) => (o.opId === op.opId ? { ...o, error: r.error } : o)));
          setSelectedId(null); // thoát kiosk cũ, bắt buộc trọng tài đọc lỗi và mở lại kết quả mới
        }
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [updateQueue]);

  const loadMatches = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (!tid || !round) { setServerMatches([]); return setLoadState("ok"); }
    setLoadState("loading");
    try {
      const res = await fetch(`/api/tournaments/${tid}/rounds/${round}/matches`, { cache: "no-store" });
      if (seq !== loadSeq.current) return;
      if (res.status === 401) setAuthLost(true);
      if (!res.ok) throw new Error();
      const body = await res.json();
      if (seq !== loadSeq.current) return;
      setServerMatches(body.matches);
      setLoadState("ok");
    } catch {
      if (seq === loadSeq.current) setLoadState("error");
    }
  }, [tid, round]);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  useEffect(() => {
    queueRef.current = loadQueue(user.id);
    setQueue(queueRef.current);
    void flush();
    const retry = () => void flush();
    window.addEventListener("online", retry);
    const iv = setInterval(() => queueRef.current.length && retry(), 15_000);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(iv);
    };
  }, [user.id, flush]);

  /** Trả về lỗi (string) nếu thao tác không hợp lệ; hợp lệ thì vào hàng đợi và gửi ngay */
  const dispatch = (matchId: string, action: RecorderAction, label: string) => {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return "Không tìm thấy ván";
    if (queueRef.current.some((o) => o.matchId === matchId && o.error)) return "Cần bỏ thao tác bị từ chối và kiểm tra lại kết quả mới trước khi xác nhận";
    const clientAt = new Date().toISOString();
    const r = applyAction(toState(m), action, clientAt);
    if (!r.ok) return r.error;
    updateQueue((q) => [...q, { opId: newOpId(), matchId, expectedVersion: m.resultVersion, action, clientAt, label }]);
    void flush();
    return null;
  };

  /** Bỏ thao tác bị từ chối và các thao tác sau nó của cùng ván (đều dựa trên thao tác bị từ chối) */
  const discardFailed = () => {
    const bad = queueRef.current[0];
    if (!bad) return;
    updateQueue((q) => q.filter((o, i) => i > 0 && o.matchId !== bad.matchId));
    void loadMatches().then(flush);
  };

  async function logout() {
    if (queueRef.current.length && !confirm(`Còn ${queueRef.current.length} thao tác chưa đồng bộ. Vẫn đăng xuất? (Thao tác vẫn được giữ trên máy)`)) return;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "/login";
  }

  const visible = useMemo(() => {
    const q = fold(query.trim());
    const n = /^\d+$/.test(q) ? Number(q) : null;
    return matches.filter(
      (m) =>
        FILTERS[filter].has(m.status) &&
        (!q ||
          (n !== null
            ? m.board === n || m.white.startNo === n || m.black?.startNo === n
            : [m.white.fullName, m.black?.fullName ?? ""].some((s) => fold(s).includes(q)))),
    );
  }, [matches, query, filter]);

  const failed = queue[0]?.error ? queue[0] : null;
  const brand = t?.primaryColor ?? "#38bdf8";

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-24">
      <header className="app-header sticky top-0 z-20">
        <div className="h-1.5" style={{ background: brand }} />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{t?.name ?? "Chưa có giải"}</div>
            <div className="truncate text-sm text-slate-500">{user.fullName}</div>
          </div>
          <button onClick={logout} aria-label="Đăng xuất" className="flex size-12 items-center justify-center rounded-sm text-slate-600 active:bg-slate-100">
            <LogOut size={22} />
          </button>
        </div>

        {(queue.length > 0 || authLost) && (
          <div role="status" className={`px-4 py-3 text-sm font-medium ${failed || authLost ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
            {authLost ? (
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="shrink-0" />
                <span className="flex-1">Phiên đăng nhập hết hạn. Thao tác vẫn giữ trên máy.</span>
                <a href="/login" className="rounded-sm bg-red-600 px-3 py-2 font-semibold text-white">Đăng nhập lại</a>
              </div>
            ) : failed ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <span>
                    Thao tác bị từ chối – {failed.label}: {failed.error}
                  </span>
                </div>
                <button onClick={discardFailed} className="self-start rounded-sm bg-red-600 px-3 py-2 font-semibold text-white">Bỏ thao tác này</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <WifiOff size={18} className="shrink-0" />
                <span className="flex-1">
                  {offline ? "Mất kết nối - Đang giữ thao tác trên máy" : "Đang đồng bộ"} ({queue.length})
                </span>
                <button onClick={() => void flush()} disabled={syncing} className="flex items-center gap-1 rounded-sm bg-amber-500 px-3 py-2 font-semibold text-white disabled:opacity-60">
                  <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> Thử đồng bộ lại
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 px-4 pb-3">
          {tournaments.length > 0 && (
            <select
              value={tid}
              onChange={(e) => {
                if (e.target.value === tid) return;
                ++loadSeq.current;
                setSelectedId(null);
                setServerMatches([]);
                setQuery("");
                setFilter(0);
                setTid(e.target.value);
                setRound(tournaments.find((x) => x.id === e.target.value)?.rounds.at(-1) ?? 0);
              }}
              className="h-12 rounded-sm border border-[#E5E5EA] bg-white px-3 text-base"
              aria-label="Giải đấu"
            >
              {tournaments.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Vòng đấu">
            {t?.rounds.map((n) => (
              <button
                key={n}
                onClick={() => setRound(n)}
                aria-pressed={n === round}
                className={`h-11 shrink-0 rounded-sm px-4 font-semibold ${n === round ? "" : "bg-slate-100 text-slate-700"}`}
                style={n === round ? { background: brand, color: textOn(brand) } : undefined}
              >
                Vòng {n}
              </button>
            ))}
          </div>
          <label className="relative block">
            <Search size={20} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              inputMode="search"
              placeholder="Số bàn, tên hoặc STT kỳ thủ"
              aria-label="Tìm bàn đấu"
              className="h-12 w-full rounded-sm border border-[#E5E5EA] bg-white pr-3 pl-10 text-base"
            />
          </label>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Lọc trạng thái">
            {FILTERS.map((f, i) => (
              <button
                key={f.label}
                onClick={() => setFilter(i)}
                aria-pressed={i === filter}
                className={`h-10 shrink-0 rounded-sm px-3.5 text-sm font-semibold ${i === filter ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                {f.label} ({matches.filter((m) => f.has(m.status)).length})
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-3 px-4 pt-3">
        {!t?.rounds.length ? (
          <p className="py-10 text-center text-slate-500">Chưa có vòng đấu nào được nhập.</p>
        ) : loadState === "error" && !serverMatches.length ? (
          <div className="flex flex-col items-center gap-3 py-10 text-slate-600">
            Không tải được danh sách bàn.
            <button onClick={() => void loadMatches()} className="flex h-12 items-center gap-2 rounded-sm bg-slate-900 px-5 font-semibold text-white">
              <RefreshCw size={18} /> Tải lại
            </button>
          </div>
        ) : loadState === "loading" && !serverMatches.length ? (
          <p className="py-10 text-center text-slate-500">Đang tải...</p>
        ) : !visible.length ? (
          <p className="py-10 text-center text-slate-500">Không có bàn nào phù hợp.</p>
        ) : (
          visible.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              className="app-card flex flex-col gap-2.5 rounded-sm p-4 text-left active:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xl font-bold">Bàn {m.board}</span>
                <StatusBadge status={m.status} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <PlayerLine side="WHITE" p={m.white} />
                  <PlayerLine side="BLACK" p={m.black} />
                </div>
                <div className="shrink-0 text-right text-2xl font-bold tabular-nums">{m.result ? RESULT_DISPLAY[m.result].score : "–"}</div>
              </div>
              <ConfirmMarks m={m} />
              {queue.some((o) => o.matchId === m.id) && <div className="text-sm font-semibold text-amber-700">⏳ Chưa đồng bộ lên máy chủ</div>}
              {m.exceptionReason && <div className="text-sm text-amber-800">Đã yêu cầu duyệt ngoại lệ: {m.exceptionReason}</div>}
            </button>
          ))
        )}
      </main>

      {selected && (
        <ResultFlow
          key={selected.id}
          match={selected}
          brand={brand}
          pendingSync={queue.some((o) => o.matchId === selected.id)}
          offline={offline}
          dispatch={(a, label) => dispatch(selected.id, a, label)}
          onClose={() => {
            setSelectedId(null);
            void loadMatches();
          }}
        />
      )}
    </div>
  );
}
