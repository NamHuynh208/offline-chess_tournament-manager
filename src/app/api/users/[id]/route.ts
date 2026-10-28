import { requireUser } from "@/lib/session";
import { manageUser } from "@/lib/manage-user";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("ADMIN");
  if (auth.error) return auth.error;
  return manageUser(req, auth.user, (await params).id);
}
