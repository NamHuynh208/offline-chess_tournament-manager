import assert from "node:assert/strict";
import { matchSearch } from "../src/lib/match-search";

const m = { board: 12, white: { fullName: "Nguyễn Đăng Khoa", startNo: 41, club: null, points: 0 }, black: { fullName: "Trần Minh Anh", startNo: 25, club: null, points: 1 } };
for (const query of ["12", "012", "Bàn 12", "ban12", "BÀN: 12", "#12", "b 12", "41", "STT 25", "stt:41", "nguyen", "Đăng Khoa", "tran minh anh", "  TRẦN   MINH  ", ""]) assert.ok(matchSearch(m, query), query);
for (const query of ["Bàn 41", "STT 12", "13", "Nguyễn khác", "Bàn -1", "0"]) assert.equal(matchSearch(m, query), false, query);
assert.ok(matchSearch({ ...m, black: null }, "Bàn 12"));
assert.equal(matchSearch({ ...m, black: null }, "STT 25"), false);
console.log("✔ Tra cứu: số bàn/tiền tố Bàn/#/STT và tên tiếng Việt có/không dấu — PASS");
