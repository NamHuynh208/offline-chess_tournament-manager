import type { ClientMatch } from "./matches";
import { RESULT_DISPLAY } from "./results";

export const PROJECTOR_PAGE_SIZE = 20;
export const projectorScore = (m: Pick<ClientMatch, "status" | "result">) => m.status === "OFFICIAL" && m.result ? RESULT_DISPLAY[m.result].score : null;
export const hasImportedPoints = (matches: ClientMatch[]) => matches.some((m) => m.white.points !== null || (m.black != null && m.black.points !== null));

export const DEFAULT_PROJECTOR_SETTINGS = {
  aspect: "auto" as "auto" | "16:9" | "16:10" | "4:3",
  scale: 100,
  pagination: "boards" as "boards" | "pages",
  perPage: PROJECTOR_PAGE_SIZE,
  pageCount: 2,
  columns: 2,
  auto: true,
  seconds: 10,
  scroll: false,
  controlsHidden: false,
  round: null as number | null,
  page: 0,
};
export type ProjectorSettings = typeof DEFAULT_PROJECTOR_SETTINGS;

/** localStorage là dữ liệu không tin cậy, không đưa số vô hạn/âm vào layout hoặc timer. */
export function parseProjectorSettings(value: unknown): ProjectorSettings {
  const s = { ...DEFAULT_PROJECTOR_SETTINGS };
  if (!value || typeof value !== "object") return s;
  const x = value as Record<string, unknown>;
  const options = { aspect: ["auto", "16:9", "16:10", "4:3"], scale: [75, 85, 90, 100, 110, 125], pagination: ["boards", "pages"], perPage: [10, 16, 20, 24, 30, 40], pageCount: [1, 2, 3, 4], columns: [1, 2, 3, 4], seconds: [5, 10, 15, 20] };
  for (const key of Object.keys(options) as (keyof typeof options)[]) {
    if ((options[key] as readonly unknown[]).includes(x[key])) Object.assign(s, { [key]: x[key] });
  }
  for (const key of ["auto", "scroll", "controlsHidden"] as const) if (typeof x[key] === "boolean") s[key] = x[key];
  if (Number.isSafeInteger(x.round) && Number(x.round) > 0 && Number(x.round) <= 30) s.round = Number(x.round);
  if (Number.isSafeInteger(x.page) && Number(x.page) >= 0 && Number(x.page) <= 10000) s.page = Number(x.page);
  return s;
}

export function projectorPages<T>(matches: T[], settings: Pick<ProjectorSettings, "pagination" | "perPage" | "pageCount">): T[][] {
  if (settings.pagination === "pages" && matches.length) {
    const count = Math.min(matches.length, settings.pageCount);
    const size = Math.floor(matches.length / count);
    const extra = matches.length % count;
    return Array.from({ length: count }, (_, i) => { const start = i * size + Math.min(i, extra); return matches.slice(start, start + size + (i < extra ? 1 : 0)); });
  }
  return Array.from({ length: Math.max(1, Math.ceil(matches.length / settings.perPage)) }, (_, i) => matches.slice(i * settings.perPage, (i + 1) * settings.perPage));
}
