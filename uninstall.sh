#!/usr/bin/env bash
#
# ISP Billing System uninstaller — reverses install.sh.
#
# Removes the systemd units, reverts the FreeRADIUS sql module to the
# distro original, drops the PostgreSQL databases and role, and deletes
# the logrotate drop-in. Source code is never touched; build artefacts
# only with --purge-files.
#
# Usage:
#   ./uninstall.sh                  # prompts before anything destructive
#   ./uninstall.sh --dry-run        # print the plan, change nothing
#   ./uninstall.sh --yes            # no prompt (scripts/reinstall flows)
#   ./uninstall.sh --keep-database  # leave the databases and role alone
#   ./uninstall.sh --keep-freeradius# leave FreeRADIUS config alone
#   ./uninstall.sh --keep-env       # keep backend/.env, frontend/.env.local
#   ./uninstall.sh --purge-files    # also delete vendor/, node_modules/, .next/
#   ./uninstall.sh --no-backup      # skip the pre-drop pg_dump (not advised)
#   ./uninstall.sh --no-service     # leave the systemd units alone
#   ./uninstall.sh --no-logrotate   # leave /etc/logrotate.d/isp-billing alone
#   ./uninstall.sh --backup-dir=DIR # where dumps go (default ./uninstall-backup-<ts>)
#
# Database settings are read from backend/.env when it exists, so the
# script drops the databases this install actually used; environment
# variables (DB_NAME, RADIUS_DB_NAME, DB_USER, DB_HOST, DB_PORT) override.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSUME_YES=0
DRY_RUN=0
DO_BACKUP=1
DO_DATABASE=1
DO_RADIUS_CONF=1
DO_SERVICE=1
DO_LOGROTATE=1
DO_ENV=1
PURGE_FILES=0
BACKUP_DIR=""

for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --no-backup) DO_BACKUP=0 ;;
    --keep-database) DO_DATABASE=0 ;;
    --keep-freeradius) DO_RADIUS_CONF=0 ;;
    --keep-env) DO_ENV=0 ;;
    --purge-files) PURGE_FILES=1 ;;
    --no-service) DO_SERVICE=0 ;;
    --no-logrotate) DO_LOGROTATE=0 ;;
    --backup-dir=*) BACKUP_DIR="${arg#*=}" ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)"; exit 1 ;;
  esac
done

ok()   { printf '\033[32m✔\033[0m %s\n' "$*"; }
info() { printf '\033[34m➜\033[0m %s\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

root_run() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then sudo "$@"
  else return 1; fi
}

have_systemd() { command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; }

# Every mutation goes through act(), so --dry-run is honest rather than
# something each call site has to remember.
act() {
  if [ "$DRY_RUN" = 1 ]; then printf '   would run: %s\n' "$*"; return 0; fi
  root_run "$@"
}

# A dry run must never claim it removed something. Success lines are reported
# through this, so --dry-run output is only ever "would run:" lines.
did() { [ "$DRY_RUN" = 1 ] || ok "$@"; }

# ------------------------------------------------------------ configuration
# backend/.env is authoritative: it names the databases this install really
# created, which may differ from the defaults if it was installed with
# DB_NAME=... set.
env_get() {
  [ -f "$ROOT/backend/.env" ] || return 0
  sed -n "s/^$1=//p" "$ROOT/backend/.env" | head -n1 | tr -d '"' | tr -d "\r"
}

DB_HOST="${DB_HOST:-$(env_get DB_HOST)}";               DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-$(env_get DB_PORT)}";               DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-$(env_get DB_DATABASE)}";           DB_NAME="${DB_NAME:-isp_billing}"
DB_USER="${DB_USER:-$(env_get DB_USERNAME)}";           DB_USER="${DB_USER:-isp_billing}"
RADIUS_DB_NAME="${RADIUS_DB_NAME:-$(env_get RADIUS_DB_DATABASE)}"
RADIUS_DB_NAME="${RADIUS_DB_NAME:-radius}"

[ -n "$BACKUP_DIR" ] || BACKUP_DIR="$ROOT/uninstall-backup-$(date +%Y%m%d-%H%M%S)"

