#!/usr/bin/env bash
#
# ISP Billing System installer.
#
# Installs the Laravel backend and Next.js frontend, creates the
# PostgreSQL databases (main + FreeRADIUS schema) and seeds demo data.
#
# Usage:
#   ./install.sh                 # full install with prompts/defaults
#   ./install.sh --no-seed       # skip demo data (production)
#   ./install.sh --backend-only  # backend + databases only
#   ./install.sh --frontend-only # frontend only
#   ./install.sh --no-freeradius # skip FreeRADIUS sql module auto-config
#   ./install.sh --no-service    # skip isp-billing-ui systemd unit setup
#
# If a local FreeRADIUS 3 install is detected (install-deps.sh
# --with-freeradius), its sql module is pointed at the radius database
# automatically and the service is restarted.
#
# Configurable via environment variables (defaults shown):
#   DB_HOST=127.0.0.1  DB_PORT=5432
#   DB_NAME=isp_billing  RADIUS_DB_NAME=radius
#   DB_USER=isp_billing  DB_PASS=<generated>
#   API_URL=/api                 (proxied to BACKEND_URL by Next.js)
#   BACKEND_URL=http://127.0.0.1:8000
#   FRONTEND_URL=http://localhost:3000
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED=1
DO_BACKEND=1
DO_FRONTEND=1
DO_RADIUS_CONF=1
DO_SERVICE=1

for arg in "$@"; do
  case "$arg" in
    --no-seed) SEED=0 ;;
    --backend-only) DO_FRONTEND=0 ;;
    --frontend-only) DO_BACKEND=0 ;;
    --no-freeradius) DO_RADIUS_CONF=0 ;;
    --no-service) DO_SERVICE=0 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)"; exit 1 ;;
  esac
done

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-isp_billing}"
RADIUS_DB_NAME="${RADIUS_DB_NAME:-radius}"
DB_USER="${DB_USER:-isp_billing}"
# On a re-run, reuse the password from the existing .env — ALTER ROLE below
# would otherwise reset the role to a new password the untouched .env lacks.
if [ -z "${DB_PASS:-}" ] && [ -f "$ROOT/backend/.env" ]; then
  DB_PASS="$(sed -n 's/^DB_PASSWORD=//p' "$ROOT/backend/.env" | head -n1 | tr -d '"')"
fi
DB_PASS="${DB_PASS:-$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24 || true)}"
# Relative by default: the browser calls the frontend origin and Next.js
# proxies /api to the backend (BACKEND_URL), so remote browsers work
# without CORS or exposing the Laravel server.
API_URL="${API_URL:-/api}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

ok()   { printf '\033[32m✔\033[0m %s\n' "$*"; }
info() { printf '\033[34m➜\033[0m %s\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1 — $2"; }

root_run() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then sudo "$@"
  else return 1; fi
}

# Shared by the two service installers below.
have_systemd() { command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; }
url_port() { printf '%s' "$1" | sed -n 's|.*:\([0-9][0-9]*\)$|\1|p'; }

# ---------------------------------------------------------------- checks
info "Checking prerequisites…"

if [ "$DO_BACKEND" = 1 ]; then
  need php "install PHP 8.2+ (e.g. apt install php8.3-cli)"
  need composer "https://getcomposer.org/download/"
  php -r 'exit(version_compare(PHP_VERSION, "8.2.0", ">=") ? 0 : 1);' \
    || die "PHP 8.2+ required, found $(php -r 'echo PHP_VERSION;')"

  # Read the module list once: piping `php -m` straight into `grep -q` lets
  # grep close the pipe on first match, killing php with SIGPIPE, which under
  # `set -o pipefail` fails the pipeline even though the extension is present.
  php_mods="$(php -m)"
  for ext in pdo_pgsql mbstring xml curl openssl; do
    printf '%s\n' "$php_mods" | grep -qi "^$ext\$" || die "Missing PHP extension: $ext (e.g. apt install php8.3-${ext/pdo_/})"
  done
  need psql "install postgresql-client (and a running PostgreSQL server)"
  ok "PHP $(php -r 'echo PHP_VERSION;'), Composer, PostgreSQL client found"
fi

if [ "$DO_FRONTEND" = 1 ]; then
  need node "install Node.js 18.18+ (https://nodejs.org)"
  need npm "ships with Node.js"
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>18||(a===18&&b>=18)?0:1)' \
    || die "Node.js 18.18+ required, found $(node -v)"
  ok "Node $(node -v), npm $(npm -v) found"
fi

