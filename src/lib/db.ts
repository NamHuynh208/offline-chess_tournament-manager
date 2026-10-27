import { PrismaClient } from "@prisma/client";

// Giữ 1 client khi Next dev hot-reload
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
