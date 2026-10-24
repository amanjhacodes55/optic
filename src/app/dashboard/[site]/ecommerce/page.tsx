"use client";

import { BarList, LineChart } from "@/components/charts";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, DataTable, Loading, PageHeader, StatTile, type Column } from "@/components/ui";
import { money, num, pct } from "@/lib/format";

type Ecom = {
  currency: string;
  revenue: number;
  orders: number;
  aov: number;
  conversionRate: number;
  cartAbandonment: number;
  checkoutAbandonment: number;
  series: { label: string; revenue: number; orders: number }[];
  products: { value: string; added: number; purchased: number; revenue: number }[];
  byChannel: { value: string; revenue: number; orders: number; sessions: number }[];
};

export default function EcommercePage() {
  const { qs } = useDashboard();
  const { data, loading } = useApi<Ecom>(`/api/stats/ecommerce?${qs()}`);
  const cur = data?.currency ?? "USD";
  const columns: Column<Ecom["products"][number]>[] = [
    { key: "value", label: "Product" },
    { key: "added", label: "Added to cart", format: num },
    { key: "purchased", label: "In orders", format: num },
    { key: "revenue", label: "Revenue (first item)", format: (n) => money(n, cur) },
  ];
  return (
    <>
      <PageHeader
        title="E-commerce"
        description={
          <>
            Built from the standard events <code>add_to_cart</code>, <code>begin_checkout</code> and <code>purchase</code> (with revenue). Server-side and
            point-of-sale orders sent through the ingest API are included.
          </>
        }
      />
      {loading && !data ? (
        <Loading height={400} />
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Revenue" value={money(data.revenue, cur)} />
            <StatTile label="Orders" value={num(data.orders)} />
            <StatTile label="Average order value" value={money(data.aov, cur)} />
            <StatTile label="Purchase conversion" value={pct(data.conversionRate, 2)} />
            <StatTile label="Cart abandonment" value={pct(data.cartAbandonment)} />
            <StatTile label="Checkout abandonment" value={pct(data.checkoutAbandonment)} />
          </div>
          <Card title="Revenue over time">
            <LineChart height={240} labels={data.series.map((s) => s.label)} format={(n) => money(n, cur)} series={[{ key: "rev", label: "Revenue", values: data.series.map((s) => s.revenue), color: "var(--s1)", kind: "area" }]} />
          </Card>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card title="Products" pad={false}>
              <div className="py-2">
                <DataTable rows={data.products} columns={columns} initialSort="revenue" exportName="optic-products" />
              </div>
            </Card>
            <Card title="Revenue by channel">
              <BarList rows={data.byChannel.filter((c) => c.revenue > 0).map((c) => ({ label: c.value, value: c.revenue, secondary: `${num(c.orders)} orders` }))} format={(n) => money(n, cur)} />
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
