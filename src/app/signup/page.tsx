import type { Metadata } from "next";
import { AuthScreen } from "@/components/marketing/auth-form";

export const metadata: Metadata = { title: "Create account · Relay" };

export default function SignupPage() {
  return <AuthScreen mode="signup" />;
}
