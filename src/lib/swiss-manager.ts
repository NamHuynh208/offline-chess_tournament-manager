// Đọc/ghi file Swiss-Manager. Module thuần (không đụng DB) để test trực tiếp với samples/.
import * as XLSX from "xlsx";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { MatchStatus, ResultType } from "@prisma/client";
import { SM_CODE, STATUS_LABEL } from "./results";

/** row: số dòng Excel (1-based) với .xls, thứ tự thẻ <Player> với XML */
export type Issue = { row?: number; column?: string; message: string };

export const normName = (s: unknown) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
export const nameKey = (s: unknown) => normName(s).toLocaleLowerCase("vi");

// ---------- Đầu vào 1: XML danh sách kỳ thủ ----------

export type ParsedPlayer = {
  uniqueId: string;
  lastName: string;
  firstName: string;
  fullName: string;
  club: string | null;
  federation: string | null;
  rating: number | null;
};

export function parsePlayersXml(xml: string) {
  const errors: Issue[] = [];
  const v = XMLValidator.validate(xml);
  if (v !== true) return { players: [], errors: [{ row: v.err.line, message: `XML không hợp lệ: ${v.err.msg}` }] };

  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false, isArray: (n) => n === "Player" }).parse(xml);
  const list: Record<string, string>[] | undefined = doc?.Players?.Player;
  if (!Array.isArray(list)) return { players: [], errors: [{ message: 'Không tìm thấy <Players><Player ... /></Players>' }] };

  const seen = new Map<string, number>();
  const players: ParsedPlayer[] = [];
  list.forEach((p, i) => {
    const row = i + 1;
    const uniqueId = normName(p.PlayerUniqueId);
    const lastName = normName(p.Lastname);
    const firstName = normName(p.Firstname);
    const rating = normName(p.Rating) === "" ? null : Number(p.Rating);
    if (!uniqueId) errors.push({ row, column: "PlayerUniqueId", message: "Thiếu mã kỳ thủ" });
    else if (seen.has(uniqueId)) errors.push({ row, column: "PlayerUniqueId", message: `Trùng mã kỳ thủ ${uniqueId} (đã có ở Player #${seen.get(uniqueId)})` });
    if (!lastName && !firstName) errors.push({ row, column: "Lastname/Firstname", message: "Thiếu họ tên" });
    if (rating !== null && !Number.isInteger(rating)) errors.push({ row, column: "Rating", message: `Rating không hợp lệ: "${p.Rating}"` });
    seen.set(uniqueId, row);
    players.push({
      uniqueId,
      lastName,
      firstName,
      fullName: normName(`${lastName} ${firstName}`),
      club: normName(p.Club) || null,
      federation: normName(p.Federation) || null,
      rating,
    });
  });
  return { players, errors };
}

// ---------- Đầu vào 2: .xls/.xlsx bốc thăm 1 vòng ----------

/** Chỉ số cột (0-based, tính từ cột đầu của vùng dữ liệu sheet) */
export type ColumnMap = { board: number; whiteSNo: number; whiteName: number; blackName: number; blackSNo: number };
export const COLUMN_LABEL: Record<keyof ColumnMap, string> = {
  board: "Bàn",
  whiteSNo: "STT (Trắng)",
  whiteName: "White",
  blackName: "Black",
  blackSNo: "STT (Đen)",
};
/** blackSNo/blackName = null nghĩa là BYE (miễn đấu). Points = điểm trước vòng (null nếu không đọc được) */
export type PairingRow = {
  row: number;
  board: number;
  whiteSNo: number;
  whiteName: string;
  whitePoints: number | null;
  blackSNo: number | null;
  blackName: string | null;
  blackPoints: number | null;
};

// "1,5" / "1.5" / "1½" / "½"; cột Điểm không bắt buộc nên sai định dạng chỉ cho null
const parsePoints = (v: string | undefined) => {
  const s = (v ?? "").replace("½", ".5").replace(",", ".");
  return s && Number.isFinite(Number(s)) ? Number(s) : null;
};

const COPYRIGHT = /^(Chương\s*trình\s*Swiss-Manager|Mail:\s*h\.herzog)/i;
const BYE_NAME = /^(|bye|miễn đấu|không đấu|spielfrei|-+)$/i;

