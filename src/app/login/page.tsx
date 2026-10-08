import type { Metadata } from "next";
import { AuthScreen } from "@/components/marketing/auth-form";

export const metadata: Metadata = { title: "Log in · Relay" };

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
