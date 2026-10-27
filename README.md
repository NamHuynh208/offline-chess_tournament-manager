This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Kiểm thử nghiệm thu PRD — 10 tiêu chí

```bash
npm ci
npx playwright install chromium
npm test
npm run lint
npm run test:acceptance
```

- `test:acceptance` chạy `npm run build` trước, rồi production server ở cổng tạm, áp migrations vào SQLite tạm và tạo 2 tài khoản test với mật khẩu ngẫu nhiên. Không dùng/ghi dữ liệu giải trong DB dev.
- `tests/acceptance/prd.spec.ts`: 10 test PRD + 5 test hồi quy. Kiểm cả API và Chromium thật: tra đủ 80 phía kỳ thủ trên 40 bàn, UI import preview/lỗi/ghi đè, cấu hình đầy đủ, xác nhận offline qua reload, bảo toàn audit, chống import snapshot cũ trong transaction và trạng thái export không hợp lệ.
- Tiêu chí 6 đo thời gian từ lúc bắt đầu xác nhận đến khi DOM projector có tỷ số, không reload; kèm kiểm tra Dashboard, phân quyền, mất mạng, đồng bộ lại, phân trang/carousel.
- XML được so sánh từng byte qua HTTP. XLS mẫu là vòng 2 nhưng XML mẫu là vòng 1, nên test 9 dùng override vòng 1 khi nhập cùng file XLS; không chỉnh sửa file kỳ vọng.
- Kết quả: `test-results/acceptance.json`, `playwright-report/index.html`, log server và screenshot/trace khi thất bại. Xem bằng `npx playwright show-report`.
- Tiêu chí 10 dùng form thật trên `/technical`: tên, thời gian theo timezone giải, địa điểm, số vòng, tổ chức, URL logo, màu; lưu/reload và cập nhật projector đang mở không reload. Không skip/đánh dấu expected failure.
- Chạy lại toàn bộ suite bằng runner, không trỏ trực tiếp test vào server/DB đang dùng. DB tạm được xóa sau khi kết thúc; báo cáo có thể chứa dữ liệu test và cookie phiên test, không đưa công khai.

## Cập nhật DB và hợp đồng API

```bash
npx prisma migrate deploy
npx prisma generate
```

- Migration `20261027180000_result_version_audit_context` thêm `Match.resultVersion` và `AuditLog.tournamentId/roundNumber/board`, backfill log còn liên kết ván. Log đã mất `matchId` trước migration không thể suy luận chắc chắn giải cũ; giữ nguyên, không xóa hoặc tự gán sai giải.
- API thao tác tại bàn bắt buộc `expectedVersion` (lấy từ `match.resultVersion`) cho nhập/xác nhận/bất đồng/yêu cầu ngoại lệ. Nhập, sửa, hủy hoặc mở lại tăng version; xác nhận Trắng/Đen không tăng. Sai/thiếu version trả 409 với ván mới nhất. Hàng đợi offline cũ thiếu version bị từ chối an toàn, cần kiểm tra và xác nhận lại.
- Import XML kỳ thủ và XLS bốc thăm: gọi Preview, gửi lại `previewToken` cùng file/tham số khi Commit. Thiếu/sai token hoặc snapshot DB đổi trả 409 và yêu cầu Preview lại. Token HMAC gắn nội dung file và snapshot toàn giải; thay đổi ở vòng khác cũng yêu cầu Preview lại để ưu tiên an toàn dữ liệu.
- Thay đổi ván và AuditLog cùng transaction; import dùng transaction Serializable và kiểm snapshot trước khi ghi.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Triển khai Ubuntu — PM2 + Nginx

### 1. Chuẩn bị server

- Node.js **22 LTS**, npm, Git; dùng một tài khoản deploy thường, không chạy ứng dụng bằng root.
- DNS A (và AAAA nếu dùng IPv6) của `giaidau.namprojects.site` trỏ về server; mở firewall cổng 80/443, không mở 3005.
- Cài công cụ:

```bash
sudo apt update
sudo apt install -y nginx sqlite3 curl git certbot python3-certbot-nginx
npm install -g pm2
```

Clone repo vào ví dụ `/srv/giaidau/app` (tài khoản deploy có quyền ghi thư mục). Nếu dùng file nén thay vì Git, không đóng gói `.env`, `node_modules`, `.next`, DB, báo cáo test hoặc `.git`; cài dependency và build trực tiếp trên Ubuntu.

### 2. Cấu hình riêng trên server

Tạo thư mục dữ liệu nằm **ngoài repo**, ví dụ `/srv/giaidau/data`, thuộc tài khoản deploy. Tạo `/srv/giaidau/app/.env`:

```dotenv
DATABASE_URL="file:/srv/giaidau/data/production.db"
SESSION_SECRET="THAY_BANG_CHUOI_NGAU_NHIEN_IT_NHAT_32_KY_TU"
```

