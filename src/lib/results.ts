import type { MatchStatus, ResultType } from "@prisma/client";

// Mã Res của Swiss-Manager (xem CLAUDE.md mục 3)
export const SM_CODE: Record<ResultType, string> = {
  WHITE_WIN: "1-0",
  BLACK_WIN: "0-1",
  DRAW: "1/2",
  WHITE_FORFEIT: "0-1F",
  BLACK_FORFEIT: "1-0F",
  DOUBLE_FORFEIT: "0-0F",
  BYE: "BYE",
};

export const RESULT_FROM_CODE = Object.fromEntries(
  Object.entries(SM_CODE).map(([k, v]) => [v, k]),
) as Record<string, ResultType>;

// Thứ tự = thứ tự nút trên màn hình nhập kết quả
export const RESULT_DISPLAY: Record<ResultType, { score: string; text: string }> = {
  WHITE_WIN: { score: "1 - 0", text: "Trắng thắng" },
  DRAW: { score: "½ - ½", text: "Hòa" },
  BLACK_WIN: { score: "0 - 1", text: "Đen thắng" },
  BLACK_FORFEIT: { score: "1 - 0F", text: "Đen bỏ cuộc / xử thua" },
  WHITE_FORFEIT: { score: "0 - 1F", text: "Trắng bỏ cuộc / xử thua" },
  DOUBLE_FORFEIT: { score: "0 - 0F", text: "Cả hai vắng mặt / xử thua" },
  BYE: { score: "BYE", text: "Miễn đấu" },
};

export const STATUS_LABEL: Record<MatchStatus, string> = {
  PENDING_RESULT: "Chưa có kết quả",
  AWAITING_CONFIRMATION: "Chờ xác nhận",
  DISPUTED: "Có bất đồng",
  OFFICIAL: "Chính thức",
  REOPENED: "Đã mở lại",
};
