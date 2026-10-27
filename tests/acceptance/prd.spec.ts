import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient, type ResultType } from "@prisma/client";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";
import { RESULT_FROM_CODE, SM_CODE } from "../../src/lib/results";
import type { ClientMatch } from "../../src/lib/matches";

if (!process.env.TEST_DATABASE_URL?.includes("uscc-acceptance-") || !process.env.TEST_BASE_URL || !process.env.TEST_PASSWORD) {
  throw new Error("Chạy npm run test:acceptance để dùng DB/server tạm an toàn");
}
const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const sample = (name: string) => readFileSync(`samples/${name}`);
const pairingFile = sample("Kết quả bốc thăm xuất ra.xls");
const playersFile = sample("Nhập_danh_sách_ban_đầu(không cần quan tâm).xml");
const resultsFile = sample("Kết_quả_sau_khi_đấu_nhập_vào_SM.xml");
const source = XLSX.read(pairingFile);
// Oracle độc lập: đọc trực tiếp từng ô file mẫu, không dùng parser đang được kiểm tra.
const sourceRows = XLSX.utils.sheet_to_json<unknown[]>(source.Sheets[source.SheetNames[0]], { header: 1, defval: "" }).slice(5, 45);
const resultRows = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false, isArray: (n) => n === "Result" }).parse(resultsFile.toString("utf8")).Results.Result as Record<string, string>[];
const sheet = (rows: unknown[][]) => {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Bốc thăm");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};
const header = ["Bàn", "STT", "White", "Điểm", "KQ", "Điểm", "Black", "STT"];
const test = base.extend<{ tech: APIRequestContext; recorder: APIRequestContext; tid: string }>({
  tech: async ({ playwright }, provide) => {
    const api = await playwright.request.newContext({ baseURL: process.env.TEST_BASE_URL });
    expect((await api.post("/api/auth/login", { data: { username: "test-tech", password: process.env.TEST_PASSWORD } })).ok()).toBeTruthy();
    await provide(api); await api.dispose();
  },
  recorder: async ({ playwright }, provide) => {
    const api = await playwright.request.newContext({ baseURL: process.env.TEST_BASE_URL });
    expect((await api.post("/api/auth/login", { data: { username: "test-record", password: process.env.TEST_PASSWORD } })).ok()).toBeTruthy();
    await provide(api); await api.dispose();
  },
  tid: async ({ tech }, provide) => {
    const r = await tech.post("/api/tournaments", { data: { name: `Nghiệm thu ${randomUUID()}`, totalRounds: 9 } });
    expect(r.status()).toBe(201);
    const { id } = await r.json();
    await upload(tech, id, "players", playersFile, "commit", "players.xml");
    await upload(tech, id, "pairing", pairingFile, "commit");
    await provide(id);
    // Không dọn dữ liệu ở đây: toàn bộ DB tạm bị xóa khi runner kết thúc, giữ log khi test đang chạy.
  },
});
test.afterAll(async () => db.$disconnect());

async function upload(api: APIRequestContext, tid: string, kind: string, buffer: Buffer, mode = "preview", name = "pairing.xls", extra: Record<string, string> = {}, status = mode === "commit" ? 201 : 200) {
  if (mode === "commit" && !Object.hasOwn(extra, "previewToken")) {
    const preview = await upload(api, tid, kind, buffer, "preview", name, extra);
    extra = { ...extra, previewToken: preview.previewToken };
  }
  const r = await api.post(`/api/tournaments/${tid}/import/${kind}`, { multipart: { file: { name, mimeType: "application/octet-stream", buffer }, mode, ...extra } });
  expect(r.status(), await r.text()).toBe(status); return r.json();
}
async function matches(api: APIRequestContext, tid: string, round = 2): Promise<ClientMatch[]> {
  const r = await api.get(`/api/tournaments/${tid}/rounds/${round}/matches`); expect(r.ok()).toBeTruthy(); return (await r.json()).matches;
}
async function action(api: APIRequestContext, m: ClientMatch, a: object, status = 200) {
  const r = await api.post(`/api/matches/${m.id}/actions`, { data: { action: a, expectedVersion: m.resultVersion, expectedUpdatedAt: m.updatedAt } });
  expect(r.status(), await r.text()).toBe(status); return (await r.json()).match as ClientMatch;
}
async function official(api: APIRequestContext, m: ClientMatch, result: ResultType = "WHITE_WIN") {
  m = await action(api, m, { type: "ENTER_RESULT", result });
  m = await action(api, m, { type: "CONFIRM", side: "WHITE" });
  return action(api, m, { type: "CONFIRM", side: "BLACK" });
}
async function loginPage(page: Page, api: APIRequestContext, path: string) {
  await page.context().addCookies((await api.storageState()).cookies); await page.goto(path);
}

test("01 — Nhập XLS thật: preview không ghi DB, báo lỗi dòng/cột, chặn ghi đè chưa xác nhận", async ({ tech, tid }) => {
  const r = await tech.post("/api/tournaments", { data: { name: "Preview riêng", totalRounds: 9 } });
  const emptyId = (await r.json()).id;
  const preview = await upload(tech, emptyId, "pairing", pairingFile);
  expect(preview.canCommit).toBe(true); expect(preview.rows).toHaveLength(40); expect(preview.warnings.length).toBeGreaterThan(0);
  expect(await db.round.count({ where: { tournamentId: emptyId } })).toBe(0);
  const bad = sheet([["Ván 2"], header, [1, 1, "A", 0, "", 0, "B", 2], [1, "x", "C", 0, "", 0, "D", 2]]);
  const errors = await upload(tech, emptyId, "pairing", bad, "preview", "invalid.xlsx");
  expect(errors.canCommit).toBe(false); expect(errors.errors.some((e: { row: number; column: string }) => e.row === 4 && !!e.column)).toBe(true);
  await upload(tech, emptyId, "pairing", bad, "commit", "invalid.xlsx", {}, 422);
  expect(await db.round.count({ where: { tournamentId: emptyId } })).toBe(0);
  const changed = sourceRows.map((r) => [...r]);
  [changed[0][1], changed[1][1]] = [changed[1][1], changed[0][1]];
  [changed[0][2], changed[1][2]] = [changed[1][2], changed[0][2]];
  const changedBytes = sheet([["Ván 2"], header, ...changed]);
  const overwrite = await upload(tech, tid, "pairing", changedBytes, "preview", "changed.xlsx");
  expect(overwrite.overwrite).toHaveLength(2);
  await upload(tech, tid, "pairing", changedBytes, "commit", "changed.xlsx", {}, 409);
  expect((await matches(tech, tid))[0].white.fullName).toBe(String(sourceRows[0][2]));
});

test("02 — Tra cứu đủ 40 bàn: đúng quân Trắng/Đen, STT, tên và đối thủ trên API + điện thoại", async ({ page, recorder, tid }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const ms = await matches(recorder, tid); expect(ms).toHaveLength(40);
  await loginPage(page, recorder, "/record");
  const select = page.getByRole("combobox", { name: "Giải đấu" });
  if (await select.count()) await select.selectOption(tid);
  await page.getByRole("button", { name: "Vòng 2", exact: true }).click();
  for (let i = 0; i < 40; i++) {
    const row = sourceRows[i], m = ms[i];
    expect([m.board, m.white.startNo, m.white.fullName, m.black?.fullName, m.black?.startNo]).toEqual([Number(row[0]), Number(row[1]), String(row[2]), String(row[6]), Number(row[7])]);
    for (const sno of [m.white.startNo!, m.black!.startNo!]) {
      await page.getByRole("searchbox", { name: "Tìm bàn đấu" }).fill(String(sno));
      const board = page.getByRole("button").filter({ has: page.getByText(`Bàn ${m.board}`, { exact: true }) });
      await expect(board).toContainText(m.white.fullName); await expect(board).toContainText(m.black!.fullName);
      await expect(board).toContainText(`STT ${m.white.startNo}`); await expect(board).toContainText(`STT ${m.black!.startNo}`);
      const dots = board.locator('span[aria-hidden="true"]');
      await expect(dots.nth(0)).toHaveClass(/bg-white/); await expect(dots.nth(1)).toHaveClass(/bg-slate-800/);
    }
  }
});

test("03 — Nhập đủ mã 1-0, 0-1, 1/2, 0-1F, 1-0F, 0-0F, BYE → AWAITING_CONFIRMATION", async ({ recorder, tid }) => {
  const ms = await matches(recorder, tid);
  const codes = ["1-0", "0-1", "1/2", "0-1F", "1-0F", "0-0F"];
  for (let i = 0; i < codes.length; i++) {
    const m = await action(recorder, ms[i], { type: "ENTER_RESULT", result: RESULT_FROM_CODE[codes[i]] });
    expect(m.status).toBe("AWAITING_CONFIRMATION"); expect(SM_CODE[m.result!]).toBe(codes[i]);
    expect(m.whiteConfirmedAt).toBeNull(); expect(m.blackConfirmedAt).toBeNull();
  }
  // Ván BYE chưa chốt (ví dụ TTKT vừa hủy): chỉ có kỳ thủ Trắng.
  const round = await db.round.findUniqueOrThrow({ where: { tournamentId_number: { tournamentId: tid, number: 2 } } });
  const player = await db.player.create({ data: { tournamentId: tid, fullName: "BYE test", startNo: 81 } });
  const bye = await db.match.create({ data: { roundId: round.id, board: 41, whitePlayerId: player.id } });
  const m = await action(recorder, { ...ms[0], id: bye.id }, { type: "ENTER_RESULT", result: "BYE" });
  expect(m.status).toBe("AWAITING_CONFIRMATION"); expect(m.black).toBeNull(); expect(m.result).toBe("BYE");
  await action(recorder, ms[7], { type: "ENTER_RESULT", result: "BYE" }, 409);
});

test("04 — Kiosk tuần tự: người thứ nhất vẫn chờ, người thứ hai mới OFFICIAL", async ({ page, recorder, tid }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const first = (await matches(recorder, tid))[0];
  await loginPage(page, recorder, "/record");
  const select = page.getByRole("combobox", { name: "Giải đấu" }); if (await select.count()) await select.selectOption(tid);
  await page.getByRole("button").filter({ has: page.getByText("Bàn 1", { exact: true }) }).click();
  await page.getByRole("button", { name: "1 - 0 Trắng thắng", exact: true }).click();
  await page.getByRole("button", { name: "Chuyển cho kỳ thủ xác nhận" }).click();
  await expect(page.getByText("Lượt 1: Kỳ thủ Trắng", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "XÁC NHẬN KẾT QUẢ", exact: true }).click();
  await expect(page.getByText("Đưa máy cho Kỳ thủ Đen", { exact: true })).toBeVisible();
  await expect.poll(async () => (await matches(recorder, tid))[0].whiteConfirmedAt).not.toBeNull();
  let m = (await matches(recorder, tid))[0]; expect(m.status).toBe("AWAITING_CONFIRMATION"); expect(m.blackConfirmedAt).toBeNull();
  await page.getByRole("button", { name: "Tôi là kỳ thủ Đen – Tiếp tục" }).click();
  await page.getByRole("button", { name: "XÁC NHẬN KẾT QUẢ", exact: true }).click();
  await expect.poll(async () => (await matches(recorder, tid))[0].status).toBe("OFFICIAL");
  m = (await matches(recorder, tid))[0]; expect(m.id).toBe(first.id); expect(m.blackConfirmedAt).not.toBeNull();
});

test("05 — Không đồng ý → DISPUTED, dashboard cần xử lý, không công bố tỷ số", async ({ page, recorder, tech, tid }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let m = (await matches(recorder, tid))[0];
  m = await action(recorder, m, { type: "ENTER_RESULT", result: "DRAW" });
  m = await action(recorder, m, { type: "CONFIRM", side: "WHITE" });
  expect(m.status).toBe("AWAITING_CONFIRMATION");
  await loginPage(page, recorder, "/record");
  const select = page.getByRole("combobox", { name: "Giải đấu" }); if (await select.count()) await select.selectOption(tid);
  await page.getByRole("button").filter({ has: page.getByText("Bàn 1", { exact: true }) }).click();
  await page.getByRole("button", { name: "Tiếp tục cho kỳ thủ xác nhận" }).click();
  await page.getByRole("button", { name: "Tôi là kỳ thủ Đen – Tiếp tục" }).click();
  await page.getByRole("button", { name: "KHÔNG ĐỒNG Ý", exact: true }).click();
  await page.getByRole("button", { name: "CHẠM LẦN NỮA ĐỂ XÁC NHẬN" }).click();
  await expect.poll(async () => (await matches(recorder, tid))[0].status).toBe("DISPUTED");
  const live = await (await tech.get(`/api/tournaments/${tid}/live?view=projector`)).json();
  expect(live.rounds[0].matches[0].result).toBeNull();
  await page.getByRole("button", { name: "Trả máy cho trọng tài – Đóng" }).click();
  await loginPage(page, tech, "/technical"); await page.getByRole("combobox", { name: "Giải đấu" }).selectOption(tid);
  await expect(page.getByRole("article").filter({ hasText: "Bàn 1" })).toContainText("Có bất đồng");
});

test("06 — Projector: chỉ OFFICIAL, <5 giây, giờ đồng bộ/mất mạng, phân trang và chặn khách", async ({ page, tech, recorder, request, tid }, info) => {
  const anonymous = await request.get(`/projector/${tid}`, { maxRedirects: 0 }); expect(anonymous.status()).toBe(307); expect(anonymous.headers().location).toBe("/login");
  expect((await request.get(`/api/tournaments/${tid}/live?view=projector`)).status()).toBe(401);
  expect((await recorder.get(`/api/tournaments/${tid}/live?view=projector`)).status()).toBe(403);
  const noRole = await recorder.get(`/projector/${tid}`, { maxRedirects: 0 }); expect(noRole.headers().location).toBe("/record");
  let [one, two, three] = await matches(recorder, tid);
  one = await official(recorder, one);
  two = await action(recorder, two, { type: "ENTER_RESULT", result: "DRAW" });
  three = await action(recorder, three, { type: "ENTER_RESULT", result: "BLACK_WIN" });
  await action(recorder, three, { type: "DISPUTE", side: "WHITE" });
  await loginPage(page, tech, `/projector/${tid}`);
  await page.getByRole("checkbox", { name: "Tự động lật trang" }).uncheck();
  await expect(page.locator("table")).toHaveCount(2); await expect(page.locator("tbody tr")).toHaveCount(20);
  const board = (name: string) => page.locator("tbody tr").filter({ hasText: name });
  await expect(board(one.white.fullName)).toContainText("1 - 0");
  await expect(board(two.white.fullName)).toContainText("Chờ chốt"); await expect(board(two.white.fullName).locator("strong")).toHaveCount(0);
  await expect(board(three.white.fullName).locator("strong")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(/Đã đồng bộ \(Cập nhật cuối: \d{2}:\d{2}:\d{2}\)/);
  await expect(page.getByText("Điểm hiển thị từ dữ liệu đầu vòng (Tạm tính) - Hệ thống không tự tính bảng xếp hạng", { exact: true })).toBeVisible();
  const dashboard = await page.context().newPage(); await dashboard.goto("/technical"); await dashboard.getByRole("combobox", { name: "Giải đấu" }).selectOption(tid);
  await expect(dashboard.getByRole("status")).toContainText("Đã đồng bộ");
  // Ghi ngay sau một lần poll để đo cả thời gian chờ poll tiếp theo, không reload trang.
  await page.waitForResponse((r) => r.url().includes("/live?view=projector") && r.ok());
  const start = performance.now();
  two = await action(recorder, two, { type: "CONFIRM", side: "WHITE" });
  await action(recorder, two, { type: "CONFIRM", side: "BLACK" });
  await expect(board(two.white.fullName)).toContainText("½ - ½", { timeout: 4900 });
  const elapsed = performance.now() - start; expect(elapsed).toBeLessThan(5000);
  await expect(dashboard.getByText("2/40 bàn chính thức · 1 cần xử lý", { exact: true })).toBeVisible();
  await info.attach("projector-latency-ms", { body: String(Math.round(elapsed)), contentType: "text/plain" });
  await dashboard.close();
  await page.getByRole("button", { name: "Trang sau", exact: true }).click(); await expect(page.getByText("Trang 2/2", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(page.locator("tbody tr").first().locator("td").first()).toHaveText("21");
  await page.getByRole("combobox", { name: "Số giây chuyển trang" }).selectOption("5");
  await page.getByRole("checkbox", { name: "Tự động lật trang" }).check();
  await expect(page.getByText("Trang 1/2", { exact: true })).toBeVisible({ timeout: 6000 });
  await page.getByRole("checkbox", { name: "Tự động lật trang" }).uncheck();
  const before = (await page.getByRole("status").innerText()).match(/Cập nhật cuối: (.*?)\)/)![1];
  await page.context().setOffline(true);
  await expect(page.getByRole("status")).toContainText(/Mất mạng|Mất kết nối|Failed to fetch/);
  await expect(page.getByRole("status")).toHaveClass(/bg-orange/);
  expect((await page.getByRole("status").innerText()).match(/Cập nhật cuối: (.*?)\)/)![1]).toBe(before);
  await page.context().setOffline(false); await expect(page.getByRole("status")).toContainText("Đã đồng bộ");
});

test("07 — Chỉ TTKT sửa OFFICIAL, bắt buộc lý do, audit đầy đủ + chống ghi đè", async ({ tech, recorder, tid }) => {
  let m = await official(recorder, (await matches(recorder, tid))[0]);
  const before = m; const started = Date.now();
  const a = { type: "EDIT_RESULT", result: "BLACK_WIN", mode: "CONFIRM", reason: "Đối chiếu phiếu biên bản" };
  const count = await db.auditLog.count({ where: { matchId: m.id } });
  await action(recorder, m, a, 403); await action(tech, m, { ...a, reason: " " }, 400);
  expect(await db.auditLog.count({ where: { matchId: m.id } })).toBe(count);
  m = await action(tech, m, a); expect(m.status).toBe("AWAITING_CONFIRMATION"); expect(m.whiteConfirmedAt).toBeNull(); expect(m.blackConfirmedAt).toBeNull();
  const log = await db.auditLog.findFirstOrThrow({ where: { matchId: m.id, action: "EDIT_RESULT" }, include: { user: true }, orderBy: { createdAt: "desc" } });
  expect(log.user.username).toBe("test-tech"); expect(log.reason).toBe(a.reason); expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(started);
  expect(JSON.parse(log.oldValue!)).toMatchObject({ status: "OFFICIAL", result: before.result, whiteConfirmedAt: before.whiteConfirmedAt, blackConfirmedAt: before.blackConfirmedAt });
  expect(JSON.parse(log.newValue!)).toMatchObject({ status: "AWAITING_CONFIRMATION", result: "BLACK_WIN", whiteConfirmedAt: null, blackConfirmedAt: null, mode: "CONFIRM" });
  await action(tech, before, a, 409);
  m = await action(tech, m, { type: "APPROVE_EXCEPTION", reason: "Kỳ thủ đã rời khu vực" }); expect(m.status).toBe("OFFICIAL");
  m = await action(tech, m, { type: "REOPEN", reason: "Kiểm tra lại" }); expect(m.status).toBe("REOPENED");
  m = await action(tech, m, { ...a, mode: "EXCEPTION" }); expect(m.status).toBe("OFFICIAL");
  m = await action(tech, m, { type: "CANCEL_RESULT", reason: "Nhầm bàn" }); expect(m.result).toBeNull(); expect(m.status).toBe("REOPENED");
  const history = await (await tech.get(`/api/tournaments/${tid}/audit?matchId=${m.id}`)).json(); expect(history.logs.length).toBeGreaterThan(count);
  expect((await recorder.get(`/api/tournaments/${tid}/audit`)).status()).toBe(403);
});

test("08 — BYE không có Đen/xác nhận giả; đặc biệt hiển thị đúng, không có điểm thì ẩn cột", async ({ page, tech, recorder, tid }) => {
  const byeFile = sheet([["Ván 3"], header, [1, 81, "Miễn đấu tự động", "", "", "", "bye", ""]]);
  await upload(tech, tid, "pairing", byeFile, "commit", "bye.xlsx");
  const bye = (await matches(recorder, tid, 3))[0];
  expect(bye.result).toBe("BYE"); expect(bye.status).toBe("OFFICIAL"); expect(bye.black).toBeNull(); expect(bye.whiteConfirmedAt).toBeNull(); expect(bye.blackConfirmedAt).toBeNull();
  await action(recorder, bye, { type: "CONFIRM", side: "BLACK" }, 409);
  const byeAudit = await db.auditLog.findFirstOrThrow({ where: { matchId: bye.id } }); expect(byeAudit.action).toBe("APPROVE_EXCEPTION"); expect(byeAudit.reason).toContain("Miễn đấu");
  let reopenedBye = await action(tech, bye, { type: "CANCEL_RESULT", reason: "Kiểm tra luồng BYE" });
  reopenedBye = await action(recorder, reopenedBye, { type: "ENTER_RESULT", result: "BYE" });
  await action(recorder, reopenedBye, { type: "CONFIRM", side: "BLACK" }, 409);
  reopenedBye = await action(recorder, reopenedBye, { type: "CONFIRM", side: "WHITE" });
  expect(reopenedBye.status).toBe("OFFICIAL"); expect(reopenedBye.blackConfirmedAt).toBeNull();
  await loginPage(page, tech, `/projector/${tid}`);
  await expect(page.locator("tbody tr")).toContainText("BYE"); await expect(page.getByRole("columnheader", { name: "Điểm", exact: true })).toHaveCount(0);
  const ms = await matches(recorder, tid);
  for (const [i, result] of (["WHITE_FORFEIT", "BLACK_FORFEIT", "DOUBLE_FORFEIT"] as const).entries()) {
    const m = await action(tech, ms[i], { type: "EDIT_RESULT", result, mode: "EXCEPTION", reason: "Vắng mặt theo biên bản" }); expect(m.status).toBe("OFFICIAL");
  }
  await page.getByRole("combobox", { name: "Vòng đang chiếu" }).selectOption("2");
  for (const [i, score] of ["0 - 1F", "1 - 0F", "0 - 0F"].entries()) await expect(page.locator("tbody tr").filter({ hasText: ms[i].white.fullName })).toContainText(score);
});

test("09 — XML HTTP khớp từng byte mẫu; Excel đúng sheet, cột, dữ liệu chính thức/đối soát", async ({ tech, recorder, tid }) => {
  // XLS mẫu là vòng 2, XML mẫu là vòng 1: nhập lại cùng cặp đấu với round=1,
  // không sửa byte nào của file XML kỳ vọng để che sai khác dữ liệu fixture.
  await upload(tech, tid, "pairing", pairingFile, "commit", "pairing.xls", { round: "1" });
  const ms = await matches(recorder, tid, 1);
  for (const [i, r] of resultRows.entries()) {
    expect(ms[i].white.startNo).toBe(Number(r.PlayerWhiteSNo)); expect(ms[i].black!.startNo).toBe(Number(r.PlayerBlackSNo));
    await action(tech, ms[i], { type: "EDIT_RESULT", result: RESULT_FROM_CODE[r.Res], mode: "EXCEPTION", reason: "Kết quả mẫu nghiệm thu" });
  }
  const xml = await tech.get(`/api/tournaments/${tid}/rounds/1/export-xml`);
  expect(xml.headers()["content-type"]).toContain("application/xml"); expect(await xml.body()).toEqual(resultsFile);
  const xlsx = await tech.get(`/api/tournaments/${tid}/export-xlsx?round=1`); expect(xlsx.headers()["content-type"]).toContain("spreadsheetml.sheet");
  const wb = XLSX.read(await xlsx.body()); expect(wb.SheetNames).toEqual(["Chính thức"]);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Chính thức"], { header: 1, defval: "" });
  expect(rows).toHaveLength(46); expect(rows[5]).toEqual(["Vòng", "Bàn", "STT Trắng", "Mã Trắng", "Trắng", "CLB Trắng", "Kết quả", "STT Đen", "Mã Đen", "Đen", "CLB Đen", "Trạng thái"]);
  for (let i = 0; i < 40; i++) expect([rows[i + 6][0], rows[i + 6][1], rows[i + 6][2], rows[i + 6][4], rows[i + 6][6], rows[i + 6][7], rows[i + 6][9], rows[i + 6][11]]).toEqual([1, i + 1, ms[i].white.startNo, ms[i].white.fullName, resultRows[i].Res, ms[i].black!.startNo, ms[i].black!.fullName, "Chính thức"]);
  const fresh = await matches(recorder, tid, 1);
  await action(tech, fresh[0], { type: "EDIT_RESULT", result: "DRAW", mode: "CONFIRM", reason: "Đối soát" });
  let disputed = await action(tech, fresh[1], { type: "EDIT_RESULT", result: "DRAW", mode: "CONFIRM", reason: "Đối soát" });
  disputed = await action(recorder, disputed, { type: "DISPUTE", side: "WHITE" }); expect(disputed.status).toBe("DISPUTED");
  const check = XLSX.read(await (await tech.get(`/api/tournaments/${tid}/export-xlsx?round=1&status=OFFICIAL,AWAITING_CONFIRMATION,DISPUTED`)).body());
  expect(check.SheetNames).toEqual(["Chính thức", "Chờ xác nhận", "Có bất đồng"]);
  for (const [name, count] of [["Chính thức", 38], ["Chờ xác nhận", 1], ["Có bất đồng", 1]] as const) expect(XLSX.utils.sheet_to_json(check.Sheets[name], { header: 1 })).toHaveLength(6 + count);
});

test("10 — Đổi tên, logo, màu trực tiếp trên giao diện và lưu sau reload", async ({ page, tech, tid }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const projector = await page.context().newPage();
  await loginPage(projector, tech, `/projector/${tid}`);
  await expect(projector.getByRole("status")).toContainText("Đã đồng bộ");
  await loginPage(page, tech, "/technical"); await page.getByRole("combobox", { name: "Giải đấu" }).selectOption(tid);
  const name = page.getByRole("textbox", { name: /Tên giải/i });
  await expect(name).toBeVisible();
  await name.fill("USCC Nghiệm thu nhận diện");
  await page.getByRole("textbox", { name: /Logo/i }).fill("/favicon.ico");
  await page.getByLabel(/Màu.*nhận diện/i).fill("#a855f7");
  await page.getByLabel(/Bắt đầu/).fill("2026-10-27T08:00");
  await page.getByLabel(/Kết thúc/).fill("2026-10-28T18:00");
  await page.getByLabel("Địa điểm", { exact: true }).fill("Hội trường USCC");
  await page.getByLabel("Đơn vị tổ chức", { exact: true }).fill("USCC");
  await page.getByLabel("Số vòng", { exact: true }).fill("8");
  await page.getByRole("button", { name: /Lưu.*(giải|cấu hình|thay đổi)/i }).click();
  await expect(page.getByText("Đã lưu cấu hình giải", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "USCC Nghiệm thu nhận diện", exact: true })).toBeVisible();
  await expect(projector.getByRole("heading", { level: 1 })).toHaveText("USCC Nghiệm thu nhận diện");
  await page.reload(); await page.getByRole("combobox", { name: "Giải đấu" }).selectOption(tid);
  await expect(name).toHaveValue("USCC Nghiệm thu nhận diện");
  const t = await (await tech.get(`/api/tournaments/${tid}`)).json();
  expect(t).toMatchObject({ name: "USCC Nghiệm thu nhận diện", logoUrl: "/favicon.ico", primaryColor: "#a855f7", location: "Hội trường USCC", organizer: "USCC", totalRounds: 8, startDate: "2026-10-27T01:00:00.000Z", endDate: "2026-10-28T11:00:00.000Z" });
  await page.goto(`/projector/${tid}`); await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.name);
  await expect(page.getByRole("img", { name: "Logo giải" })).toHaveAttribute("src", t.logoUrl);
  await expect(page.locator("main")).toHaveCSS("border-top-color", "rgb(168, 85, 247)");
  await projector.close();
});

