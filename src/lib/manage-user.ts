import bcrypt from "bcryptjs";
import { Prisma, type User } from "@prisma/client";
import { prisma } from "./db";
import { parseUserInput, publicUserSelect } from "./users";

class UserConflict extends Error {}
const snapshot = (u: Pick<User, "id" | "username" | "fullName" | "role" | "active">) => ({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, active: u.active });

/** Không đưa mật khẩu/hash vào response hoặc AuditLog, kể cả khi admin đặt lại mật khẩu. */
export async function manageUser(req: Request, actor: User, id?: string) {
  const origin = req.headers.get("origin");
  try {
    if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).host !== (req.headers.get("host") ?? new URL(req.url).host))) return Response.json({ error: "Nguồn yêu cầu không hợp lệ" }, { status: 403 });
  } catch { return Response.json({ error: "Nguồn yêu cầu không hợp lệ" }, { status: 403 }); }
  const parsed = parseUserInput(await req.json().catch(() => null), !id);
  if (!parsed.data) return Response.json({ error: parsed.error }, { status: 400 });
  const input = parsed.data;
  if (!(await bcrypt.compare(input.currentPassword, actor.passwordHash))) return Response.json({ error: "Mật khẩu hiện tại của bạn không đúng" }, { status: 403 });
  const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined;
  try {
    const user = await prisma.$transaction(async (tx) => {
      // Kiểm lại quyền/phiên trong transaction: admin có thể vừa bị khóa ở máy khác.
      const freshActor = await tx.user.findUnique({ where: { id: actor.id } });
      if (!freshActor?.active || freshActor.role !== "ADMIN" || freshActor.sessionVersion !== actor.sessionVersion) throw new UserConflict("Tài khoản của bạn vừa thay đổi. Hãy đăng nhập lại.");
      const before = id ? await tx.user.findUnique({ where: { id } }) : null;
      if (id && !before) throw new UserConflict("Không tìm thấy tài khoản");
      if (before && before.sessionVersion !== input.expectedVersion) throw new UserConflict("Tài khoản vừa được thay đổi. Hãy tải lại danh sách trước khi lưu.");
      if (before?.active && before.role === "ADMIN" && (!input.active || input.role !== "ADMIN")) {
        const count = await tx.user.count({ where: { active: true, role: "ADMIN" } });
        if (count <= 1) throw new UserConflict("Không thể khóa hoặc hạ quyền Admin đang hoạt động cuối cùng.");
      }
      const data = { fullName: input.fullName, role: input.role, active: input.active, ...(passwordHash && { passwordHash }) };
      const updated = before
        ? await tx.user.update({ where: { id: before.id }, data: { ...data, sessionVersion: { increment: 1 } }, select: publicUserSelect })
        : await tx.user.create({ data: { ...data, username: input.username, passwordHash: passwordHash! }, select: publicUserSelect });
      await tx.auditLog.create({ data: { userId: actor.id, action: !before ? "CREATE_USER" : passwordHash ? "CHANGE_PASSWORD" : "UPDATE_USER", oldValue: before ? JSON.stringify(snapshot(before)) : null, newValue: JSON.stringify(snapshot(updated)), reason: !before ? "Tạo tài khoản trọng tài" : passwordHash ? "Cập nhật tài khoản và đặt mật khẩu mới; thu hồi các phiên cũ" : "Cập nhật tài khoản; thu hồi các phiên cũ" } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ user, loginRequired: id === actor.id }, { status: id ? 200 : 201, headers: { "Cache-Control": "no-store, private" } });
  } catch (e) {
    if (e instanceof UserConflict) return Response.json({ error: e.message }, { status: 409 });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return Response.json({ error: "Tên đăng nhập đã tồn tại" }, { status: 409 });
      if (["P2034", "P1008", "P2028"].includes(e.code)) return Response.json({ error: "Có thao tác đồng thời. Hãy tải lại danh sách trước khi lưu." }, { status: 409 });
    }
    throw e;
  }
}
