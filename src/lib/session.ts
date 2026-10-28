import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { hasRole } from "./roles";

export type SessionData = { userId?: string; sessionVersion?: number };

export const getSession = async () =>
  getIronSession<SessionData>(await cookies(), {
    password: process.env.SESSION_SECRET!,
    cookieName: "uscc_session",
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
  });

/** Dùng ở đầu mọi route handler: `const auth = await requireUser("TECHNICAL_ARBITER"); if (auth.error) return auth.error;` */
export async function requireUser(...roles: Role[]) {
  const { userId, sessionVersion } = await getSession();
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user?.active || sessionVersion !== user.sessionVersion) return { error: Response.json({ error: "Phiên đăng nhập hết hạn hoặc tài khoản đã thay đổi. Vui lòng đăng nhập lại." }, { status: 401 }) };
  if (!hasRole(user.role, roles)) return { error: Response.json({ error: "Không có quyền thực hiện" }, { status: 403 }) };
  return { user };
}