test("11 — Offline giữ expectedVersion qua reload; 409 không xác nhận nhầm tỷ số TTKT vừa sửa", async ({ page, tech, recorder, tid }) => {
  let m = await action(recorder, (await matches(recorder, tid))[0], { type: "ENTER_RESULT", result: "WHITE_WIN" });
  await page.setViewportSize({ width: 390, height: 844 });
  await loginPage(page, recorder, "/record");
  await page.getByRole("combobox", { name: "Giải đấu" }).selectOption(tid);
  await page.getByRole("button").filter({ has: page.getByText("Bàn 1", { exact: true }) }).click();
  await page.getByRole("button", { name: "Tiếp tục cho kỳ thủ xác nhận" }).click();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "XÁC NHẬN KẾT QUẢ", exact: true }).click();
  const queued = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("uscc:pendingOps:")).flatMap((k) => JSON.parse(localStorage.getItem(k)!)));
  expect(queued).toHaveLength(1); expect(queued[0].expectedVersion).toBe(m.resultVersion);
  const old = m;
  m = await action(tech, m, { type: "EDIT_RESULT", result: "BLACK_WIN", mode: "CONFIRM", reason: "TTKT sửa khi điện thoại mất mạng" });
  const logs = await db.auditLog.count({ where: { matchId: m.id } });
  const conflict = await action(recorder, old, { type: "CONFIRM", side: "BLACK" }, 409);
  expect(conflict.result).toBe("BLACK_WIN"); expect(conflict.whiteConfirmedAt).toBeNull();
  expect(await db.auditLog.count({ where: { matchId: m.id } })).toBe(logs);
  const response = page.waitForResponse((r) => r.url().includes(`/matches/${m.id}/actions`) && r.status() === 409);
  await page.context().setOffline(false); await response;
  await page.reload(); // lỗi và expectedVersion vẫn tồn tại trong localStorage sau tải lại
  await expect(page.getByRole("status")).toContainText("Phiên bản kết quả đã thay đổi");
  expect((await matches(recorder, tid))[0].status).toBe("AWAITING_CONFIRMATION");
  expect((await matches(recorder, tid))[0].whiteConfirmedAt).toBeNull();
  await page.getByRole("button", { name: "Bỏ thao tác này", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("uscc:pendingOps:")).flatMap((k) => JSON.parse(localStorage.getItem(k)!)).length)).toBe(0);
  // Sửa lại cùng tỷ số cũng phải tăng version; không chỉ so giá trị result.
  const newer = await action(tech, m, { type: "EDIT_RESULT", result: "BLACK_WIN", mode: "CONFIRM", reason: "Yêu cầu xác nhận lại" });
  expect(newer.resultVersion).toBeGreaterThan(m.resultVersion);
  await action(recorder, m, { type: "CONFIRM", side: "WHITE" }, 409);
  m = await action(recorder, newer, { type: "CONFIRM", side: "WHITE" });
  m = await action(recorder, m, { type: "CONFIRM", side: "BLACK" }); expect(m.status).toBe("OFFICIAL");
});

