import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { parseTournamentInput } from "@/lib/tournament";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  return Response.json(await prisma.tournament.findMany({ orderBy: { createdAt: "desc" } }));
}

export async function POST(req: Request) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) return auth.error;
  const parsed = parseTournamentInput(await req.json().catch(() => null), false);
  if (parsed.errors) return Response.json({ errors: parsed.errors }, { status: 400 });
  const { name, totalRounds, ...rest } = parsed.data;
  const t = await prisma.tournament.create({ data: { name: name!, totalRounds: totalRounds!, ...rest } });
  return Response.json(t, { status: 201 });
}
