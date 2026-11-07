# Kiara's Laundry Shop: Income Monitor

Records laundry orders, payments, and expenses, and reports sales and cash for the shop. Built with
Next.js (App Router), TypeScript, PostgreSQL, Prisma, Auth.js (`next-auth`), Tailwind CSS, and
shadcn/ui-style components.

## Requirements

- Docker Desktop, to run everything in containers
- Node.js 22.18 or newer, for local development

## Run in Docker

This runs the database, migrations, and the production web server. You do not need Node.js.

1. Create your environment file, then replace every placeholder in `.env`. The `POSTGRES_*` values
   build the database connection for the containers, so keep them URL-safe (letters, digits, and
   `-` or `_`).

   ```bash
   cp .env.example .env
   ```

2. Build and start the app at <http://localhost:3000>. The first build takes a few minutes.

   ```bash
   npm run app:up
   ```

   Without Node.js, run the same thing directly:

   ```bash
   docker compose up -d --build --wait
   ```

3. Add accounts, once. Use one of these commands.

   ```bash
   docker compose run --rm migrate npm run owner:create -- "Your Name" you@example.com
   ```

   ```bash
   docker compose run --rm migrate npm run db:seed
   ```

Rebuild with the same `app:up` command after changing the code. Migrations run on every start, and
data stays in the `pgdata` volume across restarts and rebuilds. Stop everything with
`npm run app:down`. Containers restart with Docker Desktop unless you stop them.

Ports are bound to `127.0.0.1`, so only this computer can reach the app. To use it from other
devices, put it behind an HTTPS proxy rather than opening the port directly, and set `NEXTAUTH_URL`
to the address people will use. The web image contains no secrets: `.env` is excluded from the
build and its values are passed in when containers start.

## Local setup

For working on the code. This runs only the database in Docker. Stop the web container first with
`docker compose stop web`, because `npm run dev` also uses port 3000.

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create your environment file, then replace every placeholder in `.env`.

   ```bash
   cp .env.example .env
   ```

3. Start the database. It listens on `127.0.0.1:5433`.

   ```bash
   npm run db:up
   ```

4. Apply the migrations.

   ```bash
   npm run db:deploy
   ```

5. Add accounts, using one of the two options below.

6. Start the app at <http://localhost:3000>.

   ```bash
   npm run dev
   ```

### Option A: demo data

Creates four demo users, sample services, 35 days of orders, and expenses, all labelled `[DEMO]`.
The accounts are `owner@demo.local`, `admin@demo.local`, `cashier@demo.local`, and
`staff@demo.local`. Each uses the `SEED_DEMO_PASSWORD` from your `.env`. The seed refuses to run in
production, or on a database that already has users.

```bash
npm run db:seed
```

### Option B: a real first owner

Creates the owner account and the default expense categories. You will be asked for a password of
at least 10 characters. Add services and staff accounts after signing in.

```bash
npm run owner:create -- "Your Name" you@example.com
```

### Password reset by email

