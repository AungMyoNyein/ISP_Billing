# API Reference

Base URL: `http://<backend>/api`. All responses are JSON.

## Authentication

```
POST /auth/login            { "email": "...", "password": "..." }
  → { "token": "1|...", "user": { ... } }
```

Send the token on every subsequent request:

```
Authorization: Bearer 1|...
```

```
POST /auth/logout           revoke the current token
GET  /auth/me               current user incl. role/permissions
```

Login is throttled (10/min). All other endpoints require a valid token
plus the permission listed below (see docs/CONFIGURATION.md for keys).
`401` = bad/expired token, `403` = missing permission, `422` =
validation error (`{ message, errors: { field: [msg] } }`).

List endpoints paginate Laravel-style
(`?page=`, `?per_page=` → `{ data, current_page, last_page, total }`).

## Dashboard

| Method/Path            | Permission | Notes |
|------------------------|------------|-------|
| `GET /dashboard/stats` | (any user) | totals: total/active/online/suspended/expired customers, expiring in 7 days, new this month, unpaid invoices, monthly revenue, RADIUS health |

## Customers — `customers.view` / `customers.manage`

| Method/Path | Notes |
|---|---|
| `GET /customers` | filters: `search`, `status`, `dn_zone`, `sn_odb`, `service_plan_id`, `router_id` |
| `GET /customers/filter-options` | distinct DN zones / SN ODBs / statuses for dropdowns |
| `POST /customers` | creates and provisions into RADIUS. Required: `customer_code`, `username`, `radius_password`, `name` |
| `GET /customers/{id}` | includes decrypted RADIUS password and live `online` flag |
| `PUT /customers/{id}` | re-provisions RADIUS; manual status changes sync RADIUS access |
| `DELETE /customers/{id}` | soft delete + RADIUS deprovision |
| `GET /customers/{id}/usage?days=30` | `{ daily: [{date, download_bytes, upload_bytes, sessions}], sessions: [...], auth_log: [...], online }` from radacct + radpostauth |
| `GET /customers/{id}/onu` | SmartOLT ONU status + optical signal |
| `POST /customers/{id}/suspend` | suspend + RADIUS reject + kick PPPoE session |
| `POST /customers/{id}/reconnect` | re-activate + re-enable RADIUS |

## Service plans — `plans.view` / `plans.manage`

`GET|POST /plans`, `GET|PUT|DELETE /plans/{id}`
Fields: `name`, `price`, `download_speed_kbps`, `upload_speed_kbps`,
`session_timeout`, `idle_timeout`, `mikrotik_rate_limit` (blank = derived
from speeds), `validity_days`, `radius_group`, `is_active`.
Delete fails with 422 while customers are assigned.

## Billing — `billing.view` / `billing.manage`

| Method/Path | Notes |
|---|---|
| `GET /invoices` | filters: `search`, `status` (paid/unpaid/suspended/cancelled), `customer_id`, `from`, `to`, `overdue=1` |
| `POST /invoices` | generate from customer's plan: `{ customer_id, billing_date?, due_days? }` |
| `GET|PUT|DELETE /invoices/{id}` | paid invoices cannot be deleted |
| `POST /invoices/{id}/pay` | record payment `{ amount?, method?, reference?, paid_at?, notes? }` → customer active, expiry extended, RADIUS enabled |
| `GET /payments`, `GET /payments/{id}`, `DELETE /payments/{id}` | filters: `search`, `method`, `customer_id`, `from`, `to` |
| `GET /billing/renewals?days=7` | customers expiring within N days or already expired |
| `POST /billing/renew/{customer}` | generate the next invoice. Optional `expiry_date` sets the period end by hand — this becomes the customer's expiry once the invoice is paid; omitted, the plan's `validity_days` applies. Rejected with 422 if it falls before the period start |
| `GET /billing/expiring?days=7` | active customers expiring within N days |
| `GET /billing/suspended` | suspended customers |
| `POST /billing/enforce` | run overdue/expiry enforcement now → `{ suspended, expired }` |

## Network — `network.view` / `network.manage`

| Method/Path | Notes |
|---|---|
| `GET|POST /routers`, `GET|PUT|DELETE /routers/{id}` | `nas_ip`+`radius_secret` sync to the FreeRADIUS `nas` table; `coa_port` for disconnects |
| `POST /routers/{id}/disconnect-user` | `{ username }` — kick a PPPoE session via RADIUS Disconnect-Request |
| `GET /sessions/online?search=` | live sessions from radacct, decorated with billing customer info |
| `GET /status` | status page payload (NAS routers from radacct, FreeRADIUS, databases, SmartOLT) |

## Reports — `reports.view`

`GET /reports/revenue?months=12` · `GET /reports/customer-growth?months=12`
· `GET /reports/plan-distribution` · `GET /reports/receivables`

## Administration

| Method/Path | Permission |
|---|---|
| `GET|POST /users`, `GET|PUT|DELETE /users/{id}` | `admin.users` |
| `GET|POST /roles`, `GET|PUT|DELETE /roles/{id}` | `admin.roles` (GET /roles also returns `available_permissions`) |
| `GET /settings`, `PUT /settings` (`{ settings: [{key, value, group?}] }`) | `admin.settings` |
| `GET /audit-logs` (filters: `action`, `entity_type`, `user_id`, `from`, `to`) | `admin.audit` |
| `GET|POST /backups`, `GET /backups/{name}/download`, `POST /backups/restore` (`{name}`), `DELETE /backups/{name}` | `admin.backup` |

## Example session

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@isp.local","password":"admin12345"}' | jq -r .token)

# expiring customers this week
curl -s "http://localhost:8000/api/billing/expiring?days=7" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[].name'

# mark invoice 5 paid (re-activates customer + RADIUS)
curl -s -X POST http://localhost:8000/api/invoices/5/pay \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"method":"mobile_money","reference":"TXN-123"}'
```
