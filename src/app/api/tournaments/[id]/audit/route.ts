import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) return auth.error;
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const page = Number(q.get("page") ?? 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000) return Response.json({ error: "Trang không hợp lệ" }, { status: 400 });
  const logs = await prisma.auditLog.findMany({
    where: { tournamentId: id, ...(q.get("matchId") ? { matchId: q.get("matchId")! } : {}) },
    include: { user: { select: { username: true, fullName: true } }, match: { select: { board: true, round: { select: { number: true } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * 50, take: 51,
  });
  return Response.json({ logs: logs.slice(0, 50), hasMore: logs.length > 50 }, { headers: { "Cache-Control": "no-store, private" } });
}
