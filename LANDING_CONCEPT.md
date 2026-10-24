# JACITA Marketing homepage

The approved navy and gold design is the public homepage at `/`. Next.js rewrites that URL to `public/landing-concept/index.html`, so the complete design and its interactions retain their own styles. The address stays `/`; this is not a redirect or an iframe.

The former homepage's glass visuals now frame the existing email/password form at `/login`. Desktop and mobile navigation on the new homepage link to this sign-in page. Existing session handling, account creation, dashboards, media uploads and API routes retain their URLs and behavior. The separate client login and upload portal are future work.

## Included

- Responsive landing page, traffic line background, interactive hero tiles, stacked method cards, workflow animation, outcomes, FAQs, and a client logo placeholder area.
- `public/landing-concept/design-system.css` contains the brand overrides. `LANDING_DESIGN_SYSTEM.md` documents the visual rules.
- Asset paths are absolute, so both `/` and the original `/landing-concept/index.html` review URL render correctly.
- The enquiry form, social connection examples and client placeholders remain clearly labelled illustrations. The form does not transmit or store enquiries and stays disabled until its preview handler is available.
- The workflow signals animate along the branches and replay when the business brief node is clicked. Reduced motion settings suppress decorative motion.

## Follow-up features

Connect the enquiry flow to a validated server endpoint and replace client placeholders with authorised logos when those features are commissioned. The separate client upload portal is not implemented here.
