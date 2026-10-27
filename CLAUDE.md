# USCC Tournament Manager — Web cho Trọng tài

Web app để Trọng tài cập nhật kết quả giải cờ vua USCC, tích hợp Swiss-Manager. Nguồn yêu cầu: PRD Lite v0.3.

## Stack

- Next.js 15 (App Router, `src/`) + TypeScript + TailwindCSS v4
- Prisma 6 — SQLite khi dev (`prisma/dev.db`), PostgreSQL khi triển khai (đổi `provider` + `DATABASE_URL`, tạo lại migration)
- Xác thực: `iron-session` (cookie mã hóa) + `bcryptjs` để hash mật khẩu
- `xlsx` (đọc .xls bốc thăm, xuất .xlsx), `fast-xml-parser` (đọc/ghi XML Swiss-Manager), `lucide-react` (icon)
- Lệnh: `npm run dev`, `npm run db:migrate`, `npm run db:seed`. Biến môi trường mẫu ở `.env.example`.
- Ngôn ngữ giao diện: tiếng Việt. Màn hình Trọng tài ghi kết quả phải tối ưu cho điện thoại (mobile-first).

## 1. Phân quyền

- Chỉ Trọng tài được cấp tài khoản mới vào được web. **Kỳ thủ và khán giả KHÔNG có tài khoản**, không tự mở web.
  Không có trang đăng ký; tài khoản do Trọng tài kỹ thuật tạo (hoặc seed).
- Mọi route (trừ trang đăng nhập và màn hình trình chiếu công khai nếu có) phải kiểm tra session + role ở server
  (Server Action / Route Handler), không chỉ ẩn nút ở client.
- `TECHNICAL_ARBITER` (Trọng tài kỹ thuật): toàn quyền
  - tạo/cấu hình giải: tên, thời gian, địa điểm, số vòng, đơn vị tổ chức, logo, màu nhận diện;
  - nhập file danh sách kỳ thủ / file bốc thăm;
  - duyệt, sửa kết quả; xử lý ngoại lệ (bất đồng, duyệt không cần xác nhận, mở lại);
  - mở màn hình trình chiếu; xuất file kết quả.
- `RECORDING_ARBITER` (Trọng tài ghi kết quả):
  - tra cứu ván đấu trên điện thoại theo vòng / bàn / tên / mã kỳ thủ;
  - nhập tỷ số, rồi đưa điện thoại của mình cho 2 kỳ thủ xác nhận **lần lượt** (Trắng rồi Đen, hoặc ngược lại).
  - Không được duyệt ngoại lệ, sửa kết quả đã OFFICIAL, hay mở lại.

## 2. Vòng đời kết quả (`Match.status`) — 5 trạng thái bắt buộc

| Trạng thái | Ý nghĩa |
|---|---|
| `PENDING_RESULT` | Chưa có kết quả |
| `AWAITING_CONFIRMATION` | Trọng tài đã nhập; lưu riêng Trắng đã xác nhận chưa (`whiteConfirmedAt`), Đen đã xác nhận chưa (`blackConfirmedAt`) |
| `DISPUTED` | 1 trong 2 kỳ thủ bấm "Không đồng ý" → chuyển Trọng tài kỹ thuật xử lý; **không** công bố lên màn hình chiếu |
| `OFFICIAL` | Cả 2 kỳ thủ đã xác nhận trên máy trọng tài **HOẶC** Trọng tài kỹ thuật duyệt ngoại lệ. Chỉ trạng thái này lên màn hình trình chiếu và vào file xuất (mặc định) |
| `REOPENED` | TTKT mở lại kết quả đã chốt để sửa; phải lưu lịch sử, rồi yêu cầu xác nhận lại hoặc duyệt ngoại lệ |

