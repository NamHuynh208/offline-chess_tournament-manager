import { readUpload, planPairing, isImportConflict, ImportConflict } from "@/lib/imports";
import { requireUser } from "@/lib/session";
import { COLUMN_LABEL, parsePairingSheet, type ColumnMap } from "@/lib/swiss-manager";

const posInt = (v: FormDataEntryValue | null) => (v === null || v === "" ? undefined : /^\d+$/.test(String(v)) && Number(v) > 0 ? Number(v) : NaN);

/**
 * multipart:
 * - file: .xls/.xlsx bốc thăm Swiss-Manager
 * - mode: "preview" (mặc định) | "commit"
 * - round, headerRow (số dòng Excel): tùy chọn, ghi đè giá trị tự dò
 * - columns: JSON {"board":0,"whiteSNo":1,"whiteName":2,"blackName":6,"blackSNo":7} (chỉ số cột trong `header` của preview)
 * - confirmOverwrite: "true" khi preview báo có bàn bị ghi đè
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("TECHNICAL_ARBITER");
  if (auth.error) return auth.error;
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Cần gửi multipart/form-data" }, { status: 400 });
  const up = await readUpload(form, [".xls", ".xlsx"]);
  if ("error" in up) return Response.json({ error: up.error }, { status: 400 });

  const round = posInt(form.get("round"));
  const headerRow = posInt(form.get("headerRow"));
  if (Number.isNaN(round) || Number.isNaN(headerRow)) return Response.json({ error: "round/headerRow phải là số nguyên dương" }, { status: 400 });
  let columns: Partial<ColumnMap> | undefined;
  if (form.get("columns")) {
    try {
      columns = JSON.parse(String(form.get("columns")));
    } catch {}
    const ok = columns && typeof columns === "object" && Object.entries(columns).every(([k, v]) => Object.hasOwn(COLUMN_LABEL, k) && Number.isInteger(v) && v >= 0);
    if (!ok) return Response.json({ error: `columns phải là JSON với khóa ${Object.keys(COLUMN_LABEL).join(", ")} và giá trị là chỉ số cột >= 0` }, { status: 400 });
  }

  const plan = await planPairing(id, parsePairingSheet(up.bytes, { headerRow, columns }), round);
  if (!plan) return Response.json({ error: "Không tìm thấy giải" }, { status: 404 });
  const { preview, commit } = plan;
  if (form.get("mode") !== "commit") return Response.json(preview);
  if (form.get("previewToken") !== preview.previewToken) return Response.json({ error: new ImportConflict().message }, { status: 409 });
  if (!preview.canCommit) return Response.json(preview, { status: 422 });
  if (preview.overwrite.length && form.get("confirmOverwrite") !== "true") {
    const n = preview.summary.overwrittenWithResult;
    return Response.json(
      { ...preview, error: `Vòng ${preview.round} sẽ ghi đè ${preview.overwrite.length} bàn${n ? ` (${n} bàn đã có kết quả)` : ""}, cần xác nhận (confirmOverwrite=true)` },
      { status: 409 },
    );
  }
  try {
    const log = await commit(auth.user, up.file.name, form.get("previewToken"));
    return Response.json({ ...preview, importId: log.id }, { status: 201 });
  } catch (e) {
    if (isImportConflict(e)) return Response.json({ error: new ImportConflict().message }, { status: 409 });
    throw e;
  }
}
