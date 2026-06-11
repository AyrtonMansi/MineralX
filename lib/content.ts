/**
 * Central content configuration for the MineralX Resources website.
 *
 * All site copy lives here so it can be edited without touching component code.
 * Keep the tone corporate, measured and factual — no invented resources,
 * reserves, ounces, grades, partners or staff.
 */

export const company = {
  name: "MineralX Resources",
  shortName: "MineralX",
  legalName: "MineralX Resources Pty Ltd",
  tagline: "Australian mining and exploration.",
  description:
    "MineralX Resources is an Australian mining and exploration company building a disciplined gold exploration and development platform in Queensland.",
  email: "info@mineral-x.com.au",
  region: "Queensland, Australia",
  domain: "mineral-x.com.au",
  url: "https://mineral-x.com.au",
  postal: {
    label: "Postal address",
    lines: ["PO Box 6088", "Cairns City, Queensland, 4870"],
  },
  operations: {
    label: "Mining operations",
    lines: ["PO Box 8", "Georgetown, Queensland, 4871"],
  },
  social: [
    { label: "LinkedIn", href: "#", icon: "linkedin" as const },
    { label: "Instagram", href: "#", icon: "instagram" as const },
  ],
};

export const nav = [
  { label: "Overview", href: "#overview" },
  { label: "Operating Focus", href: "#focus" },
  { label: "Queensland", href: "#queensland" },
  { label: "Capability", href: "#capability" },
  { label: "Investors", href: "#investors" },
  { label: "Contact", href: "#contact" },
];

export const hero = {
  eyebrow: "MineralX Resources",
  headline: "Australian mining and exploration.",
  supporting:
    "MineralX Resources is building a disciplined gold exploration and development platform.",
  primaryCta: { label: "Company Overview", href: "#overview" },
  secondaryCta: { label: "Contact", href: "#contact" },
};

export const overview = {
  eyebrow: "Company Overview",
  heading: "Built on field execution and disciplined development.",
  body: "MineralX Resources combines field-led exploration, practical mining capability and disciplined project development to identify and advance gold, silver and critical mineral opportunities.",
  credentials: [
    { label: "Ownership", value: "Australian owned" },
    { label: "Focus region", value: "Queensland" },
    { label: "Commodity focus", value: "Gold & critical minerals" },
    { label: "Approach", value: "Field-led execution" },
  ],
};

export const operatingFocus = {
  eyebrow: "Operating Focus",
  heading: "Three connected capabilities.",
  intro:
    "From ground assessment to recoverable product, MineralX is structured to move opportunities forward with discipline.",
  cards: [
    {
      index: "01",
      title: "Exploration",
      body: "Field-led exploration to identify, evaluate and prioritise prospective gold and mineral targets across our area of focus.",
    },
    {
      index: "02",
      title: "Mining Capability",
      body: "Practical, on-the-ground mining capability — from access and earthworks through to bulk sampling and staged extraction.",
    },
    {
      index: "03",
      title: "Processing Pathways",
      body: "Assessment of metallurgical and processing pathways to move material from ground to recoverable product.",
    },
  ],
};

export const queensland = {
  eyebrow: "Operating Region",
  heading: "A focus on Queensland gold.",
  body: [
    "Queensland has a long and continuing history of gold production and remains one of Australia's most prospective and active mineral regions.",
    "MineralX is focused on identifying and advancing opportunities within this established mining jurisdiction — supported by accessible infrastructure, a deep services sector and a stable operating environment.",
  ],
  attributes: [
    "Established mining jurisdiction",
    "Active gold province",
    "Accessible infrastructure",
    "Skilled services sector",
  ],
};

export const capability = {
  eyebrow: "Capability",
  heading: "Capability across the development pathway.",
  intro:
    "A connected set of disciplines applied from early assessment through to processing strategy.",
  items: [
    {
      title: "Field assessment",
      body: "Structured field assessment and target generation to evaluate prospectivity and prioritise work programs.",
    },
    {
      title: "Bulk sampling",
      body: "Planning and execution of representative bulk sampling to test material at meaningful scale.",
    },
    {
      title: "Mine planning",
      body: "Practical mine planning aligned to geology, access and a staged approach to development.",
    },
    {
      title: "Metallurgical review",
      body: "Review of metallurgical characteristics to inform recovery and processing decisions.",
    },
    {
      title: "Processing strategy",
      body: "Development of processing strategy and pathways from run-of-mine through to product.",
    },
    {
      title: "Strategic partnerships",
      body: "Engagement with partners, vendors and specialists to strengthen execution and development.",
    },
  ],
};

export const investors = {
  eyebrow: "Investors & Partnerships",
  heading: "Positioned for aligned partnerships.",
  body: "MineralX is positioned to work with aligned groups across exploration, development, processing and capital. We welcome enquiries from organisations that share a disciplined, long-term approach to resource development.",
  partners: [
    {
      title: "Strategic partners",
      body: "Organisations seeking aligned exposure to disciplined resource development.",
    },
    {
      title: "Project vendors",
      body: "Holders of tenements or projects seeking a capable development partner.",
    },
    {
      title: "Technical consultants",
      body: "Geological, mining and metallurgical specialists supporting program delivery.",
    },
    {
      title: "Capital partners",
      body: "Investors evaluating measured opportunities in Australian resources.",
    },
    {
      title: "Processing partners",
      body: "Operators and groups with processing capacity and recovery expertise.",
    },
  ],
  disclaimer:
    "This website is for general information only and does not constitute an offer of securities or investment advice.",
};

export const contact = {
  eyebrow: "Contact",
  heading: "Get in touch.",
  intro:
    "For investor, partnership and project enquiries, contact the MineralX team.",
  enquiryTypes: ["Investor enquiry", "Partnership", "Project / vendor", "General"],
};

export const footer = {
  blurb:
    "An Australian mining and exploration company focused on disciplined gold exploration and development in Queensland.",
  columns: [
    {
      title: "Company",
      links: [
        { label: "Overview", href: "#overview" },
        { label: "Operating Focus", href: "#focus" },
        { label: "Capability", href: "#capability" },
      ],
    },
    {
      title: "Engage",
      links: [
        { label: "Queensland", href: "#queensland" },
        { label: "Investors", href: "#investors" },
        { label: "Contact", href: "#contact" },
      ],
    },
  ],
};
