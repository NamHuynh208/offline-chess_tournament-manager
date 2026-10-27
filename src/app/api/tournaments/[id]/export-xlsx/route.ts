import { MatchStatus } from "@prisma/client";
import { attachment, loadExport } from "@/lib/export";
import { requireUser } from "@/lib/session";
import { buildResultsWorkbook } from "@/lib/swiss-manager";
import { formatInTz } from "@/lib/time";

/**
 * Excel kết quả (FR-09).
 * ?round=N        — 1 vòng; bỏ trống = toàn giải
 * ?status=OFFICIAL,AWAITING_CONFIRMATION,DISPUTED — mặc định OFFICIAL; mỗi trạng thái 1 sheet để đối soát
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) return auth.error;
  const q = new URL(req.url).searchParams;

  const round = q.get("round");
  if (round !== null && !/^\d+$/.test(round)) return Response.json({ error: "round phải là số nguyên dương" }, { status: 400 });
  const statuses = [...new Set((q.get("status") ?? "OFFICIAL").split(",").map((s) => s.trim()))];
  const bad = statuses.filter((s) => !Object.hasOwn(MatchStatus, s));
  if (bad.length) return Response.json({ error: `Trạng thái không hợp lệ: ${bad.join(", ")}` }, { status: 400 });

  const data = await loadExport((await params).id, round ? Number(round) : undefined);
  if (!data || (round && !data.hasRound)) return Response.json({ error: "Không tìm thấy giải hoặc vòng" }, { status: 404 });

  const t = data.tournament;
  const buf = buildResultsWorkbook(
    { tournamentName: t.name, scope: round ? `Vòng ${round}` : "Toàn giải", generatedAt: formatInTz(new Date(), t.timezone) },
    statuses as MatchStatus[],
    data.matches,
  );
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": attachment(`KetQua_${round ? `Van${round}` : "ToanGiai"}.xlsx`),
    },
  });
}
