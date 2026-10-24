# JACITA Marketing landing page concept

The approved navy and gold landing page is staged at `/landing-concept/index.html`. It is a self-contained, static concept that can be reviewed in the existing Next.js app without changing `/`, authentication, dashboards, or API routes.

## What is included

- Responsive landing page, traffic line background, interactive hero tiles, stacked method cards, workflow animation, outcomes, FAQs, and a client logo placeholder area.
- `public/landing-concept/design-system.css` contains the brand overrides. `LANDING_DESIGN_SYSTEM.md` documents the visual rules.
- The contact form and social connections are illustrative. The page explicitly says they do not transmit enquiries or connect accounts.
- The workflow signals animate along the branches and replay when the business brief node is clicked. Reduced motion settings suppress decorative motion.

## Integration path

When the page is approved for production, move its sections into React components, connect the enquiry flow to a validated server endpoint, replace client placeholders with authorised logos, and then decide whether to make it the root route. Preserve the existing sign-in and dashboard routes while doing so.
