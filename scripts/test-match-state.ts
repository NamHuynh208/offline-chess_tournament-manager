// Chạy trong npm test — vòng đời kết quả (FR-04..06)
import assert from "node:assert/strict";
import { applyAction, parseAction, parseTechnicalAction, type MatchState, type RecorderAction } from "../src/lib/match-state";
import { DEFAULT_PROJECTOR_SETTINGS, hasImportedPoints, parseProjectorSettings, projectorPages, projectorScore } from "../src/lib/projector";
import type { ClientMatch } from "../src/lib/matches";
import { textOn } from "../src/lib/colors";
import { defaultTournament } from "../src/lib/tournament-selection";

const T = "2026-10-27T03:00:00.000Z";
const fresh: MatchState = { resultVersion: 0, status: "PENDING_RESULT", result: null, whiteConfirmedAt: null, blackConfirmedAt: null, exceptionReason: null, hasBlack: true, requireTechnicalApproval: false };
const run = (m: MatchState, ...as: RecorderAction[]) =>
  as.reduce((s, a) => {
    const r = applyAction(s, a, T);
    assert.ok(r.ok, `${a.type}: ${!r.ok && r.error}`);
    return r.next;
  }, m);
const err = (m: MatchState, a: RecorderAction) => {
  const r = applyAction(m, a, T);
  assert.ok(!r.ok);
  return r.error;
};
const test = (name: string, fn: () => void) => (fn(), console.log(`✔ ${name}`));

