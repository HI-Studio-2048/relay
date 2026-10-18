"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";

function stripePage(url: string, host: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === host;
  } catch {
    return false;
  }
}

export function PayButton({ planId, label }: { planId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ planId }) });
      if (!stripePage(result.url, "checkout.stripe.com")) throw new Error("Checkout didn't return a Stripe payment page");
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setBusy(false);
    }
  };
  return (
    <div className="mt-4">
      <Button type="button" className="h-10 w-full" disabled={busy} onClick={() => void pay()}>
        {busy ? "Opening checkout…" : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PortalButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
      if (!stripePage(result.url, "billing.stripe.com")) throw new Error("Billing didn't return a Stripe page");
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing");
      setBusy(false);
    }
  };
  return (
    <div>
      <Button type="button" variant="outline" className="h-10" disabled={busy} onClick={() => void open()}>
        {busy ? "Opening…" : "Manage payment"}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
