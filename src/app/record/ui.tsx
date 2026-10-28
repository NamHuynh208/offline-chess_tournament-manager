import type { MatchStatus } from "@prisma/client";
import type { ClientMatch } from "@/lib/matches";
import type { Side } from "@/lib/match-state";
import { STATUS_LABEL } from "@/lib/results";
export { textOn } from "@/lib/colors";

type PlayerInfo = ClientMatch["white"];

const STATUS_STYLE: Record<MatchStatus, string> = {
  PENDING_RESULT: "bg-slate-100 text-slate-700",
  AWAITING_CONFIRMATION: "bg-amber-100 text-amber-800",
  DISPUTED: "bg-red-100 text-red-700",
  OFFICIAL: "bg-emerald-100 text-emerald-800",
  REOPENED: "bg-violet-100 text-violet-800",
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  return <span className={`shrink-0 rounded-sm px-2.5 py-1 text-sm font-semibold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function PieceDot({ side, className = "size-4" }: { side: Side; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full border border-[#E5E5EA] ${side === "WHITE" ? "bg-white" : "bg-slate-800"} ${className}`} />;
}

export const playerMeta = (p: PlayerInfo) =>
  [p.startNo != null && `STT ${p.startNo}`, p.club, p.points != null && `${String(p.points).replace(".", ",")} điểm`].filter(Boolean).join(" · ");

export function PlayerLine({ side, p }: { side: Side; p: PlayerInfo | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PieceDot side={side} />
      {p ? (
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold leading-tight">{p.fullName}</div>
          <div className="truncate text-sm text-slate-500">{playerMeta(p)}</div>
        </div>
      ) : (
        <div className="text-lg italic text-slate-400">Miễn đấu (BYE)</div>
      )}
    </div>
  );
}

/** Bên nào đã xác nhận (FR-06) */
export function ConfirmMarks({ m }: { m: ClientMatch }) {
  if (!m.result || !["AWAITING_CONFIRMATION", "DISPUTED"].includes(m.status)) return null;
  const mark = (label: string, at: string | null) => (
    <span className={at ? "text-emerald-700" : "text-slate-500"}>
      {label}: {at ? "✓ đã xác nhận" : "chưa xác nhận"}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 text-sm font-medium">
      {mark("Trắng", m.whiteConfirmedAt)}
      {m.black && mark("Đen", m.blackConfirmedAt)}
    </div>
  );
}
