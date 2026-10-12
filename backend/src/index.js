import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 4000);
const secret = process.env.JWT_SECRET || "development-secret";
const root = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(root, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (_, file, cb) => cb(null, /^image\/(png|jpeg|jpg|webp)$/.test(file.mimetype)) });

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174"
]);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  }
}));
app.use(express.json());

const cleanUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, employeeId: user.employeeId });
async function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const claims = jwt.verify(token, secret);
    const user = await prisma.user.findUnique({ where: { id: claims.id } });
    if (!user) return res.status(401).json({ error: "Session user no longer exists" });
    req.user = { id: user.id, role: user.role, name: user.name };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
const roles = (...allowed) => (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).json({ error: "You do not have permission for this action" });
const parseDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const voucherInclude = { employee: { select: { name: true, email: true, employeeId: true } }, approvedBy: { select: { name: true } } };

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email: String(email || "").toLowerCase() } });
  if (!user || !(await bcrypt.compare(String(password || ""), user.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, secret, { expiresIn: "8h" });
  res.json({ token, user: cleanUser(user) });
});
app.get("/api/auth/me", auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(401).json({ error: "Session user no longer exists" });
  res.json({ user: cleanUser(user) });
});

app.get("/api/vouchers", auth, async (req, res) => {
  const { search, status, category, department, from, to, sortBy = "updatedAt", sortOrder = "desc" } = req.query;
  const where = req.user.role === "EMPLOYEE" ? { employeeId: req.user.id } : {};
  if (status) where.status = status;
  if (category) where.category = { contains: category, mode: "insensitive" };
  if (department) where.department = { contains: department, mode: "insensitive" };
  if (search) where.OR = [{ voucherNumber: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { employee: { name: { contains: search, mode: "insensitive" } } }];
  if (from || to) where.expenseDate = { ...(from && { gte: parseDate(from) }), ...(to && { lte: parseDate(to) }) };
  const sortFields = new Set(["updatedAt", "voucherDate", "expenseDate", "amount", "status"]);
  const orderBy = { [sortFields.has(sortBy) ? sortBy : "updatedAt"]: sortOrder === "asc" ? "asc" : "desc" };
  res.json(await prisma.voucher.findMany({ where, include: voucherInclude, orderBy }));
});
app.get("/api/vouchers/:id", auth, async (req, res) => {
  const voucher = await prisma.voucher.findUnique({ where: { id: Number(req.params.id) }, include: voucherInclude });
  if (!voucher || (req.user.role === "EMPLOYEE" && voucher.employeeId !== req.user.id)) return res.status(404).json({ error: "Voucher not found" });
  res.json(voucher);
});

function validate(body, requireSignature = false) {
  const required = ["department", "title", "expenseDate", "amount"];
  if (required.some((field) => !body[field])) return "Department, expense title, expense date and amount are required";
  if (Number(body.amount) <= 0) return "Amount must be greater than zero";
  if (!parseDate(body.expenseDate)) return "Expense date is invalid";
  if (requireSignature && !body.employeeSignature) return "Employee signature is required before submission";
  return null;
}
function dataFrom(body) {
  return { voucherDate: parseDate(body.voucherDate) || new Date(), expenseDate: parseDate(body.expenseDate), department: body.department.trim(), title: body.title.trim(), category: String(body.category || "Other").trim(), description: String(body.description || "").trim(), amount: Number(body.amount), employeeSignature: body.employeeSignature || null };
}
app.post("/api/vouchers", auth, roles("EMPLOYEE"), async (req, res) => {
  const error = validate(req.body); if (error) return res.status(400).json({ error });
  const year = new Date().getFullYear();
  const count = await prisma.voucher.count();
  const voucher = await prisma.voucher.create({ data: { ...dataFrom(req.body), voucherNumber: `EV-${year}-${String(count + 1).padStart(5, "0")}`, employeeId: req.user.id }, include: voucherInclude });
  res.status(201).json(voucher);
});
app.patch("/api/vouchers/:id", auth, roles("EMPLOYEE"), async (req, res) => {
  const current = await prisma.voucher.findUnique({ where: { id: Number(req.params.id) } });
  if (!current || current.employeeId !== req.user.id) return res.status(404).json({ error: "Voucher not found" });
  if (current.status !== "DRAFT") return res.status(409).json({ error: "Only draft vouchers can be edited" });
  const error = validate(req.body); if (error) return res.status(400).json({ error });
  res.json(await prisma.voucher.update({ where: { id: current.id }, data: dataFrom(req.body), include: voucherInclude }));
});
app.delete("/api/vouchers/:id", auth, roles("EMPLOYEE"), async (req, res) => {
  const current = await prisma.voucher.findUnique({ where: { id: Number(req.params.id) } });
  if (!current || current.employeeId !== req.user.id) return res.status(404).json({ error: "Voucher not found" });
  if (current.status !== "DRAFT") return res.status(409).json({ error: "Only draft vouchers can be deleted" });
  await prisma.voucher.delete({ where: { id: current.id } }); res.status(204).end();
});
app.post("/api/vouchers/:id/submit", auth, roles("EMPLOYEE"), async (req, res) => {
  const current = await prisma.voucher.findUnique({ where: { id: Number(req.params.id) } });
  if (!current || current.employeeId !== req.user.id) return res.status(404).json({ error: "Voucher not found" });
  if (current.status !== "DRAFT") return res.status(409).json({ error: "Only draft vouchers can be submitted" });
  if (!current.employeeSignature) return res.status(400).json({ error: "Employee signature is required before submission" });
  res.json(await prisma.voucher.update({ where: { id: current.id }, data: { status: "PENDING_APPROVAL" }, include: voucherInclude }));
});
app.post("/api/vouchers/:id/approve", auth, roles("DIRECTOR"), upload.single("signature"), async (req, res) => {
  const current = await prisma.voucher.findUnique({ where: { id: Number(req.params.id) } });
  if (!current || current.status !== "PENDING_APPROVAL") return res.status(409).json({ error: "Voucher is not awaiting approval" });
  if (!req.file) return res.status(400).json({ error: "Director signature is required" });
  res.json(await prisma.voucher.update({ where: { id: current.id }, data: { status: "APPROVED", directorSignature: `/api/signatures/${path.basename(req.file.path)}`, approvalDate: new Date(), approvedById: req.user.id }, include: voucherInclude }));
});
app.post("/api/vouchers/:id/reject", auth, roles("DIRECTOR"), async (req, res) => {
  const reason = String(req.body.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "Rejection reason is required" });
  const current = await prisma.voucher.findUnique({ where: { id: Number(req.params.id) } });
  if (!current || current.status !== "PENDING_APPROVAL") return res.status(409).json({ error: "Voucher is not awaiting approval" });
  res.json(await prisma.voucher.update({ where: { id: current.id }, data: { status: "REJECTED", rejectionReason: reason }, include: voucherInclude }));
});
app.get("/api/signatures/:file", auth, async (req, res) => {
  const file = path.join(uploadDir, path.basename(req.params.file));
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});
app.post("/api/signatures/upload", auth, roles("EMPLOYEE"), upload.single("signature"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A signature image is required" });
  res.status(201).json({ url: `/api/signatures/${path.basename(req.file.path)}` });
});
app.get("/api/dashboard", auth, async (req, res) => {
  const where = req.user.role === "EMPLOYEE" ? { employeeId: req.user.id } : {};
  const vouchers = await prisma.voucher.findMany({ where, orderBy: { updatedAt: "desc" } });
  const count = (status) => vouchers.filter((voucher) => voucher.status === status).length;
  const sum = (status) => vouchers.filter((voucher) => voucher.status === status).reduce((total, voucher) => total + voucher.amount, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const approvedToday = vouchers.filter((voucher) => voucher.status === "APPROVED" && voucher.approvalDate && new Date(voucher.approvalDate) >= today).length;
  const rejectedToday = vouchers.filter((voucher) => voucher.status === "REJECTED" && new Date(voucher.updatedAt) >= today).length;
  res.json({
    total: vouchers.length,
    draft: count("DRAFT"),
    pending: count("PENDING_APPROVAL"),
    approved: count("APPROVED"),
    rejected: count("REJECTED"),
    totalAmount: vouchers.reduce((total, voucher) => total + voucher.amount, 0),
    pendingAmount: sum("PENDING_APPROVAL"),
    approvedAmount: sum("APPROVED"),
    approvedToday,
    rejectedToday,
    recent: vouchers.slice(0, 5),
    recentApproved: vouchers.filter((voucher) => voucher.status === "APPROVED").slice(0, 5)
  });
});

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: "Unexpected server error" }); });
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
