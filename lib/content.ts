/**
 * Central content configuration for the MineralX Resources website.
 *
 * All site copy lives here so it can be edited without touching component code.
 * Keep the tone corporate, measured and factual — MineralX is a mining and
 * exploration company building value, not a services or consulting business.
 * No invented resources, reserves, ounces, grades, partners or staff.
 */

/**
 * Shared shape for sections rendered via <SectionHeading> (eyebrow + heading
 * + intro). Annotating each section with this — plus its own item shape —
 * means a typo'd or renamed field (e.g. `body` -> `text`) is caught at
 * compile time instead of silently breaking a component at render time.
 */
export type SectionCopy = {
  eyebrow: string;
  heading: string;
  intro: string;
};

export const company = {
  name: "MineralX Resources",
  shortName: "MineralX",
  legalName: "MineralX Resources Pty Ltd",
  tagline: "Australian mining and exploration.",
  description:
    "MineralX Resources is an Australian mining and exploration company building long-term value through the discovery and development of gold, silver and critical minerals.",
  email: "info@mineral-x.com.au",
  region: "Australia",
  domain: "mineral-x.com.au",
  url: "https://mineral-x.com.au",
  postal: {
    label: "Postal address",
    lines: ["PO Box 6088", "Cairns City, Queensland, 4870"],
  },
  operations: {
    label: "Operations",
    lines: ["PO Box 8", "Georgetown, Queensland, 4871"],
  },
  social: [
    { label: "LinkedIn", href: "#", icon: "linkedin" as const },
    { label: "Instagram", href: "#", icon: "instagram" as const },
  ],
  /** Legal disclaimer shown in the Investors section and the footer. */
  disclaimer:
    "This website is for general information only and does not constitute an offer of securities or investment advice.",
};

export const nav = [
  { label: "Overview", href: "/#overview" },
  { label: "What We Do", href: "/#focus" },
  { label: "Investors", href: "/#investors" },
  { label: "Updates", href: "/updates" },
  { label: "Contact", href: "/#contact" },
];

export const hero = {
  // Hero copy + CTA preserved to match the original site's hero exactly.
  supporting:
    "MineralX Resources is an Australian mining, exploration and R&D company which holds a strategic portfolio of mineral assets in North Queensland's minerals province.",
  cta: { label: "Latest Exploration Update", href: "/updates" },
  /**
   * Optional path to the original hero background image (place in /public).
   * When null, a faithful generated aerial-terrain backdrop is used instead.
   * e.g. set to "/hero.jpg" once the original asset is added.
   */
  backgroundImage: "/hero.webp" as string | null,
};

export const overview = {
  eyebrow: "Our Mission",
  mission:
    "To responsibly discover, develop and deliver the gold, silver and critical minerals the world needs — creating enduring value for our shareholders, partners and the communities in which we operate.",
  pillars: [
    {
      title: "Build",
      body: "Assemble and grow a portfolio of quality mineral assets with genuine potential.",
    },
    {
      title: "Advance",
      body: "Move discoveries forward through disciplined, staged development.",
    },
    {
      title: "Deliver",
      body: "Create long-term value by converting real assets into production.",
    },
  ],
};

export const operatingFocus: SectionCopy & {
  cards: Array<{ index: string; title: string; body: string }>;
} = {
  eyebrow: "What We Do",
  heading: "From discovery to production.",
  intro:
    "MineralX operates across the mineral value chain — building value at each stage, from exploration through to production.",
  cards: [
    {
      index: "01",
      title: "Exploration",
      body: "Targeted exploration to discover and define gold, silver and critical mineral opportunities.",
    },
    {
      index: "02",
      title: "Development",
      body: "Advancing discoveries toward production through a disciplined, staged approach to building assets.",
    },
    {
      index: "03",
      title: "Production",
      body: "Establishing clear pathways from resource to product — converting ground into recoverable value.",
    },
  ],
};

export const commodities: SectionCopy & {
  items: Array<{ symbol: string; title: string; body: string }>;
} = {
  eyebrow: "Commodity Focus",
  heading: "Metals the world depends on.",
  intro:
    "A focus on commodities with enduring demand and long-term strategic significance.",
  items: [
    {
      symbol: "Au",
      title: "Gold",
      body: "A foundation commodity with enduring monetary significance and deep, global demand.",
    },
    {
      symbol: "Ag",
      title: "Silver",
      body: "Precious and industrial demand, increasingly underpinned by the global energy transition.",
    },
    {
      symbol: "+",
      title: "Critical Minerals",
      body: "Materials essential to modern technology, energy systems and secure supply chains.",
    },
  ],
};

export const sectionBreak = {
  /**
   * Full-bleed image for the cinematic band. Reuses the hero asset with a
   * different crop + near-monochrome treatment so it reads as a second frame.
   * Replace with a dedicated drone shot when available.
   */
  image: "/hero.webp" as string | null,
  caption: "MineralX Resources",
  statement: "Building enduring value from real assets, responsibly.",
};

export const approach: SectionCopy & {
  items: Array<{ title: string; body: string }>;
} = {
  eyebrow: "Our Approach",
  heading: "How we build value.",
  intro: "A disciplined, value-led approach applied across everything we do.",
  items: [
    {
      title: "Capital discipline",
      body: "Measured allocation of capital toward the opportunities with the strongest potential to create value.",
    },
    {
      title: "Asset quality",
      body: "A focus on quality ground and meaningful opportunities over breadth for its own sake.",
    },
    {
      title: "Operational focus",
      body: "Hands-on advancement of projects, from discovery through development and into production.",
    },
    {
      title: "Responsible operations",
      body: "High standards of safety, environmental care and engagement with the communities where we operate.",
    },
  ],
};

export const investors = {
  eyebrow: "Investors & Partnerships",
  heading: "Partnering to build value.",
  body: "MineralX welcomes engagement with groups that share our focus on disciplined, long-term value creation in Australian resources.",
  partners: [
    {
      title: "Strategic partners",
      body: "Organisations seeking aligned exposure to disciplined resource development.",
    },
    {
      title: "Capital partners",
      body: "Investors evaluating measured opportunities in gold, silver and critical minerals.",
    },
    {
      title: "Joint-venture partners",
      body: "Groups looking to advance quality projects through shared development.",
    },
    {
      title: "Corporate opportunities",
      body: "Holders of quality projects or tenements seeking a capable development partner.",
    },
    {
      title: "Processing partners",
      body: "Operators with processing capacity and recovery expertise.",
    },
  ],
};

export const contact = {
  eyebrow: "Contact",
  heading: "Get in touch.",
  intro:
    "For investor, partnership and corporate enquiries, contact the MineralX team.",
  /**
   * Form delivery endpoint (e.g. Formspree: "https://formspree.io/f/xxxxxxx").
   * When set, the form submits directly and shows an on-page confirmation.
   * When null, the form falls back to opening the visitor's email client.
   */
  formEndpoint: null as string | null,
};

export const footer = {
  blurb:
    "An Australian mining and exploration company building long-term value through the discovery and development of gold, silver and critical minerals.",
  columns: [
    {
      title: "Company",
      links: [
        { label: "Overview", href: "/#overview" },
        { label: "What We Do", href: "/#focus" },
        { label: "Approach", href: "/#approach" },
      ],
    },
    {
      title: "Engage",
      links: [
        { label: "Updates", href: "/updates" },
        { label: "Investors", href: "/#investors" },
        { label: "Contact", href: "/#contact" },
      ],
    },
  ],
};