export function parsePairingSheet(data: Uint8Array, opts: { headerRow?: number; columns?: Partial<ColumnMap> } = {}) {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  let sheet: XLSX.WorkSheet | undefined;
  try {
    const wb = XLSX.read(data, { type: "array" });
    sheet = wb.Sheets[wb.SheetNames[0]];
  } catch (e) {
    errors.push({ message: `Không đọc được file Excel: ${(e as Error).message}` });
  }
  if (!sheet?.["!ref"]) return { round: null, headerRow: null, header: [], columns: null, rows: [], errors: errors.length ? errors : [{ message: "Sheet trống" }], warnings };

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true });
  const off = XLSX.utils.decode_range(sheet["!ref"]).s;
  const excelRow = (i: number) => i + off.r + 1;
  const colName = (c: number) => XLSX.utils.encode_col(c + off.c);

  const headerIdx =
    opts.headerRow !== undefined
      ? opts.headerRow - 1 - off.r
      : rows.findIndex((r) => r.some((c) => normName(c) === "Bàn") && r.some((c) => ["White", "Black"].includes(normName(c))));
  if (headerIdx < 0 || headerIdx >= rows.length) {
    errors.push({ row: opts.headerRow, message: "Không tìm thấy dòng tiêu đề (dòng có 'Bàn' và 'White'/'Black')" });
    return { round: null, headerRow: null, header: [], columns: null, rows: [], errors, warnings };
  }

  const header = rows[headerIdx].map(normName);
  const stt = header.flatMap((h, i) => (h === "STT" ? [i] : []));
  const pts = header.flatMap((h, i) => (h === "Điểm" ? [i] : [])); // Điểm trái = Trắng, phải = Đen
  // STT bên trái = Trắng, STT bên phải = Đen
  const columns: ColumnMap = {
    board: header.indexOf("Bàn"),
    whiteSNo: stt.length >= 2 ? stt[0] : -1,
    whiteName: header.indexOf("White"),
    blackName: header.indexOf("Black"),
    blackSNo: stt.length >= 2 ? stt[stt.length - 1] : -1,
    ...opts.columns,
  };
  for (const [k, c] of Object.entries(columns) as [keyof ColumnMap, number][]) {
    if (!Number.isInteger(c) || c < 0) errors.push({ row: excelRow(headerIdx), column: COLUMN_LABEL[k], message: `Thiếu cột "${COLUMN_LABEL[k]}"` });
  }

  let round: number | null = null;
  for (const r of rows.slice(0, headerIdx)) {
    const m = r.map(normName).join(" ").match(/\b(?:Ván|Round)\s+(\d+)/i);
    if (m) round = Number(m[1]);
  }
  if (errors.length) return { round, headerRow: excelRow(headerIdx), header, columns, rows: [], errors, warnings };

  const pairings: PairingRow[] = [];
  const boards = new Map<number, number>();
  const snos = new Map<number, number>();
  const names = new Map<string, { sno: number; row: number }>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const cells = r.map(normName);
    const first = cells.find((c) => c !== "");
    if (first === undefined || COPYRIGHT.test(first)) continue;

    const row = excelRow(i);
    const rowErrors: Issue[] = [];
    const int = (k: keyof ColumnMap) => {
      const v = cells[columns[k]] ?? "";
      if (/^\d+$/.test(v) && Number(v) > 0) return Number(v);
      rowErrors.push({ row, column: `${colName(columns[k])} (${COLUMN_LABEL[k]})`, message: v ? `Không phải số nguyên dương: "${v}"` : "Ô trống" });
      return 0;
    };
    const board = int("board");
    const whiteSNo = int("whiteSNo");
    const whiteName = cells[columns.whiteName] ?? "";
    if (!whiteName) rowErrors.push({ row, column: `${colName(columns.whiteName)} (White)`, message: "Thiếu tên kỳ thủ Trắng" });
    const rawBlackName = cells[columns.blackName] ?? "";
    const isBye = (cells[columns.blackSNo] ?? "") === "" && BYE_NAME.test(rawBlackName);
    const blackSNo = isBye ? null : int("blackSNo");
    const blackName = isBye ? null : rawBlackName;
    if (!isBye && !blackName) rowErrors.push({ row, column: `${colName(columns.blackName)} (Black)`, message: "Thiếu tên kỳ thủ Đen" });

    if (board && boards.has(board)) rowErrors.push({ row, column: `${colName(columns.board)} (Bàn)`, message: `Trùng số bàn ${board} (đã có ở dòng ${boards.get(board)})` });
    for (const [sno, name, side] of [[whiteSNo, whiteName, "Trắng"], [blackSNo, blackName, "Đen"]] as const) {
      if (!sno || !name) continue;
      if (snos.has(sno)) rowErrors.push({ row, column: `STT (${side})`, message: `Kỳ thủ STT ${sno} xuất hiện nhiều lần (đã có ở dòng ${snos.get(sno)})` });
      const prev = names.get(nameKey(name));
      if (prev && prev.sno !== sno) warnings.push({ row, message: `Trùng tên "${name}" với STT ${prev.sno} ở dòng ${prev.row}` });
      snos.set(sno, row);
      names.set(nameKey(name), { sno, row });
    }
    if (board) boards.set(board, row);

    if (rowErrors.length) errors.push(...rowErrors);
    else
      pairings.push({
        row,
        board,
        whiteSNo,
        whiteName,
        whitePoints: pts.length >= 2 ? parsePoints(cells[pts[0]]) : null,
        blackSNo,
        blackName,
        blackPoints: pts.length >= 2 && !isBye ? parsePoints(cells[pts[pts.length - 1]]) : null,
      });
  }
  if (!pairings.length && !errors.length) errors.push({ message: "Không có ván đấu nào sau dòng tiêu đề" });

  return { round, headerRow: excelRow(headerIdx), header, columns, rows: pairings, errors, warnings };
}

