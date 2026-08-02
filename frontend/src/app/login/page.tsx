"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { Button, Field, inputCls, ErrorNote } from "@/components/ui";
import type { User } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@isp.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white">IB</div>
          <h1 className="text-2xl font-bold text-slate-900">ISP Billing</h1>
          <p className="mt-0.5 text-sm text-slate-500">Sign in to your account</p>
        </div>
        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-6">
          <ErrorNote message={error} />
          <div className="space-y-4">
            <Field label="Email">
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password">
              <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">Default admin: admin@isp.local / admin12345</p>
      </div>
    </div>
  );
}
