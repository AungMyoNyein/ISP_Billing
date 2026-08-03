# Integrations: FreeRADIUS, NAS routers, SmartOLT

## FreeRADIUS

The billing system manages the standard FreeRADIUS SQL schema directly —
no custom modules needed. Point both FreeRADIUS and the backend at the
same database (`RADIUS_DB_*` in `backend/.env`; both PostgreSQL and
MySQL schemas are supported).

### What the system writes

| Table          | Managed rows                                                       |
|----------------|--------------------------------------------------------------------|
| `radcheck`     | `Cleartext-Password :=` per customer; `Auth-Type := Reject` while suspended/expired |
| `radreply`     | the customer's static `Framed-IP-Address`, when set                 |
| `radgroupreply`| per plan: `Mikrotik-Rate-Limit`, `Framed-Pool`, `Session-Timeout`, `Idle-Timeout`, `Acct-Interim-Interval`, plus `Service-Type`/`Framed-Protocol` |
| `radgroupcheck`| per plan: `Simultaneous-Use`                                        |
| `radusergroup` | the plan's `radius_group` + a `suspended` marker group              |
| `nas`          | one row per router from the Network module (`nas_ip`, `radius_secret`) |

`radacct` and `radpostauth` are read-only for the system: online sessions,
per-customer daily bandwidth, the dashboard's online-user count, and the
Authentication Log (Network → Authentication Log).

### What counts as "online"

A `radacct` row is closed only when the NAS sends an Accounting-Stop. A
router that reboots, loses power or has its uplink cut never sends one, so
its sessions stay open **forever** and every online figure freezes at the
moment things broke — the dashboard keeps reporting users who left days ago.

So a session counts as online only if it has no `acctstoptime` *and* its
accounting is fresh: `COALESCE(acctupdatetime, acctstarttime)` within
`RADIUS_SESSION_STALE_MINUTES` (default 30). The COALESCE matters — a
session that just connected has no `acctupdatetime` until its first interim
update, and must not be hidden.

This depends on **interim accounting**. Plans set `Acct-Interim-Interval`,
and the NAS must be configured to send updates; if yours are less frequent
than every 30 minutes, raise `RADIUS_SESSION_STALE_MINUTES` above twice the
interval or live sessions will drop off the list. Set it to `0` to disable
the freshness check and trust `acctstoptime` alone.

Stale rows are hidden, not deleted, so accounting history and bandwidth
totals are unaffected. That is why a customer can read **Offline** on the
Bandwidth Usage tab while the chart beside it shows traffic: the chart reads
the same rows with no freshness condition. The status tile distinguishes the
two cases — **Idle** means the session is still open but its accounting has
gone quiet (almost always a NAS not sending interim updates), **Offline**
means no open session at all, and both report how long ago accounting last
arrived.

The comparison runs in the database (`localtimestamp`), not in PHP.
`acctstarttime` and `acctupdatetime` are `timestamp without time zone` and
FreeRADIUS writes them in the *database server's* local time, while Carbon's
`now()` follows `app.timezone`. Binding the PHP clock compared Yangon-local
values against a UTC threshold, quietly turning a 30-minute window into a
seven-hour one.

### FreeRADIUS configuration

> **Automatic:** when FreeRADIUS is installed on the same machine
> (`sudo ./install-deps.sh --with-freeradius`), `./install.sh` performs
> steps 1–3 below itself: it writes `mods-available/sql` with the
> installer's DB credentials (the distro original is kept as
> `sql.dist`), enables the module, activates `sql` in the
> `authorize`/`accounting`/`session` sections of the default site and
> restarts the service. Post-auth results are logged to `radpostauth`.
> Pass `--no-freeradius` to skip this, e.g. when FreeRADIUS runs on a
> different host — then follow the manual steps below there.

1. Enable the SQL module:

   ```bash
   ln -s ../mods-available/sql /etc/freeradius/3.0/mods-enabled/sql
   ```

2. In `mods-available/sql` set the dialect and connection:

   ```
   sql {
       dialect = "postgresql"          # or "mysql"
       driver = "rlm_sql_${dialect}"
       server = "127.0.0.1"
       port = 5432
       login = "isp_billing"
       password = "..."
       radius_db = "radius"
       read_clients = yes              # load NAS clients from the nas table
   }
   ```

3. In `sites-enabled/default`, make sure `sql` is active in the
   `authorize`, `accounting` and `session` sections, and enable
   interim accounting updates on the NAS so bandwidth graphs stay
   current.

After a restart, FreeRADIUS authenticates PPPoE users created in the
CRM, rejects suspended customers, and writes accounting that the UI
visualises.