test("12 — Re-import đổi cặp: matchId=null nhưng toàn bộ AuditLog vẫn thuộc giải/vòng/bàn và có UI", async ({ page, tech, recorder, tid }) => {
  const m = await official(recorder, (await matches(recorder, tid))[0]);
  const oldLogs = await db.auditLog.findMany({ where: { matchId: m.id } }); expect(oldLogs.length).toBeGreaterThan(0);
  const changed = sourceRows.map((r) => [...r]);
  [changed[0][1], changed[1][1]] = [changed[1][1], changed[0][1]];
  [changed[0][2], changed[1][2]] = [changed[1][2], changed[0][2]];
  await upload(tech, tid, "pairing", sheet([["Ván 2"], header, ...changed]), "commit", "changed.xlsx", { confirmOverwrite: "true" });
  const history = await (await tech.get(`/api/tournaments/${tid}/audit`)).json();
  for (const log of oldLogs) {
    const kept = history.logs.find((l: { id: string }) => l.id === log.id);
    expect(kept).toMatchObject({ tournamentId: tid, roundNumber: 2, board: 1, matchId: null, oldValue: log.oldValue, newValue: log.newValue });
  }
  await loginPage(page, tech, "/technical"); await page.getByRole("combobox", { name: "Giải đấu" }).selectOption(tid);
  await page.getByRole("button", { name: "Lịch sử toàn giải", exact: true }).click();
  await expect(page.getByRole("article").filter({ hasText: "Vòng 2 / Bàn 1 (Ván đã xóa)" }).first()).toBeVisible();
});

