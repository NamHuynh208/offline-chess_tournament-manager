import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const latest = "20261028010000_tournament_approval_cascade";
async function main() {
  const temp = mkdtempSync(join(process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Temp", "opencode") : tmpdir(), "uscc-migration-test-"));
  const databaseUrl = `file:${join(temp, "existing.db").replaceAll("\\", "/")}`;
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  const migrate = (schema: string) => {
    const r = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", schema], { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  try {
    mkdirSync(join(temp, "migrations"));
    writeFileSync(join(temp, "schema.prisma"), readFileSync("prisma/schema.prisma"));
    for (const name of readdirSync("prisma/migrations")) if (name === "migration_lock.toml" || name < latest) cpSync(join("prisma/migrations", name), join(temp, "migrations", name), { recursive: true });
    migrate(join(temp, "schema.prisma"));
    // Ghi bằng SQL vì client mới có cột requireTechnicalApproval chưa tồn tại ở DB cũ.
    await db.$executeRaw`INSERT INTO User (id, username, passwordHash, fullName, role) VALUES ('u', 'test', 'not-a-real-password', 'Test', 'TECHNICAL_ARBITER')`;
    await db.$executeRaw`INSERT INTO User (id, username, passwordHash, fullName, role) VALUES ('admin-u', 'admin', 'keep-this-hash', 'Admin cũ', 'TECHNICAL_ARBITER')`;
    await db.$executeRaw`INSERT INTO Tournament (id, name, totalRounds, updatedAt) VALUES ('t', 'Giải cũ', 7, CURRENT_TIMESTAMP)`;
    await db.$executeRaw`INSERT INTO Player (id, tournamentId, fullName) VALUES ('p', 't', 'Kỳ thủ cũ')`;
    await db.$executeRaw`INSERT INTO Round (id, tournamentId, number) VALUES ('r', 't', 1)`;
    await db.$executeRaw`INSERT INTO Match (id, roundId, board, whitePlayerId, status, result, updatedAt) VALUES ('m', 'r', 1, 'p', 'OFFICIAL', 'BYE', CURRENT_TIMESTAMP)`;
    await db.$executeRaw`INSERT INTO AuditLog (id, tournamentId, roundNumber, board, matchId, userId, action, reason) VALUES ('a', 't', 1, 1, 'm', 'u', 'APPROVE_EXCEPTION', 'Miễn đấu cũ')`;
    await db.$executeRaw`INSERT INTO AuditLog (id, tournamentId, roundNumber, board, userId, action) VALUES ('orphan', 't', 1, 2, 'u', 'ENTER_RESULT')`;
    await db.$executeRaw`INSERT INTO ImportLog (id, tournamentId, userId, kind, fileName, rowCount) VALUES ('i', 't', 'u', 'PAIRING', 'old.xls', 1)`;
    await db.$disconnect();
    migrate("prisma/schema.prisma");
    assert.equal((await db.tournament.findUniqueOrThrow({ where: { id: "t" } })).requireTechnicalApproval, false);
    assert.equal((await db.match.findUniqueOrThrow({ where: { id: "m" } })).result, "BYE");
    assert.equal((await db.auditLog.findUniqueOrThrow({ where: { id: "a" } })).matchId, "m");
    assert.equal(await db.auditLog.count(), 2);
    await db.tournament.delete({ where: { id: "t" } });
    for (const model of [db.player, db.round, db.match, db.auditLog, db.importLog]) assert.equal(await (model.count as () => Promise<number>)(), 0);
    assert.equal(await db.user.count(), 2);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: "u" } })).sessionVersion, 0);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: "u" } })).role, "TECHNICAL_ARBITER");
    const admin = await db.user.findUniqueOrThrow({ where: { id: "admin-u" } });
    assert.equal(admin.role, "ADMIN"); assert.equal(admin.passwordHash, "keep-this-hash"); assert.equal(admin.sessionVersion, 1);
    assert.deepEqual(await db.$queryRawUnsafe("PRAGMA foreign_key_check"), []);
    console.log("✔ Migration: giữ kết quả/audit DB cũ, cờ mặc định false, xóa cascade cả log mất matchId, giữ user — PASS");
  } finally { await db.$disconnect(); rmSync(temp, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
