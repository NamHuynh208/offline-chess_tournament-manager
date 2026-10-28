import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// shortcut: chưa giới hạn số lần thử sai, thêm rate-limit trước khi mở ra Internet
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const user = username ? await prisma.user.findUnique({ where: { username } }) : null;
  if (!user?.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return Response.json({ error: "Sai tài khoản hoặc mật khẩu" }, { status: 401 });
  }
  const session = await getSession();
  session.userId = user.id;
  session.sessionVersion = user.sessionVersion;
  await session.save();
  return Response.json({ id: user.id, username: user.username, fullName: user.fullName, role: user.role });
}
