import { Analytics } from "@vercel/analytics/react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { RevealObserver } from "@/components/RevealObserver";
import { StructuredData } from "@/components/StructuredData";
import { getArticles } from "@/lib/articles";

export default function CorporateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <StructuredData />
      <Navbar hasUpdates={getArticles().length > 0} />
      {children}
      <Footer />
      <RevealObserver />
      <Analytics />
    </>
  );
}
