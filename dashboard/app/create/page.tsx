"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

export default function CreatePage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ["catalog"], queryFn: api.catalog, refetchInterval: false });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [outOfStock, setOutOfStock] = useState(false);
  const [paymentFailure, setPaymentFailure] = useState(false);

  const products = data?.products ?? [];
  const lines = products
    .filter((p) => (qty[p.id] ?? 0) > 0)
    .map((p) => ({
      productId: p.id,
      sku: p.sku,
      quantity: qty[p.id],
      unitPrice: Number.parseFloat(p.price),
    }));
  const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  const mutation = useMutation({
    mutationFn: () =>
      api.createOrder({
        customerId: "cust-demo",
        items: lines,
        simulate: { outOfStock: outOfStock || undefined, paymentFailure: paymentFailure || undefined },
      }),
    onSuccess: (order) => router.push(`/orders/${order.id}`),
  });

  const bump = (id: string, d: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) }));

  return (
    <div>
      <PageHeader title="New order" subtitle="Pick items, then place the order to kick off the saga." />

      {isLoading && <Spinner />}

      {!isLoading && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <Card className="divide-y divide-border">
            {products.map((p) => {
              const stock = p.inventory?.available ?? 0;
              return (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm">{p.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                      <span className="font-mono">{p.sku}</span>
                      <span>·</span>
                      <span className="font-mono">{money(p.price)}</span>
                      <span>·</span>
                      <span className={stock <= 5 ? "text-warning" : ""}>{stock} in stock</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => bump(p.id, -1)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted hover:text-fg">
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center font-mono text-sm">{qty[p.id] ?? 0}</span>
                    <button type="button" onClick={() => bump(p.id, 1)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted hover:text-fg">
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Total</span>
                <span className="font-mono">{money(total)}</span>
              </div>
              <button
                type="button"
                disabled={lines.length === 0 || mutation.isPending}
                onClick={() => mutation.mutate()}
                className="mt-4 w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mutation.isPending ? "Placing…" : "Place order"}
              </button>
              {mutation.isError && <p className="mt-2 text-xs text-danger">Failed to place order.</p>}
            </Card>

            <Card className="p-5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-faint">Demo · inject a failure</h3>
              <p className="mt-1.5 text-xs text-muted">
                Force a saga leg to fail and watch the compensating transactions run.
              </p>
              <div className="mt-3 space-y-2.5">
                <Toggle label="Out of stock" hint="inventory rejects" on={outOfStock} set={setOutOfStock} />
                <Toggle label="Payment declined" hint="payment fails" on={paymentFailure} set={setPaymentFailure} />
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  set,
}: {
  label: string;
  hint: string;
  on: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <button type="button" onClick={() => set(!on)} className="flex w-full items-center justify-between">
      <span className="text-sm">
        {label} <span className="text-xs text-faint">· {hint}</span>
      </span>
      <span
        className="relative h-5 w-9 rounded-full transition-colors"
        style={{ backgroundColor: on ? "var(--accent)" : "var(--border-strong)" }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
          style={{ left: on ? "18px" : "2px" }}
        />
      </span>
    </button>
  );
}
