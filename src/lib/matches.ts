import type { Match, Player } from "@prisma/client";

export const matchInclude = { whitePlayer: true, blackPlayer: true } as const;

const player = (p: Player, points: number | null) => ({ fullName: p.fullName, startNo: p.startNo, club: p.club, points });

/** Dạng gửi xuống điện thoại (ngày giờ ISO) */
export const toClientMatch = (m: Match & { whitePlayer: Player; blackPlayer: Player | null }) => ({
  id: m.id,
  updatedAt: m.updatedAt.toISOString(),
  board: m.board,
  status: m.status,
  result: m.result,
  resultVersion: m.resultVersion,
  whiteConfirmedAt: m.whiteConfirmedAt?.toISOString() ?? null,
  blackConfirmedAt: m.blackConfirmedAt?.toISOString() ?? null,
  exceptionReason: m.exceptionReason,
  white: player(m.whitePlayer, m.whitePoints),
  black: m.blackPlayer && player(m.blackPlayer, m.blackPoints),
});
export type ClientMatch = ReturnType<typeof toClientMatch>;
