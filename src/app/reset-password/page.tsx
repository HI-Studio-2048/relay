import type { Metadata } from "next";
import { AuthScreen } from "@/components/marketing/auth-form";

export const metadata: Metadata = { title: "Choose a new password · Recatch" };

export default function ResetPasswordPage() {
  return <AuthScreen mode="reset" />;
}
