"use client";
import { useEffect, useState } from "react";
import type { ClientMatch } from "./matches";

export type LiveTournament = {
  tournament: { id: string; name: string; logoUrl: string | null; primaryColor: string; timezone: string };
  rounds: { number: number; matches: ClientMatch[] }[];
};

export function useLiveTournament(id: string, projector = false) {
  const [state, setState] = useState<{ data: LiveTournament | null; lastSync: string | null; error: string }>({ data: null, lastSync: null, error: "" });
  useEffect(() => {
    let stopped = false;
    let busy = false;
    let controller: AbortController | undefined;
    setState({ data: null, lastSync: null, error: "" });
    async function poll() {
      if (busy || !id) return;
      busy = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 4000);
      try {
        const res = await fetch(`/api/tournaments/${id}/live${projector ? "?view=projector" : ""}`, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "Phiên đăng nhập hết hạn hoặc không có quyền" : "Không kết nối được máy chủ");
        const data: LiveTournament = await res.json();
        if (!stopped) setState({ data, lastSync: new Date().toISOString(), error: "" });
      } catch (e) {
        if (!stopped) setState((s) => ({ ...s, error: e instanceof Error && e.name !== "AbortError" ? e.message : "Mất kết nối máy chủ" }));
      } finally { clearTimeout(timeout); busy = false; }
    }
    const offline = () => setState((s) => ({ ...s, error: "Mất mạng" }));
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    window.addEventListener("offline", offline);
    window.addEventListener("online", poll);
    return () => { stopped = true; clearInterval(timer); controller?.abort(); window.removeEventListener("offline", offline); window.removeEventListener("online", poll); };
  }, [id, projector]);
  return { ...state, updateTournament: (tournament: LiveTournament["tournament"]) => setState((s) => ({ ...s, data: s.data ? { ...s.data, tournament } : { tournament, rounds: [] } })) };
}
