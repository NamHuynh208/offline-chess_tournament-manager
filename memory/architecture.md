> Cập nhật: 2026-10-28

## Stack
- Next.js 15 App Router (`src/app`), TypeScript, TailwindCSS v4, alias `@/*` → `src/*`
- Prisma 6 + SQLite (`prisma/dev.db`), chuyển PostgreSQL bằng cách đổi provider
- Node >=20.20.2, iron-session8.0.4/cookie0.7.2 + bcryptjs; xlsx; fast-xml-parser; lucide-react; tsx seed; tar7.5.22 dev dep đóng gói đa nền tảng

## Cấu trúc
- `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`
- `samples/`: file mẫu Swiss-Manager (XML danh sách, .xls bốc thăm, XML kết quả)
- `src/lib/swiss-manager.ts`: parser/exporter thuần (XML kỳ thủ, .xls bốc thăm, XML kết quả, .xlsx) — không đụng DB
- `src/lib/imports.ts`: `planPlayers`/`planPairing` trả `{ preview, commit }`; HMAC previewToken gắn parsed file/snapshot toàn giải, transaction Serializable kiểm lại snapshot trước ghi, ImportConflict ->409
- `src/lib/export.ts`, `results.ts` (mã SM, nhãn trạng thái), `time.ts` (formatInTz), `tournament.ts` (validate FR-01)
- `src/lib/session.ts` (iron-session, `requireUser`), `db.ts` (Prisma singleton)
- `src/app/api/**`: route handlers; đầu mỗi handler gọi `requireUser(...)`
- `src/lib/match-state.ts`: state machine trọng tài ghi + TTKT, kiểm tra role/lý do; tăng resultVersion khi nhập/sửa/hủy/mở lại, giữ khi xác nhận. `matches.ts`: ClientMatch có updatedAt/resultVersion; `offline-queue.ts`: localStorage kèm expectedVersion
- Cờ Tournament.requireTechnicalApproval đi qua matchInclude.round.tournament -> ClientMatch/toState. readyToPublish dùng chung, CONFIRM đủ 2 bên chỉ OFFICIAL nếu cờ false; APPROVE_PUBLICATION TTKT-only đủ xác nhận -> OFFICIAL + audit. Match actions kiểm cấu hình thật và updatedAt giải trong transaction Serializable
- `src/app/record/`: `page.tsx` (server, kiểm tra đăng nhập), `RecordApp.tsx` (danh sách + hàng đợi), `ResultFlow.tsx` (nhập KQ + kiosk), `ui.tsx`
- `src/app/login/page.tsx`
- `src/app/technical/`: Dashboard + empty/create modal/header selector; TournamentSettings chung POST create/PATCH edit, tự chọn giải mới trong state; PairingImport preview/commit
- `src/lib/tournament-selection.ts`: ưu tiên giải đang diễn ra mới nhất (ngày bắt đầu/kết thúc) cho RecordApp, input createdAt desc
- `src/lib/colors.ts`: tương phản WCAG cho chữ trên nền nhận diện, dùng ở mobile/settings/projector, test 4096 màu
- Migration `20261027180000_result_version_audit_context`: resultVersion + audit tournamentId/roundNumber/board, backfill log hiện hữu còn matchId; API audit lọc trực tiếp tournamentId
- Migration `20261028010000_tournament_approval_cascade`: approval flag false + FK AuditLog.tournamentId Cascade, Match player FK Cascade; DELETE giải TTKT confirmName -> cascade sạch, re-import vẫn AuditLog.matchId SetNull
- `src/app/projector/[tournamentId]/`: màn hình chiếu có kiểm tra quyền TTKT ở server
- `src/lib/use-live-tournament.ts`: polling 2 giây, timeout/abort/không chồng request; `src/app/components/SyncStatus.tsx`: giờ đồng bộ gần nhất theo timezone
- `src/lib/projector.ts`: quy tắc chỉ hiện tỷ số OFFICIAL, nhận biết điểm nhập đầu vòng, kích thước trang 20 bàn
- `/api/tournaments/[id]/live`: dữ liệu vòng/bàn/nhận diện giải, chỉ TTKT; `view=projector` xóa tỷ số chưa OFFICIAL; `/audit`: lịch sử có phân trang và lọc bàn
- `scripts/test-samples.ts`, `scripts/test-match-state.ts`: `npm test`, chạy bằng tsx + node:assert
- `scripts/test-deploy-config.ts`: assert cấu hình PM2/Nginx/thứ tự backup/deploy trong npm test (không thay thế bash -n/nginx -t)
- `ecosystem.config.js`: PM2 một fork, Next start loopback 3005/env production. `nginx-giaidau.conf`: domain reverse proxy, timeout 86400s/no buffering + Upgrade; HTTPS bổ sung bằng Certbot
- `deploy.sh [--pull]`: Node>=20.20.2, .env duy nhất, SQLite URL absolute/relative đúng prisma/, backup/stop/migrate/build/startOrReload; downtime, không rollback tự động
- `scripts/package-deploy.ts`: tar allowlist/filter/verify/atomic output giaidau-deploy.tar.gz, không chứa runtime/DB/.env. `scripts/redeploy-server.sh`: Python3 validate archive + tar extract an toàn, gọi deploy.sh dùng chung
- `scripts/test-seed.ts`: SQLite/migrations tạm, random/password preserve/explicit/optional demo; test-deploy-config kiểm archive bằng dữ liệu giả. .gitattributes LF mọi scripts/*.sh
- `playwright.config.ts`, `tests/acceptance/prd.spec.ts`: 17 test (10 PRD + hồi quy + DB trống/tạo/chuyển/xóa giải + approval mode), server prod và SQLite tạm; static import để tương thích Node20
- `scripts/test-migration.ts`: migrate DB tạm tới schema cũ, tạo dữ liệu SQL, migrate mới, assert giữ match/audit/default false, cascade xóa giải giữ User và FK sạch; chạy trong npm test
- `scripts/run-acceptance.ts`: runner SQLite tạm riêng trong Temp/opencode, migrations + 2 user test ngẫu nhiên, production server cổng trống, dọn DB/server sau test; `npm run test:acceptance` build trước
- `test-results/`, `playwright-report/`: báo cáo sinh tự động, gitignore và ESLint ignore; không public vì có thể chứa session test
- `.claude/launch.json`: cấu hình `npm run dev` cổng 3000 cho preview
- `memory/`: ghi nhớ dự án

## Quy ước
- Quy tắc nghiệp vụ chính ở `CLAUDE.md` (role, 5 trạng thái, loại kết quả, Swiss-Manager, AuditLog)
- Thay đổi Match + AuditLog luôn trong cùng transaction
- Thời gian lưu UTC, hiển thị theo `Asia/Ho_Chi_Minh`
- UI tiếng Việt, màn hình trọng tài ghi mobile-first
