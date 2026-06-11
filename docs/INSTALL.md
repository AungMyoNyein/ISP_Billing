# Installation Guide

Two ways to install: the automated script, or step-by-step manually.
A production deployment section (nginx + php-fpm + systemd + cron)
follows at the end.

## Prerequisites

| Component  | Version  | Notes                                            |
|------------|----------|--------------------------------------------------|
| PHP        | 8.2+     | extensions: `pdo_pgsql`, `mbstring`, `xml`, `curl`, `openssl` |
| Composer   | 2.x      |                                                  |
| PostgreSQL | 14+      | server + `pg_dump`/`pg_restore` for backups      |
| Node.js    | 18.18+   | 20 LTS recommended                               |
| FreeRADIUS | 3.x      | optional but required for real AAA               |
| MikroTik   | RouterOS 6.43+ | API service enabled (port 8728/8729)       |

On Debian/Ubuntu:

```bash
apt install php8.3-cli php8.3-pgsql php8.3-xml php8.3-curl php8.3-mbstring \
            composer postgresql postgresql-client nodejs npm
```

## Option A — automated install

```bash
./install.sh                 # everything, with demo data
./install.sh --no-seed       # production: no demo customers
./install.sh --backend-only  # API + databases only
./install.sh --frontend-only # UI only
```

The script:

1. verifies PHP/Composer/Node/psql and required PHP extensions;
2. creates the PostgreSQL role and the `isp_billing` + `radius` databases
   (idempotent — safe to re-run);
3. installs backend dependencies, writes `backend/.env` with a generated
   DB password and app key, runs migrations (and seeders unless `--no-seed`);
4. installs frontend dependencies (including a workaround for npm
   skipping the Tailwind native binary on older npm versions), writes
   `frontend/.env.local`, and builds the production bundle.

Override defaults via env vars, e.g.:

```bash
DB_HOST=10.0.0.5 DB_PASS=secret \
FRONTEND_URL=https://billing.example.com ./install.sh --no-seed
```

The frontend calls the API at the relative `/api` path by default —
Next.js proxies it to the backend (`BACKEND_URL`, default
`http://127.0.0.1:8000`), so the UI works from any hostname/IP with no
CORS setup. Set `API_URL` to a full URL only if browsers should hit
the backend directly.

If the script cannot reach PostgreSQL as a superuser it falls back to
`psql -U postgres` over TCP; set `PGSUPER_USER` / `PGSUPER_PASS` if your
superuser differs.

## Option B — manual install

### 1. Databases

```sql
CREATE ROLE isp_billing LOGIN PASSWORD 'change-me';
CREATE DATABASE isp_billing OWNER isp_billing;
CREATE DATABASE radius OWNER isp_billing;   -- or reuse FreeRADIUS's existing DB
```

If FreeRADIUS already has a SQL database, point the backend at it
instead of creating `radius` — the migration skips tables that exist.

### 2. Backend

```bash
cd backend
composer install
cp .env.example .env
# edit .env: DB_*, RADIUS_DB_*, FRONTEND_URL  (see docs/CONFIGURATION.md)
php artisan key:generate
php artisan migrate --force
php artisan db:seed --force      # optional demo data
php artisan serve                # dev server on :8000
```

### 3. Frontend

```bash
cd frontend
npm install
echo 'NEXT_PUBLIC_API_URL=/api' > .env.local
npm run build
npm start                        # production server on :3000 (PORT=xxxx to change)
```

`/api` is proxied to the backend by Next.js (`BACKEND_URL`, default
`http://127.0.0.1:8000` — set it when running `npm run build` if the
backend runs elsewhere).

### 4. Scheduler (required)

The billing rules (suspend overdue, expire past-due) run via the Laravel
scheduler. Add to crontab on the backend host:

```cron
* * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1
```

Without this, customers are only suspended when an operator presses
**Billing → Run enforcement** (`POST /api/billing/enforce`).

## Production deployment

### Backend — nginx + php-fpm

```nginx
server {
    listen 80;
    server_name billing-api.example.com;
    root /srv/isp-billing/backend/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }
}
```

Then:

```bash
cd backend
composer install --no-dev --optimize-autoloader
php artisan config:cache && php artisan route:cache
chown -R www-data:www-data storage bootstrap/cache
```

Set in `.env`: `APP_ENV=production`, `APP_DEBUG=false`, real `APP_URL`
and `FRONTEND_URL` (HTTPS strongly recommended — tokens travel in the
`Authorization` header).

### Frontend — systemd unit

`install.sh` creates and enables this unit automatically when it runs
with root access on a systemd host (skip with `--no-service`). The
manual equivalent:

```ini
# /etc/systemd/system/isp-billing-ui.service
[Unit]
Description=ISP Billing UI (Next.js)
After=network.target

[Service]
WorkingDirectory=/srv/isp-billing/frontend
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

Reverse-proxy it (or serve UI and API from one domain — set
`NEXT_PUBLIC_API_URL=/api` and proxy `/api` to the Laravel backend,
which also removes the need for CORS).

### Hardening checklist

- [ ] Change all seeded passwords (or install with `--no-seed`)
- [ ] `APP_DEBUG=false`, unique `APP_KEY`
- [ ] TLS on both API and UI
- [ ] PostgreSQL only reachable from the app host
- [ ] MikroTik API user limited to `api` policy + the billing host's IP
- [ ] Cron entry installed; verify with `php artisan schedule:list`
- [ ] Regular backups: **Administration → Backup & Restore** or
      `pg_dump` from cron; test a restore once

## Upgrading

```bash
git pull
cd backend && composer install --no-dev && php artisan migrate --force \
  && php artisan config:cache && php artisan route:cache
cd ../frontend && npm install && npm run build && systemctl restart isp-billing-ui
```
