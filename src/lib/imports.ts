// Đối chiếu file nhập với DB (Preview) và lưu (Commit). Mỗi plan* trả về preview + hàm commit dùng đúng dữ liệu đã preview.
import { Prisma, type User } from "@prisma/client";
import { createHmac } from "node:crypto";
import { prisma } from "./db";
import { nameKey, type Issue, type ParsedPlayer, type parsePairingSheet } from "./swiss-manager";

const MAX_UPLOAD = 5 * 1024 * 1024;

export class ImportConflict extends Error {
  constructor() { super("Dữ liệu đã thay đổi hoặc thiếu token Preview. Hãy chạy Xem trước lại trước khi nhập."); }
}

// Snapshot toàn giải: bảo vệ cả đổi STT/tên, cấu hình, thêm/xóa vòng và kết quả tại bàn.
async function importSnapshot(tx: Prisma.TransactionClient, tournamentId: string) {
  return tx.tournament.findUnique({ where: { id: tournamentId }, include: {
    players: { orderBy: { id: "asc" } },
    rounds: { orderBy: { id: "asc" }, include: { matches: { orderBy: { id: "asc" } } } },
  } });
}
const importToken = (input: unknown, snapshot: unknown) => createHmac("sha256", process.env.SESSION_SECRET!).update(JSON.stringify({ input, snapshot })).digest("hex");
export const isImportConflict = (e: unknown) => e instanceof ImportConflict || (e instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P1008", "P2028"].includes(e.code));

export async function readUpload(form: FormData, exts: string[]) {
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Thiếu file (field 'file')" };
  if (!exts.some((e) => file.name.toLowerCase().endsWith(e))) return { error: `Chỉ nhận file ${exts.join(", ")}` };
  if (file.size > MAX_UPLOAD) return { error: "File vượt quá 5MB" };
  return { file, bytes: new Uint8Array(await file.arrayBuffer()) };
}

// ---------- Danh sách kỳ thủ (XML) ----------

export async function planPlayers(tournamentId: string, parsed: { players: ParsedPlayer[]; errors: Issue[] }) {
  const snapshot = await importSnapshot(prisma, tournamentId);
  const token = importToken({ kind: "PLAYERS", parsed }, snapshot);
  const existing = snapshot?.players ?? [];
  const byUid = new Map(existing.filter((e) => e.uniqueId).map((e) => [e.uniqueId!, e]));
  const errors = [...parsed.errors];
  const linked = new Set<string>();

  const plan = parsed.players.map((p, i) => {
    const e = byUid.get(p.uniqueId);
    if (e) {
      const changes = (["fullName", "club", "federation"] as const).filter((k) => (e[k] ?? null) !== p[k]).map((k) => `${k}: "${e[k] ?? ""}" → "${p[k] ?? ""}"`);
      return { p, id: e.id as string | null, changes };
    }
    // kỳ thủ đã tạo từ file bốc thăm (chưa có mã) -> gắn mã theo tên
    const cands = existing.filter((x) => !x.uniqueId && nameKey(x.fullName) === nameKey(p.fullName));
    if (cands.length > 1 || (cands.length === 1 && linked.has(cands[0].id))) {
      errors.push({ row: i + 1, column: "Lastname/Firstname", message: `Trùng tên "${p.fullName}" với nhiều kỳ thủ, không xác định được` });
    }
    if (cands.length === 1) linked.add(cands[0].id);
    return { p, id: cands.length === 1 ? cands[0].id : null, changes: [] as string[] };
  });

  const preview = {
    previewToken: token,
    total: plan.length,
    create: plan.filter((x) => !x.id).length,
    // cảnh báo ghi đè: kỳ thủ đã có mà thông tin sẽ đổi
    updates: plan.filter((x) => x.changes.length).map((x) => ({ uniqueId: x.p.uniqueId, changes: x.changes })),
    players: parsed.players,
    errors,
    canCommit: errors.length === 0 && plan.length > 0,
  };

  const commit = (user: User, fileName: string, expectedToken: unknown) =>
    prisma.$transaction(async (tx) => {
      if (expectedToken !== token || importToken({ kind: "PLAYERS", parsed }, await importSnapshot(tx, tournamentId)) !== token) throw new ImportConflict();
      for (const { p, id } of plan) {
        const data = { uniqueId: p.uniqueId, lastName: p.lastName, firstName: p.firstName, fullName: p.fullName, club: p.club, federation: p.federation, rating: p.rating };
        if (id) await tx.player.update({ where: { id }, data });
        else await tx.player.create({ data: { ...data, tournamentId } });
      }
      return tx.importLog.create({ data: { tournamentId, userId: user.id, kind: "PLAYERS", fileName, rowCount: plan.length } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { preview, commit };
}

// ---------- Bốc thăm 1 vòng (.xls/.xlsx) ----------

type Ref = { id: string | null; startNo: number; fullName: string; setStartNo: boolean };

export async function planPairing(tournamentId: string, parsed: ReturnType<typeof parsePairingSheet>, roundOverride?: number) {
  const t = await importSnapshot(prisma, tournamentId);
  if (!t) return null;
  const token = importToken({ kind: "PAIRING", parsed, roundOverride }, t);
  const errors = [...parsed.errors];
  const warnings = [...parsed.warnings];

  const round = roundOverride ?? parsed.round;
  if (!round) errors.push({ message: "Không xác định được số vòng (file không có dòng 'Ván N'), hãy nhập số vòng" });
  else if (round > t.totalRounds) errors.push({ message: `Vòng ${round} vượt quá tổng số vòng của giải (${t.totalRounds})` });

  const bySno = new Map(t.players.filter((p) => p.startNo != null).map((p) => [p.startNo!, p]));
  const claimed = new Set<string>();
  const refs = new Map<number, Ref>();

  const resolve = (sno: number, name: string, row: number, side: string): Ref => {
    const known = bySno.get(sno);
    if (known) {
      if (nameKey(known.fullName) !== nameKey(name)) errors.push({ row, column: `STT (${side})`, message: `STT ${sno} trong hệ thống là "${known.fullName}", file ghi "${name}"` });
      return { id: known.id, startNo: sno, fullName: known.fullName, setStartNo: false };
    }
    const cands = t.players.filter((p) => nameKey(p.fullName) === nameKey(name));
    const free = cands.filter((p) => p.startNo == null && !claimed.has(p.id));
    if (free.length > 1) errors.push({ row, column: side, message: `Trùng tên: ${free.length} kỳ thủ tên "${name}" trong danh sách, không xác định được` });
    else if (free.length === 1) {
      claimed.add(free[0].id);
      return { id: free[0].id, startNo: sno, fullName: free[0].fullName, setStartNo: true };
    } else if (cands.length) {
      errors.push({ row, column: side, message: `"${name}" đã có STT ${cands.map((c) => c.startNo).join(", ")} nhưng file ghi STT ${sno}` });
    } else if (t.players.length) {
      warnings.push({ row, column: side, message: `Không nhận diện được "${name}" trong danh sách kỳ thủ, sẽ tạo mới` });
    }
    return { id: null, startNo: sno, fullName: name, setStartNo: false };
  };

  const rows = parsed.rows.map((r) => {
    const white = resolve(r.whiteSNo, r.whiteName, r.row, "Trắng");
    const black = r.blackSNo ? resolve(r.blackSNo, r.blackName!, r.row, "Đen") : null;
    for (const ref of [white, black]) if (ref) refs.set(ref.startNo, ref);
    return { board: r.board, row: r.row, white, black, whitePoints: r.whitePoints, blackPoints: r.blackPoints };
  });
  const newPlayers = [...refs.values()].filter((r) => !r.id).length;
  if (!t.players.length && newPlayers) warnings.push({ message: `Chưa nhập danh sách kỳ thủ: ${newPlayers} kỳ thủ sẽ được tạo từ file bốc thăm` });

  // Bảo vệ dữ liệu: bàn giữ nguyên cặp đấu thì giữ cả kết quả; bàn đổi cặp / bị bỏ sẽ bị ghi đè
  const oldRound = t.rounds.find((r) => r.number === round);
  const byId = new Map(t.players.map((p) => [p.id, p]));
  const existing = oldRound ? { ...oldRound, matches: oldRound.matches.map((m) => ({ ...m, whitePlayer: byId.get(m.whitePlayerId)!, blackPlayer: m.blackPlayerId ? byId.get(m.blackPlayerId)! : null })).sort((a, b) => a.board - b.board) } : null;
  const newByBoard = new Map(rows.map((r) => [r.board, r]));
  const sameAsNew = (m: { board: number; whitePlayerId: string; blackPlayerId: string | null }) => {
    const n = newByBoard.get(m.board);
    return !!n && n.white.id === m.whitePlayerId && (n.black?.id ?? null) === m.blackPlayerId;
  };
  const kept = new Set((existing?.matches ?? []).filter(sameAsNew).map((m) => m.board));
  const replaced = (existing?.matches ?? []).filter((m) => !kept.has(m.board));
  const overwrite = replaced.map((m) => ({
    board: m.board,
    white: m.whitePlayer.fullName,
    black: m.blackPlayer?.fullName ?? null,
    status: m.status,
    result: m.result,
    hasResult: m.status !== "PENDING_RESULT",
    change: newByBoard.has(m.board) ? "Đổi cặp đấu" : "Bàn bị xóa",
  }));

  const preview = {
    previewToken: token,
    round,
    headerRow: parsed.headerRow,
    header: parsed.header,
    columns: parsed.columns,
    rows: rows.map((r) => ({
      board: r.board,
      row: r.row,
      white: { startNo: r.white.startNo, name: r.white.fullName, isNew: !r.white.id },
      black: r.black && { startNo: r.black.startNo, name: r.black.fullName, isNew: !r.black.id },
    })),
    summary: { boards: rows.length, newPlayers, keptBoards: kept.size, overwrittenBoards: overwrite.length, overwrittenWithResult: overwrite.filter((o) => o.hasResult).length },
    overwrite,
    errors,
    warnings,
    canCommit: errors.length === 0 && rows.length > 0,
  };

  const commit = (user: User, fileName: string, expectedToken: unknown) =>
    prisma.$transaction(async (tx) => {
      if (expectedToken !== token || importToken({ kind: "PAIRING", parsed, roundOverride }, await importSnapshot(tx, tournamentId)) !== token) throw new ImportConflict();
      const idBySno = new Map<number, string>();
      for (const ref of refs.values()) {
        if (!ref.id) idBySno.set(ref.startNo, (await tx.player.create({ data: { tournamentId, startNo: ref.startNo, fullName: ref.fullName } })).id);
        else {
          if (ref.setStartNo) await tx.player.update({ where: { id: ref.id }, data: { startNo: ref.startNo } });
          idBySno.set(ref.startNo, ref.id);
        }
      }
      const r = await tx.round.upsert({
        where: { tournamentId_number: { tournamentId, number: round! } },
        update: { sourceFile: fileName, importedAt: new Date() },
        create: { tournamentId, number: round!, sourceFile: fileName },
      });
      if (replaced.length) await tx.match.deleteMany({ where: { id: { in: replaced.map((m) => m.id) } } });
      const keptByBoard = new Map((existing?.matches ?? []).filter((m) => kept.has(m.board)).map((m) => [m.board, m]));
      for (const row of rows) {
        const k = keptByBoard.get(row.board);
        if (k) {
          // giữ ván + kết quả, chỉ cập nhật điểm trước vòng nếu file mới khác
          if (k.whitePoints !== row.whitePoints || k.blackPoints !== row.blackPoints) {
            await tx.match.update({ where: { id: k.id }, data: { whitePoints: row.whitePoints, blackPoints: row.blackPoints } });
          }
          continue;
        }
        const bye = !row.black;
        const m = await tx.match.create({
          data: {
            roundId: r.id,
            board: row.board,
            whitePlayerId: idBySno.get(row.white.startNo)!,
            blackPlayerId: row.black ? idBySno.get(row.black.startNo)! : null,
            whitePoints: row.whitePoints,
            blackPoints: row.blackPoints,
            ...(bye && { status: "OFFICIAL", result: "BYE", enteredById: user.id, enteredAt: new Date() }),
          },
        });
        if (bye) {
          await tx.auditLog.create({
            data: { matchId: m.id, tournamentId, roundNumber: round, board: row.board, userId: user.id, action: "APPROVE_EXCEPTION", oldValue: JSON.stringify({ status: "PENDING_RESULT", result: null, resultVersion: 0, whiteConfirmedAt: null, blackConfirmedAt: null }), newValue: JSON.stringify({ status: "OFFICIAL", result: "BYE", resultVersion: 0, whiteConfirmedAt: null, blackConfirmedAt: null }), reason: "Miễn đấu theo file bốc thăm" },
          });
        }
      }
      return tx.importLog.create({
        data: {
          tournamentId,
          userId: user.id,
          kind: "PAIRING",
          fileName,
          roundNumber: round,
          rowCount: rows.length,
          // giữ bản chụp ván cũ (kể cả kết quả, xác nhận) để không mất dữ liệu khi ghi đè
          replaced: replaced.length ? JSON.stringify(replaced.map(({ whitePlayer, blackPlayer, ...m }) => ({ ...m, white: whitePlayer.fullName, black: blackPlayer?.fullName ?? null }))) : null,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { preview, commit };
}
