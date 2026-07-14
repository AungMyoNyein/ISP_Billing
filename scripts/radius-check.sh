#!/usr/bin/env bash
#
# RADIUS connectivity / NAS troubleshooting helper for ISP Billing.
#
# Runs the checks from docs/INTEGRATIONS.md in one shot: is FreeRADIUS up
# and bound to the right interface, are UDP 1812/1813 open, are the NAS
# clients loaded from the nas table, and (optionally) does a given user
# authenticate. Diagnoses the classic "RADIUS timeout" (no reply = unknown
# client / blocked port, NOT a bad password).
#
# Usage:
#   ./scripts/radius-check.sh                         # server-side checks
#   ./scripts/radius-check.sh --user bob --secret s3  # also radtest a user
#   ./scripts/radius-check.sh --listen                # live packet capture
#                                                       (fire nc from the NAS)
#
# Options:
#   --user <name>     PPPoE/RADIUS username to test with radtest
#   --secret <secret> shared secret for the radtest client (default: testing123,
#                     the stock localhost client)
#   --host <ip>       RADIUS server IP for the radtest (default: 127.0.0.1)
#   --listen          tcpdump UDP 1812/1813 until Ctrl-C, to watch NAS packets
#   -h, --help        this help
#
set -uo pipefail

ok()   { printf '\033[32m✔\033[0m %s\n' "$*"; }
info() { printf '\033[34m➜\033[0m %s\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

USER="" SECRET="testing123" HOST="127.0.0.1" LISTEN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --user)   USER="${2:-}"; shift 2 ;;
    --secret) SECRET="${2:-}"; shift 2 ;;
    --host)   HOST="${2:-}"; shift 2 ;;
    --listen) LISTEN=1; shift ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

# Run a command as root when possible (needed for ss -p, tcpdump, journalctl).
as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else "$@"; fi
}

# --listen mode: just capture and exit (the rest of the script is offline checks).
if [ "$LISTEN" = 1 ]; then
  command -v tcpdump >/dev/null 2>&1 || die "tcpdump not installed (apt install tcpdump)"
  info "Capturing UDP 1812/1813 — fire from the NAS, then Ctrl-C:"
  echo "    echo test | nc -u -w1 <this-server-ip> 1812"
  exec as_root tcpdump -ni any 'udp and (port 1812 or port 1813)'
fi

echo "── FreeRADIUS service ──────────────────────────────────────"
svc=""
for s in freeradius radiusd; do
  systemctl cat "$s" >/dev/null 2>&1 && { svc=$s; break; }
done
if [ -z "$svc" ]; then
  warn "No freeradius/radiusd systemd unit found — is FreeRADIUS installed here?"
elif systemctl is-active --quiet "$svc"; then
  ok "$svc is running"
else
  warn "$svc is NOT running — start it: sudo systemctl start $svc"
fi

echo "── Listening sockets (UDP 1812 auth / 1813 acct) ───────────"
# Match only the auth/acct ports exactly ($4 = Local Address:Port), so the
# loopback status socket on :18120 doesn't get mistaken for :1812.
listen=$(as_root ss -ulnp 2>/dev/null | awk '$4 ~ /:(1812|1813)$/' || true)
if [ -z "$listen" ]; then
  warn "Nothing listening on 1812/1813 — FreeRADIUS is down or not bound"
else
  printf '%s\n' "$listen"
  if printf '%s\n' "$listen" | grep -qE '(0\.0\.0\.0|\[::\]|\*):(1812|1813)$'; then
    ok "Listening on all interfaces (0.0.0.0 / ::)"
  elif printf '%s\n' "$listen" | grep -qE '127\.0\.0\.1:(1812|1813)$'; then
    warn "Bound to 127.0.0.1 only — remote NAS cannot reach it. Set 'ipaddr = *' in sites-enabled/default and restart."
  fi
fi

echo "── Local firewall (UDP 1812/1813 must be open) ─────────────"
fw_seen=0
if command -v ufw >/dev/null 2>&1 && as_root ufw status 2>/dev/null | grep -qi "Status: active"; then
  fw_seen=1
  if as_root ufw status 2>/dev/null | grep -qE '1812|1813'; then
    ok "ufw active with a 1812/1813 rule"
  else
    warn "ufw active but no 1812/1813 rule — sudo ufw allow 1812,1813/udp"
  fi
