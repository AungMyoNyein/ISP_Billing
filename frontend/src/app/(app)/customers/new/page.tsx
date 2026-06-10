"use client";

import { useRouter } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/CustomerForm";

export default function NewCustomerPage() {
  const router = useRouter();

  return (
    <div className="max-w-4xl">
      <PageHeader title="New Customer" subtitle="The account is provisioned into FreeRADIUS automatically" />
      <Card className="p-6">
        <CustomerForm onSaved={(c) => router.push(`/customers/${c.id}`)} />
      </Card>
    </div>
  );
}
