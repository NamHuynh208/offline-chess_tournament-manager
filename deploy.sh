#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
APP_NAME="uscc-giaidau"

trap 'echo "Deploy thất bại ở dòng $LINENO. Không tự rollback DB. Kiểm tra lỗi/backup trước khi khởi động lại $APP_NAME." >&2' ERR

if [[ $# -gt 1 || ($# -eq 1 && "$1" != "--pull") ]]; then
  echo "Cách dùng: bash deploy.sh [--pull]" >&2
  exit 2
fi

for cmd in node npm npx pm2 curl flock; do
  command -v "$cmd" >/dev/null || { echo "Thiếu lệnh: $cmd" >&2; exit 1; }
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Cần Node.js >=22 (khuyến nghị Node 22 LTS)"); process.exit(1); }'

# Chặn hai lần deploy đồng thời, không xóa file lock sau khi chạy.
exec 9>.deploy.lock
flock -n 9 || { echo "Một deploy khác đang chạy." >&2; exit 1; }

if [[ "${1:-}" == "--pull" ]]; then
  command -v git >/dev/null || { echo "Thiếu git" >&2; exit 1; }
  git diff --quiet
  git diff --cached --quiet
  git pull --ff-only
fi

[[ -f .env ]] || { echo "Thiếu .env. Xem hướng dẫn Ubuntu trong README.md." >&2; exit 1; }
# Dùng duy nhất .env để Prisma CLI, Next build/runtime cùng đọc một DB/secret.
for file in .env.local .env.production .env.production.local; do
  [[ ! -f "$file" ]] || { echo "Hãy hợp nhất $file vào .env trước khi deploy để tránh lệch cấu hình Prisma/Next." >&2; exit 1; }
done
chmod 600 .env
export NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
DATABASE_URL="$(node --env-file=.env -e 'process.stdout.write(process.env.DATABASE_URL || "")')"
SESSION_SECRET="$(node --env-file=.env -e 'process.stdout.write(process.env.SESSION_SECRET || "")')"
export DATABASE_URL SESSION_SECRET
node -e '
  if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET.startsWith("change-me")) {
    console.error("Cần DATABASE_URL và SESSION_SECRET ngẫu nhiên >=32 ký tự trong .env"); process.exit(1);
  }
  if (!process.env.DATABASE_URL.startsWith("file:/")) {
    console.error("Schema hiện dùng SQLite: DATABASE_URL phải là file:/đường/dẫn/tuyệt/đối/production.db"); process.exit(1);
  }
'
DB_PATH="${DATABASE_URL#file:}"
[[ "$DB_PATH" != *'?'* && "$DB_PATH" != *'#'* ]] || { echo "Dùng SQLite path thuần, không có query/fragment." >&2; exit 1; }
mkdir -p -- "$(dirname -- "$DB_PATH")"
if [[ -f "$DB_PATH" ]]; then
  command -v sqlite3 >/dev/null || { echo "Cần sqlite3 để backup DB trước migration: sudo apt install sqlite3" >&2; exit 1; }
fi

# In-place deploy: dừng trước npm ci/build để không xóa node_modules/.next khi app đang phục vụ.
# shortcut: có downtime trong lúc build; cần release directories/blue-green khi yêu cầu zero-downtime.
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 stop "$APP_NAME"
fi

if [[ -f "$DB_PATH" ]]; then
  BACKUP_DIR="$(dirname -- "$DB_PATH")/backups"
  mkdir -p -- "$BACKUP_DIR"
  BACKUP_PATH="$BACKUP_DIR/giaidau-$(date -u +%Y%m%dT%H%M%SZ)-$$.db"
  # .backup tạo snapshot SQLite nhất quán, kể cả khi DB có WAL.
  sqlite3 "$DB_PATH" ".backup '${BACKUP_PATH//\'/\'\'}'"
  echo "Đã backup DB: $BACKUP_PATH"
fi

npm ci --include=dev
npx --no-install prisma generate
npx --no-install prisma migrate deploy
npm run build
pm2 startOrReload ecosystem.config.js --env production --update-env

ready=false
for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3005/login >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  echo "Ứng dụng chưa sẵn sàng. Xem: pm2 logs $APP_NAME --lines 100" >&2
  exit 1
fi
pm2 save
echo "Deploy thành công: http://127.0.0.1:3005 (public qua Nginx + HTTPS)."