# ---------------------------------------------------------------- database
create_databases() {
  info "Creating PostgreSQL role '$DB_USER' and databases '$DB_NAME', '$RADIUS_DB_NAME'…"

  # Prefer local socket as the postgres superuser when available.
  # SQL is piped via stdin (-f -) so quoting survives su/sudo intact.
  run_psql() {
    if command -v sudo >/dev/null 2>&1 && sudo -n -u postgres true 2>/dev/null; then
      # cd / so psql does not warn when postgres cannot read the caller's cwd
      printf '%s\n' "$1" | (cd / && sudo -u postgres psql -v ON_ERROR_STOP=1 -f -)
    elif [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
      printf '%s\n' "$1" | su - postgres -c "psql -v ON_ERROR_STOP=1 -f -"
    else
      printf '%s\n' "$1" | PGPASSWORD="${PGSUPER_PASS:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "${PGSUPER_USER:-postgres}" -v ON_ERROR_STOP=1 -f -
    fi
  }

  run_psql "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN CREATE ROLE \"$DB_USER\" LOGIN PASSWORD '$DB_PASS'; ELSE ALTER ROLE \"$DB_USER\" PASSWORD '$DB_PASS'; END IF; END \$\$;"
  run_psql "SELECT 'CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\\gexec"
  run_psql "SELECT 'CREATE DATABASE \"$RADIUS_DB_NAME\" OWNER \"$DB_USER\"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$RADIUS_DB_NAME')\\gexec"
  ok "Databases ready"
}

# ---------------------------------------------------------------- backend
install_backend() {
  info "Installing backend (Laravel)…"
  cd "$ROOT/backend"

  # As root, Composer warns and disables plugins unless explicitly allowed.
  [ "$(id -u)" = 0 ] && export COMPOSER_ALLOW_SUPERUSER=1

  composer install --no-interaction --prefer-dist --no-progress

  if [ ! -f .env ]; then
    cp .env.example .env
    sed -i \
      -e "s|^DB_HOST=.*|DB_HOST=$DB_HOST|" \
      -e "s|^DB_PORT=.*|DB_PORT=$DB_PORT|" \
      -e "s|^DB_DATABASE=.*|DB_DATABASE=$DB_NAME|" \
      -e "s|^DB_USERNAME=.*|DB_USERNAME=$DB_USER|" \
      -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASS|" \
      -e "s|^RADIUS_DB_HOST=.*|RADIUS_DB_HOST=$DB_HOST|" \
      -e "s|^RADIUS_DB_PORT=.*|RADIUS_DB_PORT=$DB_PORT|" \
      -e "s|^RADIUS_DB_DATABASE=.*|RADIUS_DB_DATABASE=$RADIUS_DB_NAME|" \
      -e "s|^RADIUS_DB_USERNAME=.*|RADIUS_DB_USERNAME=$DB_USER|" \
      -e "s|^RADIUS_DB_PASSWORD=.*|RADIUS_DB_PASSWORD=$DB_PASS|" \
      -e "s|^FRONTEND_URL=.*|FRONTEND_URL=$FRONTEND_URL|" \
      .env
    php artisan key:generate --force
    ok "backend/.env created"
  else
    ok "backend/.env already exists — leaving it untouched"
  fi

  php artisan migrate --force
  if [ "$SEED" = 1 ]; then
    php artisan db:seed --force
    ok "Demo data seeded (admin@isp.local / admin12345 — change this!)"
  fi
  ok "Backend installed"
}

# ---------------------------------------------------------------- freeradius
# Point a locally installed FreeRADIUS 3 at the radius database: write the
# sql module config, enable it, activate "sql" in the default site and
# restart. Skipped (with a hint) when FreeRADIUS or root access is missing.
configure_freeradius() {
  local raddb=""
  for d in /etc/freeradius/3.0 /etc/raddb /etc/freeradius; do
    [ -f "$d/mods-available/sql" ] && { raddb="$d"; break; }
  done
  if [ -z "$raddb" ]; then
    info "FreeRADIUS not detected — skipping sql module setup (sudo ./install-deps.sh --with-freeradius)"
    return 0
  fi

  as_root() {
    if [ "$(id -u)" = 0 ]; then "$@"
    elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then sudo "$@"
    else return 1; fi
  }
  if ! as_root true 2>/dev/null; then
    warn "FreeRADIUS found at $raddb but no root access — configure the sql module manually (docs/INTEGRATIONS.md)"
    return 0
  fi

  info "Configuring FreeRADIUS sql module ($raddb)…"

  # FreeRADIUS quoted strings: escape backslashes and double quotes.
  local esc_pass
  esc_pass=$(printf '%s' "$DB_PASS" | sed 's/\\/\\\\/g; s/"/\\"/g')

  local tmp
  tmp=$(mktemp)
  cat > "$tmp" <<EOF
# Generated by install.sh — connects FreeRADIUS to the ISP Billing
# radius database. The distro's original file is kept as sql.dist.
sql {
	dialect = "postgresql"
	driver = "rlm_sql_\${dialect}"

	server = "$DB_HOST"
	port = $DB_PORT
	login = "$DB_USER"
	password = "$esc_pass"
	radius_db = "$RADIUS_DB_NAME"

	acct_table1 = "radacct"
	acct_table2 = "radacct"
	postauth_table = "radpostauth"
	authcheck_table = "radcheck"
	groupcheck_table = "radgroupcheck"
	authreply_table = "radreply"
	groupreply_table = "radgroupreply"
	usergroup_table = "radusergroup"

	# Load RADIUS clients from the billing-managed "nas" table on startup.
	read_clients = yes
	client_table = "nas"

	group_attribute = "SQL-Group"

	\$INCLUDE \${modconfdir}/\${.:name}/main/\${dialect}/queries.conf
}
EOF

  # Config holds the DB password — readable only by the radius user.
  local grp=root g
  for g in freerad radiusd; do
    if getent group "$g" >/dev/null 2>&1; then grp=$g; break; fi
  done

  [ -f "$raddb/mods-available/sql.dist" ] \
    || as_root cp "$raddb/mods-available/sql" "$raddb/mods-available/sql.dist"
  as_root install -m 640 -o root -g "$grp" "$tmp" "$raddb/mods-available/sql"
  rm -f "$tmp"

  [ -e "$raddb/mods-enabled/sql" ] \
    || as_root ln -s ../mods-available/sql "$raddb/mods-enabled/sql"

  # Activate "sql" where the distro site leaves it commented out. Stock
  # 3.x sites already reference "-sql" (soft) in authorize/accounting/
  # post-auth, so usually only the session entry needs uncommenting.
  as_root sed -i -E \
    '/^(authorize|accounting|session) \{/,/^\}/ s/^#[[:space:]]*sql[[:space:]]*$/\tsql/' \
    "$raddb/sites-available/default"

  local bin="" b
  for b in /usr/sbin/radiusd /usr/sbin/freeradius; do
    [ -x "$b" ] && { bin=$b; break; }
  done
  if [ -n "$bin" ] && ! as_root "$bin" -C -d "$raddb" >/dev/null 2>&1; then
    as_root "$bin" -C -d "$raddb" 2>&1 | tail -n 5 >&2 || true
    warn "FreeRADIUS config check failed — service not restarted (original module config: $raddb/mods-available/sql.dist)"
    return 0
  fi

  local svc=freeradius
  [ "$bin" = /usr/sbin/radiusd ] && svc=radiusd
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    as_root systemctl enable "$svc" >/dev/null 2>&1 || true
    as_root systemctl restart "$svc" \
      || { warn "FreeRADIUS restart failed — check: journalctl -u $svc"; return 0; }

    # Let the web user restart FreeRADIUS so a NAS change reloads its SQL
    # clients (RADIUS_RELOAD_COMMAND). Scoped NOPASSWD rule for just this
    # service; harmless if the app runs as root (artisan serve in dev).
    local webuser="" u
    for u in www-data nginx apache; do
      id "$u" >/dev/null 2>&1 && { webuser=$u; break; }
    done
    if [ -n "$webuser" ] && [ -d /etc/sudoers.d ]; then
      printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl restart %s\n' "$webuser" "$svc" \
        | as_root install -m 440 /dev/stdin /etc/sudoers.d/isp-billing-radius 2>/dev/null \
        && ok "Granted $webuser NOPASSWD restart of $svc (RADIUS_RELOAD_COMMAND)" \
        || warn "Could not write /etc/sudoers.d/isp-billing-radius — set RADIUS_RELOAD_COMMAND manually"
    fi
  else
    as_root service "$svc" restart >/dev/null 2>&1 \
      || { warn "FreeRADIUS restart failed — start it manually"; return 0; }
  fi
  ok "FreeRADIUS sql module configured and service restarted"
}

# ---------------------------------------------------------------- frontend
install_frontend() {
  info "Installing frontend (Next.js)…"
  cd "$ROOT/frontend"

  npm install --no-audit --no-fund

  # npm <10.5 sometimes skips platform-specific optional deps; fetch the
  # Tailwind oxide native binary manually if it is missing.
  if [ ! -d node_modules/@tailwindcss/oxide-linux-x64-gnu ] \
     && [ "$(uname -s)/$(uname -m)" = "Linux/x86_64" ] \
     && [ -f node_modules/@tailwindcss/oxide/package.json ]; then
    VER="$(node -p "require('@tailwindcss/oxide/package.json').version")"
    info "Fetching @tailwindcss/oxide-linux-x64-gnu@$VER (npm optional-deps workaround)…"
    curl -fsSL "https://registry.npmjs.org/@tailwindcss/oxide-linux-x64-gnu/-/oxide-linux-x64-gnu-$VER.tgz" -o /tmp/oxide.tgz
    mkdir -p node_modules/@tailwindcss/oxide-linux-x64-gnu
    tar xzf /tmp/oxide.tgz -C node_modules/@tailwindcss/oxide-linux-x64-gnu --strip-components=1
    rm -f /tmp/oxide.tgz
  fi

  if [ ! -f .env.local ]; then
    echo "NEXT_PUBLIC_API_URL=$API_URL" > .env.local
    ok "frontend/.env.local created (API: $API_URL)"
  fi

  npm run build
  ok "Frontend built"
}

# ------------------------------------------------------------ services
# Creates the systemd units that docs/INSTALL.md's upgrade flow
# (`systemctl restart isp-billing-ui` / `isp-billing-api`) assumes exist.
install_service() {
  local name="$1" desc="$2" workdir="$3" port="$4" exec_start="$5" extra_env="${6:-}"

  if ! have_systemd; then
    info "systemd not detected — start $desc manually (docs/INSTALL.md)"
    return 0
  fi
  if ! root_run true 2>/dev/null; then
    warn "No root access — create the $name unit manually (docs/INSTALL.md) or re-run with sudo"
    return 0
  fi

  local owner
  owner="$(stat -c %U "$ROOT")"

  info "Installing $name.service (port $port, user $owner)…"
  root_run tee "/etc/systemd/system/$name.service" >/dev/null <<EOF
[Unit]
Description=$desc
After=network.target postgresql.service

[Service]
WorkingDirectory=$workdir
Environment=PORT=$port
${extra_env:+Environment=$extra_env
}ExecStart=$exec_start
Restart=always
User=$owner

[Install]
WantedBy=multi-user.target
EOF
  root_run systemctl daemon-reload
  root_run systemctl enable "$name" >/dev/null 2>&1 || true
  if root_run systemctl restart "$name"; then
    ok "$name service running (port $port) — restart after upgrades: systemctl restart $name"
  else
    warn "$name failed to start — check: journalctl -u $name (is port $port free?)"
  fi
}

install_api_service() {
  local port
  port="$(url_port "$BACKEND_URL")"
  install_service isp-billing-api "ISP Billing API (Laravel)" "$ROOT/backend" "${port:-8000}" \
    "$(command -v php) artisan serve --host 127.0.0.1 --port ${port:-8000}"
}

install_ui_service() {
  local port
  port="$(url_port "$FRONTEND_URL")"
  install_service isp-billing-ui "ISP Billing UI (Next.js)" "$ROOT/frontend" "${port:-3000}" \
    "$(command -v npm) start" "BACKEND_URL=$BACKEND_URL"
}

# ---------------------------------------------------------------- run
[ "$DO_BACKEND" = 1 ] && { create_databases; install_backend; }
[ "$DO_BACKEND" = 1 ] && [ "$DO_RADIUS_CONF" = 1 ] && configure_freeradius
[ "$DO_BACKEND" = 1 ] && [ "$DO_SERVICE" = 1 ] && install_api_service
[ "$DO_FRONTEND" = 1 ] && install_frontend
[ "$DO_FRONTEND" = 1 ] && [ "$DO_SERVICE" = 1 ] && install_ui_service

cat <<EOF

──────────────────────────────────────────────────────────────
 Install complete.

 Start (development):
   cd backend  && php artisan serve          # API  → http://localhost:8000
   cd frontend && npm start                  # UI   → $FRONTEND_URL

 Required cron entry (billing enforcement):
   * * * * * cd $ROOT/backend && php artisan schedule:run >> /dev/null 2>&1

 Default login (if seeded): admin@isp.local / admin12345
 Production deployment guide: docs/INSTALL.md
──────────────────────────────────────────────────────────────
EOF
