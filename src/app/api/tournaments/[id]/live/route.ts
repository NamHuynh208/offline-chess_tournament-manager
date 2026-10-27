import { prisma } from "@/lib/db";
import { matchInclude, toClientMatch } from "@/lib/matches";
import { requireUser } from "@/lib/session";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) return auth.error;
  const t = await prisma.tournament.findUnique({
    where: { id: (await params).id },
    include: { rounds: { orderBy: { number: "asc" }, include: { matches: { orderBy: { board: "asc" }, include: matchInclude } } } },
  });
  if (!t) return Response.json({ error: "Không tìm thấy giải" }, { status: 404 });
  const projector = new URL(req.url).searchParams.get("view") === "projector";
  return Response.json({
    tournament: { id: t.id, name: t.name, logoUrl: t.logoUrl, primaryColor: t.primaryColor, timezone: t.timezone },
    rounds: t.rounds.map((r) => ({ number: r.number, matches: r.matches.map((m) => {
      const c = toClientMatch(m);
      // Projector không nhận tỷ số chưa chính thức, kể cả trong payload mạng.
      return projector ? { ...c, result: m.status === "OFFICIAL" ? c.result : null, exceptionReason: null } : c;
    }) })),
  }, { headers: { "Cache-Control": "no-store, private" } });
}
