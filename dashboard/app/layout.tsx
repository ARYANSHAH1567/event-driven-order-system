import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Nav } from "@/components/Nav";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Order System — Ops",
  description: "Operations console for the event-driven order & fulfillment system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-6">
            <Nav />
            <main className="flex-1 py-8">{children}</main>
            <footer className="border-t border-border py-5 text-xs text-faint">
              Event-driven order &amp; fulfillment system · saga · outbox · idempotency · DLQ
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
