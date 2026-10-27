/** Input đã sắp createdAt giảm dần: ưu tiên giải đang diễn ra mới nhất, nếu không có lấy mới nhất. */
export function defaultTournament<T extends { startDate: string | null; endDate: string | null }>(tournaments: T[], now = Date.now()) {
  return tournaments.find((t) => (!t.startDate || Date.parse(t.startDate) <= now) && (!t.endDate || Date.parse(t.endDate) >= now)) ?? tournaments[0];
}
