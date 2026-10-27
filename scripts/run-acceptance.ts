// Chỉ chạy trên DB tạm do script tạo, tuyệt đối không dùng DATABASE_URL của dự án.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const require = createRequire(import.meta.url);
const temp = mkdtempSync(join(process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Temp", "opencode") : process.cwd(), "uscc-acceptance-"));
const databaseUrl = `file:${join(temp, "test.db").replaceAll("\\", "/")}`;
const password = randomBytes(18).toString("hex");
const env = { ...process.env, DATABASE_URL: databaseUrl, SESSION_SECRET: randomBytes(48).toString("hex"), TEST_DATABASE_URL: databaseUrl, TEST_PASSWORD: password };
let server: ChildProcess | undefined;
let prisma: PrismaClient | undefined;

async function main() {
  const migration = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], { env, stdio: "inherit" });
  if (migration.status !== 0) throw new Error("Không tạo được DB test");
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.createMany({ data: [
    { username: "test-tech", fullName: "TTKT kiểm thử", role: "TECHNICAL_ARBITER", passwordHash },
    { username: "test-record", fullName: "Trọng tài ghi kiểm thử", role: "RECORDING_ARBITER", passwordHash },
  ] });
  await prisma.$disconnect();
  const socket = createServer();
  await new Promise<void>((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("Không tìm được cổng test");
  const port = address.port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const baseURL = `http://localhost:${port}`;
  let output = "";
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (b) => { output += b.toString(); });
  server.stderr?.on("data", (b) => { output += b.toString(); });
  const deadline = Date.now() + 30000;
  while (true) {
    if (server.exitCode !== null) throw new Error(`Server test dừng:\n${output}`);
    try { if ((await fetch(`${baseURL}/login`)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error(`Server test không khởi động:\n${output}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`\nAcceptance: production server ${baseURL}, DB tạm riêng; 10 tiêu chí PRD + test hồi quy.\n`);
  const result = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve("@playwright/test/cli"), "test"], { env: { ...env, TEST_BASE_URL: baseURL }, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/server.log", output);
  if (result) console.error("Có tiêu chí FAIL; xem test-results/acceptance.json và playwright-report/index.html.");
  process.exitCode = result;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await prisma?.$disconnect();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      server!.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    server.kill();
    await exited;
  }
  server?.stdout?.destroy();
  server?.stderr?.destroy();
  rmSync(temp, { recursive: true, force: true }); // chỉ thư mục riêng do mkdtempSync ở trên tạo
});