test("13 — Import UI preview/lỗi/commit; 409 khi KQ đổi sau Preview, không ghi dữ liệu hoặc log import", async ({ page, tech, recorder, tid }) => {
  await loginPage(page, tech, "/technical"); await page.getByRole("combobox", { name: "Giải đấu" }).selectOption(tid);
  const fileInput = page.getByLabel("File bốc thăm (.xls / .xlsx)", { exact: true });
  const invalid = sheet([["Ván 2"], header, [1, "x", "A", 0, "", 0, "B", 2]]);
  await fileInput.setInputFiles({ name: "bad.xlsx", mimeType: "application/octet-stream", buffer: invalid });
  await page.getByRole("button", { name: "Xem trước bốc thăm", exact: true }).click();
  await expect(page.getByText(/Lỗi dòng 3/)).toBeVisible(); await expect(page.getByRole("button", { name: "Nhập bốc thăm đã xem trước", exact: true })).toBeDisabled();
  const changed = sourceRows.map((r) => [...r]);
  [changed[0][1], changed[1][1]] = [changed[1][1], changed[0][1]];
  [changed[0][2], changed[1][2]] = [changed[1][2], changed[0][2]];
  const bytes = sheet([["Ván 2"], header, ...changed]);
  await fileInput.setInputFiles({ name: "changed.xlsx", mimeType: "application/octet-stream", buffer: bytes });
  await page.getByRole("button", { name: "Xem trước bốc thăm", exact: true }).click();
  await expect(page.getByText(/Cảnh báo ghi đè 2 bàn/)).toBeVisible();
  await page.getByRole("checkbox", { name: "Tôi xác nhận ghi đè các bàn nêu trên" }).check();
  const before = (await matches(recorder, tid))[0];
  const fresh = await action(recorder, before, { type: "ENTER_RESULT", result: "DRAW" });
  const logs = await db.importLog.count({ where: { tournamentId: tid } });
  const conflict = page.waitForResponse((r) => r.url().includes("/import/pairing") && r.status() === 409);
  await page.getByRole("button", { name: "Nhập bốc thăm đã xem trước", exact: true }).click(); await conflict;
  await expect(page.getByRole("alert").filter({ hasText: "Hãy chạy Xem trước lại" })).toBeVisible();
  expect((await matches(recorder, tid))[0]).toMatchObject({ id: fresh.id, result: "DRAW" }); expect(await db.importLog.count({ where: { tournamentId: tid } })).toBe(logs);
  await page.getByRole("button", { name: "Xem trước bốc thăm", exact: true }).click();
  await page.getByRole("checkbox", { name: "Tôi xác nhận ghi đè các bàn nêu trên" }).check();
  await page.getByRole("button", { name: "Nhập bốc thăm đã xem trước", exact: true }).click();
  await expect(page.getByText("Đã nhập vòng 2: 40 bàn", { exact: true })).toBeVisible();
  expect((await matches(recorder, tid))[0].white.fullName).toBe(String(changed[0][2]));
  const preview = await upload(tech, tid, "players", playersFile, "preview", "players.xml");
  await action(recorder, (await matches(recorder, tid))[2], { type: "ENTER_RESULT", result: "DRAW" });
  await upload(tech, tid, "players", playersFile, "commit", "players.xml", { previewToken: preview.previewToken }, 409);
});

