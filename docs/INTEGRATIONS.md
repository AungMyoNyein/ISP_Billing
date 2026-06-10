# Integrations: FreeRADIUS, MikroTik, SmartOLT

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
and the `suspended` group, then kicks the live PPPoE session via the
MikroTik API so the customer is offline immediately — accounting
history is preserved. Reconnection removes both rows and re-provisions
plan attributes.

## MikroTik

### Router requirements

- RouterOS 6.43+ (the client uses the modern plain login).
- API service enabled: `/ip service set api disabled=no` (port 8728) or
  `api-ssl` (8729 — tick "SSL" on the router form).
- Dedicated user, least privilege:

  ```
  /user group add name=billing policy=api,read,write
  /user add name=api-billing group=billing password=... address=<billing-host-IP>
  ```

- PPPoE server with `use-radius=yes` in the PPP AAA settings; the rate
  limit then comes from the RADIUS `Mikrotik-Rate-Limit` reply
  attribute, so no per-user queues are needed.

### What the system does

| Action               | RouterOS command                  | When                         |
|----------------------|-----------------------------------|------------------------------|
| Connectivity probe   | `/system/resource/print`          | Status page, "Check" button (caches board, uptime, CPU) |
| List live sessions   | `/ppp/active/print`               | Router detail                |
| Kick a PPPoE session | `/ppp/active/remove`              | On suspension/expiry and via "disconnect user" |
| Adjust live speed    | `/queue/simple/add\|set`          | Optional plan-change helper  |

The RouterOS API client is implemented in
`backend/app/Services/RouterOs/RouterOsClient.php` (binary protocol over
a TCP socket, no external dependencies).

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
