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
- `tests/acceptance/prd.spec.ts`: 19 test (10 tiêu chí PRD + hồi quy): quản lý tài khoản, DB trống/tạo/chuyển/xóa, duyệt công bố, export UI thật, offline/audit, projector Light 40–43 bàn và lưu cấu hình. Không skip/expected failure.
- Tiêu chí 6 đo thời gian từ lúc bắt đầu xác nhận đến khi DOM projector có tỷ số, không reload; kèm kiểm tra Dashboard, phân quyền, mất mạng, đồng bộ lại, phân trang/carousel.
- XML được so sánh từng byte qua HTTP. File XLS hiện tại ghi vòng 1; dataset các test thường dùng override vòng 2, riêng test XML dùng vòng 1. Không chỉnh sửa file mẫu kỳ vọng.
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
- Migration `20261028010000_tournament_approval_cascade`: cờ `Tournament.requireTechnicalApproval` mặc định false; FK cascade AuditLog → Tournament và Match → Player để xóa giải sạch, giữ liên kết AuditLog → Match dạng SetNull cho re-import. Unit test nâng cấp DB cũ có dữ liệu kiểm không mất kết quả/log, mặc định false và xóa đúng phạm vi.
- `DELETE /api/tournaments/[id]` chỉ TTKT: JSON `{ "confirmName": "Tên giải chính xác" }`. Xóa vĩnh viễn kỳ thủ/vòng/bàn/import/audit thuộc giải; giữ tài khoản và các giải khác. Trên UI phải nhập đúng tên giải, có nút Hủy; sau xóa tự chọn giải còn lại hoặc về màn hình tạo đầu tiên. Backup trước khi xóa nếu cần lưu lịch sử.

## Quản lý giải và duyệt công bố

- Header `/technical`: chọn giải, **+ Tạo giải mới**, **Cấu hình / Sửa giải** (đưa tới form chỉnh sửa ngay trong trang), **Xoá giải đấu**. Empty state có nút tạo giải đầu tiên. Không cần curl để tạo/chỉnh/xóa giải.
- Khu vực **Xuất kết quả**: chọn Vòng để xuất XML Swiss-Manager theo vòng; chọn Toàn giải sẽ có nút XML riêng cho từng vòng. Excel xuất theo cùng phạm vi, mặc định chỉ OFFICIAL; tùy chọn đối soát thêm sheet Chờ xác nhận/Có bất đồng. Phạm vi xuất không phụ thuộc tab Cần xử lý/Tất cả/Lịch sử; XML luôn chỉ OFFICIAL theo quy tắc exporter hiện có.
- Trong form tạo/sửa, tùy chọn **Trọng tài kỹ thuật duyệt trước khi lên máy chiếu** mặc định **tắt**: đủ xác nhận thì OFFICIAL ngay theo PRD.
- Khi bật, cả hai xác nhận xong vẫn `AWAITING_CONFIRMATION`, không có tỷ số trên Projector/export XML chính thức. Điện thoại báo chờ TTKT; Dashboard đưa bàn vào **Cần xử lý**, có **Duyệt công bố** hoặc **Duyệt nhanh tất cả bàn đã đủ xác nhận**.
- Duyệt công bố chỉ TTKT, chỉ bàn đủ xác nhận và chưa bất đồng; dùng expectedUpdatedAt, ghi action `APPROVE_PUBLICATION` cùng transaction. Duyệt nhanh chỉ xử lý danh sách đã đủ xác nhận lúc bấm, từng bàn có audit; nếu có xung đột/lỗi mạng thì dừng và báo số đã duyệt, không ghi đè kết quả mới.
- Duyệt ngoại lệ vẫn cần lý do và thành OFFICIAL ngay; BYE nhập từ bốc thăm là ngoại lệ TTKT nên giữ chính thức, không giả xác nhận Đen. Đổi tùy chọn không thu hồi OFFICIAL cũ, không tự công bố bàn đang chờ; các bàn đã đủ xác nhận có thể duyệt từ Dashboard kể cả sau khi tắt cờ.
- Sau cập nhật, tải lại web ở các máy trọng tài để lấy cấu hình/giao diện mới. Server luôn đọc cờ thật từ DB, không tin cờ từ điện thoại/offline; kiểm lại phiên bản cấu hình trong transaction.

## Getting Started

### Quản lý tài khoản trọng tài

