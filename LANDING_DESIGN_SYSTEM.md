# JACITA Marketing design system

Version 1, 24 October 2026. Applied to the public landing page concept in `public/landing-concept/design-system.css`.

## Brand direction

The supplied JACITA logo sets the visual language: deep navy communicates trust and clarity; warm gold signals progress and gives the page a recognisable accent. White and soft ivory keep the content readable. Social platform logos can retain their native brand colours inside the playful hero tiles, but site controls, headings, illustrations and motion use JACITA's palette.

## Colour tokens

| Role | Token | Hex | Use |
| --- | --- | --- | --- |
| Primary | `--navy` | `#081F41` | Primary button, headings, brand surfaces |
| Deep surface | `--navy-deep` | `#06142E` | Process, motion and contact sections |
| Supporting blue | `--blue` | `#244C80` | Secondary highlights and light paths |
| Gold accent | `--gold` | `#B99849` | Borders, graphics, illustrations |
| Gold on dark | `--gold-bright` | `#D5B773` | Dark surface labels, focus and buttons |
| Gold on light | `--gold-ink` | `#8A681E` | Light surface labels, links and icons |
| Body copy | `--text` | `#334763` | Main paragraphs on white |
| Muted copy | `--muted` | `#536178` | Secondary paragraphs on white |
| Light text | `--on-dark` | `#D9E6FA` | Body copy on navy |
| White | `--surface` | `#FFFFFF` | Main page and cards |
| Soft surface | `--surface-soft` | `#F8F9FB` | Alternating sections and FAQ panel |
| Warm surface | `--surface-warm` | `#F8F6F0` | Personal service panel |
| Border | `--line` | `#E3E8EE` | Light cards and controls |

Gold has separate light and dark text variants. The decorative `--gold` is not used as small text on white.

## Contrast decisions

The following ratios use the WCAG relative luminance formula, rounded to two decimal places.

| Pair | Ratio | Intended use |
| --- | ---: | --- |
| Navy on white | 16.37:1 | Headings and buttons |
| Body copy on white | 9.45:1 | Paragraphs |
| Muted copy on white | 6.27:1 | Supporting text |
| Gold ink on white | 5.15:1 | Small accent labels |
| Bright gold on navy | 8.46:1 | Dark section labels and focus |
| Light text on navy | 12.98:1 | Dark section paragraphs |

Normal text is designed for at least 4.5:1 and large text for at least 3:1. Review translucent layers against their rendered backgrounds when new components are added.

## Type and layout

- Font: Inter with system sans serif fallback.
- Large headlines: tight tracking and roughly 1.05 to 1.12 line height. Paragraphs: 1.6 to 1.8 line height.
- Eyebrows: uppercase, 11px, restrained letter spacing. Gold ink on light, bright gold on dark.
- Maximum content width: 1190px. Side gutters: 24px on desktop, 18px on phones.
- Section spacing: 72px to 112px, scaled with viewport width.
- Card radius: 24px. Large panel radius: 30px. Buttons: full pill.
- A single primary action style uses navy with white text. Secondary actions use a white surface with a navy label. Gold filled actions use dark navy text.

## Interaction and accessibility rules

- All actionable controls have a visible keyboard focus ring. Focus is dark gold on light and bright gold on dark.
- Main buttons are at least 48px high. Navigation links get a 44px high area. FAQ summaries are at least 63px high on phones.
- The FAQ uses native `details` and `summary` controls, and keeps one answer open at a time.
- The marketing workflow diagram uses navy cards, gold signal paths and a dotted navy field. On phones it becomes a vertical readable flow. Its business brief node can replay the decorative path animation.
- Playful effects remain decorative. Content is present without hover. Touch users see open eyes on the primary CTA, while pointer users can move the pupils.
- `prefers-reduced-motion` removes the long sticky card animation, disables most decorative animations and leaves the process available as a normal step list.
- The contact form remains a concept interaction. Its submission does not send or store data.

## Usage rule

Use the semantic tokens in `public/landing-concept/design-system.css` for new UI. Keep direct platform colours only inside their respective social logo tiles. When a real dashboard is integrated, move these tokens into the shared application theme and verify each component's final rendered contrast, keyboard order, reflow and mobile layout.

## Reference standards

- [WCAG 2.2, Contrast Minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- [WCAG 2.2, Target Size Minimum](https://www.w3.org/TR/WCAG22/#target-size-minimum)
- [WCAG 2.2, Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible)
- [WCAG 2.2, Animation from Interactions](https://www.w3.org/TR/WCAG22/#animation-from-interactions)