Sinh secret bằng `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`, thay placeholder rồi `chmod 600 .env`. Không commit `.env`, không dùng mật khẩu mẫu. Giữ secret ổn định qua các lần deploy để không làm hết hạn toàn bộ phiên.

Script dùng duy nhất `.env`; không để thêm `.env.local`, `.env.production` hoặc `.env.production.local` vì Prisma CLI/Next có thể đọc cấu hình khác nhau. Không export biến DATABASE_URL/SESSION_SECRET cũ trong shell khi deploy (biến môi trường có ưu tiên hơn file).

### 3. Deploy

```bash
cd /srv/giaidau/app
bash -n deploy.sh
bash deploy.sh
# Những lần sau, nếu repo sạch và có upstream:
bash deploy.sh --pull
```

`deploy.sh` khóa chống deploy đồng thời, tùy chọn `git pull --ff-only`, kiểm tra env, dừng process hiện tại, backup SQLite bằng `.backup`, chạy `npm ci --include=dev`, `prisma generate`, `prisma migrate deploy`, `npm run build`, rồi `pm2 startOrReload ... --env production --update-env`. Cuối cùng kiểm `/login` và `pm2 save`. Không seed lại tài khoản tự động và không tự rollback DB khi lỗi.

**Có downtime trong lúc cài/build**: đây là deploy tại chỗ an toàn cho một process SQLite, không phải zero-downtime. Chạy ngoài giờ thi đấu; nếu lỗi sau khi đã dừng, ứng dụng giữ trạng thái dừng để bạn xử lý, không tự chạy code/schema không tương thích. Backup nằm ở `/srv/giaidau/data/backups`; cần chính sách giữ bản sao/off-server riêng, script không tự xóa backup.

Lần đầu, đặt mật khẩu mạnh cho `SEED_ADMIN_PASSWORD` và `SEED_ARBITER_PASSWORD` trong `.env`, chạy `npm run db:seed` một lần từ thư mục app, sau đó bỏ hai biến khỏi `.env`. Seed chạy lại sẽ đổi mật khẩu tài khoản tương ứng.

PM2 chạy **một fork**, Next bind `127.0.0.1:3005`. Biến production không nhạy cảm nằm trong `ecosystem.config.js`; secret/DB nạp từ `.env` bởi deploy. Xem log: `pm2 logs uscc-giaidau --lines 100`. Thiết lập tự chạy sau reboot bằng `pm2 startup`, thực hiện đúng lệnh sudo PM2 in ra, rồi `pm2 save` bằng cùng tài khoản deploy. PM2 có thể lưu môi trường trong `~/.pm2/dump.pm2`; bảo vệ thư mục này và không đưa lên Git.

Schema hiện là **SQLite**. Không chỉ đổi DATABASE_URL sang PostgreSQL: cần đổi provider, chuẩn bị/test migrations PostgreSQL riêng trước. Không đặt DB production trong `prisma/dev.db` hoặc thư mục checkout.

### 4. Nginx và HTTPS

```bash
sudo cp nginx-giaidau.conf /etc/nginx/sites-available/giaidau.namprojects.site
sudo ln -s /etc/nginx/sites-available/giaidau.namprojects.site /etc/nginx/sites-enabled/giaidau.namprojects.site
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d giaidau.namprojects.site --redirect
sudo nginx -t
sudo systemctl reload nginx
```

Lệnh tạo symlink chỉ cần chạy lần đầu. File cấu hình chứa `map`, phải include ở cấp `http {}` (đúng với `sites-enabled` Ubuntu mặc định), không dán vào trong một `server {}` khác. Certbot bổ sung chứng chỉ HTTPS và chuyển HTTP sang HTTPS. **Phải bật HTTPS trước khi đăng nhập production** vì session cookie có cờ `Secure`.

Cấu hình có `client_max_body_size 20M`, `proxy_buffering off`, `proxy_read_timeout 86400s`, HTTP/1.1 và Upgrade header cho WebSocket. Không cache/gzip response proxy để hỗ trợ stream SSE. Timeout là thời gian không nhận dữ liệu, không đảm bảo kết nối vĩnh viễn; SSE/WebSocket tương lai vẫn cần heartbeat/reconnect và kiểm tra timeout của CDN/load balancer nếu có. Ứng dụng hiện dùng **polling 2 giây**, cấu hình proxy không tự thêm endpoint SSE/WebSocket.

**Giới hạn file ứng dụng vẫn là 5 MiB** trong `src/lib/imports.ts`; Nginx cho request body tối đa 20 MiB không làm ứng dụng chấp nhận file 20 MiB.

Kiểm tra sau triển khai:

```bash
curl -I http://127.0.0.1:3005/login
curl -I https://giaidau.namprojects.site/login
pm2 status
sudo certbot renew --dry-run
```

Trước khi mở Internet, xử lý rate-limit đăng nhập và các cảnh báo dependency đã ghi trong memory. Khi đổi schema/API xác nhận, yêu cầu trọng tài tải lại web, kiểm tra hàng đợi offline trước giờ thi đấu.