# Same superuser strategy as install.sh's create_databases().
run_psql() {
  if command -v sudo >/dev/null 2>&1 && sudo -n -u postgres true 2>/dev/null; then
    printf '%s\n' "$1" | (cd / && sudo -u postgres psql -v ON_ERROR_STOP=1 -f -)
  elif [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
    printf '%s\n' "$1" | su - postgres -c "psql -v ON_ERROR_STOP=1 -f -"
  else
    printf '%s\n' "$1" | PGPASSWORD="${PGSUPER_PASS:-}" psql -h "$DB_HOST" -p "$DB_PORT" \
      -U "${PGSUPER_USER:-postgres}" -v ON_ERROR_STOP=1 -f -
  fi
}

# ------------------------------------------------------------ confirmation
cat <<EOF

──────────────────────────────────────────────────────────────
 ISP Billing uninstall — this will:
EOF
[ "$DO_SERVICE"   = 1 ] && echo "   • stop and delete the isp-billing-api / isp-billing-ui systemd units"
[ "$DO_RADIUS_CONF" = 1 ] && echo "   • restore FreeRADIUS mods-available/sql and radiusd.conf from their .dist backups"
[ "$DO_RADIUS_CONF" = 1 ] && echo "   • disable the sql module and remove /etc/sudoers.d/isp-billing-radius"
[ "$DO_DATABASE"  = 1 ] && echo "   • DROP DATABASE \"$DB_NAME\" and \"$RADIUS_DB_NAME\", and DROP ROLE \"$DB_USER\""
[ "$DO_DATABASE"  = 1 ] && [ "$DO_BACKUP" = 1 ] && echo "     (dumped first to $BACKUP_DIR)"
[ "$DO_LOGROTATE" = 1 ] && echo "   • remove /etc/logrotate.d/isp-billing"
[ "$DO_ENV"       = 1 ] && echo "   • remove backend/.env and frontend/.env.local"
[ "$PURGE_FILES"  = 1 ] && echo "   • delete backend/vendor, frontend/node_modules, frontend/.next"
cat <<EOF

 Source code and git history are NOT touched.
──────────────────────────────────────────────────────────────
EOF

if [ "$((DO_SERVICE + DO_RADIUS_CONF + DO_DATABASE + DO_LOGROTATE + DO_ENV + PURGE_FILES))" = 0 ]; then
  info "Every step was disabled by a --keep/--no flag — nothing to do."
  exit 0
fi

if [ "$DRY_RUN" = 1 ]; then
  info "Dry run — nothing will be changed."
elif [ "$ASSUME_YES" != 1 ]; then
  # Prompting needs a terminal. Without one (cron, CI, a piped shell) the run
  # aborts rather than guessing consent — pass --yes to skip the prompt.
  # The open is tested in a subshell: [ -r /dev/tty ] only stats the device
  # and passes even where opening it fails, and a failed redirection on `exec`
  # in this shell would be fatal.
  ( exec </dev/tty ) 2>/dev/null \
    || die "No terminal to confirm on — re-run with --yes to proceed unattended."
  if [ "$DO_DATABASE" = 1 ]; then
    printf 'Type the database name (%s) to confirm: ' "$DB_NAME"
    read -r reply </dev/tty || reply=""
    [ "$reply" = "$DB_NAME" ] || die "Aborted — got '$reply'."
  else
    printf 'Continue? [y/N] '
    read -r reply </dev/tty || reply=""
    case "$reply" in y|Y|yes|YES) ;; *) die "Aborted." ;; esac
  fi
fi

# ------------------------------------------------------------ systemd units
remove_services() {
  if ! have_systemd; then
    info "systemd not detected — skipping unit removal"
    return 0
  fi
  if ! root_run true 2>/dev/null; then
    warn "No root access — remove the isp-billing-* units manually"
    return 0
  fi

  local name
  for name in isp-billing-api isp-billing-ui; do
    if [ -f "/etc/systemd/system/$name.service" ]; then
      act systemctl stop "$name" || true
      act systemctl disable "$name" >/dev/null 2>&1 || true
      act rm -f "/etc/systemd/system/$name.service"
      did "Removed $name.service"
    else
      info "$name.service not present — nothing to remove"
    fi
  done
  act systemctl daemon-reload || true
  act systemctl reset-failed || true
}

