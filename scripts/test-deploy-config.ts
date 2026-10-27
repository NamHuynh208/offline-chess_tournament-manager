import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { list } from "tar";
import { packageDeploy, safeDeployPath } from "./package-deploy";

const require = createRequire(import.meta.url);
const { apps: [app] } = require("../ecosystem.config.js");
assert.equal(app.name, "uscc-giaidau");
assert.equal(app.instances, 1);
assert.equal(app.exec_mode, "fork");
assert.equal(app.env_production.NODE_ENV, "production");
assert.equal(app.env_production.PORT, "3005");
assert.equal(app.env_production.SESSION_SECRET, undefined);
assert.match(app.args, /--hostname 127\.0\.0\.1 --port 3005$/);
assert.ok(existsSync(app.script));

const nginx = readFileSync("nginx-giaidau.conf", "utf8");
for (const line of ["server_name giaidau.namprojects.site;", "proxy_pass http://127.0.0.1:3005;", "proxy_buffering off;", "proxy_read_timeout 86400s;", "client_max_body_size 20M;", "proxy_set_header Upgrade $http_upgrade;"]) assert.ok(nginx.includes(line), line);

const deploy = readFileSync("deploy.sh", "utf8");
assert.ok(!deploy.includes("\r"), "Script Ubuntu phải dùng LF");
let previous = -1;
for (const step of ["flock -n 9", "git pull --ff-only", "pm2 stop", "sqlite3 \"$DB_PATH\"", "npm ci --include=dev", "prisma generate", "prisma migrate deploy", "npm run build", "pm2 startOrReload", "curl --fail", "pm2 save"]) {
  const at = deploy.indexOf(step);
  assert.ok(at > previous, `Thiếu/sai thứ tự bước: ${step}`);
  previous = at;
}
assert.ok(deploy.includes("set -Eeuo pipefail"));
assert.ok(deploy.includes("major < 20"));
const redeploy = readFileSync("scripts/redeploy-server.sh", "utf8");
assert.ok(redeploy.includes("tar -xzvf"));
assert.ok(redeploy.includes('bash "$APP_DIR/deploy.sh"'));
assert.ok(redeploy.indexOf("python3 -") < redeploy.indexOf("tar -xzvf"));
for (const p of [".env", "src/.env.local", "prisma/prod.db", "prisma/prod.db.backup", "prisma/prod.db-journal", "prod.db-wal", "prod.db-shm", "public/test.sqlite3", "node_modules/x", ".next/x", "test-results/log", "../escape"]) assert.equal(safeDeployPath(p), false, p);
assert.equal(safeDeployPath(".env.example"), true);
console.log("✔ Cấu hình deployment: PM2 loopback/production, Nginx stream/upload, trình tự deploy/backup — PASS");

async function testPackage() {
  const temp = mkdtempSync(join(process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Temp", "opencode") : tmpdir(), "uscc-package-test-"));
  try {
    for (const p of ["prisma", "public", "scripts", "src", "node_modules", "test-results"]) mkdirSync(join(temp, p));
    for (const p of ["package.json", "package-lock.json", "deploy.sh", "scripts/redeploy-server.sh", "prisma/schema.prisma", ".env.example", ".env", "prisma/prod.db", "prisma/prod.db.backup", "public/accidental.db-journal", "src/.env.production", "node_modules/secret.txt", "test-results/report.txt"]) writeFileSync(join(temp, p), "test");
    const file = await packageDeploy(temp);
    const entries: string[] = [];
    await list({ file, onReadEntry: (e) => { entries.push(e.path); } });
    for (const p of entries) assert.ok(safeDeployPath(p), p);
    assert.ok(!entries.some((p) => /prod\.db|accidental\.db|secret\.txt|report\.txt/.test(p)));
    assert.ok(entries.includes(".env.example"));
    console.log("✔ Archive thực tế loại DB/secret kể cả file phát sinh trong public/src — PASS");
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
testPackage().catch((e) => { console.error(e); process.exitCode = 1; });
