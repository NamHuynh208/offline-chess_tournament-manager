import { attachment, loadExport } from "@/lib/export";
import { requireUser } from "@/lib/session";
import { buildResultsXml } from "@/lib/swiss-manager";

/** XML kết quả 1 vòng để nhập lại Swiss-Manager (chỉ ván OFFICIAL) */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; round: string }> }) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) return auth.error;
  const { id, round } = await params;
  if (!/^\d+$/.test(round)) return Response.json({ error: "Số vòng không hợp lệ" }, { status: 400 });
  const data = await loadExport(id, Number(round));
  if (!data?.hasRound) return Response.json({ error: "Không tìm thấy giải hoặc vòng" }, { status: 404 });

  return new Response(buildResultsXml(data.matches), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": attachment(`KetQua_Van${round}.xml`),
      // để TTKT biết còn ván chưa chính thức không có trong file
      "X-Not-Official-Count": String(data.matches.filter((m) => m.status !== "OFFICIAL").length),
    },
  });
}