"Forgot password?" on the sign-in page emails a one-time link to `/reset-password`. It needs the
`SMTP_*` values in `.env` (see `.env.example`). For Gmail, use an
[app password](https://myaccount.google.com/apppasswords), not the account's normal password.
Without `SMTP_PASSWORD` the form says reset by email is not set up, and the owner resets
passwords on the Users page instead.

- A link works once, for 60 minutes. Asking again replaces the old link.
- One email per account every 2 minutes, so the form cannot flood an inbox.
- The form answers the same way for every address, so it never shows who has an account.
- Only a SHA-256 hash of the token is stored. Requests and resets go in the audit log.
- The link uses `NEXTAUTH_URL`, so set it to the address people actually open.
- Resetting does not sign out sessions that are already open; they last up to 12 hours.

## Scripts

| Script                        | What it does                                               |
| ----------------------------- | ---------------------------------------------------------- |
| `npm run dev`                 | Development server                                         |
| `npm run build` / `start`     | Production build and server                                |
| `npm run app:up` / `app:down` | Build and start, or stop, the whole app in Docker          |
| `npm run db:up`               | Start only the Docker database                             |
| `npm run db:down`             | Stop all Docker containers                                 |
| `npm run db:migrate`          | Create and apply a migration in development                |
| `npm run db:deploy`           | Apply migrations (use this in production, never `db push`) |
| `npm run db:seed`             | Load demo data                                             |
| `npm run owner:create`        | Create an owner account                                    |
| `npm run lint`                | ESLint                                                     |
| `npm run typecheck`           | TypeScript                                                 |
| `npm run format`              | Prettier                                                   |
| `npm run test`                | Unit and integration tests                                 |
| `npm run test:e2e`            | Playwright end-to-end tests                                |
| `npm run check`               | Format check, lint, types, tests, and build                |

## Testing

The tests need the database running, and they never touch your development data.

- `tests/unit`: money, dates, CSV, permissions, validation.
- `tests/integration`: services against real Postgres, in a `<database>_test` database.
- `tests/e2e`: real browser flows against a production build, in a `<database>_e2e` database that
  is dropped and rebuilt on every run. Install the browser once with `npx playwright install
chromium`.

## Deployment

The `web` target of the `Dockerfile` is the production image. It needs `DATABASE_URL`,
`NEXTAUTH_URL`, and `NEXTAUTH_SECRET` at runtime, and the `build` target runs migrations. Without
containers, use these steps:

1. Provision PostgreSQL and set `DATABASE_URL`, `NEXTAUTH_URL` (the public `https` URL), and
   `NEXTAUTH_SECRET` (`openssl rand -base64 32`).
2. Run `npm ci` and `npm run build`.
3. Run `npm run db:deploy`.
4. Run `npm run owner:create -- "Name" email` once.
5. Start with `npm run start` behind HTTPS.

Do not run `npm run db:seed` in production. Back up the database regularly: it holds all financial
history, and automated backups are not part of this app.

## How the numbers work

These definitions are also shown in tooltips in the app.

| Term          | Meaning                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------ |
| Gross sales   | Totals of valid orders dated in the period, after discounts.                               |
| Net sales     | Gross sales minus refunds issued in the period on orders that are still valid.             |
| Collected     | Payments received in the period minus refunds paid in the period, by the date money moved. |
| Outstanding   | Order totals minus payments applied. Voided orders owe nothing.                            |
| Expenses      | Non-voided expenses dated in the period.                                                   |
| Net cash flow | Collected minus expenses. This is cash movement, not profit. The app shows no profit.      |

- **Storage:** money is integer centavos and quantities are integer thousandths, so 3.5 kg is
  `3500`. There is no floating-point arithmetic on stored amounts. Database `CHECK` constraints
  also reject negative amounts and totals that do not add up.
- **Rounding:** a line total is rounded half up to the centavo. That is the only rounding step;
  every other total is an exact sum. The average order is rounded for display only.
- **Order total:** `subtotal - discount + additional charges`.
- **Dates:** timestamps are stored in UTC. A report day runs from midnight to midnight in the shop
  time zone (`Asia/Manila` by default). Weeks run Monday to Sunday. Expense dates are calendar
  days, not instants.

## Roles

| Capability                        | Owner  | Admin  | Cashier              | Staff |
| --------------------------------- | ------ | ------ | -------------------- | ----- |
| View orders, update status        | Yes    | Yes    | Yes                  | Yes   |
| Mark an order completed           | Yes    | Yes    | Yes                  | No    |
| See amounts and payment history   | Yes    | Yes    | Yes                  | No    |
| Create orders, collect payments   | Yes    | Yes    | Yes                  | No    |
| Edit or void orders               | Yes    | Yes    | No                   | No    |
| Reverse payments, issue refunds   | Yes    | Yes    | No                   | No    |
| Expenses                          | Yes    | Yes    | No                   | No    |
| Services                          | Manage | Manage | View                 | No    |
| Reports and dashboard             | All    | All    | One day, no expenses | No    |
| Shop settings, expense categories | Yes    | Yes    | No                   | No    |
| Users, audit logs                 | Yes    | No     | No                   | No    |

Permissions live in `src/lib/permissions.ts` and are enforced in the service layer (`src/server`),
so a hidden button is never the only protection. Each page, action, and export also checks the
session. Role changes and deactivation take effect on the next request.

## Decisions made where the brief left room

Please review these. Each is the simple, safe choice, and each is easy to change.

1. **Reversal or refund.** A reversal means an entry was a mistake: the row stays, but it counts in
   no total, on any date. A refund means money really went back: it is a new row dated when it
   left, so past days never change.
2. **A refund lowers what is owed by the same amount.** Total 500, paid 500, refund 100 leaves 400
   owed, 400 kept, and balance 0. It reduces net sales, not gross sales.
3. **Voiding requires a zero money position.** An order holding payments must be refunded or
   reversed first, and a voided order is then frozen. `CANCELLED` can only be reached by voiding,
   so every cancellation has a reason.
4. **Discounts apply to the service subtotal only.** Additional charges are added afterwards and
   are never discounted.
5. **Cashiers can change a unit price and give a discount on new orders.** Both are recorded in the
   audit log. Editing a saved order is for admins and owners.
6. **Editing an order replaces its item rows.** The previous rows are kept in full in the audit
   log. The order itself is never deleted.
7. **Staff see every order, without amounts.** The brief's "assigned orders" has no assignment
   model behind it, so nothing is hidden by person.
8. **Future dates are refused** for orders and payments, with a five-minute allowance for clock
   drift. Back-dating is allowed and is recorded in the audit log.
9. **The income chart shows sales and collections only.** One rent day flattens daily income on a
   shared axis, so expenses appear as figures and by category instead.
10. **Accounts lock for 15 minutes after 5 failed logins.**
11. **Expense attachments are links**, restricted to `http` and `https`. There is no file upload.
12. **Changing the currency setting changes the symbol only.** Amounts are not converted.
13. **Changing the time zone** applies to all reports, including past dates.
14. **The desktop app is Windows only and keeps its data on that one computer.** See
    [Windows desktop app](#windows-desktop-app).
15. **The 10+1 Laundry Promo** is switched on and off in Settings and starts off.
    - Each load of a service marked "Counts for the 10+1 Laundry Promo" earns 1 stamp, and 10 stamps
      earn 1 free load. The mark is set on the Services page and only per-load services can have
      it. PER LOAD and VIP PER LOAD start marked; each order line keeps the mark it was sold with.
    - An order earns its stamps once it is completed and paid in full. A reversal, any refund, or a
      void takes them back, and voiding an order that used a free load returns that load.
    - Only orders created while the promo is on count, so past orders earn nothing.
    - Off hides the promo from receipts and blocks new free loads. Customers keep their count, and
      an order that already used a free load keeps it, because its total depends on it.
    - One free load per order. It takes the price of the cheapest marked load on that order off the
      total, recorded apart from ordinary discounts and shown as its own line in reports.
    - An earned free load goes on the customer's next new order by itself, and the cashier can
      untick "Use free load" to save it. An order with no marked load, or whose discount leaves no
      room for the free load, saves at its normal total and the customer keeps it. Editing an
      existing order never adds one by itself.
    - There is no customer login, so "customers" see the promo on their printed receipt.
    - Each customer also has their own switch, on the Customers list and on the Customer card of
      their orders. Owners and admins can change it; cashiers only see it. New and existing
      customers start on, and the shop-wide switch overrides it. Off for a customer works like the
      shop-wide switch, for that customer alone.

## Project layout

```text
android/           Android project made by Capacitor, with the ShopServer plugin
electron/          Windows desktop shell
mobile/            The phone app's connect and error screens
prisma/            Schema, migrations, demo seed
scripts/           First-owner, desktop, and Android build scripts
src/app/           Pages and route handlers
src/components/    UI, forms, chart
src/lib/           Pure logic: money, dates, permissions, validation (client-safe)
src/server/        Business logic, authorization, database access (server-only)
tests/             Unit, integration, and end-to-end tests
```

## Windows desktop app

The desktop app is the same application in an Electron window. It needs no Docker, Node.js, or
database setup on the shop computer, because it carries its own private PostgreSQL 18.

Build the installer on Windows:

```bash
npm run desktop:build
```

The installer is written to `dist/installer`. `npm run desktop:build -- --dir` builds only the
unpacked app in `dist/installer/win-unpacked`, and `npm run desktop:start` runs a build without
packaging it, once `npm run desktop:build` has produced the server.

- **First start:** the app creates its database and asks for the owner account. The setup page
  exists only in the desktop app, and closes for good once an owner exists. After that, add
  services under Services and turn the promo on in Settings.
- **Where data lives:** `%APPDATA%\kiara-laundry`, in `database`, with logs in `logs`. Installing a
  new version or uninstalling leaves it in place. Nothing from your `.env` or development database
  goes into the installer.
- **Backups:** back up that folder while the app is closed. A lost computer is lost data otherwise.
- **Passwords:** the database password and session secret are generated on each computer and kept
  in `secrets.json` in the same folder. The owner password cannot be recovered.
- **One computer:** the server and database listen on `127.0.0.1` only, so other computers cannot
  connect, unless [Phone access](#android-app) is on. A shop with several tills should use the
  hosted version instead.
- **Moving to a new PostgreSQL major version** needs a dump and restore, because the data folder is
  tied to the bundled version. Keep the bundled version on 18 until that is planned.
- **The installer is unsigned**, so Windows SmartScreen warns on first run: choose **More info**,
  then **Run anyway**. A code-signing certificate removes the warning.

## Android app

The Android app is built with Capacitor. It holds only a connect screen, in `mobile/`. Orders,
accounts, and reports stay on the shop's server, which runs the same application, so the phone needs
a connection and works with no data of its own. It cannot be used while the server is off.

Building needs Android Studio, which provides the SDK and Java:

```bash
npm run android:build
```

The app is written to `dist/android/Kiara-Laundry.apk`. Copy it to the phone and allow installing
from that source when Android asks. It needs Android 10 or newer.
`npm run android:build -- --debug` builds a version that can be inspected from a computer, and
`npm run android:open` opens the project in Android Studio.

To connect to the desktop app:

1. On the shop computer, choose **Phone access** in the menu bar, then **Turn on**. The app restarts.
2. If Windows asks, allow access on private networks.
3. Choose **Phone access** again to see the address, such as `192.168.1.20:47800`.
4. Put the phone on the same Wi-Fi, open the app, and type that address.
5. Sign in with a normal account. Roles and permissions work as they do on the computer.

- **Phone access is off by default.** While it is on, the desktop app listens on port 47800 on every
  network the computer is joined to. Sign-ins and shop data travel unencrypted, so use it only on
  the shop's own private Wi-Fi, never one that customers use, and turn it off otherwise.
- **The address can change.** Routers may give the computer a new address. Reserve one for it in the
  router. When the phone cannot connect, its error screen has **Change address**.
- **Hosted version:** type its `https` address instead. Plain `http` is accepted only for private
  network addresses, so passwords are never sent unencrypted over the internet.
- **First owner:** owner setup never runs while Phone access is on, because anyone on the network
  could become the owner. Create the owner first.
- **Links:** only the connected server opens inside the app. Other links open in the phone's browser.
- **Receipts and reports:** Print opens Android's print screen, and CSV files go to Downloads.
- **The signing key** is in `android/signing`, which is kept out of source control. Back it up.
  Without it, an update cannot install over the old app, so each phone would have to uninstall first.
  Phones keep no shop data, so that loses only the saved address.
- **iPhone:** not built. Capacitor needs a Mac and Xcode for iOS.
