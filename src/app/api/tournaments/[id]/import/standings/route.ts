import { readUpload, planStandings, isImportConflict, ImportConflict } from "@/lib/imports";
import { requireUser } from "@/lib/session";
import { parseStandingsSheet } from "@/lib/swiss-manager";

/** multipart: file (.xls/.xlsx bảng xếp hạng Swiss-Manager), mode = "preview" (mặc định) | "commit" + previewToken, confirmOverwrite = "true" khi thay bảng cũ */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) return auth.error;
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Cần gửi multipart/form-data" }, { status: 400 });
  const up = await readUpload(form, [".xls", ".xlsx"]);
  if ("error" in up) return Response.json({ error: up.error }, { status: 400 });

  const plan = await planStandings(id, parseStandingsSheet(up.bytes));
  if (!plan) return Response.json({ error: "Không tìm thấy giải" }, { status: 404 });
  const { preview, commit } = plan;
  if (form.get("mode") !== "commit") return Response.json(preview);
  if (form.get("previewToken") !== preview.previewToken) return Response.json({ error: new ImportConflict().message }, { status: 409 });
  if (!preview.canCommit) return Response.json(preview, { status: 422 });
  if (preview.replaces && form.get("confirmOverwrite") !== "true") {
    return Response.json({ ...preview, error: `Bảng xếp hạng hiện tại (${preview.replaces.title}) sẽ bị thay, cần xác nhận (confirmOverwrite=true)` }, { status: 409 });
  }
  try {
    const log = await commit(auth.user, up.file.name, form.get("previewToken"));
    return Response.json({ ...preview, importId: log.id }, { status: 201 });
  } catch (e) {
    if (isImportConflict(e)) return Response.json({ error: new ImportConflict().message }, { status: 409 });
    throw e;
  }
}
