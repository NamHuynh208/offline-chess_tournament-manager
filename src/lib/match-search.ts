import type { ClientMatch } from "./matches";

export const foldSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();

/** Số bàn và STT là hai định danh khác nhau: hỗ trợ tiền tố để tìm chính xác. */
export function matchSearch(m: Pick<ClientMatch, "board" | "white" | "black">, value: string) {
  const query = foldSearch(value);
  if (!query) return true;
  const board = query.match(/^(?:ban\s*[:#-]?\s*|b\s*|#\s*)(\d+)$/);
  if (board) return m.board === Number(board[1]);
  const sno = query.match(/^stt\s*[:#-]?\s*(\d+)$/);
  if (sno) return m.white.startNo === Number(sno[1]) || m.black?.startNo === Number(sno[1]);
  if (/^\d+$/.test(query)) return m.board === Number(query) || m.white.startNo === Number(query) || m.black?.startNo === Number(query);
  return [m.white.fullName, m.black?.fullName ?? ""].some((name) => foldSearch(name).includes(query));
}
