"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { MarketingBrand } from "@/components/marketing/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client";
import type { PlanCard } from "@/lib/billing/quote";

type Mode = "login" | "signup" | "forgot" | "reset";

/** Only follow same-origin paths after login, never `//evil.com` or absolute URLs. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} className="h-10" {...props} />
      {hint ? <p className="text-[12px] text-[#6b7280]">{hint}</p> : null}
    </div>
  );
}

function Form({ mode, plans = [], initialPlanId = "" }: { mode: Mode; plans?: PlanCard[]; initialPlanId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [planId, setPlanId] = useState(initialPlanId);
  const selected = plans.find((plan) => plan.id === planId) ?? null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    if (mode === "signup" && !planId) {
      setError("Choose a plan to continue");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        const result = await api<{ message: string }>("/api/auth/forgot", { method: "POST", body: JSON.stringify(data) });
        setSent(result.message);
        setBusy(false);
        return;
      }
      if (mode === "signup") {
        const result = await api<{ checkoutUrl?: string | null; next?: string | null }>("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({ ...data, planId }),
        });
        if (result.checkoutUrl) {
          const checkout = new URL(result.checkoutUrl);
          if (checkout.protocol !== "https:" || checkout.hostname !== "checkout.stripe.com") {
            throw new Error("Checkout didn't return a Stripe payment page");
          }
          window.location.assign(checkout.toString());
          return;
        }
        router.replace(result.next || "/billing");
        router.refresh();
        return;
      }
      const body = mode === "reset" ? { token: params.get("token") ?? "", password: data.password } : data;
      await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p role="status" className="rounded-lg bg-[#ecfdf3] px-3 py-3 text-[13px] text-[#05603a]">
        {sent}
      </p>
    );
  }

  return (
    <form method="post" action="/signup" onSubmit={(event) => void submit(event)} className="space-y-4">
      {mode === "signup" && plans.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-[#1b1f24]">Plan</legend>
          {plans.map((plan) => (
            <label
              key={plan.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ${planId === plan.id ? "bg-[#eef6ff] ring-[#0084ff]" : "ring-[#e5e7eb]"}`}
            >
              <input
                type="radio"
                name="planId"
                value={plan.id}
                checked={planId === plan.id}
                onChange={() => setPlanId(plan.id)}
                className="mt-1"
                required
              />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-[#1b1f24]">{plan.name}</span>
                <span className="block text-[12px] text-[#6b7280]">
                  {plan.promoApplied ? (
                    <>
                      <span className="line-through">{plan.regularLabel}</span> {plan.dueTodayLabel} first month, then {plan.renewalLabel}/month
                    </>
                  ) : (
                    <>{plan.regularLabel}/month</>
                  )}
                </span>
              </span>
            </label>
          ))}
          {selected ? (
            <p className="rounded-lg bg-[#f4f6f8] px-3 py-2 text-[12px] leading-relaxed text-[#4b5563]">
              {selected.promoApplied ? (
                <>
                  Due today: {selected.dueTodayLabel} for the first month. Renews at {selected.renewalLabel}/month. Checkout is required
                  before the workspace opens.
                </>
              ) : (
                <>{selected.regularLabel}/month. Checkout is required before the workspace opens.</>
              )}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      {mode === "signup" ? <Field id="name" label="Your name" autoComplete="name" placeholder="Alex Rivera" /> : null}
      {mode !== "reset" ? <Field id="email" label="Email" type="email" autoComplete="email" required placeholder="you@company.com" /> : null}
      {mode !== "forgot" ? (
        <Field
          id="password"
          label={mode === "reset" ? "New password" : "Password"}
          type="password"
          required
          minLength={mode === "signup" || mode === "reset" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          hint={mode === "signup" || mode === "reset" ? "At least 8 characters." : undefined}
        />
      ) : null}
      {mode === "login" ? (
        <p className="text-right text-[12px]">
          <Link href="/forgot-password" className="text-[#6b7280] hover:text-[#0084ff] hover:underline">
            Forgot password?
          </Link>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="h-10 w-full text-[14px]" disabled={busy}>
        {busy ? "One moment…" : { signup: "Continue to checkout", login: "Log in", forgot: "Send reset link", reset: "Save password" }[mode]}
      </Button>
    </form>
  );
}

const PERKS = [
  "Visual flows for Telegram, Instagram, Messenger and WhatsApp",
  "Shared inbox with live takeover",
  "Lead capture, tags and confirmed broadcasts",
];

export function AuthScreen({ mode, plans = [], initialPlanId = "" }: { mode: Mode; plans?: PlanCard[]; initialPlanId?: string }) {
  const copy: Record<Mode, { title: string; subtitle: string; switchText: ReactNode }> = {
    login: {
      title: "Welcome back",
      subtitle: "Log in to your Recatch workspace.",
      switchText: (
        <>
          New to Recatch?{" "}
          <Link href="/signup" className="font-medium text-[#0084ff] hover:underline">
            Create an account
          </Link>
        </>
      ),
    },
    forgot: {
      title: "Forgot your password?",
      subtitle: "Enter your email and we will send you a link to choose a new one.",
      switchText: (
        <Link href="/login" className="font-medium text-[#0084ff] hover:underline">
          Back to log in
        </Link>
      ),
    },
    reset: {
      title: "Choose a new password",
      subtitle: "Pick one you have not used here before.",
      switchText: (
        <Link href="/login" className="font-medium text-[#0084ff] hover:underline">
          Back to log in
        </Link>
      ),
    },
    signup: {
      title: "Create your account",
      subtitle: "Choose a plan, then checkout. The workspace opens when payment finishes.",
      switchText: (
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#0084ff] hover:underline">
            Log in
          </Link>
        </>
      ),
    },
  };
  const { title, subtitle, switchText } = copy[mode];

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <MarketingBrand />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-heading text-[28px] font-semibold tracking-tight text-[#1b1f24]">{title}</h1>
          <p className="mt-2 text-[14px] text-[#6b7280]">{subtitle}</p>
          <div className="mt-8">
            <Suspense>
              <Form mode={mode} plans={plans} initialPlanId={initialPlanId} />
            </Suspense>
          </div>
          <p className="mt-6 text-center text-[13px] text-[#6b7280]">{switchText}</p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-[#1b1f24] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,132,255,0.45),transparent_55%),radial-gradient(circle_at_85%_90%,rgba(0,200,83,0.3),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="max-w-md font-heading text-[30px] leading-tight font-semibold tracking-tight text-balance text-white">
            Every conversation, automated where it should be and human where it matters.
          </p>
          <ul className="mt-8 space-y-3">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-center gap-3 text-[14px] text-[#c9d1da]">
                <span className="grid size-5 place-items-center rounded-full bg-[#00c853]">
                  <Check className="size-3 text-white" />
                </span>
                {perk}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
