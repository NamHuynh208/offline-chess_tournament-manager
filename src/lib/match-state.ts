// Vòng đời kết quả cho Trọng tài ghi (FR-04..06). Thuần, dùng chung server (kiểm tra thật) và điện thoại (cập nhật lạc quan khi mất mạng).
import type { AuditAction, MatchStatus, ResultType, Role } from "@prisma/client";
import { RESULT_DISPLAY, STATUS_LABEL } from "./results";

export type Side = "WHITE" | "BLACK";
export const SIDE_LABEL: Record<Side, string> = { WHITE: "Trắng", BLACK: "Đen" };

/** Thời điểm dạng ISO string để dùng được cả ở client */
export type MatchState = {
  resultVersion: number;
  status: MatchStatus;
  result: ResultType | null;
  whiteConfirmedAt: string | null;
  blackConfirmedAt: string | null;
  exceptionReason: string | null;
  hasBlack: boolean;
  requireTechnicalApproval: boolean;
};

export type RecorderAction =
  | { type: "ENTER_RESULT"; result: ResultType }
  | { type: "CONFIRM"; side: Side }
  | { type: "DISPUTE"; side: Side }
  | { type: "REQUEST_EXCEPTION"; reason: string };

export type TechnicalAction =
  | { type: "APPROVE_PUBLICATION" }
  | { type: "APPROVE_EXCEPTION" | "REOPEN" | "CANCEL_RESULT"; reason: string }
  | { type: "EDIT_RESULT"; result: ResultType; reason: string; mode: "CONFIRM" | "EXCEPTION" };

export function parseTechnicalAction(x: unknown): TechnicalAction | null {
  if (!x || typeof x !== "object") return null;
  const a = x as Record<string, unknown>;
  if (a.type === "APPROVE_PUBLICATION") return { type: a.type };
  if (typeof a.reason !== "string" || !a.reason.trim() || a.reason.length > 500) return null;
  if (a.type === "APPROVE_EXCEPTION" || a.type === "REOPEN" || a.type === "CANCEL_RESULT") return { type: a.type, reason: a.reason.trim() };
  if (a.type === "EDIT_RESULT" && RESULT_TYPES.includes(a.result as ResultType) && (a.mode === "CONFIRM" || a.mode === "EXCEPTION")) {
    return { type: a.type, result: a.result as ResultType, reason: a.reason.trim(), mode: a.mode };
  }
  return null;
}

export const toState = (m: Omit<MatchState, "hasBlack"> & { black: unknown }): MatchState => ({
  resultVersion: m.resultVersion,
  status: m.status,
  result: m.result,
  whiteConfirmedAt: m.whiteConfirmedAt,
  blackConfirmedAt: m.blackConfirmedAt,
  exceptionReason: m.exceptionReason,
  hasBlack: !!m.black,
  requireTechnicalApproval: m.requireTechnicalApproval,
});

const RESULT_TYPES = Object.keys(RESULT_DISPLAY) as ResultType[];

/** Kiểm tra body từ client (trust boundary) */
export function parseAction(x: unknown): RecorderAction | null {
  if (!x || typeof x !== "object") return null;
  const a = x as Record<string, unknown>;
  const side = a.side === "WHITE" || a.side === "BLACK" ? a.side : null;
  switch (a.type) {
    case "ENTER_RESULT":
      return RESULT_TYPES.includes(a.result as ResultType) ? { type: a.type, result: a.result as ResultType } : null;
    case "CONFIRM":
    case "DISPUTE":
      return side && { type: a.type, side };
    case "REQUEST_EXCEPTION":
      return typeof a.reason === "string" && a.reason.length <= 500 ? { type: a.type, reason: a.reason } : null;
  }
  return null;
}

type Outcome = { ok: true; next: MatchState; audit: AuditAction } | { ok: false; error: string };

export const readyToPublish = (m: Pick<MatchState, "status" | "result" | "whiteConfirmedAt" | "blackConfirmedAt" | "hasBlack">) => m.status === "AWAITING_CONFIRMATION" && !!m.result && !!m.whiteConfirmedAt && (!!m.blackConfirmedAt || !m.hasBlack);

