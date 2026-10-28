import type { Role } from "@prisma/client";

export const canManageTournament = (role: Role) => role === "ADMIN" || role === "TECHNICAL_ARBITER";
export const hasRole = (role: Role, allowed: Role[]) => !allowed.length || role === "ADMIN" || allowed.includes(role);
