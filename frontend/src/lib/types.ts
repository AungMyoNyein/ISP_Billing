export interface Role {
  id: number;
  name: string;
  description?: string | null;
  permissions: string[];
  is_system: boolean;
  users_count?: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role_id: number | null;
  role?: Role | null;
  is_active: boolean;
  last_login_at?: string | null;
}

export interface ServicePlan {
  id: number;
  name: string;
  price: string | number;
  download_speed_kbps: number;
  upload_speed_kbps: number;
  session_timeout: number | null;
  idle_timeout: number | null;
  mikrotik_rate_limit: string | null;
  validity_days: number;
  radius_group: string | null;
  is_active: boolean;
  description?: string | null;
  customers_count?: number;
}

export interface Router {
  id: number;
  name: string;
  host: string;
  api_port: number;
  username: string;
  use_ssl: boolean;
  nas_ip: string | null;
  status: "online" | "offline" | "unknown";
  last_seen_at: string | null;
  last_resource?: Record<string, string> | null;
  customers_count?: number;
  notes?: string | null;
}

export type CustomerStatus = "pending" | "active" | "suspended" | "expired" | "disabled";

export interface Customer {
  id: number;
  customer_code: string;
  username: string;
  radius_password?: string;
  name: string;
  phone: string | null;
  address: string | null;
  dn_zone: string | null;
  sn_odb: string | null;
  gps_location: string | null;
  status: CustomerStatus;
  notes: string | null;
  service_plan_id: number | null;
  router_id: number | null;
  smartolt_onu_sn: string | null;
  activation_date: string | null;
  expiry_date: string | null;
  last_renewed_at: string | null;
  created_at: string;
  service_plan?: ServicePlan | null;
  router?: Router | null;
  online?: boolean;
}

export type InvoiceStatus = "paid" | "unpaid" | "suspended" | "cancelled";

export interface Invoice {
  id: number;
  invoice_number: string;
  customer_id: number;
  service_plan_id: number | null;
  amount: string | number;
  billing_date: string;
  due_date: string;
  status: InvoiceStatus;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  notes?: string | null;
  customer?: Customer;
  service_plan?: ServicePlan | null;
  payments?: Payment[];
}

export interface Payment {
  id: number;
  payment_number: string;
  invoice_id: number | null;
  customer_id: number;
  amount: string | number;
  method: string;
  reference: string | null;
  paid_at: string;
  notes?: string | null;
  customer?: Customer;
  invoice?: Invoice | null;
  receiver?: { id: number; name: string } | null;
}

export interface DashboardStats {
  total_customers: number;
  active_customers: number;
  online_users: number;
  suspended_customers: number;
  expired_customers: number;
  expiring_in_7_days: number;
  new_customers_this_month: number;
  unpaid_invoices: number;
  revenue_this_month: number;
  radius_healthy: boolean;
}

export interface OnlineSession {
  radacctid: number;
  username: string;
  ip_address: string;
  mac_address: string;
  nas_ip: string;
  session_id: string;
  started_at: string | null;
  uptime_seconds: number | null;
  download_bytes: number;
  upload_bytes: number;
  customer: {
    id: number;
    name: string;
    customer_code: string;
    status: CustomerStatus;
    plan: string | null;
  } | null;
}

export interface AuditLog {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  changes: unknown;
  ip_address: string | null;
  created_at: string;
  user?: { id: number; name: string; email: string } | null;
}

export interface SystemStatus {
  routers: Array<{
    id: number;
    name: string;
    host: string;
    status: string;
    last_seen_at: string | null;
    customers_count: number;
    resource: Record<string, string> | null;
  }>;
  routers_online: number;
  routers_total: number;
  freeradius: { database_reachable: boolean; online_sessions: number | null };
  database: { main: boolean; radius: boolean };
  smartolt: { configured: boolean };
  checked_at: string;
}