### NAS changes trigger a FreeRADIUS restart

FreeRADIUS loads its SQL clients (the `nas` table) **only at startup** —
a reload/HUP does *not* re-read it. So when you add or edit a router, the
backend runs `RADIUS_RELOAD_COMMAND` (default
`sudo -n systemctl restart freeradius`) to restart the service and pick up
the new client. Without this, a freshly added NAS sends packets that
FreeRADIUS silently drops as an *unknown client* — the NAS reports a
**RADIUS timeout** (no reply).

- Under php-fpm the web user (`www-data`/`nginx`) needs passwordless
  permission to run the restart; `install.sh` drops a scoped sudoers rule
  (`/etc/sudoers.d/isp-billing-radius`). In dev (`artisan serve` as root)
  no rule is needed.
- Set `RADIUS_RELOAD_COMMAND` blank when FreeRADIUS runs on a different
  host (then restart it there yourself, or use FreeRADIUS dynamic clients).
- The reload is best-effort: a failure logs a warning and the Routers page
  shows an amber banner — the router still saves.

### NAS type and `Simultaneous-Use`

Routers are written to `nas` with `nastype = mikrotik`
(`RadiusService::NAS_TYPE`). The type only matters when a plan sets
**Simultaneous-Use**: FreeRADIUS then calls `checkrad` to ask whether an
existing `radacct` session is really still live before rejecting the new
login. `mikrotik` selects checkrad's `mikrotik_telnet` probe.

That probe telnets into the router, so it needs:

- telnet enabled on the MikroTik (Winbox → IP → Services), and
- the router's credentials in `/etc/freeradius/3.0/naspasswd`, one line per
  NAS: `<nas-ip> <user> <password>`.

Without those, the probe times out (~seconds per check) and stale sessions
are treated as live, so a customer who crashed offline can't reconnect until
the accounting row is closed. If you don't want session verification, set
those plans' Simultaneous-Use to blank, or change `NAS_TYPE` to `other` —
with `other`, checkrad is skipped and the `radacct` row is trusted as-is.

### Firewall / network (UDP 1812 + 1813)

FreeRADIUS listens on **UDP 1812** (auth) and **UDP 1813** (accounting).
Both must be reachable from every NAS:

- Open **UDP** 1812 and 1813 in any host firewall (`ufw allow 1812,1813/udp`)
  **and** in the cloud provider's security group / network firewall — the
  latter is the usual culprit when the OS has no local firewall.
- FreeRADIUS must bind to the right interface: `ipaddr = *` in
  `sites-enabled/default` (check `ss -ulnp | grep 181` — it should show
  `0.0.0.0:1812`, not `127.0.0.1`).

> **You cannot test a RADIUS port with a TCP tool.** `telnet`/`nc`/port
> scanners (TCP) always report it closed, and FreeRADIUS never replies to a
> blind UDP probe, so even `nmap -sU` looks "filtered" on a working server.

To actually verify reachability, run a capture on the server and fire a
datagram from the NAS (or any outside host):

```bash
# on the RADIUS server
sudo tcpdump -ni any 'udp and (port 1812 or port 1813)'

# from the NAS / an outside host (replace with the server's public IP)
echo test | nc -u -w1 <radius-server-ip> 1812
```

Packet shows up → the port path is open (any failure is then a client/secret
issue — debug with `freeradius -X`). Nothing shows up → it's blocked
upstream (security group / firewall / wrong target IP).

`scripts/radius-check.sh` runs all of the above in one shot — service state,
bind address, host firewall, loaded `nas` clients, and an optional
`--user <name> --secret <s>` radtest; `--listen` starts the capture above.

### Suspension model

Suspension adds `Auth-Type := Reject` (denies the next authentication)
and the `suspended` group, then kicks the live PPPoE session with a
RADIUS Disconnect-Request (RFC 5176, sent with `radclient` to the NAS
CoA port) so the customer is offline immediately — accounting history
is preserved. Reconnection removes both rows and re-provisions plan
attributes.

**Rejects are sent immediately.** FreeRADIUS ships with
`reject_delay = 1` in `radiusd.conf`, holding every Access-Reject for a
second to slow brute-force attempts. MikroTik's RADIUS timeout defaults
to **300 ms**, so a suspended customer's reject arrives long after the
NAS gave up — the router logs a *RADIUS timeout* instead of an
authentication failure, which looks identical to an unreachable server.
`install.sh` therefore sets `reject_delay = 0` (keeping the distro file
as `radiusd.conf.dist`). Clients are limited to the billing-managed
`nas` table, so the rate-limit protects little. Also raise the NAS side
— `/radius set [find] timeout=3s` — since 300 ms is too tight for any
SQL-backed RADIUS once the `radcheck` query is under load.

