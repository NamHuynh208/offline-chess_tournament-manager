import { create, list } from "tar";
import { existsSync, renameSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Danh sách cho phép: không đóng gói file runtime/server mới phát sinh trong repo.
export const deployFiles = [".env.example", ".gitattributes", ".gitignore", "CLAUDE.md", "README.md", "package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "postcss.config.mjs", "eslint.config.mjs", "playwright.config.ts", "ecosystem.config.js", "nginx-giaidau.conf", "deploy.sh", "src", "public", "samples", "scripts", "tests", "memory", "prisma/schema.prisma", "prisma/seed.ts", "prisma/migrations"];
export function safeDeployPath(path: string) {
  const parts = path.replaceAll("\\", "/").replace(/^\.\//, "").split("/").filter(Boolean);
  return !path.startsWith("/") && !parts.some((p) => p === ".." || ["node_modules", ".next", ".git", ".claude", "playwright-report", "test-results", "backups"].includes(p) || (p.startsWith(".env") && p !== ".env.example") || /\.db|\.sqlite(?:3)?(?:$|-)|\.tar\.gz$|\.tsbuildinfo$|\.pem$|\.key$|\.log$/.test(p));
}
export async function packageDeploy(cwd = process.cwd()) {
  const target = resolve(cwd, "giaidau-deploy.tar.gz");
  const temp = `${target}.tmp`;
  try {
    await create({ cwd, file: temp, gzip: true, portable: true, filter: (path, stat) => safeDeployPath(path) && ("isSymbolicLink" in stat ? !stat.isSymbolicLink() : stat.type !== "SymbolicLink") }, deployFiles.filter((p) => existsSync(resolve(cwd, p))));
    const entries: string[] = [];
    await list({ file: temp, onReadEntry: (entry) => { if (!safeDeployPath(entry.path) || !["File", "Directory"].includes(entry.type)) throw new Error(`Nội dung archive không an toàn: ${entry.path}`); entries.push(entry.path); } });
    for (const p of ["package.json", "package-lock.json", "deploy.sh", "scripts/redeploy-server.sh", "prisma/schema.prisma"]) if (!entries.includes(p)) throw new Error(`Archive thiếu ${p}`);
    renameSync(temp, target);
    console.log(`Đã tạo ${target} (${statSync(target).size} bytes, ${entries.length} entries). Không chứa .env thật, DB hoặc thư mục build/dependencies.`);
    return target;
  } finally { rmSync(temp, { force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) packageDeploy().catch((e) => { console.error(e); process.exitCode = 1; });
