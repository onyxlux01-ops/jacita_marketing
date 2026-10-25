# JACITA Marketing homepage

The approved navy and gold design is the public homepage at `/`, rendered natively by `src/app/page.tsx`. Its sections live in `src/components/landing/`. The page uses the shared Next.js layout, font loading, metadata and navigation, with a CSS Module that scopes the supplied design to this page.

The former homepage's glass visuals now frame the existing email/password form at `/login`. Desktop and mobile navigation on the new homepage link to this sign-in page. Existing session handling, account creation, dashboards, media uploads and API routes retain their URLs and behavior. The separate client login and upload portal are future work.

## Included

- Responsive landing page, traffic line background, interactive hero tiles, stacked method cards, workflow animation, outcomes, FAQs, and a client logo placeholder area.
- `public/landing-concept/design-system.css` contains the brand overrides. `LANDING_DESIGN_SYSTEM.md` documents the visual rules.
- The original patch and its assets are already present. `/landing-concept/index.html` remains a standalone reference; the homepage does not load, rewrite to, or inject that HTML.
- Static copy and the FAQ render as server components. Small client components manage the mobile menu, draggable tiles, workflow stack, SVG traffic, rotating outcomes, illustrative logos and enquiry preview.
- Animation frames, timers, media query listeners and observers are released on unmount. Reduced motion preferences are observed, including changes while the page is open.
- CSS variables and selectors are scoped beneath the homepage wrapper, so navigating to login or the dashboard does not apply the marketing theme to those pages.
- The enquiry form, social connection examples and client placeholders remain clearly labelled illustrations. The form does not transmit or store enquiries and stays disabled until its preview handler is available.
- The workflow signals animate along the branches and replay when the business brief node is clicked. Reduced motion settings suppress decorative motion.

## Follow-up features

Connect the enquiry flow to a validated server endpoint and replace client placeholders with authorised logos when those features are commissioned. The separate client upload portal is not implemented here.
