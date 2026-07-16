"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

export default function DlqPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["queues"], queryFn: api.queues });

  const replay = useMutation({
    mutationFn: (queue: string) => api.replayDlq(queue),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queues"] }),
  });

  const dlqs = (data?.queues ?? []).filter((q) => q.isDlq);
  const hasDead = dlqs.some((q) => q.messages > 0);

  return (
    <div>
      <PageHeader
        title="Dead letters"
        subtitle="Messages that exhausted their retries. Inspect the depth, then replay."
      />

      {isLoading && <Spinner />}
      {isError && <EmptyState>RabbitMQ management API unavailable.</EmptyState>}

      {data && dlqs.length === 0 && <EmptyState>No dead-letter queues yet.</EmptyState>}

      {data && dlqs.length > 0 && (
        <>
          {!hasDead && (
            <p className="mb-4 text-sm text-muted">
              All dead-letter queues are empty — nothing to replay. ✓
            </p>
          )}
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-faint">
                  <th className="px-4 py-2.5 font-medium">Dead-letter queue</th>
                  <th className="px-4 py-2.5 text-right font-medium">Messages</th>
                  <th className="px-4 py-2.5 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {dlqs.map((q) => (
                  <tr key={q.name} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{q.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      <span style={{ color: q.messages > 0 ? "var(--danger)" : undefined }}>
                        {q.messages}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={q.messages === 0 || replay.isPending}
                        onClick={() => replay.mutate(q.name)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <RotateCcw size={13} /> Replay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
