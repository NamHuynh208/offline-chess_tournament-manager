#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Chạy bản script trên server: bash scripts/redeploy-server.sh /tmp/giaidau-deploy.tar.gz
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
[[ $# -eq 1 ]] || { echo "Cách dùng: bash scripts/redeploy-server.sh /tmp/giaidau-deploy.tar.gz" >&2; exit 2; }
ARCHIVE="$(realpath -- "$1")"
cd -- "$APP_DIR"
for cmd in python3 tar flock pm2; do command -v "$cmd" >/dev/null || { echo "Thiếu $cmd" >&2; exit 1; }; done
[[ -f .env ]] || { echo "Thiếu .env server; không tự tạo/ghi đè cấu hình DB." >&2; exit 1; }
exec 8>.redeploy.lock
flock -n 8 || { echo "Một redeploy khác đang chạy" >&2; exit 1; }

# Không tin archive tải lên: chặn traversal/symlink, .env và DB trước khi giải nén.
python3 - "$ARCHIVE" "$APP_DIR" <<'PY'
import pathlib, sys, tarfile
archive, app = sys.argv[1], pathlib.Path(sys.argv[2])
files = {'.env.example', '.gitattributes', '.gitignore', 'CLAUDE.md', 'README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs', 'eslint.config.mjs', 'playwright.config.ts', 'ecosystem.config.js', 'nginx-giaidau.conf', 'deploy.sh'}
dirs = {'src', 'public', 'samples', 'scripts', 'tests', 'memory'}
with tarfile.open(archive, 'r:gz') as tar:
    seen = set()
    for m in tar.getmembers():
        path = pathlib.PurePosixPath(m.name)
        parts = path.parts
        allowed = m.name in files or (parts and parts[0] in dirs) or m.name in {'prisma/schema.prisma', 'prisma/seed.ts', 'prisma/migrations'} or m.name.startswith('prisma/migrations/') or m.name == 'prisma'
        if not parts or path.is_absolute() or '..' in parts or '\\' in m.name or not allowed or not (m.isfile() or m.isdir()):
            raise SystemExit('Archive không an toàn: ' + m.name)
        for p in parts:
            if (p.startswith('.env') and p != '.env.example') or '.db' in p or '.sqlite' in p or p in {'node_modules', '.next', '.git', 'backups'}:
                raise SystemExit('Archive chứa DB/secret/runtime: ' + m.name)
        dest = app
        for p in parts:
            dest = dest / p
            if dest.is_symlink():
                raise SystemExit('Đích giải nén là symlink: ' + str(dest))
        seen.add(m.name)
    if not {'package.json', 'package-lock.json', 'deploy.sh', 'prisma/schema.prisma'}.issubset(seen):
        raise SystemExit('Archive thiếu source/config bắt buộc')
print('Archive hợp lệ: không ghi đè .env/prod.db hoặc DB runtime.')
PY

# Dừng trước extract, giữ DB/.env cũ; deploy.sh backup SQLite trước migration.
if pm2 describe uscc-giaidau >/dev/null 2>&1; then pm2 stop uscc-giaidau; fi
tar -xzvf "$ARCHIVE" --no-same-owner --no-same-permissions -C "$APP_DIR"
# Dùng chung quy trình để không lặp logic: npm ci, prisma generate/migrate deploy,
# npm run build, pm2 startOrReload --update-env, healthcheck, pm2 save. Không seed/reset DB.
bash "$APP_DIR/deploy.sh"
