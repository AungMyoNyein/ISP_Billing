"use client";

import { CustomerBillingList } from "@/components/CustomerBillingList";

export default function SuspendedPage() {
  return (
    <CustomerBillingList
      title="Suspended Customers"
      subtitle="RADIUS access is disabled for these customers until payment"
      endpoint="/billing/suspended"
      action="reconnect"
    />
  );
}
