# Expense Voucher Management System

## Setup

Requirements: Node.js 20+ and npm.

```bash
npm install
copy backend\.env.example backend\.env
npm run db:push
npm run db:seed
npm run dev
```

The frontend runs at `http://localhost:5173` and the backend API at `http://localhost:4000`.

Seed accounts:

| Role | Email | Password |
| --- | --- | --- |
| Employee | employee@example.com | password123 |
| Director | director@example.com | password123 |
| Accounts | accounts@example.com | password123 |

## Architecture

- `frontend`: React + Vite responsive SPA with protected, role-aware routes.
- `backend`: Express REST API with JWT authentication and role authorization.
- `backend/prisma`: SQLite schema and seed data. SQLite keeps the assignment easy to run locally; the Prisma schema can be migrated to PostgreSQL by changing the provider and `DATABASE_URL`.
- Uploaded signatures are stored under `backend/uploads` and served only through authenticated signature requests.

## API

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/vouchers` (role-scoped; supports `search`, `status`, `category`, `department`, `from`, `to`)
- `GET /api/vouchers/:id`
- `POST /api/vouchers` (employee)
- `PATCH /api/vouchers/:id` (employee, draft only)
- `DELETE /api/vouchers/:id` (employee, draft only)
- `POST /api/vouchers/:id/submit` (employee)
- `POST /api/vouchers/:id/approve` (director, multipart signature)
- `POST /api/vouchers/:id/reject` (director, rejection reason)
- `POST /api/signatures/upload` (employee signature image)
- `GET /api/dashboard`

## Assumptions

- A voucher's lifecycle is `DRAFT -> PENDING_APPROVAL -> APPROVED/REJECTED`; rejected vouchers are read-only as required.
- Voucher numbers are generated server-side as `EV-YYYY-00001`.
- Demo authentication uses seeded accounts; production deployments should add password reset, rate limiting, object storage, and HTTPS.
