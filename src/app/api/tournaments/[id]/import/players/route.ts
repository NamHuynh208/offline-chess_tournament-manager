import { readUpload, planPlayers, isImportConflict, ImportConflict } from "@/lib/imports";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { parsePlayersXml } from "@/lib/swiss-manager";

/** multipart: file (.xml), mode = "preview" (mặc định) | "commit", confirmOverwrite = "true" khi có kỳ thủ bị cập nhật */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!(await prisma.tournament.count({ where: { id } }))) return Response.json({ error: "Không tìm thấy giải" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Cần gửi multipart/form-data" }, { status: 400 });
  const up = await readUpload(form, [".xml"]);
  if ("error" in up) return Response.json({ error: up.error }, { status: 400 });

  const { preview, commit } = await planPlayers(id, parsePlayersXml(new TextDecoder().decode(up.bytes)));
  if (form.get("mode") !== "commit") return Response.json(preview);
  if (form.get("previewToken") !== preview.previewToken) return Response.json({ error: new ImportConflict().message }, { status: 409 });
  if (!preview.canCommit) return Response.json(preview, { status: 422 });
  if (preview.updates.length && form.get("confirmOverwrite") !== "true") {
    return Response.json({ ...preview, error: `${preview.updates.length} kỳ thủ sẽ bị cập nhật thông tin, cần xác nhận (confirmOverwrite=true)` }, { status: 409 });
  }
  try {
    const log = await commit(auth.user, up.file.name, form.get("previewToken"));
    return Response.json({ ...preview, importId: log.id }, { status: 201 });
  } catch (e) {
    if (isImportConflict(e)) return Response.json({ error: new ImportConflict().message }, { status: 409 });
    throw e;
  }
}
