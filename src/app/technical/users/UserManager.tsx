"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, KeyRound, Plus, RefreshCw, Users } from "lucide-react";
import { ROLE_LABEL, type ManagedUser } from "@/lib/users";

const input = "min-w-0 rounded-sm border border-[#E5E5EA] bg-white px-3 py-2";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export default function UserManager() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<ManagedUser | "new" | null>(null);
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/users", { cache: "no-store" });
      const b = await r.json(); if (!r.ok) throw new Error(b.error ?? "Không tải được tài khoản");
      setUsers(b.users); setCurrentUserId(b.currentUserId);
    } catch (e) { setError(e instanceof Error ? e.message : "Mất kết nối máy chủ"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = users.filter((u) => `${u.username} ${u.fullName}`.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi")));
  return <div className="min-h-dvh">
    <header className="app-header flex flex-wrap items-center justify-between gap-4 px-6 py-4"><div><h1 className="flex items-center gap-2 text-xl font-bold"><Users aria-hidden size={22} />Quản lý tài khoản trọng tài</h1><p className="mt-1 text-sm text-slate-500">Chỉ Admin được tạo tài khoản và thay đổi quyền/mật khẩu. Trọng tài kỹ thuật chỉ điều hành giải đấu.</p></div><a href="/technical" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><ArrowLeft aria-hidden size={18} />Về điều hành kỹ thuật</a></header>
    <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="app-card flex flex-wrap items-end justify-between gap-3 p-4"><label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">Tìm tài khoản<input type="search" aria-label="Tìm tài khoản" value={query} onChange={(e) => setQuery(e.target.value)} className={input} placeholder="Tên đăng nhập hoặc họ tên" /></label><div className="flex flex-wrap gap-2"><button className={button} onClick={() => { setMessage(""); setEditing("new"); }}><Plus aria-hidden size={18} />Tạo tài khoản</button><button disabled={loading} className={`${input} inline-flex min-h-11 items-center gap-2 text-sm font-semibold`} onClick={() => void load()}><RefreshCw aria-hidden size={18} />Tải lại danh sách</button></div></div>
      <p className="text-sm text-slate-600">Không xóa tài khoản để bảo toàn lịch sử. Dùng “Khóa” để ngừng truy cập. Mọi thay đổi tài khoản sẽ thu hồi phiên đăng nhập cũ; các thao tác offline vẫn giữ trên máy và cần kiểm tra sau khi đăng nhập lại.</p>
      {error && <p role="alert" className="text-red-800">{error}</p>}
      {message && <p role="status" className="font-semibold text-emerald-800">{message}</p>}
      {loading ? <p>Đang tải tài khoản...</p> : <div className="grid gap-4 md:grid-cols-2">{visible.map((u) => <article key={u.id} className="app-card space-y-3 p-5" aria-label={`Tài khoản ${u.username}`}>
        <div className="flex flex-wrap justify-between gap-2"><h2 className="break-all font-bold">{u.fullName}</h2><span className={`rounded-sm px-2 py-1 text-xs font-semibold ${u.active ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{u.active ? "Đang hoạt động" : "Đã khóa"}</span></div>
        <p className="break-all text-sm">{u.username}{u.id === currentUserId && " · Tài khoản của bạn"}</p><p className="text-sm text-slate-600">{ROLE_LABEL[u.role]}</p>
        <button className={`${input} inline-flex min-h-11 items-center gap-2 text-sm font-semibold`} onClick={() => { setMessage(""); setEditing(u); }}><KeyRound aria-hidden size={18} />Sửa / Đổi mật khẩu</button>
      </article>)}</div>}
      {!loading && !visible.length && <p>Không có tài khoản phù hợp.</p>}
    </main>
    {editing && <UserForm key={editing === "new" ? "new" : editing.id} user={editing === "new" ? null : editing} self={editing !== "new" && editing.id === currentUserId} onClose={() => setEditing(null)} onSaved={(u, loginRequired) => { if (loginRequired) { location.href = "/login"; return; } setUsers((us) => editing === "new" ? [u, ...us] : us.map((x) => x.id === u.id ? u : x)); setEditing(null); setMessage("Đã lưu tài khoản"); }} />}
  </div>;
}

function UserForm({ user, self, onClose, onSaved }: { user: ManagedUser | null; self: boolean; onClose: () => void; onSaved: (user: ManagedUser, loginRequired: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== form.get("confirmPassword")) { setError("Mật khẩu mới nhập lại không khớp"); return; }
    setBusy(true);
    try {
      const r = await fetch(user ? `/api/users/${user.id}` : "/api/users", { method: user ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.get("username"), fullName: form.get("fullName"), role: form.get("role"), active: form.get("active") === "on", password, currentPassword: form.get("currentPassword"), expectedVersion: user?.sessionVersion }), signal: AbortSignal.timeout(15000) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error ?? "Không lưu được tài khoản");
      onSaved(b.user, b.loginRequired);
    } catch (e) { setError(e instanceof Error ? e.message : "Mất kết nối; tải lại danh sách trước khi thử lại."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} aria-label={user ? "Sửa tài khoản trọng tài" : "Tạo tài khoản trọng tài"} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }} className="app-card fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-auto rounded-sm p-6 backdrop:bg-slate-900/60">
    <form onSubmit={submit} className="space-y-4"><h2 className="text-xl font-bold">{user ? `Sửa tài khoản: ${user.username}` : "Tạo tài khoản trọng tài"}</h2>
      <label className="flex flex-col gap-1 font-semibold">Tên đăng nhập<input autoFocus={!user} required name="username" autoComplete="off" autoCapitalize="none" minLength={3} maxLength={40} readOnly={!!user} defaultValue={user?.username ?? ""} className={`${input} read-only:bg-slate-50`} /></label>
      <label className="flex flex-col gap-1 font-semibold">Họ tên<input autoFocus={!!user} required name="fullName" maxLength={200} defaultValue={user?.fullName ?? ""} className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Vai trò<select aria-label="Vai trò" name="role" defaultValue={user?.role ?? "RECORDING_ARBITER"} className={input}>{Object.entries(ROLE_LABEL).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
      <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="active" defaultChecked={user?.active ?? true} />Cho phép đăng nhập (bỏ chọn để khóa)</label>
      <label className="flex flex-col gap-1 font-semibold">Mật khẩu mới<input type="password" name="password" required={!user} minLength={12} autoComplete="new-password" className={input} /></label>
      <label className="flex flex-col gap-1 font-semibold">Nhập lại mật khẩu mới<input type="password" name="confirmPassword" required={!user} autoComplete="new-password" className={input} /></label>
      <p className="text-sm text-slate-500">Ít nhất 12 ký tự, tối đa 72 byte UTF-8. {user && "Để trống cả hai ô để giữ mật khẩu cũ."} Không thể xem lại mật khẩu đã lưu.</p>
      <label className="flex flex-col gap-1 font-semibold">Mật khẩu hiện tại của bạn<input type="password" name="currentPassword" required autoComplete="current-password" className={input} /></label>
      {self && <p className="text-sm font-semibold text-orange-900">Bạn đang sửa tài khoản của mình. Lưu thành công sẽ yêu cầu đăng nhập lại. Không thể khóa/hạ quyền Admin hoạt động cuối cùng.</p>}
      {error && <p role="alert" className="text-red-800">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={busy} className={input} onClick={onClose}>Hủy</button><button disabled={busy} className={button}>{busy ? "Đang lưu..." : "Lưu tài khoản"}</button></div>
    </form>
  </dialog>;
}
