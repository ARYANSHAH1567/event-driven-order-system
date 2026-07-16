"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StatusPill } from "@/components/StatusPill";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api, type OrderStatus } from "@/lib/api";
import { money, relativeTime, shortId } from "@/lib/format";

const FILTERS: (OrderStatus | "ALL")[] = [
  "ALL",
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

function Leg({ done }: { done: boolean }) {
  return done ? (
    <Check size={14} strokeWidth={2} style={{ color: "var(--success)" }} />
  ) : (
    <Minus size={14} strokeWidth={2} className="text-faint" />
  );
}

export default function OrdersPage() {
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["orders", filter],
    queryFn: () => api.orders(filter === "ALL" ? undefined : filter),
  });

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Live feed of every order and where it sits in the saga."
        action={
          <div className="flex gap-1 rounded-md border border-border bg-elevated p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  filter === f ? "bg-inset text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        }
      />

      {isLoading && <Spinner />}
      {isError && (
        <EmptyState>
          Couldn&apos;t reach the order service. Is <code className="font-mono">docker compose</code>{" "}
          up?
        </EmptyState>
      )}

      {data && data.orders.length === 0 && (
        <EmptyState>
          No orders yet. <Link href="/create" className="text-accent">Create one →</Link>
        </EmptyState>
      )}

      {data && data.orders.length > 0 && (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-faint">
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 text-center font-medium">Inventory</th>
                <th className="px-4 py-2.5 text-center font-medium">Payment</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 text-right font-medium">Age</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id} className="group border-b border-border/60 last:border-0 hover:bg-inset/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/orders/${o.id}`} className="font-mono text-xs text-fg group-hover:text-accent">
                      {shortId(o.id)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{o.customerId}</td>
                  <td className="px-4 py-2.5 text-center"><span className="inline-flex justify-center"><Leg done={o.inventoryReserved} /></span></td>
                  <td className="px-4 py-2.5 text-center"><span className="inline-flex justify-center"><Leg done={o.paymentSucceeded} /></span></td>
                  <td className="px-4 py-2.5"><StatusPill status={o.status} /></td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{money(o.totalAmount, o.currency)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-faint">{relativeTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
