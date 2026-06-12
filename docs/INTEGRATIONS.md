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
| `radreply`     | `Mikrotik-Rate-Limit`, `Session-Timeout`, `Idle-Timeout` from the service plan |
| `radusergroup` | the plan's `radius_group` + a `suspended` marker group              |
| `nas`          | one row per router from the Network module (`nas_ip`, `radius_secret`) |

`radacct` is read-only for the system: online sessions (rows without
`acctstoptime`), per-customer daily bandwidth, and the dashboard's
online-user count.

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

### Suspension model

Suspension adds `Auth-Type := Reject` (denies the next authentication)
and the `suspended` group, then kicks the live PPPoE session with a
RADIUS Disconnect-Request (RFC 5176, sent with `radclient` to the NAS
CoA port) so the customer is offline immediately — accounting history
is preserved. Reconnection removes both rows and re-provisions plan
attributes.

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
