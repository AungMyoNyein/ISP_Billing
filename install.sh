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
#
# Configurable via environment variables (defaults shown):
#   DB_HOST=127.0.0.1  DB_PORT=5432
#   DB_NAME=isp_billing  RADIUS_DB_NAME=radius
#   DB_USER=isp_billing  DB_PASS=<generated>
#   API_URL=http://localhost:8000/api
#   FRONTEND_URL=http://localhost:3000
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED=1
DO_BACKEND=1
DO_FRONTEND=1

for arg in "$@"; do
  case "$arg" in
    --no-seed) SEED=0 ;;
    --backend-only) DO_FRONTEND=0 ;;
    --frontend-only) DO_BACKEND=0 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)"; exit 1 ;;
  esac
done

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-isp_billing}"
RADIUS_DB_NAME="${RADIUS_DB_NAME:-radius}"
DB_USER="${DB_USER:-isp_billing}"
DB_PASS="${DB_PASS:-$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24 || true)}"
API_URL="${API_URL:-http://localhost:8000/api}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

ok()   { printf '\033[32m✔\033[0m %s\n' "$*"; }
info() { printf '\033[34m➜\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1 — $2"; }

# ---------------------------------------------------------------- checks
info "Checking prerequisites…"

if [ "$DO_BACKEND" = 1 ]; then
  need php "install PHP 8.2+ (e.g. apt install php8.3-cli)"
  need composer "https://getcomposer.org/download/"
  php -r 'exit(version_compare(PHP_VERSION, "8.2.0", ">=") ? 0 : 1);' \
    || die "PHP 8.2+ required, found $(php -r 'echo PHP_VERSION;')"

  for ext in pdo_pgsql mbstring xml curl openssl; do
    php -m | grep -qi "^$ext\$" || die "Missing PHP extension: $ext (e.g. apt install php8.3-${ext/pdo_/})"
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
      printf '%s\n' "$1" | sudo -u postgres psql -v ON_ERROR_STOP=1 -f -
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

# ---------------------------------------------------------------- run
[ "$DO_BACKEND" = 1 ] && { create_databases; install_backend; }
[ "$DO_FRONTEND" = 1 ] && install_frontend

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