const entered = run(fresh, { type: "ENTER_RESULT", result: "DRAW" });
test("Nhập KQ -> chờ xác nhận, chưa ai xác nhận", () => {
  assert.equal(entered.resultVersion, 1);
  assert.equal(entered.status, "AWAITING_CONFIRMATION");
  assert.equal(entered.result, "DRAW");
});
test("Trắng xác nhận -> vẫn chờ, khóa lượt Trắng; Đen xác nhận -> OFFICIAL", () => {
  const w = run(entered, { type: "CONFIRM", side: "WHITE" });
  assert.equal(w.status, "AWAITING_CONFIRMATION");
  assert.equal(w.resultVersion, entered.resultVersion);
  assert.equal(w.whiteConfirmedAt, T);
  assert.match(err(w, { type: "CONFIRM", side: "WHITE" }), /đã xác nhận/);
  assert.match(err(w, { type: "DISPUTE", side: "WHITE" }), /đã xác nhận/);
  assert.equal(run(w, { type: "CONFIRM", side: "BLACK" }).status, "OFFICIAL");
});
test("Một bên không đồng ý -> DISPUTED, giữ xác nhận của bên kia", () => {
  const d = run(entered, { type: "CONFIRM", side: "WHITE" }, { type: "DISPUTE", side: "BLACK" });
  assert.equal(d.status, "DISPUTED");
  assert.equal(d.whiteConfirmedAt, T);
  assert.match(err(d, { type: "CONFIRM", side: "BLACK" }), /không còn chờ/);
  assert.match(err(d, { type: "ENTER_RESULT", result: "DRAW" }), /Trọng tài kỹ thuật/);
  assert.equal(run(d, { type: "REQUEST_EXCEPTION", reason: " Đen rời khu vực " }).exceptionReason, "Đen rời khu vực");
});
test("Nhập lại KQ xóa xác nhận cũ; OFFICIAL không sửa được", () => {
  const re = run(entered, { type: "CONFIRM", side: "WHITE" }, { type: "ENTER_RESULT", result: "WHITE_WIN" });
  assert.equal(re.whiteConfirmedAt, null);
  const off = run(re, { type: "CONFIRM", side: "WHITE" }, { type: "CONFIRM", side: "BLACK" });
  assert.match(err(off, { type: "ENTER_RESULT", result: "DRAW" }), /Chính thức/);
  assert.match(err(off, { type: "REQUEST_EXCEPTION", reason: "x" }), /chưa chính thức/);
});
test("BYE chỉ dùng cho ván không có Đen; chỉ cần Trắng xác nhận", () => {
  assert.match(err(fresh, { type: "ENTER_RESULT", result: "BYE" }), /không chọn được BYE/);
  const bye = { ...fresh, hasBlack: false };
  assert.match(err(bye, { type: "ENTER_RESULT", result: "DRAW" }), /chỉ có kết quả BYE/);
  assert.equal(run(bye, { type: "ENTER_RESULT", result: "BYE" }, { type: "CONFIRM", side: "WHITE" }).status, "OFFICIAL");
});
test("Chưa nhập KQ thì không xác nhận / yêu cầu ngoại lệ; lý do rỗng bị từ chối", () => {
  assert.ok(err(fresh, { type: "CONFIRM", side: "WHITE" }));
  assert.ok(err(fresh, { type: "REQUEST_EXCEPTION", reason: "x" }));
  assert.match(err(entered, { type: "REQUEST_EXCEPTION", reason: "  " }), /lý do/);
});
test("parseAction chặn dữ liệu sai", () => {
  assert.equal(parseAction({ type: "ENTER_RESULT", result: "2-0" }), null);
  assert.equal(parseAction({ type: "CONFIRM", side: "RED" }), null);
  assert.equal(parseAction({ type: "REQUEST_EXCEPTION", reason: "x".repeat(501) }), null);
  assert.equal(parseAction({ type: "APPROVE_EXCEPTION" }), null);
  assert.deepEqual(parseAction({ type: "DISPUTE", side: "BLACK", extra: 1 }), { type: "DISPUTE", side: "BLACK" });
});
test("TTKT: bắt buộc quyền, lý do và validation payload", () => {
  const a = { type: "REOPEN" as const, reason: "Sửa biên bản" };
  const off = { ...entered, status: "OFFICIAL" as const };
  assert.equal(applyAction(off, a, T).ok, false);
  assert.equal(parseTechnicalAction({ ...a, reason: " " }), null);
  assert.equal(parseTechnicalAction({ ...a, reason: "x".repeat(501) }), null);
  assert.equal(parseTechnicalAction({ type: "EDIT_RESULT", result: "BAD", mode: "CONFIRM", reason: "x" }), null);
  assert.equal(parseTechnicalAction({ type: "EDIT_RESULT", result: "DRAW", mode: "BAD", reason: "x" }), null);
  assert.equal(applyAction(off, { ...a, reason: " " }, T, "TECHNICAL_ARBITER").ok, false);
});
test("TTKT: sửa, hủy, mở lại và duyệt ngoại lệ", () => {
  const off = { ...entered, status: "OFFICIAL" as const, whiteConfirmedAt: T, blackConfirmedAt: T };
  const technical = (m: MatchState, a: NonNullable<ReturnType<typeof parseTechnicalAction>>) => {
    const r = applyAction(m, a, T, "TECHNICAL_ARBITER"); assert.ok(r.ok); return r.next;
  };
  const re = technical(off, { type: "REOPEN", reason: "Kiểm tra" });
  assert.equal(re.status, "REOPENED"); assert.equal(re.result, "DRAW"); assert.equal(re.whiteConfirmedAt, null);
  const cancelled = technical(off, { type: "CANCEL_RESULT", reason: "Nhập nhầm bàn" });
  assert.equal(cancelled.status, "REOPENED"); assert.equal(cancelled.result, null);
  assert.equal(applyAction(cancelled, { type: "APPROVE_EXCEPTION", reason: "x" }, T, "TECHNICAL_ARBITER").ok, false);
  const corrected = technical(off, { type: "EDIT_RESULT", result: "BLACK_WIN", mode: "CONFIRM", reason: "Đối chiếu" });
  assert.equal(corrected.resultVersion, off.resultVersion + 1);
  assert.equal(technical(off, { type: "EDIT_RESULT", result: off.result!, mode: "CONFIRM", reason: "Xác nhận lại" }).resultVersion, off.resultVersion + 1);
  assert.equal(corrected.status, "AWAITING_CONFIRMATION"); assert.equal(corrected.whiteConfirmedAt, null); assert.equal(corrected.blackConfirmedAt, null);
  const disputed = { ...entered, status: "DISPUTED" as const, exceptionReason: "Đen vắng" };
  assert.equal(technical(disputed, { type: "APPROVE_EXCEPTION", reason: "Phân xử" }).exceptionReason, null);
  assert.equal(technical(disputed, { type: "EDIT_RESULT", result: "BLACK_FORFEIT", mode: "EXCEPTION", reason: "Đen bỏ cuộc" }).status, "OFFICIAL");
  assert.equal(applyAction(off, { type: "EDIT_RESULT", result: "BYE", mode: "EXCEPTION", reason: "x" }, T, "TECHNICAL_ARBITER").ok, false);
});
test("Projector: tuyệt đối không hiện tỷ số chưa OFFICIAL; điểm 0 vẫn có dữ liệu", () => {
  for (const status of ["PENDING_RESULT", "AWAITING_CONFIRMATION", "DISPUTED", "REOPENED"] as const) assert.equal(projectorScore({ status, result: "WHITE_WIN" }), null);
  assert.equal(projectorScore({ status: "OFFICIAL", result: "DRAW" }), "½ - ½");
  assert.equal(projectorScore({ status: "OFFICIAL", result: null }), null);
  assert.equal(hasImportedPoints([{ white: { points: 0 }, black: null } as ClientMatch]), true);
  assert.equal(hasImportedPoints([{ white: { points: null }, black: null } as ClientMatch]), false);
});
test("Màu nhận diện: chữ đen/trắng đạt độ tương phản WCAG 4.5:1 kể cả màu cực sáng/tối", () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    const linear = [r, g, b].map((n) => n / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const l = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    const contrast = textOn(hex) === "#000000" ? (l + 0.05) / 0.05 : 1.05 / (l + 0.05);
    assert.ok(contrast >= 4.5, `${hex}: ${contrast}`);
  }
});
test("Chọn giải mới nhất đang diễn ra, bỏ giải tương lai/kết thúc và fallback nếu không có giải phù hợp", () => {
  const now = Date.parse(T);
  const future = { startDate: "2099-01-01", endDate: null };
  const current = { startDate: "2026-01-01", endDate: null };
  const old = { startDate: null, endDate: "2025-01-01" };
  assert.equal(defaultTournament([future, current, old], now), current);
  assert.equal(defaultTournament([future, old], now), future);
  assert.equal(defaultTournament([], now), undefined);
});
test("TTKT duyệt trước: đủ xác nhận vẫn chờ, chặn duyệt thiếu xác nhận/bất đồng và ghi đúng action", () => {
  const gated = run({ ...fresh, requireTechnicalApproval: true }, { type: "ENTER_RESULT", result: "DRAW" }, { type: "CONFIRM", side: "WHITE" }, { type: "CONFIRM", side: "BLACK" });
  assert.equal(gated.status, "AWAITING_CONFIRMATION");
  assert.equal(applyAction(gated, { type: "APPROVE_PUBLICATION" }, T).ok, false);
  const approved = applyAction(gated, { type: "APPROVE_PUBLICATION" }, T, "TECHNICAL_ARBITER");
  assert.ok(approved.ok); assert.equal(approved.next.status, "OFFICIAL"); assert.equal(approved.audit, "APPROVE_PUBLICATION");
  assert.equal(applyAction({ ...gated, blackConfirmedAt: null }, { type: "APPROVE_PUBLICATION" }, T, "TECHNICAL_ARBITER").ok, false);
  assert.equal(applyAction({ ...gated, status: "DISPUTED" }, { type: "APPROVE_PUBLICATION" }, T, "TECHNICAL_ARBITER").ok, false);
  assert.deepEqual(parseTechnicalAction({ type: "APPROVE_PUBLICATION" }), { type: "APPROVE_PUBLICATION" });
});
test("Cấu hình projector: validate storage, chia đều và không mất/trùng bàn khi đổi cách phân trang", () => {
  assert.deepEqual(parseProjectorSettings({ scale: -1, columns: 99, seconds: 0, page: Infinity, round: "2", auto: "yes" }), DEFAULT_PROJECTOR_SETTINGS);
  const stored = { ...DEFAULT_PROJECTOR_SETTINGS, aspect: "4:3", scale: 125, pagination: "pages", pageCount: 3, columns: 4, auto: false, controlsHidden: true, round: 2, page: 1 };
  assert.deepEqual(parseProjectorSettings(stored), stored);
  const all = Array.from({ length: 43 }, (_, i) => i + 1);
  for (const pagination of ["boards", "pages"] as const) for (const pageCount of [1, 2, 3, 4]) for (const perPage of [10, 16, 20, 24, 30, 40]) {
    const pages = projectorPages(all, { pagination, pageCount, perPage });
    assert.deepEqual(pages.flat(), all);
    assert.equal(pages.length, pagination === "pages" ? pageCount : Math.ceil(all.length / perPage));
  }
  assert.deepEqual(projectorPages([], DEFAULT_PROJECTOR_SETTINGS), [[]]);
});
console.log("\nState machine + Projector + Contrast + Tournament: PASS");
