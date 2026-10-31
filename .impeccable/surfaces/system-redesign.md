# USCC system redesign

Mode: Operate. Scope: /login, /technical, /technical/users, /record, result confirmation, /projector.

## Direction contract

THESIS: Quy trình trọng tài phải rõ trước vẻ đẹp. Apple light do người dùng yêu cầu là hướng cố định, không dùng concept trang marketing. Máy chiếu mở ra là bảng toàn vòng 40 bàn, không phải một trang cài đặt.

OWN-WORLD: System Apple type, nền bạc #F5F5F7, nội dung trắng, chữ graphite, xanh hệ thống dùng cho hành động/chọn; màu giải chỉ dùng ở nhận diện và màu trạng thái có nghĩa. Góc nhỏ 2–4px, không viền đen; khoảng trắng thay khung lồng khung.

STORY: Admin/TTKT biết giải đang điều hành, điều gì cần xử lý, và tìm thấy cấu hình/import/export; trọng tài bàn tìm bàn bằng số/tên rồi xác nhận an toàn. Khán giả nhìn tên hai bên, số bàn và kết quả chính thức, không lẫn điểm đầu vòng với tỷ số.

FIRST VIEWPORT: Header thương hiệu/điều hướng gọn; thanh chọn giải và hành động bên dưới; dashboard đưa kết quả/ngoại lệ trước cấu hình. Record mobile có tên giải, bộ chọn vòng, tìm theo số/tên và thẻ bàn hai bên. Projector có tiêu đề cân đối, bảng 2 cột 40 bàn, tỷ số tabular không nền màu sặc sỡ; điều khiển riêng, có thể thu gọn.

FORM: Hướng Apple đã được người dùng ghim; ghi đè các đề xuất catalog không phù hợp. seed:ae58315c0775c2f6. Code-led Operate. Cố định các chức năng/API/phân quyền; sửa tra cứu riêng tại helper dùng chung test.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Decisions
- Người dùng chọn mặc định xem toàn bộ 40 bàn một trang, 2 cột; vẫn điều chỉnh số trang/cột/cỡ/tỉ lệ/cuộn.
- Không dùng imagery/raster trang trí trong app. Screenshot chỉ là bằng chứng test, không ship như asset.
- UI UX Pro Max: style Minimalism/Swiss phù hợp, bố cục hero/CTA không phù hợp Operate; product search không có kết quả. API handlers hiện có giữ nguyên, không đổi thành Server Actions theo gợi ý Next16 không phù hợp stack Next15 hiện tại.
