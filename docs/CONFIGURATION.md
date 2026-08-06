# Configuration Reference

## Backend environment (`backend/.env`)

### Application

| Variable       | Default                 | Description                          |
|----------------|-------------------------|--------------------------------------|
| `APP_NAME`     | `ISP Billing`           | Shown in logs/mails                  |
| `APP_ENV`      | `local`                 | `production` in production           |
| `APP_DEBUG`    | `true`                  | **`false` in production**            |
| `APP_URL`      | `http://localhost:8000` | Public URL of the API                |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend origin allowed by CORS      |

### Main database (PostgreSQL)

| Variable      | Default       | Description            |
|---------------|---------------|------------------------|
| `DB_CONNECTION` | `pgsql`     | Keep `pgsql`           |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `5432` | |
| `DB_DATABASE` | `isp_billing` | Main billing database  |
| `DB_USERNAME` / `DB_PASSWORD` | `isp_billing` / — | |

### FreeRADIUS database

The billing system reads/writes the standard FreeRADIUS SQL schema on a
separate connection. It can share the database FreeRADIUS already uses.

| Variable               | Default       | Description                       |
|------------------------|---------------|-----------------------------------|
| `RADIUS_DB_CONNECTION` | `pgsql`       | `pgsql` or `mysql`, matching your FreeRADIUS schema |
| `RADIUS_DB_HOST` / `RADIUS_DB_PORT` | `127.0.0.1` / `5432` |      |
| `RADIUS_DB_DATABASE`   | `radius`      |                                   |
| `RADIUS_DB_USERNAME` / `RADIUS_DB_PASSWORD` | `radius` / — |        |
| `RADIUS_RELOAD_COMMAND` | `sudo -n systemctl restart freeradius` | Run after a NAS/router change so FreeRADIUS re-reads its SQL clients (it only loads them at startup, so a **full restart** is required — a reload/HUP does not re-read the `nas` table). The web user needs permission to run it (`install.sh` adds a sudoers rule). Set **blank to disable**, e.g. when FreeRADIUS runs on another host. |

> The reload is best-effort: if the command fails or isn't permitted, the
> router still saves and the Routers page shows an amber warning that a
> manual `systemctl restart freeradius` is needed. On a `radiusd`-named
> distro (RHEL/Rocky), override the service name accordingly.

### SmartOLT (optional)

| Variable            | Description                                        |
|---------------------|----------------------------------------------------|
| `SMARTOLT_BASE_URL` | e.g. `https://yourisp.smartolt.com/api`. Blank = integration disabled (UI shows "not configured"). |
| `SMARTOLT_API_KEY`  | API token, sent as `X-Token` header                |

## Frontend environment (`frontend/.env.local`)

| Variable              | Default                     | Description           |
|-----------------------|-----------------------------|-----------------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | API base URL. Use `/api` when reverse-proxying UI and API from one domain. |
| `PORT`                | `3000`                      | `npm start` listen port |

## In-app settings (Administration → System Settings)

Stored in the `settings` table; editable from the UI.

| Key                    | Default        | Effect                                       |
|------------------------|----------------|----------------------------------------------|
| `company.name`         | `Demo ISP Ltd.`| Display name                                 |
| `company.currency`     | `MMK`          | Currency label                               |
| `billing.due_days`     | `5`            | Days between billing date and due date for generated invoices |
| `billing.auto_suspend` | `true`         | Reserved toggle for the enforcement job      |

## Permissions (Roles & Permissions)

A role holds a list of permission keys; `*` grants everything.

| Key                | Grants                                              |
|--------------------|-----------------------------------------------------|
| `customers.view`   | List/view customers, usage, ONU status              |
| `customers.manage` | Create/edit/delete, suspend/reconnect               |
| `plans.view` / `plans.manage` | Service plans read / write               |
| `billing.view`     | Invoices, payments, renewals/expiring/suspended lists |
| `billing.manage`   | Create/edit invoices, record payments, renew, run enforcement |
| `network.view`     | Routers (read), online sessions, status page        |
| `network.manage`   | Router CRUD, disconnect PPPoE users                 |
| `support.view`     | Read support tickets and their reply threads        |
| `support.manage`   | Open/edit/delete tickets, post replies and internal notes, change status/priority/assignee |
| `reports.view`     | All reports                                         |
| `admin.users` / `admin.roles` / `admin.settings` / `admin.audit` / `admin.backup` | The respective Administration screens |

Seeded roles: **Administrator** (`*`), **Manager**, **Operator**, **Viewer**.

## Scheduled jobs

| Command           | Schedule | Purpose                                              |
|-------------------|----------|------------------------------------------------------|
| `billing:process` | hourly   | Suspend customers with unpaid invoices past due date (disables RADIUS, kicks PPPoE session); mark past-expiry customers expired. |

Run manually with `php artisan billing:process`. Requires the cron entry
from the install guide.
