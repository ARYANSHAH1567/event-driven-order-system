"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusPill } from "@/components/StatusPill";
import { Card, Spinner } from "@/components/ui";
import { api, type OrderEvent } from "@/lib/api";
import { clockTime, money, shortId } from "@/lib/format";

// Colour each timeline node by the kind of event.
function dotColor(type: string): string {
  if (type.includes("rejected") || type.includes("failed") || type.includes("cancelled"))
    return "var(--danger)";
  if (type.includes("confirmed") || type.includes("reserved") || type.includes("succeeded") || type.includes("delivered"))
    return "var(--success)";
  if (type.includes("shipment")) return "var(--info)";
  return "var(--text-faint)";
}

function TimelineRow({ event, last }: { event: OrderEvent; last: boolean }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span className="absolute left-[5px] top-3 h-full w-px bg-border" aria-hidden />}
      <span
        className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor(event.type) }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-fg">{event.type}</span>
          <span className="rounded bg-inset px-1.5 py-0.5 font-mono text-[11px] text-faint">
            {event.producer}
          </span>
          <span className="ml-auto font-mono text-xs text-faint">{clockTime(event.createdAt)}</span>
        </div>
        {Object.keys(event.payload ?? {}).length > 0 && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-xs text-muted hover:text-fg">payload</summary>
            <pre className="mt-1.5 overflow-x-auto rounded-md border border-border bg-inset p-2.5 font-mono text-[11px] leading-relaxed text-muted">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </li>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.order(id),
  });

  return (
    <div>
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={15} /> All orders
      </Link>

      {isLoading && <Spinner />}
      {isError && <p className="text-sm text-danger">Order not found.</p>}

      {order && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
          {/* Summary */}
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-muted">{shortId(order.id)}</span>
                <StatusPill status={order.status} />
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <Row label="Customer" value={order.customerId} />
                <Row label="Total" value={money(order.totalAmount, order.currency)} mono />
                <Row label="Inventory" value={order.inventoryReserved ? "reserved" : "—"} />
                <Row label="Payment" value={order.paymentSucceeded ? "charged" : "—"} />
              </div>
              {order.cancellationReason && (
                <p className="mt-4 rounded-md border border-border bg-inset p-2.5 text-xs text-danger">
                  {order.cancellationReason}
                </p>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-faint">Items</h3>
              <ul className="space-y-2 text-sm">
                {order.items.map((it) => (
                  <li key={it.id} className="flex items-center justify-between">
                    <span className="text-muted">
                      <span className="font-mono text-xs">{it.sku}</span> × {it.quantity}
                    </span>
                    <span className="font-mono text-xs">{money(it.unitPrice, order.currency)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Timeline */}
          <Card className="p-5">
            <h3 className="mb-5 text-xs font-medium uppercase tracking-wide text-faint">
              Event timeline
            </h3>
            <ol>
              {order.events.map((e, i) => (
                <TimelineRow key={e.id} event={e} last={i === order.events.length - 1} />
              ))}
            </ol>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  );
}
