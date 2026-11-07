# AGENTS.md — Laundry Shop Income Monitoring System

## Project Goal

Build a reliable, responsive income monitoring system for **Kiara's Laundry Shop** (shop name should be configurable). The application will help the owner and authorized staff record laundry transactions, monitor income and expenses, track payments, and review business performance.

Build with **Next.js App Router**, TypeScript, and a relational database. Prioritize accurate financial calculations, simple daily workflows, clear reporting, and secure access.

## 1. Recommended Technology

- **Framework:** Next.js (App Router) with TypeScript
- **UI:** Tailwind CSS and shadcn/ui
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** Auth.js or a similarly maintained authentication solution
- **Validation:** Zod
- **Charts:** Recharts
- **Forms:** React Hook Form with Zod validation
- **Date handling:** date-fns
- **Testing:** Vitest for unit tests and Playwright for critical end-to-end flows

Use stable, mutually compatible package versions. Do not introduce additional libraries unless they solve a clear project need.

## 2. Core Features

### Dashboard
Show a quick overview with date-range filters:
- Today's gross sales
- Today's amount collected
- Today's unpaid balance / accounts receivable
- Today's expenses
- Today's net cash flow
- Transaction count
- Average transaction value
- Income trend chart (daily, weekly, monthly)
- Recent transactions
- Recent expenses

Clearly distinguish **sales/revenue**, **cash collected**, **outstanding balances**, and **net cash flow**. Do not label all incoming payments as new sales.

### Laundry Transactions
Allow authorized users to:
- Create, view, edit, and void a transaction
- Generate a unique, human-readable receipt/reference number
- Record customer name and optional contact details
- Select laundry services and quantities/weights
- Set service price, discounts, and additional charges
- Record order date, due date, and order status
- Add notes
- Print a clean receipt

Suggested statuses: `RECEIVED`, `WASHING`, `DRYING`, `FOLDING`, `READY_FOR_PICKUP`, `COMPLETED`, `CANCELLED`.

Each transaction should support one or more line items. Preserve the price charged at the time of sale even if the service price list changes later.

### Payments
Support:
- Full and partial payments
- Multiple payments against one transaction
- Payment methods: cash, GCash, Maya, bank transfer, card, and other
- Payment date and reference number
- Remaining balance calculation
- Payment history per transaction
- Refunds or payment reversals through an auditable adjustment flow

Never overwrite or silently delete payment history. Record corrections as reversals or adjustments with a reason and user attribution.

### Expenses
Allow users to record and manage:
- Expense category
- Description
- Amount
- Date paid / expense date
- Payment method
- Optional supplier or payee
- Receipt/reference number
- Notes and attachment URL (optional)
- Created by

Suggested categories: rent, electricity, water, detergent and supplies, salaries, maintenance, delivery, internet/phone, equipment, taxes/fees, and other.

### Reports
Provide date filters and useful summaries:
- Daily income report
- Weekly income report
- Monthly income report
- Yearly income report
- Custom date-range report
- Sales by service
- Payments by payment method
- Expenses by category
- Outstanding balances
- Transaction and payment history

Allow export to CSV. Provide a print-friendly report view. If PDF export is added, ensure totals match the on-screen report.

### Settings
Allow the owner/admin to configure:
- Shop name, address, contact number, and receipt footer
- Currency (default: PHP / ₱)
- Time zone (default: `Asia/Manila`)
- Services and current prices
- Expense categories
- User accounts and roles

## 3. Financial Definitions and Calculation Rules

Use these definitions consistently throughout the application:

- **Gross sales:** Sum of valid transaction totals, after discounts and before payments are considered.
- **Net sales:** Gross service charges minus discounts and transaction-level refunds/voids, according to the selected report definition. Explain the definition in the UI.
- **Payments collected:** Sum of successful, non-reversed payments received during the selected date range. This is a cash-collection measure, not necessarily sales made during that period.
- **Outstanding balance:** Valid transaction total minus net payments applied to that transaction. Never allow a negative balance unless an explicit credit/refund workflow supports it.
- **Expenses:** Sum of non-voided expenses dated within the selected period.
- **Net cash flow:** Payments collected during the period minus expenses paid during the period.
- **Profit estimate:** Do not call net cash flow “profit.” If a profit estimate is shown, clearly state which costs are included and excluded.

