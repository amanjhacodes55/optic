import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/components/auth-form";
import { SignupGate } from "./gate";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <AuthLayout>
      <Suspense>
        <SignupGate />
      </Suspense>
    </AuthLayout>
  );
}
