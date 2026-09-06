import type { Metadata } from "next";
import "./plant.css";
export const metadata: Metadata = {
  title: "Plant workspace · MineralX",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";
export default function PlantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="plant-app">{children}</div>;
}
