"use client";

import { DimensionReport } from "@/components/dashboard/report-table";
import { PageHeader } from "@/components/ui";

export default function AcquisitionPage() {
  return (
    <>
      <PageHeader
        title="Traffic sources"
        description="Where sessions came from. Channels follow GA4's default grouping: UTM medium first, then the referrer's domain, otherwise Direct."
      />
      <div className="space-y-4">
        <DimensionReport title="Default channel group" dims={[{ dim: "channel", label: "Channel" }]} />
        <DimensionReport
          title="Sources and campaigns"
          dims={[
            { dim: "referrer", label: "Referrer" },
            { dim: "utm_source", label: "Source" },
            { dim: "utm_medium", label: "Medium" },
            { dim: "utm_campaign", label: "Campaign" },
            { dim: "utm_content", label: "Content" },
            { dim: "utm_term", label: "Term" },
          ]}
        />
      </div>
    </>
  );
}
