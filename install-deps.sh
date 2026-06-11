#!/usr/bin/env bash
#
# Core system dependencies installer for the ISP Billing System.
#
# Installs everything ./install.sh expects to find on the machine:
#   - PHP 8.3 (CLI + FPM) with pgsql, mbstring, xml, curl, zip, intl, bcmath
#   - Composer 2
#   - PostgreSQL server + client (started and enabled)
#   - Node.js 20 LTS + npm (via NodeSource if the distro version is too old)
#   - git, curl, unzip, cron
#
# Usage (run as root / with sudo):
#   sudo ./install-deps.sh                    # everything above
#   sudo ./install-deps.sh --with-freeradius  # also FreeRADIUS 3 + SQL module
#   sudo ./install-deps.sh --node 22          # pick the Node.js major version
#
# Supported: Debian 12+, Ubuntu 22.04+ (apt). On RHEL-family distros the
# script prints the equivalent dnf packages and exits.
#
set -euo pipefail

NODE_MAJOR=20
WITH_FREERADIUS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --with-freeradius) WITH_FREERADIUS=1 ;;
    --node) shift; NODE_MAJOR="${1:?--node needs a version, e.g. --node 20}" ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)"; exit 1 ;;
  esac
  shift
done

ok()   { printf '\033[32m✔\033[0m %s\n' "$*"; }
info() { printf '\033[34m➜\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Run as root: sudo ./install-deps.sh"

# ---------------------------------------------------------------- distro
if [ -r /etc/os-release ]; then
  . /etc/os-release
else
  die "Cannot detect distribution (/etc/os-release missing)"
fi

case "${ID:-}:${ID_LIKE:-}" in
  debian:*|ubuntu:*|*:*debian*|*:*ubuntu*) PKG=apt ;;
  rhel:*|centos:*|rocky:*|almalinux:*|fedora:*|*:*rhel*|*:*fedora*)
    cat <<'EOF'
This script automates Debian/Ubuntu. On RHEL-family systems install:

  dnf install -y php php-cli php-fpm php-pgsql php-mbstring php-xml \
                 php-curl php-zip php-intl php-bcmath php-process \
                 postgresql-server postgresql composer nodejs npm \
                 git curl unzip cronie
  postgresql-setup --initdb && systemctl enable --now postgresql crond
  # FreeRADIUS (optional): dnf install -y freeradius freeradius-postgresql

Then run ./install.sh as usual.
EOF
    exit 1
    ;;
  *) die "Unsupported distribution: ${PRETTY_NAME:-unknown}. Install PHP 8.2+, Composer, PostgreSQL and Node 18.18+ manually, then run ./install.sh." ;;
esac

export DEBIAN_FRONTEND=noninteractive

info "Updating package index…"
apt-get update -qq

# ---------------------------------------------------------------- basics
info "Installing base tools (git, curl, unzip, cron)…"
apt-get install -y -qq git curl unzip cron ca-certificates gnupg >/dev/null
ok "Base tools installed"

# ---------------------------------------------------------------- PHP
info "Installing PHP + extensions…"
# Ubuntu 22.04 ships PHP 8.1; pull in the ondrej/php PPA for 8.3 there.
if ! apt-cache show php8.3-cli >/dev/null 2>&1; then
  if [ "${ID}" = "ubuntu" ]; then
    info "Adding ppa:ondrej/php for PHP 8.3…"
    apt-get install -y -qq software-properties-common >/dev/null
    add-apt-repository -y ppa:ondrej/php >/dev/null
    apt-get update -qq
  else
    die "php8.3 packages not available — add a PHP 8.2+/8.3 repository (e.g. packages.sury.org for Debian) and re-run."
  fi
fi
apt-get install -y -qq \
  php8.3-cli php8.3-fpm php8.3-pgsql php8.3-mbstring php8.3-xml \
  php8.3-curl php8.3-zip php8.3-intl php8.3-bcmath >/dev/null
ok "PHP $(php -r 'echo PHP_VERSION;') installed"

# ---------------------------------------------------------------- Composer
if command -v composer >/dev/null 2>&1; then
  ok "Composer $(composer --version 2>/dev/null | awk '{print $3}') already installed"
else
  info "Installing Composer…"
  EXPECTED="$(curl -fsSL https://composer.github.io/installer.sig)"
  curl -fsSL https://getcomposer.org/installer -o /tmp/composer-setup.php
  ACTUAL="$(php -r "echo hash_file('sha384', '/tmp/composer-setup.php');")"
  [ "$EXPECTED" = "$ACTUAL" ] || die "Composer installer checksum mismatch — aborting"
  php /tmp/composer-setup.php --quiet --install-dir=/usr/local/bin --filename=composer
  rm -f /tmp/composer-setup.php
  ok "Composer $(composer --version 2>/dev/null | awk '{print $3}') installed"
fi

# ---------------------------------------------------------------- PostgreSQL
info "Installing PostgreSQL…"
apt-get install -y -qq postgresql postgresql-client >/dev/null
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl enable --now postgresql >/dev/null 2>&1 || service postgresql start
else
  service postgresql start 2>/dev/null || true
fi
ok "PostgreSQL $(psql --version | awk '{print $3}') installed and running"

# ---------------------------------------------------------------- Node.js
node_ok() {
  command -v node >/dev/null 2>&1 \
    && node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>18||(a===18&&b>=18)?0:1)'
}
if node_ok; then
  ok "Node.js $(node -v) already installed"
else
  info "Installing Node.js ${NODE_MAJOR}.x from NodeSource…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  node_ok || die "Node.js install failed (need 18.18+, got $(node -v 2>/dev/null || echo none))"
  ok "Node.js $(node -v) installed"
fi

# ---------------------------------------------------------------- FreeRADIUS
if [ "$WITH_FREERADIUS" = 1 ]; then
  info "Installing FreeRADIUS + PostgreSQL SQL module…"
  apt-get install -y -qq freeradius freeradius-postgresql freeradius-utils >/dev/null
  ok "FreeRADIUS installed (./install.sh will auto-configure the sql module)"
fi

# ---------------------------------------------------------------- summary
cat <<EOF

──────────────────────────────────────────────────────────────
 Core dependencies installed:

   PHP        $(php -r 'echo PHP_VERSION;')   (cli, fpm, pgsql, mbstring, xml, curl, zip, intl, bcmath)
   Composer   $(composer --version 2>/dev/null | awk '{print $3}')
   PostgreSQL $(psql --version | awk '{print $3}')   (service running)
   Node.js    $(node -v) / npm $(npm -v)
$( [ "$WITH_FREERADIUS" = 1 ] && echo "   FreeRADIUS $(freeradius -v 2>/dev/null | sed -n 's/.*Version \([0-9.]*\).*/\1/p' | head -1)" )

 Next step:
   ./install.sh            # set up the application
──────────────────────────────────────────────────────────────
EOF
