"use client";

import { Activity, Boxes, PlusCircle, Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Orders", icon: Boxes },
  { href: "/create", label: "New order", icon: PlusCircle },
  { href: "/health", label: "Health", icon: Activity },
  { href: "/dlq", label: "Dead letters", icon: Inbox },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="flex items-center justify-between border-b border-border py-4">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
        <span className="text-sm font-medium tracking-tight">ordersys</span>
        <span className="text-xs text-faint">ops console</span>
      </Link>
      <nav className="flex items-center gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                active ? "bg-elevated text-fg" : "text-muted hover:text-fg"
              }`}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
