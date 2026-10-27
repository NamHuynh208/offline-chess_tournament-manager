// DB lưu UTC; mọi hiển thị/xuất dùng múi giờ giải (mặc định Asia/Ho_Chi_Minh). Dạng "27/10/2026 17:07:55".
export const formatInTz = (d: Date, timeZone = "Asia/Ho_Chi_Minh") =>
  new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "short", timeStyle: "medium", hourCycle: "h23" }).format(d).replace(",", "");