- TTKT mở **Quản lý tài khoản** trên Header `/technical` hoặc `/technical/users`: tìm kiếm, tạo tài khoản TTKT/Arbiter, sửa họ tên/vai trò, khóa/mở và đặt lại mật khẩu (cả tài khoản của chính mình).
- Tên đăng nhập mới được chuẩn hóa chữ thường, 3–40 ký tự `a-z`, `0-9`, `.`, `_`, `-`; không đổi tên đăng nhập đã tạo để tránh nhầm định danh. Mật khẩu mới tối thiểu 12 ký tự, tối đa 72 byte UTF-8; nhập lại xác nhận. Để trống hai ô khi sửa để giữ mật khẩu cũ.
- Mỗi thao tác lưu yêu cầu **mật khẩu hiện tại của TTKT đang đăng nhập**, không phải mật khẩu của người được chỉnh sửa. Server kiểm role/phiên lại trong transaction, chống ghi đè phiên bản cũ và chặn khóa/hạ quyền TTKT hoạt động cuối cùng.
- Không xóa tài khoản: khóa để ngừng truy cập nhưng giữ AuditLog/kết quả đã nhập. Mỗi thay đổi tăng `User.sessionVersion`, thu hồi cookie cũ ngay ở request tiếp theo; mở khóa không hồi sinh phiên cũ. Sửa tài khoản chính mình sẽ chuyển về đăng nhập. Seed đổi mật khẩu bằng env cũng thu hồi phiên.
- Migration `20261028020000_user_session_version` thêm phiên bản mặc định 0, không xóa user/mật khẩu/dữ liệu giải. Sau triển khai tất cả cookie cũ chưa có version phải đăng nhập lại một lần. Kiểm tra/đồng bộ hàng đợi offline trước khi đổi quyền/mật khẩu trong giờ thi đấu.
- API `GET/POST /api/users`, `PATCH /api/users/[id]` chỉ TTKT; không có đăng ký công khai. Chỉ trả trường công khai, không trả passwordHash. Audit `CREATE_USER/UPDATE_USER/CHANGE_PASSWORD` lưu tài khoản TTKT thao tác và snapshot tài khoản đích, tuyệt đối không lưu mật khẩu/hash. Đưa mật khẩu mới cho trọng tài qua kênh riêng; giao diện không cho xem lại mật khẩu.

### Giao diện và trình chiếu

- Toàn hệ thống dùng font stack Apple/system, font smoothing và tracking -0.011em. SF Pro không được tải/cài kèm; máy không có dùng font fallback sẵn có. Card/nút/input/modal bo nhẹ 2–4px; chỉ ký hiệu quân Trắng/Đen giữ hình tròn để nhận diện.
- Projector nền trắng/xám nhạt, chữ tối, điểm nhấn màu giải và tỷ số có chữ đen/trắng theo tương phản. Khung 100dvh không cuộn trang, lưới tự chia đều chiều cao và thu cỡ chữ theo số dòng/cột; tên dài tối đa 2 dòng và có tooltip tên đầy đủ.
- Thanh điều khiển có nút Ẩn/Hiện: ratio Auto/16:9/16:10/4:3 (fit vào vùng trình chiếu còn lại, không kéo méo/cắt), scale 75–125%, chia theo 1–4 trang hoặc 10/16/20/24/30/40 bàn/trang, 1–4 cột, trang cố định hoặc tự lật sau 5/10/15/20 giây, Fullscreen API/F11.
- Cấu hình lưu theo giải trong localStorage, gồm vòng/trang/cỡ hiển thị/ẩn điều khiển. Chọn trang cố định tắt auto; khi bớt bàn thì trang hiện tại được giới hạn lại. Storage sai được kiểm tra/fallback, storage bị chặn thì vẫn dùng phiên hiện tại.
- Mặc định 20 bàn/trang, 2 cột, tự lật 10 giây. Chế độ vừa khít ưu tiên hiện đủ mọi bàn nên rất nhiều bàn/cột trên màn hình nhỏ sẽ giảm chữ; chọn ít bàn hơn hoặc bật **Cho phép cuộn dọc (giữ chữ lớn)** để giữ cỡ chữ. Dữ liệu/điểm/kết quả OFFICIAL và quyền TTKT giữ nguyên.

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

- Node.js **>=20.20.2**, hỗ trợ Node 20/22; khuyến nghị bản LTS còn được hỗ trợ bảo mật khi mở Internet. Dùng tài khoản deploy thường, không chạy ứng dụng bằng root. `iron-session` ghim **8.0.4** (`cookie` 0.7.x), không còn yêu cầu Node >=22 của bản 9.
- DNS A (và AAAA nếu dùng IPv6) của `giaidau.namprojects.site` trỏ về server; mở firewall cổng 80/443, không mở 3005.
- Cài công cụ:

```bash
sudo apt update
sudo apt install -y nginx sqlite3 curl git python3 certbot python3-certbot-nginx
npm install -g pm2
```