Chuyển trạng thái hợp lệ:
- `PENDING_RESULT` → `AWAITING_CONFIRMATION` (nhập tỷ số; reset cả 2 xác nhận)
- `AWAITING_CONFIRMATION` → `OFFICIAL` (bên thứ 2 xác nhận) | `DISPUTED` (một bên không đồng ý)
- `DISPUTED` → `AWAITING_CONFIRMATION` (TTKT sửa, cần xác nhận lại) | `OFFICIAL` (TTKT duyệt ngoại lệ)
- `OFFICIAL` → `REOPENED` (chỉ TTKT, bắt buộc lý do)
- `REOPENED` → `AWAITING_CONFIRMATION` | `OFFICIAL` (duyệt ngoại lệ)
- Sửa tỷ số ở bất kỳ bước nào phải xóa xác nhận cũ của cả 2 bên.
- Tùy chọn `Tournament.requireTechnicalApproval` mặc định false giữ PRD. Nếu true, đủ xác nhận vẫn AWAITING_CONFIRMATION, TTKT dùng APPROVE_PUBLICATION (kiểm đủ xác nhận) mới OFFICIAL; duyệt ngoại lệ/BYE nhập bởi TTKT vẫn OFFICIAL. Không thêm trạng thái thứ 6.

## 3. Loại kết quả (`Match.result`) — không gộp chung

| Enum | Mã Swiss-Manager | Ý nghĩa |
|---|---|---|
| `WHITE_WIN` | `1-0` | Trắng thắng |
| `BLACK_WIN` | `0-1` | Đen thắng |
| `DRAW` | `1/2` | Hòa |
| `WHITE_FORFEIT` | `0-1F` | Trắng bị xử thua / bỏ cuộc |
| `BLACK_FORFEIT` | `1-0F` | Đen bị xử thua / bỏ cuộc |
| `DOUBLE_FORFEIT` | `0-0F` | Xử thua cả hai / vắng mặt |
| `BYE` | `BYE` | Miễn đấu (`blackPlayerId = null`) |

## 4. Tích hợp Swiss-Manager (mẫu ở `samples/`)

- **Đầu vào 1 — danh sách kỳ thủ (tùy chọn, đầu giải):** XML
  `<Players><Player PlayerUniqueId="..." Lastname="..." Firstname="..." Club="..." Federation="..." /></Players>`.
  `PlayerUniqueId` → `Player.uniqueId`. **Không phải** số STT/SNo.
- **Đầu vào 2 — bốc thăm mỗi vòng:** file `.xls` xuất từ Swiss-Manager.
  - Tìm dòng tiêu đề chứa đúng `['Bàn', 'STT', 'White', 'Điểm', 'KQ', 'Điểm', 'Black', 'STT']`; bỏ các dòng thông tin giải phía trên
    (số vòng nằm ở dòng dạng `"Ván 2 "`), bỏ dòng trống và 2 dòng bản quyền Swiss-Manager ở cuối.
  - Cột `STT` bên trái = `PlayerWhiteSNo`, cột `STT` bên phải = `PlayerBlackSNo` → lưu vào `Player.startNo`.
  - Tên trong .xls dạng `"Họ Tên"` (= `Lastname + " " + Firstname` của XML) → dùng để khớp với danh sách XML nếu đã nhập.
- **Đầu ra 1 — import lại Swiss-Manager:** XML UTF-8
  `<?xml version="1.0" encoding="UTF-8"?><Results><Result Round="X" PlayerWhiteSNo="Y" PlayerBlackSNo="Z" Res="..." /></Results>`,
  `Res` lấy theo bảng mã ở mục 3. Chỉ xuất ván `OFFICIAL`.
- **Đầu ra 2 — FR-09:** file `.xlsx` kết quả 1 vòng hoặc toàn giải. Mặc định chỉ `OFFICIAL`; có tùy chọn kèm danh sách
  đang chờ / bất đồng để đối soát.

## 5. Audit Log

- Mọi thao tác xác nhận tại bàn, nhập/sửa kết quả, bất đồng, duyệt ngoại lệ, mở lại **phải** ghi 1 dòng `AuditLog`
  trong **cùng transaction** (`prisma.$transaction`) với thay đổi `Match`.
- Trường: `matchId`, `userId` (trọng tài đang đăng nhập — kể cả khi kỳ thủ bấm xác nhận trên máy của họ), `action`,
   `oldValue`, `newValue` (JSON snapshot `{status, result, whiteConfirmedAt, blackConfirmedAt}`), `reason`, `createdAt`.
