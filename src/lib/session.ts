import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "./db";

export type SessionData = { userId?: string };

export const getSession = async () =>
  getIronSession<SessionData>(await cookies(), {
    password: process.env.SESSION_SECRET!,
    cookieName: "uscc_session",
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
  });

/** Dùng ở đầu mọi route handler: `const auth = await requireUser("TECHNICAL_ARBITER"); if (auth.error) return auth.error;` */
export async function requireUser(...roles: Role[]) {
  const { userId } = await getSession();
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user?.active) return { error: Response.json({ error: "Chưa đăng nhập" }, { status: 401 }) };
  if (roles.length && !roles.includes(user.role)) return { error: Response.json({ error: "Không có quyền thực hiện" }, { status: 403 }) };
  return { user };
}
