"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChessKnight, LogIn, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: f.get("username"), password: f.get("password") }),
      });
      if (res.ok) return router.replace("/");
      setError((await res.json().catch(() => null))?.error ?? "Đăng nhập thất bại");
    } catch {
      setError("Không kết nối được máy chủ");
    }
    setBusy(false);
  }

  return (
    <main className="login-page"><div className="login-panel">
      <div className="brand-signature"><ChessKnight aria-hidden />USCC Tournament Manager</div>
      <h1>Điều hành giải đấu.<br />Tập trung vào từng ván cờ.</h1>
      <p className="leading-relaxed text-slate-600">Đăng nhập để ghi nhận, xác nhận và công bố kết quả.</p>
      <form onSubmit={submit} className="login-form">
        <label className="flex flex-col gap-1 font-medium">
          Tài khoản
          <input name="username" autoComplete="username" autoCapitalize="none" required className="h-14 rounded-sm border border-[#E5E5EA] bg-white px-4 text-lg" />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Mật khẩu
          <input name="password" type="password" autoComplete="current-password" required className="h-14 rounded-sm border border-[#E5E5EA] bg-white px-4 text-lg" />
        </label>
        {error && <p role="alert" className="rounded-sm bg-red-50 p-3 text-red-700">{error}</p>}
        <button disabled={busy} className="ui-primary h-12 w-full disabled:opacity-60">
          <LogIn size={22} /> {busy ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
      <p className="login-note flex items-start gap-2"><ShieldCheck aria-hidden size={18} className="mt-0.5 shrink-0" />Chỉ dành cho trọng tài được cấp tài khoản. Liên hệ Admin nếu bạn cần hỗ trợ truy cập.</p>
      </div>
    </main>
  );
}
