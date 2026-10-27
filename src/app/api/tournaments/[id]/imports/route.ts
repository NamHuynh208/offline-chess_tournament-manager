import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatInTz } from "@/lib/time";

/** Lịch sử nhập file của giải, thời điểm theo múi giờ giải */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) return auth.error;
  const t = await prisma.tournament.findUnique({
    where: { id: (await params).id },
    include: { importLogs: { orderBy: { createdAt: "desc" }, include: { user: { select: { username: true, fullName: true } } } } },
  });
  if (!t) return Response.json({ error: "Không tìm thấy giải" }, { status: 404 });
  return Response.json(
    t.importLogs.map(({ replaced, user, ...l }) => ({
      ...l,
      createdAtLocal: formatInTz(l.createdAt, t.timezone),
      importedBy: user,
      replaced: replaced ? JSON.parse(replaced) : [],
    })),
  );
}
