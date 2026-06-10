"use client";

import { CustomerBillingList } from "@/components/CustomerBillingList";

export default function RenewalsPage() {
  return (
    <CustomerBillingList
      title="Renewals"
      subtitle="Customers expiring soon or already expired — generate their next invoice"
      endpoint="/billing/renewals"
      showDays
      action="renew"
    />
  );
}
