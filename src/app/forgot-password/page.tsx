import type { Metadata } from "next";
import { AuthScreen } from "@/components/marketing/auth-form";

export const metadata: Metadata = { title: "Forgot password · Recatch" };

export default function ForgotPasswordPage() {
  return <AuthScreen mode="forgot" />;
}
