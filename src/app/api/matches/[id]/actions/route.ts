import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applyAction, parseAction, parseTechnicalAction, toState, type MatchState } from "@/lib/match-state";
import { matchInclude, toClientMatch } from "@/lib/matches";
import { requireUser } from "@/lib/session";
import { canManageTournament } from "@/lib/roles";

class Conflict extends Error {}
const snapshot = (s: MatchState) => ({ resultVersion: s.resultVersion, status: s.status, result: s.result, whiteConfirmedAt: s.whiteConfirmedAt, blackConfirmedAt: s.blackConfirmedAt, exceptionReason: s.exceptionReason });
const date = (s: string | null) => (s ? new Date(s) : null);

/**
 * Thao tác của trọng tài ghi tại bàn: nhập KQ, kỳ thủ xác nhận / không đồng ý, yêu cầu duyệt ngoại lệ.
 * body: { action, opId?, clientAt? } — opId giúp gửi lại sau khi mất mạng mà không ghi 2 lần.
 * 409 kèm `match` mới nhất khi thao tác không hợp lệ với trạng thái hiện tại.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const technical = parseTechnicalAction(body?.action);
  if (technical && !canManageTournament(auth.user.role)) return Response.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const action = technical ?? parseAction(body?.action);
  if (!action) return Response.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
  const opId = typeof body?.opId === "string" && /^[\w-]{8,64}$/.test(body.opId) ? body.opId : null;
  const clientAt = typeof body?.clientAt === "string" && !isNaN(Date.parse(body.clientAt)) ? body.clientAt : null;

  const load = () => prisma.match.findUnique({ where: { id }, include: matchInclude });
  const duplicate = opId ? await prisma.auditLog.findUnique({ where: { clientOpId: opId } }) : null;
  if (duplicate) {
    if (duplicate.matchId !== id || duplicate.userId !== auth.user.id) return Response.json({ error: "Mã thao tác đã được dùng cho tài khoản hoặc bàn khác" }, { status: 409 });
    const m = await load();
    return Response.json({ match: m && toClientMatch(m), duplicate: true });
  }
  const m = await load();
  if (!m) return Response.json({ error: "Không tìm thấy ván đấu" }, { status: 404 });
  if (technical && body?.expectedUpdatedAt !== m.updatedAt.toISOString()) return Response.json({ error: "Ván đã thay đổi, hãy kiểm tra lại trước khi thao tác", match: toClientMatch(m) }, { status: 409 });
  if (!technical && (!Number.isSafeInteger(body?.expectedVersion) || body.expectedVersion !== m.resultVersion)) {
    return Response.json({ error: "Phiên bản kết quả đã thay đổi hoặc thiếu phiên bản. Hãy bỏ thao tác cũ, kiểm tra tỷ số mới và cho kỳ thủ xác nhận lại.", match: toClientMatch(m) }, { status: 409 });
  }
  const cur = toState(toClientMatch(m));
  const r = applyAction(cur, action, new Date().toISOString(), auth.user.role);
  if (!r.ok) return Response.json({ error: r.error, match: toClientMatch(m) }, { status: 409 });

  const n = r.next;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({ where: { id: m.round.tournamentId } });
      if (!tournament || tournament.updatedAt.getTime() !== m.round.tournament.updatedAt.getTime()) throw new Conflict();
      // so updatedAt để 2 máy cùng thao tác 1 ván không ghi đè nhau
      const { count } = await tx.match.updateMany({
        where: { id, updatedAt: m.updatedAt, resultVersion: m.resultVersion },
        data: {
          status: n.status,
          result: n.result,
          resultVersion: n.resultVersion,
          whiteConfirmedAt: date(n.whiteConfirmedAt),
          blackConfirmedAt: date(n.blackConfirmedAt),
          exceptionReason: n.exceptionReason,
          ...(action.type === "ENTER_RESULT" && { enteredById: auth.user.id, enteredAt: new Date() }),
        },
      });
      if (!count) throw new Conflict();
      await tx.auditLog.create({
        data: {
          matchId: id,
          tournamentId: m.round.tournamentId,
          roundNumber: m.round.number,
          board: m.board,
          userId: auth.user.id,
          action: r.audit,
          oldValue: JSON.stringify(snapshot(cur)),
          newValue: JSON.stringify({ ...snapshot(n), operation: action.type, ...("mode" in action && { mode: action.mode }), ...("side" in action && { side: action.side }), clientAt }),
          reason: "reason" in action ? action.reason.trim() : null,
          clientOpId: opId,
        },
      });
      return tx.match.findUniqueOrThrow({ where: { id }, include: matchInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ match: toClientMatch(updated) });
  } catch (e) {
    const dupOp = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"; // cùng opId gửi 2 lần song song
    const concurrent = e instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P1008", "P2028"].includes(e.code);
    if (!(e instanceof Conflict) && !dupOp && !concurrent) throw e;
    const fresh = await load();
    return dupOp
      ? Response.json({ match: fresh && toClientMatch(fresh), duplicate: true })
      : Response.json({ error: "Ván vừa được cập nhật ở máy khác, đã tải lại", match: fresh && toClientMatch(fresh) }, { status: 409 });
  }
}
