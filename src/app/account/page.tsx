import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { AccountView } from "./view";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <Suspense fallback={<Loading height={400} />}>
      <AccountView />
    </Suspense>
  );
}