## NAS routers (MikroTik or any RADIUS-capable BRAS)

All communication with the router goes through RADIUS — there is no
RouterOS API access. Add routers under **Network → Routers** with the
NAS IP (as FreeRADIUS sees it), the shared RADIUS secret, and the CoA
port; the entry is synced to the FreeRADIUS `nas` table.

### Router requirements (MikroTik example)

- PPPoE server with `use-radius=yes` in the PPP AAA settings; the rate
  limit then comes from the RADIUS `Mikrotik-Rate-Limit` reply
  attribute, so no per-user queues are needed.
- Accept incoming RADIUS disconnects (RFC 5176) so live sessions can
  be kicked on suspension:

  ```
  /radius incoming set accept=yes port=3799
  ```

  The shared secret of the `/radius` entry must match the router's
  `radius_secret` in the billing system.
- Enable interim accounting updates (`interim-update`) so bandwidth
  graphs and the status page stay current.

### What the system does

| Action               | Mechanism                                    | When                         |
|----------------------|----------------------------------------------|------------------------------|
| Kick a PPPoE session | `radclient ... disconnect` to `nas_ip:coa_port` | On suspension/expiry and via "disconnect user" |
| NAS activity         | `radacct` aggregation (online sessions, last accounting packet) | Status page |

`radclient` ships with `freeradius-utils`, installed by
`install-deps.sh --with-freeradius`.

## SmartOLT

Optional. Set `SMARTOLT_BASE_URL` (e.g.
`https://yourisp.smartolt.com/api`) and `SMARTOLT_API_KEY`; requests
send the key as the `X-Token` header. Until both are set, the UI shows
SmartOLT as "not configured" and `GET /customers/{id}/onu` returns
`enabled: false`.

Give each customer their **ONU serial** in the CRM, then:

- `GET /api/customers/{id}/onu` returns ONU status + optical signal;
- `SmartOltService` also exposes `enableOnu()` / `disableOnu()` for
  custom flows (not wired to suspension by default — suspension is
  enforced at the RADIUS/PPPoE layer).

### Importing ONUs as customers (`smartolt:sync`)

Authorise the ONU in SmartOLT and the customer appears in billing on the
next hourly run — no re-typing. Identity comes from the ONU itself:

| Billing field | SmartOLT source |
|---|---|
| `customer_code` and `name` | ONU **Name** (both, there is no separate name) |
| `username` / `radius_password` | WAN setup PPPoE username / password |
| `address`, `dn_zone`, `sn_odb`, `gps_location` | ONU address / zone / ODB / GPS |
| `smartolt_onu_sn` | ONU serial — the sync key, now `UNIQUE` |
| service plan, activation and expiry dates | **not imported** — set them in billing |

Imported customers land as **pending**: nothing is written to RADIUS and
no invoice is raised. Assign a plan and activate to provision access.

The sync is **create-only**. An ONU serial billing already knows —
including soft-deleted customers — is left untouched, so it never
overwrites an operator's edits. It also skips, rather than guesses, when
an ONU has no serial, no name, no PPPoE credentials, or whose code or
username collides with an existing customer (or with another ONU in the
same batch); every skip is printed with its reason.

```bash
php artisan smartolt:sync --dry-run   # show what would be imported
php artisan smartolt:sync             # import
```

Scheduled hourly in `routes/console.php` alongside `billing:process`, and
a no-op while SmartOLT is unconfigured.

What the live API returns (verified against a production account):

- `GET /onu/get_all_onus_details` → `{onus: [...], status, response_code}`,
  every ONU in one response — there is no pagination to handle.
- PPPoE credentials are **inline on each ONU** as `username` / `password`,
  in cleartext. There is no separate WAN-config endpoint;
  `/onu/get_onu_wan_config/{sn}` answers **405**.
- Useful fields: `sn`, `name`, `zone_name`, `odb_name`, `address`,
  `administrative_status` (only `Enabled` ONUs are imported), `wan_mode`
  (an ONU set to "Setup via ONU webpage" has no credentials and is
  skipped), `latitude`/`longitude` (null unless the ONU is placed on the
  map — `gps_location` is only set when both are present).

Field names are still read through a small candidate list per field
(`SN_KEYS`, `NAME_KEYS`, `PPPOE_*_KEYS` in `SyncSmartOlt`), so a payload
change shows up as a skip with a reason rather than a bad customer.
