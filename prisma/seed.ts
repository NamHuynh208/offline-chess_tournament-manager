import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const users = [
  { username: "admin", fullName: "Trọng tài kỹ thuật", role: Role.TECHNICAL_ARBITER, pw: process.env.SEED_ADMIN_PASSWORD },
  { username: "arbiter1", fullName: "Trọng tài ghi kết quả 1", role: Role.RECORDING_ARBITER, pw: process.env.SEED_ARBITER_PASSWORD },
];

async function main() {
  for (const { pw, ...u } of users) {
    if (!pw) throw new Error(`Thiếu mật khẩu seed cho ${u.username} trong .env`);
    const passwordHash = await bcrypt.hash(pw, 10);
    await prisma.user.upsert({ where: { username: u.username }, update: { passwordHash, role: u.role }, create: { ...u, passwordHash } });
    console.log(`seeded ${u.username} (${u.role})`);
  }
}

main().finally(() => prisma.$disconnect());