# ------------------------------------------------------------ freeradius
# Undo configure_freeradius(): put the distro files back, take the sql module
# out of the enabled set and out of the default site, and drop the sudoers
# rule. Restoring is a move, not a copy, so a later install.sh re-runs its own
# backup step cleanly instead of preserving a file we already replaced.
revert_freeradius() {
  local raddb="" d
  for d in /etc/freeradius/3.0 /etc/raddb /etc/freeradius; do
    [ -f "$d/mods-available/sql" ] && { raddb="$d"; break; }
  done
  if [ -z "$raddb" ]; then
    info "FreeRADIUS not detected — skipping config revert"
    return 0
  fi
  if ! root_run true 2>/dev/null; then
    warn "FreeRADIUS found at $raddb but no root access — revert it manually"
    return 0
  fi

  info "Reverting FreeRADIUS config ($raddb)…"

  if [ -f "$raddb/mods-available/sql.dist" ]; then
    act mv -f "$raddb/mods-available/sql.dist" "$raddb/mods-available/sql"
    did "Restored mods-available/sql from sql.dist"
  else
    warn "No sql.dist backup — mods-available/sql still holds the generated config (and the DB password)"
  fi

  if [ -f "$raddb/radiusd.conf.dist" ]; then
    act mv -f "$raddb/radiusd.conf.dist" "$raddb/radiusd.conf"
    did "Restored radiusd.conf from radiusd.conf.dist (reject_delay back to the distro value)"
  fi

  local qconf="$raddb/mods-config/sql/main/postgresql/queries.conf"
  if [ -f "$qconf.dist" ]; then
    act mv -f "$qconf.dist" "$qconf"
    did "Restored queries.conf from queries.conf.dist (accounting timestamps back to the NAS clock)"
  fi

  # The distro ships sql disabled; install.sh created this symlink.
  if [ -L "$raddb/mods-enabled/sql" ]; then
    act rm -f "$raddb/mods-enabled/sql"
    did "Disabled the sql module"
  fi

  # Re-comment the bare "sql" entries install.sh uncommented. The stock "-sql"
  # (soft-fail) entries have a leading dash and are deliberately left alone.
  if [ -f "$raddb/sites-available/default" ]; then
    act sed -i -E \
      '/^(authorize|accounting|session) \{/,/^\}/ s/^[[:space:]]+sql[[:space:]]*$/#\tsql/' \
      "$raddb/sites-available/default"
  fi

  [ -f /etc/sudoers.d/isp-billing-radius ] && {
    act rm -f /etc/sudoers.d/isp-billing-radius
    did "Removed /etc/sudoers.d/isp-billing-radius"
  }

  # Only restart on a config that actually parses — leaving the box without a
  # RADIUS server is worse than leaving a stale config in place.
  local bin="" b
  for b in /usr/sbin/radiusd /usr/sbin/freeradius; do
    [ -x "$b" ] && { bin=$b; break; }
  done
  local svc=freeradius
  [ "$bin" = /usr/sbin/radiusd ] && svc=radiusd

  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: %s -C -d %s, then systemctl restart %s\n' "${bin:-radiusd}" "$raddb" "$svc"
    return 0
  fi
  if [ -n "$bin" ] && ! root_run "$bin" -C -d "$raddb" >/dev/null 2>&1; then
    root_run "$bin" -C -d "$raddb" 2>&1 | tail -n 5 >&2 || true
    warn "FreeRADIUS config check failed after revert — service NOT restarted; fix $raddb by hand"
    return 0
  fi
  if have_systemd; then
    root_run systemctl restart "$svc" >/dev/null 2>&1 \
      || warn "FreeRADIUS restart failed — check: journalctl -u $svc"
  fi
  ok "FreeRADIUS reverted to the distro configuration"
}

# ------------------------------------------------------------ databases
backup_databases() {
  [ "$DO_BACKUP" = 1 ] || { warn "Skipping backup (--no-backup)"; return 0; }
  command -v pg_dump >/dev/null 2>&1 || { warn "pg_dump not found — skipping backup"; return 0; }

  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: pg_dump %s and %s into %s\n' "$DB_NAME" "$RADIUS_DB_NAME" "$BACKUP_DIR"
    return 0
  fi

  mkdir -p "$BACKUP_DIR"
  local db
  for db in "$DB_NAME" "$RADIUS_DB_NAME"; do
    local out="$BACKUP_DIR/$db.sql"
    if command -v sudo >/dev/null 2>&1 && sudo -n -u postgres true 2>/dev/null; then
      (cd / && sudo -u postgres pg_dump "$db") > "$out" 2>/dev/null \
        || { rm -f "$out"; warn "Could not dump $db"; continue; }
    else
      PGPASSWORD="${PGSUPER_PASS:-}" pg_dump -h "$DB_HOST" -p "$DB_PORT" \
        -U "${PGSUPER_USER:-postgres}" "$db" > "$out" 2>/dev/null \
        || { rm -f "$out"; warn "Could not dump $db"; continue; }
    fi
    ok "Dumped $db → $out ($(du -h "$out" | cut -f1))"
  done
}

