# MineralX corporate website

MineralX's corporate website, built with Next.js App Router, TypeScript and Tailwind CSS. The original SpaceX-inspired black theme, Inter typography and aerial hero image are retained.

## Run locally

Use Node.js 22 and install the locked dependencies:

```sh
npm ci
npm run dev
npm run lint
npm run build
npm start
```

## Public scope

The website presents the company and its broad direction across resources, research and industrial development. Do not publish individual project details, private correspondence, unverified capabilities, financial metrics or partner names/logos without an approved public source.

- `/`: corporate introduction, direction, approach and engagement
- `/company`: identity, purpose and operating principles
- `/direction`: three connected strategic themes
- `/partnerships`: capital, strategic and technical/industrial relationships
- `/contact`: clearly labelled email enquiries
- `/privacy`: website and enquiry privacy notice
- `/updates` and `/updates/[slug]`: Markdown corporate publishing

Shared copy and contact information are in `lib/content.ts`. Page-specific editorial content is in the corresponding `app/` route. The existing legal entity and postal address have been retained; changes require verification against company records.

## Contact enquiries

Contact actions open a draft addressed to `info@mineral-x.com.au` with the selected enquiry subject. Visitors send the message from their own email application. This site does not claim to submit or confirm delivery. No email provider credentials or form service are required.

## Publishing corporate updates

Copy `content/articles/_template.md` to an approved URL slug such as `company-announcement.md`. Complete the metadata and approved corporate text, then commit and deploy. Files beginning with `_` are excluded. Updates navigation and its sitemap entry appear automatically once at least one published article exists. Keep individual projects and unpublished commercial information out of public articles. Markdown is trusted repository content; never accept visitor-uploaded Markdown.

## Accessibility and performance

The header remains available on scroll. The native mobile dialog supports keyboard focus containment, Escape and focus return. A skip link and visible focus styles support keyboard navigation. Page content is rendered on the server, and the synthetic loading screen has been removed. The original hero image remains unchanged; reduced-motion preferences disable its drift animation.

## Maintenance and deployment

The production branch is `main`. Confirm the repository's Vercel deployment status and the custom domain after pushing. Never assume a successful Git push means the production site has deployed. Roll back using the last verified Vercel production deployment, or revert the release commit and redeploy.

Next.js is pinned to the patched 15.5 maintenance line. The PostCSS override selects a patched compatible 8.x release for Next's transitive dependency; review it when upgrading Next.js. Use `npm audit --omit=dev` and verify the production build after dependency changes.

© MineralX Resources Pty Ltd.
