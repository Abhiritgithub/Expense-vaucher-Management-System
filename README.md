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

## Database schema

The database is managed with Prisma. The default development database is SQLite (`backend/prisma/dev.db`), configured through `DATABASE_URL`.

### `User`

Stores application users and their access roles.

| Field | Type | Description |
| --- | --- | --- |
| `id` | Integer | Primary key. |
| `name` | String | User's display name. |
| `email` | String | Unique login email address. |
| `passwordHash` | String | Bcrypt-hashed password; plaintext passwords are not stored. |
| `role` | Enum | `EMPLOYEE`, `DIRECTOR`, or `ACCOUNTS`. |
| `employeeId` | String, optional | Employee identifier, when applicable. |
| `createdAt` | DateTime | User creation timestamp. |

### `Voucher`

Stores the expense voucher and its approval lifecycle.

| Field | Type | Description |
| --- | --- | --- |
| `id` | Integer | Primary key. |
| `voucherNumber` | String | Automatically generated unique number such as `EV-2026-00001`. |
| `voucherDate` | DateTime | Date the voucher was created. |
| `expenseDate` | DateTime | Date of the expense. |
| `department` | String | Employee department. |
| `title` | String | Expense title. |
| `category` | String | Expense category. |
| `description` | String | Expense description. |
| `amount` | Float | Claimed amount. |
| `employeeSignature` | String, optional | Authenticated signature image path. |
| `directorSignature` | String, optional | Authenticated approval signature image path. |
| `status` | Enum | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, or `REJECTED`. |
| `rejectionReason` | String, optional | Required when a director rejects a voucher. |
| `approvalDate` | DateTime, optional | Date and time of approval. |
| `employeeId` | Integer | Owner of the voucher; references `User.id`. |
| `approvedById` | Integer, optional | Director who approved the voucher; references `User.id`. |
| `createdAt` | DateTime | Voucher creation timestamp. |
| `updatedAt` | DateTime | Last modification timestamp. |

The relationships are:

- One employee can create many vouchers.
- A voucher belongs to one employee.
- A voucher can optionally be approved by one director.
- Voucher status follows `DRAFT -> PENDING_APPROVAL -> APPROVED` or `REJECTED`.
- Employees can only access their own vouchers; directors and Accounts users can access all vouchers.

The complete Prisma definition is in [`backend/prisma/schema.prisma`](./backend/prisma/schema.prisma).

## API documentation

The API base URL is `http://localhost:4000/api`.

Protected endpoints require this header:

```http
Authorization: Bearer <jwt-token>
```

JSON requests should use:

```http
Content-Type: application/json
```

### Authentication

#### `POST /auth/login`

Authenticates a user and returns a JWT session token.

Request:

```json
{
  "email": "employee@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "token": "<jwt-token>",
  "user": {
    "id": 1,
    "name": "Aarav Employee",
    "email": "employee@example.com",
    "role": "EMPLOYEE",
    "employeeId": "EMP-001"
  }
}
```

#### `GET /auth/me`

Returns the authenticated user's current database profile. This endpoint is used to restore a session after a page refresh.

### Voucher read operations

#### `GET /vouchers`

Returns vouchers according to the user's role:

- `EMPLOYEE`: only vouchers created by the authenticated employee.
- `DIRECTOR` and `ACCOUNTS`: all organization vouchers.

Supported query parameters:

| Parameter | Description |
| --- | --- |
| `search` | Searches voucher number, title, or employee name. |
| `status` | Filters by `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, or `REJECTED`. |
| `category` | Filters by expense category. |
| `department` | Filters by department. |
| `from` | Minimum expense date. |
| `to` | Maximum expense date. |
| `sortBy` | `updatedAt`, `voucherDate`, `expenseDate`, `amount`, or `status`. |
| `sortOrder` | `asc` or `desc`. |

Example:

```text
GET /api/vouchers?status=PENDING_APPROVAL&sortBy=amount&sortOrder=desc
```

#### `GET /vouchers/:id`

Returns complete voucher details, including employee information, approval information, audit timestamps, and signature paths. Employees receive `404` when requesting another employee's voucher.

#### `GET /dashboard`

Returns role-specific dashboard metrics and recent voucher activity.

### Employee voucher operations

All routes in this section require the `EMPLOYEE` role.

#### `POST /vouchers`

Creates a voucher as `DRAFT`. The server generates the unique voucher number.

Request:

```json
{
  "voucherDate": "2026-10-12",
  "expenseDate": "2026-10-10",
  "department": "Finance",
  "title": "Business travel",
  "category": "Travel",
  "description": "Taxi and lodging expenses",
  "amount": 2500,
  "employeeSignature": "/api/signatures/<file>"
}
```

#### `PATCH /vouchers/:id`

Updates an employee's own voucher. It is accepted only while the voucher is `DRAFT`.

#### `DELETE /vouchers/:id`

Deletes an employee's own voucher. It is accepted only while the voucher is `DRAFT`.

#### `POST /vouchers/:id/submit`

Submits an employee's own Draft voucher for approval. An employee signature is required.

### Director approval operations

#### `POST /vouchers/:id/approve`

Requires the `DIRECTOR` role and a `PENDING_APPROVAL` voucher. Submit a multipart form field named `signature` containing a PNG, JPG, JPEG, or WebP image. The maximum file size is 2 MB.

#### `POST /vouchers/:id/reject`

Requires the `DIRECTOR` role and a `PENDING_APPROVAL` voucher.

Request:

```json
{
  "reason": "Receipt details are incomplete"
}
```

The rejection reason must not be empty.

### Signature operations

#### `POST /signatures/upload`

Requires the `EMPLOYEE` role. Submit a multipart form field named `signature`. The response contains the authenticated signature URL used when creating or editing a Draft voucher.

#### `GET /signatures/:file`

Returns an uploaded signature image only when a valid authenticated session is provided.

### Error responses

Errors use a JSON response with an `error` message:

```json
{
  "error": "Only draft vouchers can be edited"
}
```

Common status codes:

- `400`: Invalid request or validation failure.
- `401`: Missing, invalid, or expired authentication session.
- `403`: Authenticated user lacks the required role.
- `404`: Resource not found or inaccessible to the current employee.
- `409`: Voucher is in an invalid state for the requested workflow action.
- `500`: Unexpected server error.

## Assumptions

- A voucher's lifecycle is `DRAFT -> PENDING_APPROVAL -> APPROVED/REJECTED`; rejected vouchers are read-only as required.
- Voucher numbers are generated server-side as `EV-YYYY-00001`.
- Demo authentication uses seeded accounts; production deployments should add password reset, rate limiting, object storage, and HTTPS.
