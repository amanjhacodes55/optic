"use client";

import { SignupForm } from "@/components/auth-form";
import { useApi } from "@/components/dashboard/state";

export function SignupGate() {
  const { data } = useApi<{ signupAllowed: boolean }>("/api/auth/me");
  return <SignupForm signupAllowed={data ? data.signupAllowed : null} />;
}
