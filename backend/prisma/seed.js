import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash("password123", 10);
for (const user of [
  { name: "Aarav Employee", email: "employee@example.com", passwordHash, role: "EMPLOYEE", employeeId: "EMP-001" },
  { name: "Priya Director", email: "director@example.com", passwordHash, role: "DIRECTOR" },
  { name: "Neha Accounts", email: "accounts@example.com", passwordHash, role: "ACCOUNTS" }
]) {
  await prisma.user.upsert({ where: { email: user.email }, update: user, create: user });
}
console.log("Seeded demo users");
await prisma.$disconnect();
