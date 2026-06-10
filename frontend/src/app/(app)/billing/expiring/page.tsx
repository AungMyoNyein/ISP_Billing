"use client";

import { CustomerBillingList } from "@/components/CustomerBillingList";

export default function ExpiringPage() {
  return (
    <CustomerBillingList
      title="Expiring Customers"
      subtitle="Active customers whose service expires within the selected window"
      endpoint="/billing/expiring"
      showDays
      action="renew"
    />
  );
}
