import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { SitesList } from "./sites";

export const metadata: Metadata = { title: "Sites" };

export default function DashboardHome() {
  return (
    <Suspense fallback={<Loading height={400} />}>
      <SitesList />
    </Suspense>
  );
}
