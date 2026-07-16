"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

export default function HealthPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const queues = useQuery({ queryKey: ["queues"], queryFn: api.queues });

  return (
    <div>
      <PageHeader title="System health" subtitle="Service liveness and live queue depths." />

      {health.isLoading && <Spinner />}

      {health.data && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {health.data.services.map((s) => (
            <Card key={s.name} className="p-4">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.status === "up" ? "var(--success)" : "var(--danger)" }}
                />
                <span className="text-xs text-muted">{s.status}</span>
              </div>
              <div className="mt-2 text-sm">{s.name.replace("-service", "")}</div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-faint">Queues</h2>
      {queues.isError && <EmptyState>RabbitMQ management API unavailable.</EmptyState>}
      {queues.data && (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-faint">
                <th className="px-4 py-2.5 font-medium">Queue</th>
                <th className="px-4 py-2.5 text-right font-medium">Ready</th>
                <th className="px-4 py-2.5 text-right font-medium">Unacked</th>
                <th className="px-4 py-2.5 text-right font-medium">Consumers</th>
              </tr>
            </thead>
            <tbody>
              {queues.data.queues
                .filter((q) => !q.isDlq)
                .map((q) => (
                  <tr key={q.name} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{q.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{q.ready}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{q.unacked}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{q.consumers}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
