import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const users = [
  { username: "admin", fullName: "Quản trị hệ thống", role: Role.ADMIN, pw: process.env.SEED_ADMIN_PASSWORD },
  { username: "arbiter1", fullName: "Trọng tài ghi kết quả 1", role: Role.RECORDING_ARBITER, pw: process.env.SEED_ARBITER_PASSWORD },
];

async function main() {
  for (const { pw, ...u } of users) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (!pw?.trim() && existing) {
      console.warn(`[SEED] Không truyền mật khẩu ${u.username}: giữ nguyên tài khoản/mật khẩu hiện tại.`);
      continue;
    }
    const password = pw?.trim() || randomBytes(24).toString("base64url");
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({ where: { username: u.username }, update: { passwordHash, role: u.role, sessionVersion: { increment: 1 } }, create: { ...u, passwordHash } });
    if (!pw?.trim()) console.warn(`[SEED] CẢNH BÁO: thiếu mật khẩu ${u.username}. Mật khẩu ngẫu nhiên dùng lần đầu: ${password}\nLưu ở nơi an toàn, không công khai log này. Đặt biến SEED tương ứng rồi seed lại để đổi mật khẩu.`);
    console.log(`seeded ${u.username} (${u.role})`);
  }
  if (process.env.SEED_DEFAULT_TOURNAMENT === "true") {
    const id = "uscc-seed-demo";
    await prisma.tournament.upsert({ where: { id }, update: {}, create: { id, name: "Giải cờ vua USCC mẫu", totalRounds: 7, organizer: "USCC" } });
    console.log("Đã chuẩn bị giải mẫu USCC (không tạo trùng khi seed lại).");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
