> Cập nhật: 2026-10-27

## Đã xong
- [x] CLAUDE.md với quy tắc PRD Lite v0.3
- [x] Scaffold Next.js 15 + TS + Tailwind v4, deps, Prisma 6 + SQLite
- [x] Schema: User, Tournament, Player, Round, Match, AuditLog, ImportLog; migrations `init`, `import_log`; seed `admin`, `arbiter1`
- [x] Đăng nhập/đăng xuất API (`/api/auth/login|logout`), `requireUser(role)` cho route handler
- [x] FR-01: `GET/POST /api/tournaments`, `GET/PATCH /api/tournaments/[id]`
- [x] FR-02: `POST /api/tournaments/[id]/import/players` và `/import/pairing` (preview/commit, mapping cột, cảnh báo ghi đè), `GET /imports` (lịch sử)
- [x] FR-09: `GET /api/tournaments/[id]/rounds/[round]/export-xml`, `GET /api/tournaments/[id]/export-xlsx?round=&status=`
- [x] `npm test`: test-samples (8) + test-match-state/projector/contrast (11) — PASS
- [x] Trang `/login`, `/` -> `/record`
- [x] FR-03: `/record` tra cứu theo vòng, tìm bàn/tên (không dấu)/STT, lọc trạng thái; API `GET /api/tournaments/[id]/rounds/[round]/matches`
- [x] FR-04..06: nhập KQ -> trọng tài kiểm tra lại -> kiosk Trắng -> đưa máy -> Đen -> OFFICIAL/DISPUTED; yêu cầu duyệt ngoại lệ; API `POST /api/matches/[id]/actions`
- [x] Hàng đợi offline + "Thử đồng bộ lại" (đã thử trên trình duyệt: mất mạng, tải lại trang, bị từ chối)
- [x] Dashboard TTKT `/technical`: tab Cần xử lý toàn giải (DISPUTED / exceptionReason), lọc vòng, tất cả bàn và thống kê
- [x] API + UI TTKT: duyệt ngoại lệ, sửa (xác nhận lại / ngoại lệ ngay), hủy, REOPENED; lý do bắt buộc, chống sửa dữ liệu cũ, AuditLog cùng transaction
- [x] API `/api/tournaments/[id]/audit`: phân trang 50 dòng, lọc bàn; UI lịch sử từng bàn / toàn giải, snapshot trước/sau, người thao tác, thời gian theo timezone giải
- [x] Projector riêng chỉ TTKT: logo/tên/màu/vòng, 2 cột 20 bàn/trang, lật trang tự động bật/tắt và chỉnh giây, nút toàn màn hình; chỉ OFFICIAL có tỷ số; điểm nhập đầu vòng + ghi chú bắt buộc
- [x] FR-07: Dashboard/Projector polling 2 giây + trạng thái mạng/thời điểm đồng bộ cuối; projector không nhận tỷ số chưa chốt trong payload API
- [x] TypeScript, ESLint và production build PASS
- [x] Test nghiệm thu `npm run test:acceptance`: build + SQLite/migrations/user tạm + production server cổng ngẫu nhiên; 15 test Playwright, JSON/HTML/trace/screenshot khi lỗi; không đụng DB dev
- [x] Nghiệm thu đủ 10/10 PASS + 5 hồi quy PASS; projector cập nhật 2422ms localhost, XML byte-for-byte và Excel đối soát
- [x] Form cấu hình tên/thời gian theo timezone/địa điểm/số vòng/tổ chức/logo/màu; lưu state tức thời, reload, đồng bộ projector; WCAG contrast >=4.5:1
- [x] Phiên bản tỷ số xác nhận offline + 409 khi lệch/thiếu, không chốt tỷ số chưa nhìn thấy; audit độc lập giải/vòng/bàn sau re-import; HMAC Preview + kiểm snapshot trong transaction Serializable; export status own-key 400
- [x] Migration thêm resultVersion/audit context + backfill log còn liên kết; generate client, migrate deploy DB dev
- [x] UI nhập bốc thăm preview/lỗi/cảnh báo/checkbox ghi đè/commit + 409 bắt Preview lại, test Chromium
- [x] Ubuntu deploy: ecosystem.config.js (PM2 127.0.0.1:3005 production), nginx-giaidau.conf (domain, stream/WS/upload), deploy.sh (pull tùy chọn/lock/backup/migrate/build/reload/healthcheck)
- [x] README hướng dẫn .env production ngoài Git, SQLite ngoài repo, HTTPS Certbot, PM2 startup/save, downtime/backup và upload 5 MiB vs Nginx 20 MiB
- [x] Test assert deployment config trong npm test; .gitattributes LF cho shell/conf
- [x] Gói source `giaidau-deploy.tar.gz` chuyển VM, không chứa secret/DB/dependencies/build/report; VM cần tạo .env riêng rồi chạy deploy.sh
- [x] Repo GitHub private `NamHuynh208/uscc-tournament-manager`, nhánh master + origin HTTPS; loại .env/SQLite/report/cache/archive/.claude khỏi source push

## Tiếp theo
- [ ] Kiểm bash -n deploy.sh, nginx -t và deploy thật trên Ubuntu; bật HTTPS trước khi đăng nhập, hoàn thiện rate-limit/dependency audit trước public
- [ ] Màn hình TTKT: tạo giải mới, upload XML kỳ thủ, lịch sử nhập, nút xuất file (cấu hình + UI import bốc thăm đã xong)
- [ ] Kiểm thử máy chiếu thật/mạng LAN/tải đồng thời thực tế; Chromium tự động đã kiểm 40 bàn, mất mạng/kết nối lại, phân quyền và cập nhật không reload
- [ ] Xử lý dependency audit (Prisma/deepmerge-ts, Next/PostCSS) trước triển khai production
- [ ] Danh sách `/record` chưa polling (chỉ Dashboard/Projector tự làm mới); giữ nguyên hàng đợi offline hiện tại
- [ ] Quản lý tài khoản trọng tài (TTKT tạo tài khoản)
- [ ] Rate-limit đăng nhập trước khi đưa lên Internet
