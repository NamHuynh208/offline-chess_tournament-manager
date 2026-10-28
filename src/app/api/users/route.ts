import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { publicUserSelect } from "@/lib/users";
import { manageUser } from "@/lib/manage-user";

export async function GET() {
  const auth = await requireUser("ADMIN");
  if (auth.error) return auth.error;
  const users = await prisma.user.findMany({ select: publicUserSelect, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  return Response.json({ users, currentUserId: auth.user.id }, { headers: { "Cache-Control": "no-store, private" } });
}

export async function POST(req: Request) {
  const auth = await requireUser("ADMIN");
  if (auth.error) return auth.error;
  return manageUser(req, auth.user);
}
