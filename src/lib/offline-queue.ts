// Hàng đợi thao tác trên điện thoại trọng tài: giữ lại khi mất mạng, gửi lại theo đúng thứ tự.
import type { RecorderAction } from "./match-state";

export type QueuedOp = { opId: string; matchId: string; expectedVersion: number; action: RecorderAction; clientAt: string; label: string; error?: string };

// Theo từng tài khoản: trọng tài khác đăng nhập cùng máy không gửi nhầm thao tác
const key = (userId: string) => `uscc:pendingOps:${userId}`;

// shortcut: trình duyệt chặn localStorage (ẩn danh) thì hàng đợi chỉ còn trong bộ nhớ, mất khi tải lại trang
export function loadQueue(userId: string): QueuedOp[] {
  try {
    return JSON.parse(localStorage.getItem(key(userId)) ?? "[]");
  } catch {
    return [];
  }
}
export function saveQueue(userId: string, q: QueuedOp[]) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(q));
  } catch {}
}

// không dùng crypto.randomUUID: không có khi web chạy http qua IP mạng LAN
export const newOpId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
