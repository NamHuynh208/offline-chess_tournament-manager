// Kiểm tra dữ liệu giải (FR-01). partial = true cho PATCH: chỉ kiểm tra các trường có gửi lên.
export type TournamentInput = {
  name?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  location?: string | null;
  organizer?: string | null;
  totalRounds?: number;
  logoUrl?: string | null;
  primaryColor?: string;
  requireTechnicalApproval?: boolean;
};

export function parseTournamentInput(body: unknown, partial: boolean) {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: TournamentInput = {};
  const errors: Record<string, string> = {};
  const has = (k: string) => b[k] !== undefined;
  if (has("requireTechnicalApproval")) {
    if (typeof b.requireTechnicalApproval !== "boolean") errors.requireTechnicalApproval = "Phải là true hoặc false";
    else data.requireTechnicalApproval = b.requireTechnicalApproval;
  }

  for (const k of ["name", "location", "organizer"] as const) {
    if (!has(k)) {
      if (k === "name" && !partial) errors[k] = "Bắt buộc";
      continue;
    }
    const v = b[k] === null ? "" : b[k];
    if (typeof v !== "string" || v.trim().length > 200) errors[k] = "Chuỗi tối đa 200 ký tự";
    else if (k !== "name") data[k] = v.trim() || null;
    else if (v.trim()) data.name = v.trim();
    else errors.name = "Bắt buộc";
  }

  for (const k of ["startDate", "endDate"] as const) {
    if (!has(k)) continue;
    const d = b[k] === null || b[k] === "" ? null : new Date(String(b[k]));
    if (d && isNaN(d.getTime())) errors[k] = "Ngày không hợp lệ (ISO 8601, vd 2026-10-27T08:00:00+07:00)";
    else data[k] = d;
  }
  if (data.startDate && data.endDate && data.endDate < data.startDate) errors.endDate = "Ngày kết thúc trước ngày bắt đầu";

  if (has("totalRounds")) {
    const n = Number(b.totalRounds);
    if (!Number.isInteger(n) || n < 1 || n > 30) errors.totalRounds = "Số nguyên từ 1 đến 30";
    else data.totalRounds = n;
  } else if (!partial) errors.totalRounds = "Bắt buộc";

  if (has("logoUrl")) {
    const v = b.logoUrl === null ? "" : String(b.logoUrl).trim();
    // chỉ http(s) hoặc đường dẫn nội bộ, chặn javascript:/data:
    if (v && !/^(https?:\/\/|\/(?!\/))\S+$/i.test(v)) errors.logoUrl = "URL phải bắt đầu bằng http(s):// hoặc /";
    else data.logoUrl = v || null;
  }

  if (has("primaryColor")) {
    const v = String(b.primaryColor).trim();
    if (!/^#[0-9a-f]{6}$/i.test(v)) errors.primaryColor = "Mã màu dạng #RRGGBB";
    else data.primaryColor = v.toLowerCase();
  }

  return Object.keys(errors).length ? { errors } : { data };
}