drop_databases() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run SQL: DROP DATABASE IF EXISTS "%s"; DROP DATABASE IF EXISTS "%s";\n' \
      "$DB_NAME" "$RADIUS_DB_NAME"
    printf '   would run SQL: DROP ROLE IF EXISTS "%s";\n' "$DB_USER"
    return 0
  fi

  info "Dropping databases '$DB_NAME', '$RADIUS_DB_NAME' and role '$DB_USER'…"

  local db
  for db in "$DB_NAME" "$RADIUS_DB_NAME"; do
    # An open connection makes DROP DATABASE fail outright, and FreeRADIUS or a
    # stray artisan process will be holding one.
    run_psql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
    if run_psql "DROP DATABASE IF EXISTS \"$db\";" >/dev/null 2>&1; then
      ok "Dropped database $db"
    else
      warn "Could not drop $db — something is still connected to it"
    fi
  done

  # The role may own objects in databases this installer never created, so a
  # failure here is reported rather than forced.
  if run_psql "DROP ROLE IF EXISTS \"$DB_USER\";" >/dev/null 2>&1; then
    ok "Dropped role $DB_USER"
  else
    warn "Could not drop role $DB_USER — it still owns objects elsewhere; check with: \\du"
  fi
}

# ------------------------------------------------------------ logrotate
remove_logrotate() {
  if [ ! -f /etc/logrotate.d/isp-billing ]; then
    info "/etc/logrotate.d/isp-billing not present — nothing to remove"
    return 0
  fi
  if act rm -f /etc/logrotate.d/isp-billing; then
    did "Removed /etc/logrotate.d/isp-billing"
  else
    warn "Could not remove /etc/logrotate.d/isp-billing (needs root)"
  fi
}

# ------------------------------------------------------------ files
remove_env_files() {
  local f
  for f in "$ROOT/backend/.env" "$ROOT/frontend/.env.local"; do
    if [ -f "$f" ]; then
      if [ "$DRY_RUN" = 1 ]; then printf '   would run: rm -f %s\n' "$f"
      else rm -f "$f"; ok "Removed ${f#"$ROOT"/}"; fi
    fi
  done
}

purge_build_files() {
  local d
  for d in "$ROOT/backend/vendor" "$ROOT/frontend/node_modules" "$ROOT/frontend/.next"; do
    if [ -d "$d" ]; then
      if [ "$DRY_RUN" = 1 ]; then printf '   would run: rm -rf %s\n' "$d"
      else rm -rf "$d"; ok "Removed ${d#"$ROOT"/}"; fi
    fi
  done
}

# ------------------------------------------------------------ run
# Services first so nothing reconnects to a database mid-drop, then FreeRADIUS
# (which must stop using the radius DB before it disappears), then the data.
[ "$DO_SERVICE"     = 1 ] && remove_services
[ "$DO_RADIUS_CONF" = 1 ] && revert_freeradius
[ "$DO_DATABASE"    = 1 ] && { backup_databases; drop_databases; }
[ "$DO_LOGROTATE"   = 1 ] && remove_logrotate
[ "$DO_ENV"         = 1 ] && remove_env_files
[ "$PURGE_FILES"    = 1 ] && purge_build_files

cron_hint=""
if crontab -l 2>/dev/null | grep -q "$ROOT/backend/artisan"; then
  cron_hint="
 A cron entry still runs the scheduler — remove it with 'crontab -e':
   $(crontab -l 2>/dev/null | grep "$ROOT/backend/artisan" | head -n1)
"
fi

cat <<EOF

──────────────────────────────────────────────────────────────
 Uninstall complete.
$( [ "$DO_DATABASE" = 1 ] && [ "$DO_BACKUP" = 1 ] && [ "$DRY_RUN" = 0 ] && echo " Database dumps kept in: $BACKUP_DIR
 Restore one with: sudo -u postgres psql -d $DB_NAME -f $BACKUP_DIR/$DB_NAME.sql
")$cron_hint
 Reinstall:
   ./install.sh --no-seed          # production, no demo data

 Note: install.sh generates a NEW APP_KEY when backend/.env is absent.
 Customer RADIUS passwords in an old database dump were encrypted with the
 previous key and will not decrypt under the new one — keep the old .env if
 you intend to restore that dump.
──────────────────────────────────────────────────────────────
EOF
