import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const require = createRequire(import.meta.url);
async function main() {
  const temp = mkdtempSync(join(process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Temp", "opencode") : tmpdir(), "uscc-seed-test-"));
  const env = { ...process.env, DATABASE_URL: `file:${join(temp, "seed.db").replaceAll("\\", "/")}`, SEED_ADMIN_PASSWORD: "", SEED_ARBITER_PASSWORD: "", SEED_DEFAULT_TOURNAMENT: "false" };
  const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const seed = (extra = {}) => {
    const r = spawnSync(process.execPath, [require.resolve("tsx/cli"), "prisma/seed.ts"], { env: { ...env, ...extra }, encoding: "utf8" });
    assert.equal(r.status, 0, "Seed không được thất bại khi thiếu mật khẩu");
    return r.stderr; // không in log chứa mật khẩu test ra báo cáo
  };
  try {
    const migrate = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], { env, encoding: "utf8" });
    assert.equal(migrate.status, 0, "Tạo DB seed test thất bại");
    const warning = seed();
    const users = await db.user.findMany({ orderBy: { username: "asc" } });
    assert.equal(users.length, 2);
    assert.equal(users.find((u) => u.username === "admin")?.role, "ADMIN");
    const passwords = [...warning.matchAll(/Mật khẩu ngẫu nhiên dùng lần đầu: (\S+)/g)].map((m) => m[1]);
    assert.equal(passwords.length, 2); assert.notEqual(passwords[0], passwords[1]);
    for (const u of users) assert.ok((await Promise.all(passwords.map((p) => bcrypt.compare(p, u.passwordHash)))).some(Boolean));
    seed();
    assert.deepEqual((await db.user.findMany({ orderBy: { username: "asc" } })).map((u) => u.passwordHash), users.map((u) => u.passwordHash));
    assert.equal(await db.tournament.count(), 0);
    const explicit = randomBytes(24).toString("hex");
    seed({ SEED_ADMIN_PASSWORD: explicit, SEED_DEFAULT_TOURNAMENT: "true" });
    assert.ok(await bcrypt.compare(explicit, (await db.user.findUniqueOrThrow({ where: { username: "admin" } })).passwordHash));
    seed({ SEED_DEFAULT_TOURNAMENT: "true" });
    assert.equal(await db.tournament.count(), 1);
    console.log("✔ Seed: mật khẩu ngẫu nhiên khi thiếu env, giữ tài khoản cũ, mật khẩu chỉ định và giải mẫu idempotent — PASS");
  } finally { await db.$disconnect(); rmSync(temp, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
