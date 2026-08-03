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
| NAS router | any RADIUS-capable BRAS | RADIUS auth/acct + incoming Disconnect (RFC 5176, port 3799) |

On Debian/Ubuntu:

```bash
apt install php8.3-cli php8.3-pgsql php8.3-xml php8.3-curl php8.3-mbstring \
            composer postgresql postgresql-client nodejs npm
```

## Option A — automated install

```bash
./install.sh                 # everything (baseline data only — safe on production)
./install.sh --demo          # also load the demo fixture (never on production)
./install.sh --no-seed       # skip the baseline seed entirely
./install.sh --backend-only  # API + databases only
./install.sh --frontend-only # UI only
./install.sh --no-logrotate  # skip /etc/logrotate.d/isp-billing
```

The script:

1. verifies PHP/Composer/Node/psql and required PHP extensions;
2. creates the PostgreSQL role and the `isp_billing` + `radius` databases
   (idempotent — safe to re-run);
3. installs backend dependencies, writes `backend/.env` with a generated
   DB password and app key, runs migrations (and the baseline seed unless
   `--no-seed`);
4. installs frontend dependencies (including a workaround for npm
   skipping the Tailwind native binary on older npm versions), writes
   `frontend/.env.local`, and builds the production bundle;
5. installs `/etc/logrotate.d/isp-billing` (see below).

### Log rotation

`backend/storage/logs/laravel.log` is a single file that grows without
bound — it holds FreeRADIUS reload failures and other provisioning
warnings, so it matters. The installer writes
`/etc/logrotate.d/isp-billing` to rotate it daily, keeping 14 compressed
generations, with `copytruncate` (the app holds the file open).

`radius.log` is normally left alone: the distro FreeRADIUS package already
ships `/etc/logrotate.d/freeradius`, and logrotate aborts its **entire**
run if two configs claim the same file. The installer adds a stanza for it
only when nothing else does — e.g. a source-built FreeRADIUS. After
writing the file it parses the full logrotate config and backs its own
file out if anything is rejected, so a bad drop-in can't break rotation
for the rest of the box.

Skip the whole step with `--no-logrotate`. Check what would happen with:

```bash
sudo logrotate -d /etc/logrotate.conf     # dry run, changes nothing
```

Override defaults via env vars, e.g.:

```bash
DB_HOST=10.0.0.5 DB_PASS=secret \
FRONTEND_URL=https://billing.example.com ./install.sh
```

The frontend calls the API at the relative `/api` path by default —
Next.js proxies it to the backend (`BACKEND_URL`, default
`http://127.0.0.1:8000`), so the UI works from any hostname/IP with no
CORS setup. Set `API_URL` to a full URL only if browsers should hit
the backend directly.

If the script cannot reach PostgreSQL as a superuser it falls back to
`psql -U postgres` over TCP; set `PGSUPER_USER` / `PGSUPER_PASS` if your
superuser differs.

### What gets seeded

`db:seed` loads **baseline data only**: the four roles, default settings, the
service plan catalogue, and one `admin@isp.local` account. Every write is
create-if-absent, so re-running it — which a re-install does — never resets a
changed password, overwrites the company letterhead, or rolls back
permissions edited in the Roles screen. It is safe on a live database.

Demo routers, the extra manager/operator accounts and 25 sample customers
live in a separate fixture that is never loaded automatically:

```bash
php artisan db:seed --class=DemoSeeder    # or ./install.sh --demo
```

Do not run it on production — it provisions every sample customer into
FreeRADIUS.

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
php artisan db:seed --force                  # baseline: roles, settings, plans, admin
php artisan db:seed --class=DemoSeeder --force   # optional demo fixture
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

The billing rules (suspend overdue, expire past-due) and the SmartOLT ONU
import run via the Laravel scheduler. Add to crontab on the backend host:

```cron
* * * * * /usr/bin/php /path/to/backend/artisan schedule:run >/dev/null 2>>/path/to/backend/storage/logs/scheduler.log
```

Two details worth keeping. Give `artisan` an **absolute path** rather than
`cd`-ing first — cron runs from the user's home, and a wrong working
directory fails with `Could not open input file: artisan` every minute.
And send stderr to a log instead of `/dev/null`: the job is silent when
healthy, so discarding its errors is how a scheduler stays broken for
weeks unnoticed. `storage/logs/` is already covered by the logrotate
config the installer writes.

Verify it is actually running:

```bash
journalctl -u cron --since "5 min ago" | grep schedule:run   # cron fired it
cat /path/to/backend/storage/logs/scheduler.log              # empty = healthy
php artisan schedule:list                                    # what runs when
```

Without this, customers are only suspended when an operator presses
**Billing → Run enforcement** (`POST /api/billing/enforce`), and new
SmartOLT ONUs are only imported by running `php artisan smartolt:sync`.

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
with root access on a systemd host (skip with `--no-service`), plus an
`isp-billing-api` unit that serves the Laravel backend on
`BACKEND_URL` via `php artisan serve` — replace that one with the
nginx + php-fpm setup above for serious traffic. The manual
equivalent of the UI unit:

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

- [ ] Change the seeded `admin@isp.local` password
- [ ] `APP_DEBUG=false`, unique `APP_KEY`
- [ ] TLS on both API and UI
- [ ] PostgreSQL only reachable from the app host
- [ ] NAS routers accept RADIUS CoA/Disconnect only from the RADIUS host, with strong shared secrets
- [ ] Cron entry installed; verify with `php artisan schedule:list`
- [ ] Regular backups: **Administration → Backup & Restore** or
      `pg_dump` from cron; test a restore once

## Upgrading

```bash
git pull
cd backend && composer install --no-dev && php artisan migrate --force \
  && php artisan config:cache && php artisan route:cache
systemctl restart isp-billing-api   # if using the installer's artisan-serve unit
cd ../frontend && npm install && npm run build && systemctl restart isp-billing-ui
```

## Uninstalling / reinstalling

`./uninstall.sh` reverses `install.sh`: it removes the two systemd units,
restores FreeRADIUS's `mods-available/sql` and `radiusd.conf` from the
`.dist` backups the installer made, disables the sql module, drops the
`isp_billing` and `radius` databases and their role, and deletes
`/etc/logrotate.d/isp-billing`. Source code and git history are never
touched; build artefacts only with `--purge-files`.

It reads the database names from `backend/.env`, so it drops the databases
this install actually used rather than the defaults.

```bash
sudo ./uninstall.sh --dry-run     # print the plan, change nothing
sudo ./uninstall.sh               # prompts: type the database name to confirm
sudo ./install.sh                 # reinstall clean (baseline data only)
```

Both databases are dumped to `uninstall-backup-<timestamp>/` before they are
dropped (`--no-backup` skips it). Selective flags: `--keep-database`,
`--keep-freeradius`, `--keep-env`, `--no-service`, `--no-logrotate`,
`--purge-files`, `--yes`.

> **Keep the old `backend/.env` if you plan to restore one of those dumps.**
> A fresh install generates a new `APP_KEY`, and customer RADIUS passwords in
> the dump were encrypted with the previous one — under a new key they read
> back as null and those customers are skipped during provisioning.

The scheduler cron entry is not installed by `install.sh`, so it is not
removed either; the uninstaller prints it if it finds one still pointing at
this checkout.
