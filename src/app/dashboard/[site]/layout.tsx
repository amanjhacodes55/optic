import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Loading } from "@/components/ui";

export default function SiteLayout({ children }: LayoutProps<"/dashboard/[site]">) {
  // The dashboard is client-rendered from the URL; Suspense lets search params resolve at request time.
  return (
    <Suspense fallback={<Loading height={400} />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
