import type { OrderStatus } from "@/lib/api";

const STYLES: Record<string, { fg: string; bg: string; label: string }> = {
  PENDING: { fg: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 14%, transparent)", label: "Pending" },
  CONFIRMED: { fg: "var(--success)", bg: "color-mix(in srgb, var(--success) 14%, transparent)", label: "Confirmed" },
  SHIPPED: { fg: "var(--info)", bg: "color-mix(in srgb, var(--info) 16%, transparent)", label: "Shipped" },
  DELIVERED: { fg: "var(--success)", bg: "color-mix(in srgb, var(--success) 14%, transparent)", label: "Delivered" },
  CANCELLED: { fg: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 14%, transparent)", label: "Cancelled" },
};

export function StatusPill({ status }: { status: OrderStatus | string }) {
  const s = STYLES[status] ?? {
    fg: "var(--text-muted)",
    bg: "var(--bg-inset)",
    label: status,
  };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: s.fg, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}
