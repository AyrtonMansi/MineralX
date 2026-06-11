import { company } from "@/lib/content";

/** Organization JSON-LD for richer search presentation and credibility. */
export function StructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: company.name,
    legalName: company.legalName,
    url: company.url,
    email: company.email,
    description: company.description,
    foundingLocation: "Queensland, Australia",
    areaServed: "AU",
    address: {
      "@type": "PostalAddress",
      addressRegion: "Queensland",
      addressCountry: "AU",
      postOfficeBoxNumber: "PO Box 6088",
      addressLocality: "Cairns City",
      postalCode: "4870",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
