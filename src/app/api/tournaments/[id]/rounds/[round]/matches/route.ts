import { prisma } from "@/lib/db";
import { matchInclude, toClientMatch } from "@/lib/matches";
import { requireUser } from "@/lib/session";

/** Danh sách ván 1 vòng cho màn hình tra cứu (FR-03) */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; round: string }> }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id, round } = await params;
  if (!/^\d+$/.test(round)) return Response.json({ error: "Số vòng không hợp lệ" }, { status: 400 });
  const r = await prisma.round.findUnique({
    where: { tournamentId_number: { tournamentId: id, number: Number(round) } },
    include: { matches: { include: matchInclude, orderBy: { board: "asc" } } },
  });
  if (!r) return Response.json({ error: "Không tìm thấy vòng đấu" }, { status: 404 });
  return Response.json({ round: r.number, matches: r.matches.map(toClientMatch) });
}