fi
if command -v firewall-cmd >/dev/null 2>&1 && as_root firewall-cmd --state 2>/dev/null | grep -qi running; then
  fw_seen=1
  if as_root firewall-cmd --list-ports 2>/dev/null | grep -qE '1812|1813'; then
    ok "firewalld running with a 1812/1813 port"
  else
    warn "firewalld running but no 1812/1813 port — firewall-cmd --add-port=1812-1813/udp --permanent && firewall-cmd --reload"
  fi
fi
[ "$fw_seen" = 0 ] && info "No active host firewall detected — check the CLOUD security group instead (the usual blocker)."

echo "── NAS clients loaded from the nas table ───────────────────"
# Read DB creds from backend/.env if present, else fall back to peer auth.
ENV="$(cd "$(dirname "$0")/.." && pwd)/backend/.env"
mysql_nas() {
  # -N -B: no column headers, tab-separated output.
  if [ -f "$ENV" ]; then
    local h p d u pw
    h=$(grep -E '^RADIUS_DB_HOST=' "$ENV" | cut -d= -f2-); p=$(grep -E '^RADIUS_DB_PORT=' "$ENV" | cut -d= -f2-)
    d=$(grep -E '^RADIUS_DB_DATABASE=' "$ENV" | cut -d= -f2-); u=$(grep -E '^RADIUS_DB_USERNAME=' "$ENV" | cut -d= -f2-)
    pw=$(grep -E '^RADIUS_DB_PASSWORD=' "$ENV" | cut -d= -f2-)
    MYSQL_PWD="$pw" mysql -h "${h:-127.0.0.1}" -P "${p:-3306}" -u "${u:-radius}" -N -B -D "${d:-radius}" -e "$1" 2>/dev/null
  else
    # No .env: fall back to root's socket auth (stock MySQL 8 on Debian).
    mysql --protocol=socket -u root -N -B -D radius -e "$1" 2>/dev/null
  fi
}
# CONCAT, not ||: MySQL reads || as logical OR by default, which would
# silently print 0 for every row instead of the nasname.
nas=$(mysql_nas "SELECT CONCAT(nasname, '  (', shortname, ')') FROM nas ORDER BY nasname;")
if [ -z "$nas" ]; then
  warn "Cannot read the nas table (check RADIUS_DB_* in backend/.env) or it is empty"
else
  printf '%s\n' "$nas" | sed 's/^/    /'
  ok "$(printf '%s\n' "$nas" | grep -c .) NAS client(s) in the table"
  warn "FreeRADIUS reads these only at STARTUP — restart it after adding a NAS (RADIUS_RELOAD_COMMAND)."
fi

if [ -n "$USER" ]; then
  echo "── radtest $USER @ $HOST ───────────────────────────────────"
  if ! command -v radtest >/dev/null 2>&1; then
    warn "radtest not installed (apt install freeradius-utils)"
  else
    out=$(radtest "$USER" "$USER" "$HOST" 0 "$SECRET" 2>&1)
    if printf '%s' "$out" | grep -q "Access-Accept"; then
      ok "Access-Accept — user, password, group and server are all fine"
    elif printf '%s' "$out" | grep -q "Access-Reject"; then
      warn "Access-Reject — server replied but denied (wrong password, suspended, or expired)"
    else
      warn "No reply — timeout. Wrong client secret, unknown client IP, or port blocked. Run with --listen and check the cloud firewall."
    fi
    printf '%s\n' "$out" | grep -E 'Access-(Accept|Reject)|Reply-Message|No reply|timed out' | sed 's/^/    /'
  fi
fi

echo "── Reachability from a NAS (UDP cannot be TCP-tested) ──────"
cat <<'TXT'
    TCP tools (telnet/nc/port scanners) ALWAYS report a RADIUS port closed,
    and FreeRADIUS never answers a blind probe. To prove reachability:

      on this server:   ./scripts/radius-check.sh --listen
      from the NAS:     echo test | nc -u -w1 <this-server-ip> 1812

    Packet appears  -> port open; any failure is a client/secret issue.
    Nothing appears -> blocked upstream (cloud security group / firewall).
TXT