Important:
1. Store money as integer cents or an exact decimal database type. Never use floating-point arithmetic for persisted financial amounts.
2. Store timestamps in UTC and display/report using the configured shop time zone (`Asia/Manila` by default).
3. Define report date boundaries in the shop time zone, including start-of-day and end-of-day.
4. Exclude cancelled/voided transactions from sales totals.
5. Do not count a partial payment as a second sale.
6. A payment belongs to the date it was received; a sale belongs to the transaction's sale/order date.
7. Apply discounts before calculating the final transaction total.
8. Validate that quantities, unit prices, discounts, and payment amounts are non-negative and within sensible limits.
9. Use database transactions for operations that update multiple related financial records.
10. Make rounding rules explicit and consistent.

## 4. Suggested Database Models

Use Prisma models or equivalent relational tables. Adapt names as needed, but preserve the relationships and auditability.

### User
- id
- name
- email (unique)
- password hash or authentication provider identity
- role (`OWNER`, `ADMIN`, `CASHIER`, `STAFF`)
- isActive
- createdAt
- updatedAt

### Customer
- id
- name
- phone (optional)
- email (optional)
- notes (optional)
- createdAt
- updatedAt

### Service
- id
- name
- description (optional)
- pricingUnit (e.g. `PER_KG`, `PER_LOAD`, `PER_PIECE`, `FIXED`)
- currentPrice
- isActive
- createdAt
- updatedAt

### LaundryTransaction
- id
- receiptNumber (unique)
- customerId (optional)
- status
- subtotal
- discount
- total
- orderDate
- dueDate (optional)
- completedAt (optional)
- notes (optional)
- createdById
- updatedById
- voidedAt (optional)
- voidReason (optional)
- createdAt
- updatedAt

### TransactionItem
- id
- transactionId
- serviceId (optional if service is later archived)
- serviceNameSnapshot
- pricingUnitSnapshot
- quantity
- unitPrice
- lineTotal

### Payment
- id
- transactionId
- amount
- method
- paidAt
- referenceNumber (optional)
- notes (optional)
- receivedById
- reversedAt (optional)
- reversalReason (optional)
- createdAt

### Expense
- id
- categoryId
- description
- amount
- expenseDate
- paymentMethod
- payee (optional)
- referenceNumber (optional)
- notes (optional)
- createdById
- voidedAt (optional)
- voidReason (optional)
- createdAt
- updatedAt

### ExpenseCategory
- id
- name
- isActive
- createdAt
- updatedAt

### AuditLog
- id
- userId
- action
- entityType
- entityId
- beforeData (JSON, optional)
- afterData (JSON, optional)
- reason (optional)
- createdAt

Add indexes for receipt number, transaction/order dates, payment dates, expense dates, statuses, and foreign keys. Use database constraints where practical.

## 5. Roles and Permissions

Enforce authorization on the server, not only by hiding UI controls.

- **OWNER:** Full access, settings, users, all financial data, reports, and audit logs.
- **ADMIN:** Manage transactions, payments, expenses, services, and reports; user permissions may be restricted by the owner.
- **CASHIER:** Create transactions, collect payments, print receipts, and view permitted reports.
- **STAFF:** View assigned/necessary orders and update permitted laundry statuses. No access to sensitive financial settings unless explicitly granted.

Every protected server action, route handler, and data query must verify the user's session and permission.

## 6. Pages and Navigation

Create a clean, responsive admin layout with a sidebar on desktop and a usable mobile navigation.

Suggested routes:
- `/login`
- `/dashboard`
- `/transactions`
- `/transactions/new`
- `/transactions/[id]`
- `/payments`
- `/expenses`
- `/reports`
- `/services`
- `/customers`
- `/users`
- `/settings`
- `/audit-logs`

Use loading, empty, validation, success, and error states on every major page.

## 7. UI / UX Direction

