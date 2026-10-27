import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

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
console.log("✔ Cấu hình deployment: PM2 loopback/production, Nginx stream/upload, trình tự deploy/backup — PASS");
