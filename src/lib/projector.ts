import type { ClientMatch } from "./matches";
import { RESULT_DISPLAY } from "./results";

export const PROJECTOR_PAGE_SIZE = 20;
export const projectorScore = (m: Pick<ClientMatch, "status" | "result">) => m.status === "OFFICIAL" && m.result ? RESULT_DISPLAY[m.result].score : null;
export const hasImportedPoints = (matches: ClientMatch[]) => matches.some((m) => m.white.points !== null || (m.black != null && m.black.points !== null));