- Log mới luôn lưu `tournamentId`, `roundNumber`, `board` độc lập; API toàn giải không phụ thuộc `matchId` (có thể null sau re-import). Các cột nullable chỉ để giữ nguyên log mồ côi trước migration.
- `reason` bắt buộc với `APPROVE_EXCEPTION`, `EDIT_RESULT` (khi đã OFFICIAL), `REOPEN`.
- `APPROVE_PUBLICATION` là duyệt bàn đã đủ xác nhận, không phải ngoại lệ, không bắt lý do; luôn audit cùng transaction. Bulk UI duyệt từng bàn có kiểm expectedUpdatedAt, dừng và báo phần đã xong nếu xung đột.
- `createdAt` lưu UTC trong DB; luôn hiển thị/xuất theo múi giờ giải `Asia/Ho_Chi_Minh` (`Tournament.timezone`),
  dùng `Intl.DateTimeFormat(..., { timeZone })`.

## Quy ước code

- Logic nghiệp vụ (chuyển trạng thái, map mã kết quả, parse/xuất file) đặt ở `src/lib/`, có test nhỏ cho parser và state machine.
  Parser/exporter thuần ở `src/lib/swiss-manager.ts`; `npm test` chạy `scripts/test-samples.ts` trên `samples/` — phải luôn PASS.
- Route handler: đầu hàm gọi `requireUser(role?)` từ `src/lib/session.ts`.
- Chuyển trạng thái ván chỉ qua `applyAction` trong `src/lib/match-state.ts` (dùng chung server + điện thoại); thêm thao tác mới thì thêm vào đây + test ở `scripts/test-match-state.ts`.
- Thao tác từ điện thoại luôn qua hàng đợi offline và mang `opId` (idempotent qua `AuditLog.clientOpId`) + `expectedVersion` lấy từ `Match.resultVersion`. Nhập/sửa/hủy/mở lại tăng version, xác nhận không tăng; sai/thiếu version trả 409 và bắt buộc kiểm tra/xác nhận lại.
- Nhập file luôn 2 bước: `mode=preview` (mặc định) rồi `mode=commit` kèm `previewToken`; ghi đè dữ liệu cần `confirmOverwrite=true`. Token HMAC ràng buộc nội dung + snapshot toàn giải; transaction Serializable kiểm snapshot lần nữa trước khi ghi; dữ liệu đổi trả 409 yêu cầu Preview lại.
- `src/lib/colors.ts`: chữ đen/trắng trên nền nhận diện theo WCAG >= 4.5:1; không dùng màu giải làm chữ trên nền cố định (có thể không đọc được).
- `xlsx` cài từ `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, không cài bản trên npm registry (có lỗ hổng).
- Không lưu mật khẩu/secret vào code hay memory; dùng `.env`.
- Node >=20.20.2: ghim iron-session 8.0.4 (cookie 0.7.x), không nâng v9 nếu còn hỗ trợ Node20.
- Seed thiếu password sinh ngẫu nhiên cho tài khoản mới, cảnh báo console; tài khoản có sẵn giữ nguyên nếu không truyền password. SEED_DEFAULT_TOURNAMENT=true tạo mẫu idempotent, mặc định không tạo.
- `npm run package:deploy` dùng danh sách source cho phép + tar/filter/verify, không đưa DB/.env vào gói; redeploy-server.sh kiểm archive trước extract và gọi deploy.sh giữ DB/backup, không reset/seed tự động.
- Xóa giải chỉ TTKT qua DELETE /api/tournaments/[id] với confirmName chính xác. FK cascade xóa vòng/bàn/kỳ thủ/import/audit theo giải, kể cả log có matchId=null; không xóa User hay giải khác. Re-import vẫn giữ audit SetNull.

## Project Memory Guidelines

- Trước khi bắt đầu nhiệm vụ: Đọc `memory/activeContext.md` và `memory/progress.md`.
- Sau khi hoàn thành hoặc đổi hướng triển khai: Cập nhật lại `memory/activeContext.md` và `memory/progress.md`.
- Khi cấu trúc dự án, stack hoặc quy ước code thay đổi: Cập nhật `memory/architecture.md`.
