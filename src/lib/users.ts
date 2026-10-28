import type { Role } from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin — Quản trị hệ thống", TECHNICAL_ARBITER: "Trọng tài kỹ thuật", RECORDING_ARBITER: "Arbiter — Trọng tài ghi kết quả" };
export const publicUserSelect = { id: true, username: true, fullName: true, role: true, active: true, createdAt: true, sessionVersion: true } as const;
export type ManagedUser = { id: string; username: string; fullName: string; role: Role; active: boolean; createdAt: string; sessionVersion: number };

export function parseUserInput(value: unknown, creating: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Dữ liệu tài khoản không hợp lệ" };
  const b = value as Record<string, unknown>;
  const username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (creating && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) return { error: "Tên đăng nhập gồm 3–40 ký tự a-z, 0-9, dấu chấm, gạch dưới hoặc gạch ngang" };
  if (!fullName || fullName.length > 200) return { error: "Họ tên bắt buộc, tối đa 200 ký tự" };
  if (b.role !== "ADMIN" && b.role !== "TECHNICAL_ARBITER" && b.role !== "RECORDING_ARBITER") return { error: "Vai trò không hợp lệ" };
  if (typeof b.active !== "boolean") return { error: "Trạng thái tài khoản không hợp lệ" };
  if ((creating || password !== "") && (password.trim().length < 12 || new TextEncoder().encode(password).length > 72)) return { error: "Mật khẩu mới cần ít nhất 12 ký tự, tối đa 72 byte UTF-8" };
  if (b.password !== undefined && typeof b.password !== "string") return { error: "Mật khẩu không hợp lệ" };
  if (typeof b.currentPassword !== "string" || !b.currentPassword || new TextEncoder().encode(b.currentPassword).length > 72) return { error: "Nhập mật khẩu hiện tại của bạn để xác thực thao tác" };
  if (!creating && (!Number.isSafeInteger(b.expectedVersion) || Number(b.expectedVersion) < 0)) return { error: "Thiếu phiên bản tài khoản. Hãy tải lại danh sách." };
  return { data: { username, fullName, role: b.role as Role, active: b.active, password, currentPassword: b.currentPassword, expectedVersion: Number(b.expectedVersion) } };
}
