# ISP Billing System

Production-ready ISP billing & RADIUS management system.

```
                    ┌──────────────┐
                    │   Web UI     │
                    │ (Next.js 15) │
                    └──────┬───────┘
                           │ REST (Bearer token / Sanctum)
                           ▼
                  ┌─────────────────┐
                  │ Backend API     │
                  │ Laravel 12      │
                  └──────┬──────────┘
                         │
        ┌────────────────┼─────────────────┐
        ▼                ▼                 ▼
 ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
 │ PostgreSQL  │  │ FreeRADIUS  │  │ MikroTik    │
 │ Main DB     │  │ SQL schema  │  │ RouterOS API│
 └─────────────┘  └─────────────┘  └─────────────┘
        │
        ▼
 ┌─────────────┐
 │ SmartOLT    │
 │ (optional)  │
 └─────────────┘
```

## Stack

| Layer      | Tech                                              |
|------------|---------------------------------------------------|
| Backend    | Laravel 12, PHP 8.3, Sanctum token auth           |
| Database   | PostgreSQL (`isp_billing` main + `radius` schema) |
| Frontend   | Next.js 15 (App Router), TailwindCSS 4            |
| AAA        | FreeRADIUS SQL tables (radcheck/radreply/radusergroup/radacct/nas) |
| Network    | MikroTik RouterOS API (built-in binary client, no deps) |
| OLT        | SmartOLT REST API (optional)                      |

## Modules

- **Dashboard** — total/active/online/suspended/expired customers, expiring in 7 days, new this month, monthly revenue; auto-refreshes.
- **CRM / Customers** — Customer ID (manual), username/password, name, phone, address, DN Zone, SN ODB, GPS location, status, notes; full filters; detail page with **Bandwidth Usage tab** (daily download/upload chart + session history from `radacct`).
- **Service Plans** — name, price, download/upload speed, session timeout, idle timeout, MikroTik rate limit (auto-derived from speeds if blank), validity days, RADIUS group.
- **Billing Menu** — Invoices, Payments, Renewals, Expiring Customers, Suspended Customers — all with filters.
- **Invoices** — invoice number, customer, plan, amount, billing date, due date, status (paid/unpaid/suspended/cancelled), Mark Paid flow.
- **Network** — MikroTik routers (CRUD, live probe, PPPoE session kick) and Online Sessions (live radacct view, 15s refresh).
- **Reports** — monthly revenue, customer growth, plan distribution, receivables.
- **Administration** — Users, Roles & Permissions (granular RBAC), System Settings, Audit Logs, Backup & Restore (pg_dump/pg_restore).
- **Status Page** — connected MikroTik routers, router status/resources, FreeRADIUS status, database status, SmartOLT status.

## Billing rules (enforced automatically)

```
Unpaid invoice > Due Date
    ↓  (hourly scheduler: billing:process)
Invoice status = suspended, Customer status = suspended
    ↓
RADIUS access disabled (Auth-Type := Reject + "suspended" group)
    ↓  live PPPoE session kicked via MikroTik API

Invoice marked Paid
    ↓
Customer status = active, expiry extended by plan validity
    ↓
RADIUS access re-enabled (reject row removed, attributes re-provisioned)
```

## Quick install

```bash
./install.sh             # everything, with demo data
./install.sh --no-seed   # production (no demo customers)
```

Full documentation in [`docs/`](docs/):

- [Installation & production deployment](docs/INSTALL.md)
- [Configuration reference (env vars, settings, permissions)](docs/CONFIGURATION.md)
- [API reference](docs/API.md)
- [FreeRADIUS / MikroTik / SmartOLT integration guide](docs/INTEGRATIONS.md)

## Manual setup

### Backend

```bash
cd backend
composer install
cp .env.example .env && php artisan key:generate
# configure DB_* (main) and RADIUS_DB_* (FreeRADIUS database) in .env
php artisan migrate --seed
php artisan serve            # http://localhost:8000
```

The RADIUS connection supports both PostgreSQL and MySQL FreeRADIUS
schemas (`RADIUS_DB_CONNECTION=pgsql|mysql`). If FreeRADIUS already
created its tables, the migration leaves them untouched.

**Scheduler (required in production)** — add to crontab:

```
* * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1
```

This runs `billing:process` hourly (suspend overdue, expire past-due).

### Frontend

```bash
cd frontend
npm install
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000/api' > .env.local
npm run dev     # or: npm run build && npm start
```

Set `FRONTEND_URL` in the backend `.env` to the frontend origin for CORS.

### Default logins (seeded)

| Role          | Email               | Password      |
|---------------|---------------------|---------------|
| Administrator | admin@isp.local     | admin12345    |
| Manager       | manager@isp.local   | manager12345  |
| Operator      | operator@isp.local  | operator12345 |

**Change these before going live.**

## FreeRADIUS integration

Point FreeRADIUS's `sql` module at the `radius` database — done
automatically by `./install.sh` when FreeRADIUS is installed locally
(`sudo ./install-deps.sh --with-freeradius`); use `--no-freeradius` to
opt out, e.g. for a remote RADIUS host. The billing system maintains:

- `radcheck` — `Cleartext-Password`, and `Auth-Type := Reject` while suspended
- `radreply` — `Mikrotik-Rate-Limit`, `Session-Timeout`, `Idle-Timeout` from the plan
- `radusergroup` — plan's RADIUS group + `suspended` marker group
- `nas` — synced from the Routers module (`nas_ip` + `radius_secret`)
- `radacct` — read for online sessions, bandwidth usage and dashboard counts

## MikroTik integration

Add routers under **Network → Routers** (API user with `api` policy,
port 8728 or 8729+SSL). Used for: connectivity probe + system resources
(status page), active PPPoE sessions, and kicking sessions on
suspension so RADIUS rules apply immediately.

## SmartOLT integration (optional)

Set in backend `.env`:

```
SMARTOLT_BASE_URL=https://yourisp.smartolt.com/api
SMARTOLT_API_KEY=...
```

Customers with a `SmartOLT ONU Serial` get ONU status/signal via
`GET /api/customers/{id}/onu`.

## API

All endpoints under `/api`, JSON, `Authorization: Bearer <token>`
(obtain via `POST /api/auth/login`). Permission keys per route group:
`customers.*`, `plans.*`, `billing.*`, `network.*`, `reports.view`,
`admin.*`. See `backend/routes/api.php` for the full surface (65 routes).
