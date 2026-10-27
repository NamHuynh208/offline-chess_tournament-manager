// Chạy: npm test — kiểm tra parser/exporter với 3 file thật trong samples/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";
import { buildResultsWorkbook, buildResultsXml, nameKey, parsePairingSheet, parsePlayersXml, type ExportMatch } from "../src/lib/swiss-manager";
import { RESULT_FROM_CODE } from "../src/lib/results";

const sample = (f: string) => readFileSync(new URL(`../samples/${f}`, import.meta.url));
const test = (name: string, fn: () => void) => {
  fn();
  console.log(`✔ ${name}`);
};

// 1. XML danh sách kỳ thủ
const players = parsePlayersXml(sample("Nhập_danh_sách_ban_đầu(không cần quan tâm).xml").toString("utf8"));
test("XML danh sách: 80 kỳ thủ, không lỗi, đủ CLB/Liên đoàn", () => {
  assert.deepEqual(players.errors, []);
  assert.equal(players.players.length, 80);
  assert.deepEqual(players.players[0], {
    uniqueId: "1", lastName: "Nguyễn", firstName: "Hồng Phúc (B)", fullName: "Nguyễn Hồng Phúc (B)",
    club: "UIT", federation: "VIE", rating: 0,
  });
});

// 2. XLS bốc thăm
const pairing = parsePairingSheet(sample("Kết quả bốc thăm xuất ra.xls"));
test("XLS bốc thăm: dò header dòng 5, vòng 2, đúng 40 bàn, bỏ dòng bản quyền", () => {
  assert.deepEqual(pairing.errors, []);
  assert.equal(pairing.headerRow, 5);
  assert.equal(pairing.round, 2);
  assert.equal(pairing.rows.length, 40);
  assert.deepEqual(pairing.rows.map((r) => r.board), Array.from({ length: 40 }, (_, i) => i + 1));
  assert.deepEqual(pairing.rows[0], { row: 6, board: 1, whiteSNo: 1, whiteName: "Bạch Triều Vĩ", whitePoints: 0, blackSNo: 41, blackName: "Nguyễn Hồng Phúc (B)", blackPoints: 0 });
  assert.deepEqual(pairing.rows[39], { row: 45, board: 40, whiteSNo: 80, whiteName: "Võ Phạm Thiên Phúc", whitePoints: 0, blackSNo: 40, blackName: "Nguyễn Hồng Phúc (A)", blackPoints: 0 });
  const snos = pairing.rows.flatMap((r) => [r.whiteSNo, r.blackSNo]).sort((a, b) => a! - b!);
  assert.deepEqual(snos, Array.from({ length: 80 }, (_, i) => i + 1));
});
test("Mọi tên trong XLS khớp đúng 1 kỳ thủ trong XML (STT ≠ PlayerUniqueId)", () => {
  const byName = new Map(players.players.map((p) => [nameKey(p.fullName), p]));
  assert.equal(byName.size, 80);
  for (const r of pairing.rows) for (const n of [r.whiteName, r.blackName!]) assert.ok(byName.has(nameKey(n)), n);
  assert.equal(byName.get(nameKey("Nguyễn Hồng Phúc (B)"))!.uniqueId, "1"); // nhưng STT = 41
});

