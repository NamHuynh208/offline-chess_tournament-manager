"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-bold">USCC – Trọng tài</h1>
        <p className="text-slate-500">Chỉ dành cho trọng tài được cấp tài khoản</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 font-medium">
          Tài khoản
          <input name="username" autoComplete="username" autoCapitalize="none" required className="h-14 rounded-xl border border-slate-300 bg-white px-4 text-lg" />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Mật khẩu
          <input name="password" type="password" autoComplete="current-password" required className="h-14 rounded-xl border border-slate-300 bg-white px-4 text-lg" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        <button disabled={busy} className="flex h-14 items-center justify-center gap-2 rounded-xl bg-sky-500 text-lg font-semibold text-white disabled:opacity-60">
          <LogIn size={22} /> {busy ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}
