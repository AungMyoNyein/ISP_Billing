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
 │ PostgreSQL  │  │ FreeRADIUS  │  │ NAS routers │
 │ Main DB     │  │ SQL schema  │  │ RADIUS only │
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
| Network    | RADIUS only — NAS table sync + RFC 5176 disconnects via `radclient` |
| OLT        | SmartOLT REST API (optional)                      |

## Modules

- **Dashboard** — total/active/online/suspended/expired customers, expiring in 7 days, new this month, monthly revenue; auto-refreshes.
- **CRM / Customers** — Customer ID (manual), username/password, name, phone, address, DN Zone, SN ODB, GPS location, status, notes; full filters; detail page with **Bandwidth Usage tab** (daily download/upload chart + session history from `radacct`).
- **Service Plans** — name, price, download/upload speed, session timeout, idle timeout, `Mikrotik-Rate-Limit` RADIUS attribute (auto-derived from speeds if blank), validity days, RADIUS group.
- **Billing Menu** — Invoices, Payments, Renewals, Expiring Customers, Suspended Customers — all with filters.
- **Invoices** — invoice number, customer, plan, amount, billing date, due date, status (paid/unpaid/suspended/cancelled), Mark Paid flow.
- **Network** — NAS routers (CRUD, synced to the FreeRADIUS `nas` table, RADIUS session kick) and Online Sessions (live radacct view, 15s refresh).
- **Reports** — monthly revenue, customer growth, plan distribution, receivables.
- **Administration** — Users, Roles & Permissions (granular RBAC), System Settings, Audit Logs, Backup & Restore (pg_dump/pg_restore).
- **Status Page** — NAS routers with online sessions and last accounting activity, FreeRADIUS status, database status, SmartOLT status.

## Billing rules (enforced automatically)

```
Unpaid invoice > Due Date
    ↓  (hourly scheduler: billing:process)
Invoice status = suspended, Customer status = suspended
    ↓
RADIUS access disabled (Auth-Type := Reject + "suspended" group)
    ↓  live PPPoE session kicked via RADIUS Disconnect-Request (RFC 5176)

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
- [FreeRADIUS / NAS router / SmartOLT integration guide](docs/INTEGRATIONS.md)

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
echo 'NEXT_PUBLIC_API_URL=/api' > .env.local
npm run dev     # or: npm run build && npm start
```

API calls go through a Next.js rewrite (`/api/*` → `BACKEND_URL`,
default `http://127.0.0.1:8000`), so no CORS setup is needed and the
backend can stay on loopback. To call the backend directly instead,
set `NEXT_PUBLIC_API_URL` to its full URL and `FRONTEND_URL` in the
backend `.env` to the frontend origin for CORS.

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

## NAS router integration

Add routers under **Network → Routers** with the NAS IP, the shared
RADIUS secret, and the CoA/Disconnect port (default 3799). All router
communication is plain RADIUS: the entry is synced to the FreeRADIUS
`nas` table, and live sessions are kicked on suspension with RADIUS
Disconnect-Requests (RFC 5176) via `radclient` so the rules apply
immediately. On MikroTik, enable `/radius incoming set accept=yes`.

Saving a router restarts FreeRADIUS (`RADIUS_RELOAD_COMMAND`) so it
re-reads the `nas` table — it only loads clients at startup, so without
this a new NAS is dropped as an *unknown client* and times out. Make sure
**UDP 1812/1813** are open from each NAS (including the cloud security
group). See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for the reload,
firewall, and timeout-troubleshooting details.

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
