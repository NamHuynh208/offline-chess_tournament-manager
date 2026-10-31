# USCC Tournament Manager
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
- Admin: quản trị tài khoản, đồng thời có đầy đủ quyền điều hành giải.
- Trọng tài kỹ thuật: cấu hình giải, nhập bốc thăm, xử lý ngoại lệ, duyệt, xuất kết quả và mở máy chiếu.
- Trọng tài ghi kết quả: dùng điện thoại tìm bàn, nhập tỷ số và đưa máy cho kỳ thủ xác nhận tuần tự, có hàng đợi offline.
- Khán giả xem màn hình tại hội trường; không có tài khoản hoặc đường dẫn công khai tự truy cập.

## Product Purpose
Ghi nhận và công bố kết quả giải cờ vua, kết nối quy trình Swiss-Manager; ưu tiên đúng kết quả, đúng bàn và thao tác rõ ràng.

## Operating Context
- Web Next.js/React, SQLite/Prisma, Ubuntu/PM2/Nginx. Giao diện tiếng Việt.
- Điện thoại tại bàn đấu và máy chiếu ở hội trường sáng, vòng thường 40+ bàn.
- Theo xác nhận ngày 2026-10-31: mặc định máy chiếu ưu tiên hiện toàn bộ 40 bàn một trang; vẫn giữ tùy chọn số cột/trang/cỡ chữ/cuộn/tự lật.

## Capabilities and Constraints
- Không bỏ các chức năng đã có khi thiết kế lại: quản lý giải/user, nhập preview/commit, 5 trạng thái kết quả, xác nhận/offline, ngoại lệ/duyệt kỹ thuật, audit, xuất XML/Excel.
- Chỉ OFFICIAL được hiện tỷ số trên projector; điểm chỉ có khi nhập từ dữ liệu đầu vòng, không tự tính xếp hạng.
- Không thay schema/API hoặc cơ chế phân quyền trong đợt thiết kế lại này.
- Tra cứu theo tên không dấu và số bàn; STT cần phân biệt rõ khi cùng là số.

## Brand Commitments
- Người dùng yêu cầu phong cách Apple: nền sáng, font system Apple có tiếng Việt, ít bo góc, không viền đen, phân cấp rõ và không trang trí lấn dữ liệu.
- Giữ logo/màu nhận diện từng giải do người dùng cấu hình, màu trạng thái không thay thế mô tả chữ.

## Evidence on Hand
- CLAUDE.md, memory/, các mẫu Swiss-Manager trong samples/, bộ kiểm thử acceptance và source hiện hành.
- Không có logo/ảnh thương hiệu USCC được cung cấp riêng; không tạo logo giả thay logo giải.

## Product Principles
- Không công bố kết quả chưa chốt.
- Không đổi dữ liệu hoặc bỏ bước kiểm tra an toàn để đổi diện mạo.
- Máy chiếu dùng diện tích cho tên và tỷ số; điện thoại ưu tiên tìm/ghi đúng bàn.
- Giữ focus bàn phím, tương phản và vùng chạm khi thu gọn giao diện.
