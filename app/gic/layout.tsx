import type { Metadata } from "next";
import Link from "next/link";
import "./gic.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "GIC · MineralX",
  description: "Private processing run register.",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: {
    title: "MineralX · GIC",
    description: "Private access",
    url: "/gic",
  },
};
export default function GicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="gic">
      <header className="gic-brandbar">
        <Link href="/" className="gic-brand">
          MineralX
        </Link>
        <span className="gic-brand-divider" />
        <Link href="/gic">GIC</Link>
        <span className="gic-private">Private workspace</span>
      </header>
      {children}
      <footer className="gic-footer">
        <Link href="/">MineralX website</Link>
        <Link href="/gic">Run register</Link>
        <Link href="/gic/reports">Annual reporting</Link>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
