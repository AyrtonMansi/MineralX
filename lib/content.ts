/** Public corporate copy. Keep individual projects and unverified claims out of this site. */
export const company = {
  name: "MineralX Resources",
  shortName: "MineralX",
  legalName: "MineralX Resources Pty Ltd",
  // As recorded on the company's executed agreements; shown in the footer and JSON-LD.
  abn: "46 688 770 194",
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
  // City of the registered postal address — not a project or site location.
  base: { place: "Cairns, Queensland", coordinates: "16.92° S  145.77° E" },
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
/**
 * MineralX's own 2025 drone survey photography. Files are pre-graded, EXIF/GPS
 * stripped WebP at 1000w and 2000w (`${src}-1000.webp`). Captions stay regional:
 * no project names, tenure or claims, per this file's header.
 */
export type Photo = { src: string; alt: string; caption: string };
export const photos = {
  landscape: {
    src: "/images/site/field-landscape",
    alt: "Aerial view of open eucalypt woodland with red-earth workings and a drill rig",
    caption: "Field operations · North Queensland",
  },
  ranges: {
    src: "/images/site/ranges-landscape",
    alt: "Aerial view of woodland country and a flooded historic working below distant ranges",
    caption: "Country · North Queensland",
  },
  drillRig: {
    src: "/images/site/drill-rig",
    alt: "Drill rig on a cleared red-earth pad in eucalypt woodland",
    caption: "Drilling · North Queensland",
  },
  operations: {
    src: "/images/site/field-operations",
    alt: "Excavator, drill rig and open workings seen from above",
    caption: "Site works · North Queensland",
  },
} satisfies Record<string, Photo>;
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
/**
 * The staged approach, stated in the resources theme detail above ("understand
 * the opportunity, evaluate the technical and commercial fundamentals, and
 * direct effort where it can create lasting value"), set out as steps.
 */
export const stages = [
  {
    title: "Understand the opportunity",
    body: "Build a clear picture of the resource and its potential before committing effort.",
  },
  {
    title: "Evaluate the fundamentals",
    body: "Test assumptions against the technical and commercial fundamentals.",
  },
  {
    title: "Direct effort where it lasts",
    body: "Direct investment towards the next meaningful step, with a long-term view.",
  },
];
/** What makes a partnership introduction useful — from the Partnerships page. */
export const partnershipQualities = [
  "A clear purpose",
  "Complementary strengths",
  "A practical view of what can be achieved together",
];
