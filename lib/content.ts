/**
 * Central content configuration for the MineralX Resources website.
 *
 * All site copy lives here so it can be edited without touching component code.
 * Keep the tone corporate, measured and factual — MineralX is a mining and
 * exploration company building value, not a services or consulting business.
 * No invented resources, reserves, ounces, grades, partners or staff.
 */

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
};

export const nav = [
  { label: "Overview", href: "#overview" },
  { label: "What We Do", href: "#focus" },
  { label: "Investors", href: "#investors" },
  { label: "Contact", href: "#contact" },
];

export const hero = {
  // Hero copy + CTA preserved to match the original site's hero exactly.
  supporting:
    "MineralX Resources is an Australian mining, exploration and R&D company which holds a strategic portfolio of mineral assets in North Queensland's minerals province.",
  cta: { label: "Latest Exploration Update", href: "#overview" },
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

export const operatingFocus = {
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

export const commodities = {
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
  disclaimer:
    "This website is for general information only and does not constitute an offer of securities or investment advice.",
};

export const contact = {
  eyebrow: "Contact",
  heading: "Get in touch.",
  intro:
    "For investor, partnership and corporate enquiries, contact the MineralX team.",
};

export const footer = {
  blurb:
    "An Australian mining and exploration company building long-term value through the discovery and development of gold, silver and critical minerals.",
  columns: [
    {
      title: "Company",
      links: [
        { label: "Overview", href: "#overview" },
        { label: "What We Do", href: "#focus" },
      ],
    },
    {
      title: "Engage",
      links: [
        { label: "Commodities", href: "#commodities" },
        { label: "Investors", href: "#investors" },
        { label: "Contact", href: "#contact" },
      ],
    },
  ],
};