// ---------- Đầu ra 1: XML kết quả nhập lại Swiss-Manager ----------

export type ExportMatch = {
  round: number;
  board: number;
  status: MatchStatus;
  result: ResultType | null;
  white: { startNo: number | null; uniqueId?: string | null; fullName: string; club?: string | null };
  black: { startNo: number | null; uniqueId?: string | null; fullName: string; club?: string | null } | null;
};

/** Chỉ ván OFFICIAL. BYE bỏ qua: Swiss-Manager đã tự xếp miễn đấu khi bốc thăm. Định dạng giống hệt file mẫu (CRLF). */
export function buildResultsXml(matches: ExportMatch[]) {
  const lines = matches
    .filter((m) => m.status === "OFFICIAL" && m.result && m.result !== "BYE" && m.white.startNo && m.black?.startNo)
    .sort((a, b) => a.round - b.round || a.board - b.board)
    .map((m) => `  <Result Round="${m.round}" PlayerWhiteSNo="${m.white.startNo}" PlayerBlackSNo="${m.black!.startNo}" Res="${SM_CODE[m.result!]}" />`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', "<Results>", ...lines, "</Results>", ""].join("\r\n");
}

// ---------- Đầu ra 2: Excel kết quả (FR-09) ----------

const XLSX_HEADER = ["Vòng", "Bàn", "STT Trắng", "Mã Trắng", "Trắng", "CLB Trắng", "Kết quả", "STT Đen", "Mã Đen", "Đen", "CLB Đen", "Trạng thái"];

/** Mỗi trạng thái được chọn là 1 sheet riêng để đối soát */
export function buildResultsWorkbook(info: { tournamentName: string; scope: string; generatedAt: string }, statuses: MatchStatus[], matches: ExportMatch[]) {
  const wb = XLSX.utils.book_new();
  for (const status of statuses) {
    const rows = matches
      .filter((m) => m.status === status)
      .sort((a, b) => a.round - b.round || a.board - b.board)
      .map((m) => [
        m.round,
        m.board,
        m.white.startNo ?? "",
        m.white.uniqueId ?? "",
        m.white.fullName,
        m.white.club ?? "",
        m.result ? SM_CODE[m.result] : "",
        m.black?.startNo ?? "",
        m.black?.uniqueId ?? "",
        m.black?.fullName ?? "(miễn đấu)",
        m.black?.club ?? "",
        STATUS_LABEL[m.status],
      ]);
    const ws = XLSX.utils.aoa_to_sheet([
      ["Giải", info.tournamentName],
      ["Phạm vi", info.scope],
      ["Trạng thái", STATUS_LABEL[status]],
      ["Thời điểm tạo", info.generatedAt],
      [],
      XLSX_HEADER,
      ...rows,
    ]);
    ws["!cols"] = XLSX_HEADER.map((h) => ({ wch: ["Trắng", "Đen"].includes(h) ? 28 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws, STATUS_LABEL[status]);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
