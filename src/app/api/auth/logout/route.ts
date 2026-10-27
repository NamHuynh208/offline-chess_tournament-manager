import { getSession } from "@/lib/session";

export async function POST() {
  (await getSession()).destroy();
  return Response.json({ ok: true });
}
