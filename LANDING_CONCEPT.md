# JACITA Marketing homepage

The approved navy and gold design is the public homepage at `/`, rendered natively by `src/app/page.tsx`. Its sections live in `src/components/landing/`. The page uses the shared Next.js layout, font loading, metadata and navigation, with a CSS Module that scopes the supplied design to this page.

The former homepage's glass visuals now frame the existing email/password form at `/login`. Desktop and mobile navigation on the new homepage link to this sign-in page. Existing session handling, account creation, dashboards, media uploads and API routes retain their URLs and behavior. The separate client login and upload portal are future work.

## Included

- Responsive landing page, traffic line background, interactive platform artwork, stacked method cards, workflow animation, outcomes, FAQs, and endorsed business logos.
- The homepage matches version 19 of the supplied [landing reference](https://jacita-marketing-concept.famousgull10.chatgpt.site/), including its typing headline, circular reveal menu and actual platform/business artwork. Local assets live in `public/landing/`; there is no dependency on the private reference site's availability or authentication.
- The hero uses an original Glacier Blue cloud shader inspired by the approved Framer background reference. A lazy native WebGL canvas stays behind a static CSS fallback and light text/navigation wash. Rendering is capped at 30fps, pauses off screen or in hidden tabs, reduces resolution/detail on mobile, and releases GPU resources on unmount or reduced-motion changes. Graphics failures use the static fallback.
- The ten platform logos use their original SVG crop coordinates in `platform-logos.json` and rounded rigid-body collisions powered by a lazily loaded Matter.js engine. A shared responsive floor lets logos fall, collide, rotate, and be thrown; tapping empty space kicks nearby logos upward with a ripple. The play area keeps dragging clear of the headline and controls, allows scrolling on empty space, pauses off screen and when settled, and falls back to static logos for reduced motion.
- The three service cards use native numbered folders in JACITA navy, pale blue and gold, with original inline SVG illustrations. Hover or keyboard focus opens a folder; touch taps toggle one at a time. Copy stays readable, cards grow with their text, and reduced motion shows a static expanded layout.
- `public/landing-concept/design-system.css` contains the brand overrides. `LANDING_DESIGN_SYSTEM.md` documents the visual rules.
- The original patch and its assets are already present. `/landing-concept/index.html` remains a standalone reference; the homepage does not load, rewrite to, or inject that HTML.
- Static copy and the FAQ render as server components. Small client components manage the native dialog menu, typing headline, draggable artwork, workflow stack, SVG traffic, rotating outcomes, business logos and enquiry preview. The dialog traps focus, closes with Escape, restores focus and releases the body scroll lock on close or navigation.
- Animation frames, timers, media query listeners and observers are released on unmount. Reduced motion preferences are observed, including changes while the page is open.
- CSS variables and selectors are scoped beneath the homepage wrapper, so navigating to login or the dashboard does not apply the marketing theme to those pages.
- The enquiry form and social connection examples remain clearly labelled illustrations. The form does not transmit or store enquiries and stays disabled until its preview handler is available. The endorsed businesses use the identities provided in the approved reference.
- The workflow signals animate along the branches and replay when the business brief node is clicked. Reduced motion settings suppress decorative motion.

## Follow-up features

Connect the enquiry flow to a validated server endpoint when commissioned. The separate client upload portal is not implemented here.
