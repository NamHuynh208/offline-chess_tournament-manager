import { prisma } from "./db";
import type { ExportMatch } from "./swiss-manager";

/** Toàn bộ ván của giải (hoặc 1 vòng) ở dạng phẳng cho exporter; null nếu không có giải */
export async function loadExport(tournamentId: string, round?: number) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      rounds: {
        where: round ? { number: round } : undefined,
        include: { matches: { include: { whitePlayer: true, blackPlayer: true } } },
      },
    },
  });
  if (!t) return null;
  const matches: ExportMatch[] = t.rounds.flatMap((r) =>
    r.matches.map((m) => ({ round: r.number, board: m.board, status: m.status, result: m.result, white: m.whitePlayer, black: m.blackPlayer })),
  );
  return { tournament: t, hasRound: t.rounds.length > 0, matches };
}

/** Content-Disposition an toàn cho tên file tiếng Việt */
export const attachment = (name: string) => `attachment; filename="${name.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