// 3. Lỗi chi tiết theo dòng/cột + mapping cột thủ công
const sheetBytes = (aoa: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "S");
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
};
const H = ["Bàn", "STT", "White", "Điểm", "KQ", "Điểm", "Black", "STT"];
test("Báo lỗi trùng bàn, sai số, trùng kỳ thủ; nhận BYE", () => {
  const p = parsePairingSheet(sheetBytes([
    ["Ván 3"], H,
    [1, 1, "A", 0, "", 0, "B", 2],
    [1, 3, "C", 0, "", 0, "D", 4],
    [2, "x", "E", 0, "", 0, "F", 6],
    [3, 7, "G", 0, "", 0, "H", 1],
    [4, 9, "I", "1,5", "", "", "bye", ""],
    ["Chương trìnhSwiss-Manager được phát triển..."],
  ]));
  assert.equal(p.round, 3);
  assert.deepEqual(p.errors, [
    { row: 4, column: "A (Bàn)", message: "Trùng số bàn 1 (đã có ở dòng 3)" },
    { row: 5, column: "B (STT (Trắng))", message: 'Không phải số nguyên dương: "x"' },
    { row: 6, column: "STT (Đen)", message: "Kỳ thủ STT 1 xuất hiện nhiều lần (đã có ở dòng 3)" },
  ]);
  assert.deepEqual(p.rows.at(-1), { row: 7, board: 4, whiteSNo: 9, whiteName: "I", whitePoints: 1.5, blackSNo: null, blackName: null, blackPoints: null });
});
test("Thiếu cột -> lỗi; chỉnh mapping cột thủ công -> đọc được", () => {
  const aoa = [["Bàn", "No", "White", "Black", "No"], [1, 1, "A", "B", 2]];
  assert.deepEqual(parsePairingSheet(sheetBytes(aoa)).errors.map((e) => e.column), ["STT (Trắng)", "STT (Đen)"]);
  const p = parsePairingSheet(sheetBytes(aoa), { columns: { whiteSNo: 1, blackSNo: 4 } });
  assert.deepEqual(p.errors, []);
  assert.equal(p.rows[0].blackSNo, 2);
});

// 4. Xuất XML Swiss-Manager khớp từng byte với file mẫu
const resultsXml = sample("Kết_quả_sau_khi_đấu_nhập_vào_SM.xml").toString("utf8");
const parsedResults = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", isArray: () => true, parseAttributeValue: false })
  .parse(resultsXml).Results[0].Result as Record<string, string>[];
const official: ExportMatch[] = parsedResults.map((r, i) => ({
  round: Number(r.Round), board: i + 1, status: "OFFICIAL", result: RESULT_FROM_CODE[r.Res],
  white: { startNo: Number(r.PlayerWhiteSNo), fullName: `W${i}` },
  black: { startNo: Number(r.PlayerBlackSNo), fullName: `B${i}` },
}));
test("XML kết quả: sinh lại giống hệt file mẫu (40 ván, CRLF, UTF-8)", () => {
  assert.equal(official.length, 40);
  assert.ok(official.every((m) => m.result), "mọi mã Res đều map được");
  assert.equal(buildResultsXml([...official].reverse()), resultsXml);
});
test("XML kết quả: bỏ ván chưa OFFICIAL và BYE", () => {
  const extra: ExportMatch[] = [
    { ...official[0], board: 41, status: "DISPUTED" },
    { ...official[0], board: 42, status: "AWAITING_CONFIRMATION" },
    { ...official[0], board: 43, result: "BYE", black: null },
  ];
  assert.equal(buildResultsXml([...official, ...extra]), resultsXml);
});

// 5. Excel FR-09
test("Excel: 1 sheet / trạng thái, có thông tin giải + dữ liệu ván", () => {
  const ms: ExportMatch[] = [...official.slice(0, 3), { ...official[3], status: "DISPUTED" }];
  const wb = XLSX.read(buildResultsWorkbook({ tournamentName: "USCC 2026", scope: "Vòng 1", generatedAt: "27/10/2026 10:00:00" }, ["OFFICIAL", "DISPUTED"], ms));
  assert.deepEqual(wb.SheetNames, ["Chính thức", "Có bất đồng"]);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Chính thức"], { header: 1 });
  assert.deepEqual(rows[0], ["Giải", "USCC 2026"]);
  assert.equal(rows[5][0], "Vòng");
  assert.equal(rows.length, 6 + 3);
  assert.deepEqual(rows[6], [1, 1, 1, "", "W0", "", "1/2", 41, "", "B0", "", "Chính thức"]);
  assert.equal(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Có bất đồng"], { header: 1 }).length, 6 + 1);
});

console.log("\nTất cả kiểm thử đều PASS");
