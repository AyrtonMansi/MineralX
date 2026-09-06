import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { company } from "@/lib/content";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { getArticles } from "@/lib/articles";
import { StructuredData } from "@/components/StructuredData";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const title = `${company.name} — Resources, Research & Industry`;
const description = company.description;

export const metadata: Metadata = {
  metadataBase: new URL(company.url),
  title: {
    default: title,
    template: `%s — ${company.name}`,
  },
  description,
  keywords: [
    "MineralX Resources",
    "Australian mining company",
    "mineral processing",
    "industrial development",
    "mineral exploration",
    "resource development",
    "mining and exploration Australia",
  ],
  applicationName: company.name,
  authors: [{ name: company.name }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: company.url,
    siteName: company.name,
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "business",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU" className={inter.variable}>
      <body className="bg-black font-sans text-white antialiased">
        <StructuredData />
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Navbar hasUpdates={getArticles().length > 0} />
        {children}
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
