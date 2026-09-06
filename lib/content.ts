/** Public corporate copy. Keep individual projects and unverified claims out of this site. */
export const company = {
  name: "MineralX Resources",
  shortName: "MineralX",
  legalName: "MineralX Resources Pty Ltd",
  tagline: "Advancing resources. Building industry.",
  description:
    "MineralX is an Australian resources company advancing mining opportunities and building a broader platform for mineral processing, research and industrial development.",
  email: "info@mineral-x.com.au",
  region: "Australia",
  domain: "mineral-x.com.au",
  url: "https://mineral-x.com.au",
  postal: {
    label: "Postal address",
    lines: ["PO Box 6088", "Cairns City, Queensland, 4870"],
  },
  social: [] as Array<{
    label: string;
    href: string;
    icon: "linkedin" | "instagram";
  }>,
  disclaimer:
    "This website is for general information only and does not constitute an offer of securities or investment advice.",
};
export const nav = [
  { label: "Company", href: "/company" },
  { label: "Our direction", href: "/direction" },
  { label: "Partnerships", href: "/partnerships" },
];
export const hero = {
  heading: company.tagline,
  supporting: company.description,
  cta: { label: "Explore our direction", href: "/direction" },
  backgroundImage: "/hero.webp" as string | null,
};
export const themes = [
  {
    index: "01",
    id: "resources",
    title: "Mining & resources",
    body: "Advancing Australian mineral opportunities through practical execution and disciplined investment.",
    detail:
      "Our focus begins with mineral resources and the work required to develop them responsibly. We take a staged approach: understand the opportunity, evaluate the technical and commercial fundamentals, and direct effort where it can create lasting value.",
  },
  {
    index: "02",
    id: "research",
    title: "Research & technology",
    body: "Pursuing better ways to understand, process and realise mineral value.",
    detail:
      "Applied research and technical development are central to our wider direction. We seek to connect mineral understanding with practical processing knowledge, working towards solutions that can be evaluated, refined and applied in industry.",
  },
  {
    index: "03",
    id: "industry",
    title: "Industrial development",
    body: "Working towards productive industrial capability built on resources and technical learning.",
    detail:
      "Our long-term ambition extends beyond the resource itself. We see the potential to connect mining, processing and technical development with Australian industrial capability. Progress depends on sound economics, the right relationships and considered investment.",
  },
];
export const principles = [
  {
    title: "Practical execution",
    body: "Turn a clear direction into focused work, informed decisions and tangible progress.",
  },
  {
    title: "Disciplined investment",
    body: "Advance in stages, test assumptions and allocate capital with a long-term view.",
  },
  {
    title: "Productive collaboration",
    body: "Bring together commercial, technical and industrial perspectives to move opportunities forward.",
  },
];
export const partnerTypes = [
  {
    title: "Capital partners",
    body: "Investors aligned with a considered approach to Australian resources and long-term industrial development.",
    subject: "Investment enquiry",
  },
  {
    title: "Strategic partners",
    body: "Organisations exploring shared commercial direction and complementary capability across the resources value chain.",
    subject: "Strategic partnership enquiry",
  },
  {
    title: "Technical & industrial partners",
    body: "Research, processing and industry organisations interested in practical technical collaboration.",
    subject: "Technical and industrial partnership enquiry",
  },
];
export function enquiryHref(subject = "Corporate enquiry") {
  return `mailto:${company.email}?subject=${encodeURIComponent(`MineralX — ${subject}`)}`;
}
export const footer = {
  blurb:
    "An Australian resources company building towards a broader future in mining, research and industrial development.",
  columns: [
    {
      title: "Company",
      links: [{ label: "Home", href: "/" }, ...nav.slice(0, 2)],
    },
    {
      title: "Connect",
      links: [
        { label: "Partnerships", href: "/partnerships" },
        { label: "Contact", href: "/contact" },
        { label: "Privacy", href: "/privacy" },
      ],
    },
  ],
};