Clone repo vào ví dụ `/srv/giaidau/app` (tài khoản deploy có quyền ghi thư mục). Nếu dùng file nén thay vì Git, không đóng gói `.env`, `node_modules`, `.next`, DB, báo cáo test hoặc `.git`; cài dependency và build trực tiếp trên Ubuntu.

### 2. Cấu hình riêng trên server

Tạo thư mục dữ liệu nằm **ngoài repo**, ví dụ `/srv/giaidau/data`, thuộc tài khoản deploy. Tạo `/srv/giaidau/app/.env`:

```dotenv
DATABASE_URL="file:/srv/giaidau/data/production.db"
SESSION_SECRET="THAY_BANG_CHUOI_NGAU_NHIEN_IT_NHAT_32_KY_TU"
NODE_ENV="production"
TZ="Asia/Ho_Chi_Minh"
SEED_ADMIN_PASSWORD=""
SEED_ARBITER_PASSWORD=""
SEED_DEFAULT_TOURNAMENT="false"
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

Lần đầu, đặt mật khẩu mạnh cho `SEED_ADMIN_PASSWORD` và `SEED_ARBITER_PASSWORD` trong `.env`, chạy `npm run db:seed` một lần từ thư mục app. Nếu thiếu/để trống, seed **không dừng**: tài khoản mới nhận mật khẩu ngẫu nhiên riêng (in kèm cảnh báo trên console; giữ kín log này), tài khoản có sẵn được giữ nguyên mật khẩu/quyền. Nếu truyền mật khẩu rõ ràng rồi seed lại, mật khẩu tài khoản tương ứng được cập nhật. Không có mật khẩu cố định dùng chung.

`SEED_DEFAULT_TOURNAMENT="true"` tạo một giải mẫu 7 vòng, không tạo trùng khi chạy lại. Mặc định không tạo mẫu; TTKT có thể dùng **Tạo giải đấu đầu tiên / + Tạo giải mới** ngay tại `/technical`, tự chuyển sang giải mới để nhập bốc thăm. Dropdown ở `/record` ưu tiên giải mới nhất đang diễn ra (ngày bắt đầu/kết thúc nếu có), fallback giải mới nhất nếu không có giải phù hợp.

PM2 chạy **một fork**, Next bind `127.0.0.1:3005`. Biến production không nhạy cảm nằm trong `ecosystem.config.js`; secret/DB nạp từ `.env` bởi deploy. Xem log: `pm2 logs uscc-giaidau --lines 100`. Thiết lập tự chạy sau reboot bằng `pm2 startup`, thực hiện đúng lệnh sudo PM2 in ra, rồi `pm2 save` bằng cùng tài khoản deploy. PM2 có thể lưu môi trường trong `~/.pm2/dump.pm2`; bảo vệ thư mục này và không đưa lên Git.

Schema hiện là **SQLite**. Không chỉ đổi DATABASE_URL sang PostgreSQL: cần đổi provider, chuẩn bị/test migrations PostgreSQL riêng trước. Khuyến nghị DB ngoài thư mục checkout. Nếu server đã dùng `DATABASE_URL="file:./prod.db"`, giữ nguyên: Prisma hiểu là `prisma/prod.db`, script deploy giải đúng đường dẫn để backup, không đổi sang DB mới/rỗng.

### Cập nhật bằng file nén, giữ nguyên DB server

Trên máy phát triển:
```bash
npm run package:deploy
scp giaidau-deploy.tar.gz USER@VM_IP:/tmp/giaidau-deploy.tar.gz
```

Script đóng gói dùng tar đa nền tảng, danh sách source cho phép và kiểm lại archive trước khi hoàn tất; không chứa `.env` thật, `*.db`/journal/WAL/SHM, backups, dependencies, build, Git hay báo cáo test. `prod.db` trên server không nằm trong gói và không bị ghi đè khi giải nén. Có dependency dev `tar` để chạy lệnh này trên cả Windows/Ubuntu.

Trên server đã có app/script:
```bash
cd /srv/giaidau/app
bash scripts/redeploy-server.sh /tmp/giaidau-deploy.tar.gz
```

Nếu server cũ chưa có script này, chép riêng `scripts/redeploy-server.sh` mới vào thư mục scripts trước. Script kiểm tra archive bằng Python3 (chặn DB/secret, traversal và symlink), dừng PM2 rồi `tar -xzvf`; gọi `deploy.sh` dùng chung chuỗi `npm ci`, Prisma generate/migrate deploy, build, PM2 reload/start, healthcheck. Không xóa/reset/seed DB, không ghi đè `.env`; backup SQLite trước migration. Có downtime như deploy Git, không tự rollback khi thất bại.

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