test("14 — Export XLSX: chặn khóa prototype/enum sai bằng 400 thay vì 500", async ({ tech, tid }) => {
  for (const status of ["toString", "constructor", "__proto__", "OFFICIAL,toString", "BAD", ""]) {
    const r = await tech.get(`/api/tournaments/${tid}/export-xlsx?status=${encodeURIComponent(status)}`);
    expect(r.status()).toBe(400); expect((await r.json()).error).toContain("Trạng thái không hợp lệ");
  }
});

test("15 — Transaction import kiểm lại snapshot sau lập plan; token ràng buộc nội dung file và không được bỏ qua Preview", async ({ tech, recorder, tid }) => {
  const { planPairing, planPlayers, ImportConflict } = await import("../../src/lib/imports");
  const { prisma } = await import("../../src/lib/db");
  const { parsePairingSheet, parsePlayersXml } = await import("../../src/lib/swiss-manager");
  try {
    const user = await db.user.findUniqueOrThrow({ where: { username: "test-tech" } });
    const pairingPlan = await planPairing(tid, parsePairingSheet(pairingFile));
    const playersPlan = await planPlayers(tid, parsePlayersXml(playersFile.toString("utf8")));
    const imports = await db.importLog.count({ where: { tournamentId: tid } });
    await action(recorder, (await matches(recorder, tid))[0], { type: "ENTER_RESULT", result: "DRAW" });
    // Dùng cùng closure lập kế hoạch cũ: kiểm tra bên trong transaction, không chỉ ở route.
    await expect(pairingPlan!.commit(user, "pairing.xls", pairingPlan!.preview.previewToken)).rejects.toBeInstanceOf(ImportConflict);
    await expect(playersPlan.commit(user, "players.xml", playersPlan.preview.previewToken)).rejects.toBeInstanceOf(ImportConflict);
    expect(await db.importLog.count({ where: { tournamentId: tid } })).toBe(imports);
    const preview = await upload(tech, tid, "pairing", pairingFile);
    await upload(tech, tid, "pairing", pairingFile, "commit", "pairing.xls", { previewToken: "" }, 409);
    const changedPoints = sourceRows.map((r) => [...r]); changedPoints[0][3] = 99;
    await upload(tech, tid, "pairing", sheet([["Ván 2"], header, ...changedPoints]), "commit", "different.xlsx", { previewToken: preview.previewToken }, 409);
    await upload(tech, tid, "pairing", pairingFile, "commit", "pairing.xls", { previewToken: preview.previewToken });
  } finally { await prisma.$disconnect(); }
});