- Modern, clean, professional laundry-shop dashboard.
- Use a light neutral background with a restrained blue/teal accent palette.
- Make key totals easy to scan without overcrowding the screen.
- Use clear labels and tooltips for financial terms.
- Use Philippine peso formatting, e.g. `₱1,250.00`.
- Use accessible color contrast, keyboard navigation, and semantic labels.
- Tables should support search, sorting, pagination, and date filters where appropriate.
- Confirm destructive actions and require a reason when voiding financial records.
- Design for desktop, tablet, and mobile.
- Do not use fake dashboard numbers in production. Seed data must be clearly marked as demo data.

## 8. Engineering Rules for AI Coding Agents

When working in this repository:

1. Read this file and the existing project structure before making changes.
2. Inspect `package.json`, Prisma schema, environment example, and existing conventions before choosing an implementation.
3. Do not replace working project architecture without a clear reason.
4. Use TypeScript strict mode. Avoid `any`; define shared types and validate external input.
5. Prefer Server Components for read-heavy pages. Use Client Components only when interactivity requires them.
6. Keep database access on the server. Never expose database credentials or secrets to the browser.
7. Use server actions or route handlers with Zod validation and authorization checks.
8. Keep business logic in reusable server-side service modules, not duplicated across UI components.
9. Use Prisma transactions for multi-record financial operations.
10. Never hard-delete financial records. Use void/reversal fields and audit logs.
11. Do not trust totals sent by the client. Recalculate all financial totals on the server.
12. Do not expose private customer data or financial records across user/branch boundaries.
13. Keep `.env` secrets out of source control. Maintain `.env.example` with placeholder values only.
14. Add migrations for schema changes; do not rely on production `db push`.
15. Add tests for calculations, permissions, date boundaries, payments, reversals, and report aggregation.
16. Before finishing, run formatting, linting, type checking, unit tests, and relevant build checks. Report any checks that could not be run.
17. Do not claim a feature is complete unless its UI, server logic, validation, persistence, and tests are implemented.
18. When requirements are unclear, choose the safest simple behavior and document the assumption rather than inventing business rules.

## 9. Required Tests and Acceptance Criteria

The application is not ready until these scenarios work:

- A cashier can create a laundry order with multiple service items.
- The server calculates the correct subtotal, discount, and total.
- A customer can make a partial payment and later settle the balance.
- The outstanding balance updates correctly after each payment.
- A reversed payment is excluded from collected-payment totals.
- A voided transaction is excluded from sales and outstanding balances.
- An expense appears in the correct expense-date report.
- A daily report uses the `Asia/Manila` calendar day, including midnight boundaries.
- Sales reports use transaction dates while collection reports use payment dates.
- Net cash flow equals payments collected minus expenses paid for the selected period.
- Unauthorized users cannot access restricted pages or invoke protected server actions.
- CSV exports match the selected filters and displayed totals.
- Receipt numbers remain unique under concurrent transaction creation.
- Editing a service price does not change historical transaction item prices.
- Financial changes are represented in the audit log.

## 10. Suggested Build Order

1. Inspect repository and initialize Next.js App Router + TypeScript if needed.
2. Configure database, Prisma, migrations, and environment variables.
3. Implement authentication, roles, and server-side authorization.
4. Build shared layout, navigation, and dashboard shell.
5. Implement services and customers.
6. Implement laundry transactions and receipt numbering.
7. Implement payment collection, partial payments, and reversals.
8. Implement expense tracking.
9. Implement report calculations and CSV export.
10. Add audit logs, settings, responsive polish, and tests.
11. Run all checks and document setup/deployment steps in `README.md`.

## 11. Local Development and Delivery

Provide:
- `.env.example`
- Prisma schema and migrations
- Seed script with clearly labeled demo records
- `README.md` with install, database setup, migration, seed, development, test, and deployment instructions
- Working login flow and instructions for creating the first owner account
- No hard-coded production credentials

A typical local workflow should be documented using the project's actual package manager and scripts. Do not assume commands exist until they are added to `package.json`.

## 12. Future Enhancements (Do Not Block the Core Release)

Keep the architecture open to:
- Multiple branches and branch-level reporting
- Inventory tracking for detergents and supplies
- Payroll and staff attendance
- Customer loyalty and discounts
- SMS notifications for ready-for-pickup orders
- Online customer order tracking
- Automated database backups

Do not implement these ahead of the core income, payment, expense, and reporting workflows unless requested.