export function applyAction(m: MatchState, a: RecorderAction | TechnicalAction, now: string, role: Role = "RECORDING_ARBITER"): Outcome {
  const fail = (error: string) => ({ ok: false as const, error });
  if (a.type === "APPROVE_PUBLICATION") {
    if (role !== "TECHNICAL_ARBITER") return fail("Chỉ Trọng tài kỹ thuật được duyệt công bố");
    if (!readyToPublish(m)) return fail("Chỉ duyệt công bố khi ván đang chờ và đã đủ xác nhận kỳ thủ");
    return { ok: true, audit: "APPROVE_PUBLICATION", next: { ...m, status: "OFFICIAL", exceptionReason: null } };
  }
  if (["APPROVE_EXCEPTION", "EDIT_RESULT", "REOPEN", "CANCEL_RESULT"].includes(a.type)) {
    if (role !== "TECHNICAL_ARBITER") return fail("Chỉ Trọng tài kỹ thuật được thực hiện");
    if (!("reason" in a) || !a.reason.trim() || a.reason.length > 500) return fail("Cần nhập lý do (tối đa 500 ký tự)");
  }
  switch (a.type) {
    case "REOPEN":
    case "CANCEL_RESULT":
      if (m.status !== "OFFICIAL") return fail("Chỉ mở lại / hủy kết quả đã chính thức");
      return { ok: true, audit: a.type === "REOPEN" ? "REOPEN" : "EDIT_RESULT", next: { ...m, resultVersion: m.resultVersion + 1, status: "REOPENED", result: a.type === "CANCEL_RESULT" ? null : m.result, whiteConfirmedAt: null, blackConfirmedAt: null, exceptionReason: null } };
    case "APPROVE_EXCEPTION":
      if (!m.result || m.status === "OFFICIAL" || m.status === "PENDING_RESULT") return fail("Cần có kết quả chưa chính thức để duyệt ngoại lệ");
      return { ok: true, audit: "APPROVE_EXCEPTION", next: { ...m, status: "OFFICIAL", exceptionReason: null } };
    case "EDIT_RESULT":
      if ((a.result === "BYE") === m.hasBlack) return fail(m.hasBlack ? "Ván có đủ 2 kỳ thủ, không chọn được BYE" : "Ván miễn đấu chỉ có kết quả BYE");
      return { ok: true, audit: "EDIT_RESULT", next: { ...m, resultVersion: m.resultVersion + 1, result: a.result, status: a.mode === "EXCEPTION" ? "OFFICIAL" : "AWAITING_CONFIRMATION", whiteConfirmedAt: null, blackConfirmedAt: null, exceptionReason: null } };
    case "ENTER_RESULT": {
      if (!["PENDING_RESULT", "AWAITING_CONFIRMATION", "REOPENED"].includes(m.status)) {
        return fail(`Ván đang "${STATUS_LABEL[m.status]}", chỉ Trọng tài kỹ thuật được sửa`);
      }
      if ((a.result === "BYE") === m.hasBlack) return fail(m.hasBlack ? "Ván có đủ 2 kỳ thủ, không chọn được BYE" : "Ván miễn đấu chỉ có kết quả BYE");
      // nhập lại tỷ số luôn xóa xác nhận cũ của cả 2 bên
      const next: MatchState = { ...m, resultVersion: m.resultVersion + 1, status: "AWAITING_CONFIRMATION", result: a.result, whiteConfirmedAt: null, blackConfirmedAt: null, exceptionReason: null };
      return { ok: true, audit: "ENTER_RESULT", next };
    }
    case "CONFIRM":
    case "DISPUTE": {
      if (m.status !== "AWAITING_CONFIRMATION" || !m.result) return fail(`Ván đang "${STATUS_LABEL[m.status]}", không còn chờ xác nhận`);
      if (a.side === "BLACK" && !m.hasBlack) return fail("Ván miễn đấu không có kỳ thủ Đen");
      const key = a.side === "WHITE" ? "whiteConfirmedAt" : "blackConfirmedAt";
      if (m[key]) return fail(`Kỳ thủ ${SIDE_LABEL[a.side]} đã xác nhận rồi`);
      if (a.type === "DISPUTE") return { ok: true, audit: "DISPUTE", next: { ...m, status: "DISPUTED" } };
      const next = { ...m, [key]: now };
      const both = !!next.whiteConfirmedAt && (!!next.blackConfirmedAt || !m.hasBlack);
      return { ok: true, audit: a.side === "WHITE" ? "CONFIRM_WHITE" : "CONFIRM_BLACK", next: both && !m.requireTechnicalApproval ? { ...next, status: "OFFICIAL" } : next };
    }
    case "REQUEST_EXCEPTION": {
      if (!["AWAITING_CONFIRMATION", "DISPUTED"].includes(m.status) || !m.result) {
        return fail("Chỉ yêu cầu duyệt ngoại lệ khi đã nhập kết quả và ván chưa chính thức");
      }
      const reason = a.reason.trim();
      if (!reason) return fail("Cần nhập lý do");
      return { ok: true, audit: "REQUEST_EXCEPTION", next: { ...m, exceptionReason: reason } };
    }
  }
}
