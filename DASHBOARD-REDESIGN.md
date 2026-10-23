# JACITA workspace redesign

The private `/app` workspace uses the supplied Aether palette, scoped glass surfaces, responsive navigation, a business switcher, weekly review queue and reusable performance components. The public home page and authentication remain unchanged. No dependencies, integrations or database migrations were added.

## Records and workflows

- Summary totals query the selected business through the authenticated Supabase client and RLS. Counts are exact rather than based on the latest 40 content records. The active-business count is explicitly workspace-wide; other cards describe the selected business.
- Confirmed publications count provider jobs with `status=published`, an external post ID and `simulated=false`. The content pipeline separately counts published content with supporting provider jobs. Scheduled and publishing states remain distinct.
- Review actions open existing content, social accounts, media, brand settings, campaigns and automation workflows. Business switching uses the existing membership-checked server action.
- Draft editing, approvals, platform variants, media selection, scheduling and publication actions retain their existing implementation. Material-edit and scheduling safeguards are covered by the existing database tests.
- Performance filters separate Instagram, Facebook and TikTok, and separate stored provider, manual and sample sources. Reporting periods include an equal-length previous period. Missing daily records remain missing rather than invented zero values. Daily values have keyboard controls, tooltips and a table.
- TikTok video views are not combined with Meta reach. Engagements are explicitly defined as likes, comments, shares and saves. Daily reach is not presented as unique people over the full period.
- Enquiry and recorded-booking totals are separate. Confirmed booking outcomes and sales attribution are not verified by the current data model. Unknown campaign attribution remains unknown. No click-to-sale funnel was invented.
- Charts show reporting dates, business timezone and last record update. Provider sync time is not tracked separately and is labelled as unrecorded.

## Existing integration limits

Meta and TikTok adapters already exist; their availability still depends on each business's credentials, permissions and account connections. No connection is presented as live just because its adapter exists. Canva and AI video editing were not added. There is no standalone Growth route in this checkout; existing campaigns, goals, services and analysis remain accessible.

AI usage code calculates costs from reported tokens and the application's price table. Those amounts are estimates rather than provider invoices. Other operating costs are not tracked.

Read-only, anonymous schema probes against the configured backend on 23 October 2026 confirmed the overview's content, account, brand, campaign, automation, media and metrics projections. They also confirmed that `ai_usage` is not exposed in the backend schema and that its publishing-job enum lacks `held`. The UI therefore reports unavailable cost/hold tracking. These optional gaps do not hide working content or analytics. No remote data or schema was changed.

## Preview and validation

Run `npm run dev` and open `http://localhost:3000/app`, using an existing invited account. The new Businesses page is `/app/businesses`. Use `?range=7d`, `30d` or `90d` on Overview or Analytics, or change the reporting-period selector.

Checks: `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:unit`, `npm run test:publishing`, `npm run test:meta`, `npm run test:preview`, `npm run test:pglite`, and `npm run test:dashboard`.

Desktop and mobile visual inspection used the actual Overview, Businesses, Content Studio, Calendar and Analytics components rendered with isolated empty test fixtures. Those fixtures did not replace application data or bypass authentication. Full signed-in browser workflow checks require an existing account session; the preview browser was left at sign-in. Temporary public inspection pages and render fixtures were removed after inspection.

Visual fixes included mobile review ordering, compact navigation, Content Studio empty-state width, Analytics card padding, and shorter mobile calendar days. All nonessential workspace motion honours reduced-motion preferences.
