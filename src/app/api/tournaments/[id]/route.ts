import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { parseTournamentInput } from "@/lib/tournament";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const t = await prisma.tournament.findUnique({ where: { id: (await params).id }, include: { rounds: { orderBy: { number: "asc" } } } });
  return t ? Response.json(t) : Response.json({ error: "Không tìm thấy giải" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) return auth.error;
  const { id } = await params;
  const t = await prisma.tournament.findUnique({ where: { id }, include: { rounds: { select: { number: true } } } });
  if (!t) return Response.json({ error: "Không tìm thấy giải" }, { status: 404 });

  const parsed = parseTournamentInput(await req.json().catch(() => null), true);
  if (parsed.errors) return Response.json({ errors: parsed.errors }, { status: 400 });
  const d = parsed.data;
  const start = d.startDate !== undefined ? d.startDate : t.startDate;
  const end = d.endDate !== undefined ? d.endDate : t.endDate;
  if (start && end && end < start) return Response.json({ errors: { endDate: "Ngày kết thúc trước ngày bắt đầu" } }, { status: 400 });
  const maxRound = Math.max(0, ...t.rounds.map((r) => r.number));
  if (d.totalRounds !== undefined && d.totalRounds < maxRound) {
    return Response.json({ errors: { totalRounds: `Đã có dữ liệu vòng ${maxRound}, không thể giảm xuống ${d.totalRounds}` } }, { status: 409 });
  }
  return Response.json(await prisma.tournament.update({ where: { id }, data: d }));
}
