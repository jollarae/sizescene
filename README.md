# SizeScene — size recommendation prototype

A Chrome extension that scans the current jeans product page and recommends a size using the shopper's saved measurements. On first open, the shopper creates an email/password account or logs in, then saves height, weight, waist, and hip once. Inseam and thigh are optional. Returning shoppers stay signed in through a renewable session; their measurements are loaded from their own Supabase account. The three-dot menu opens account and measurement settings. New accounts start with empty fields, not the creator's measurements.

The default fit is **As designed**, meaning the product's stated silhouette (for example, wide leg or low rise). **Closer** and **Roomier** move to adjacent available waist sizes when possible. Product advice such as “runs small” adjusts the starting size. Length is chosen from the available options closest to the user's inseam. **Why this size?** shows up to three short, checked reasons and one relevant caveat. **See source details** opens the product options, size guide, and retailer notes. A small note at the bottom of each recommendation reminds shoppers that actual fit may vary. An `L30` size label is not presented as a measured garment inseam. If no matching body chart is found, a numeric size may be shown as a clearly marked estimate; letter-only sizes without a matching chart are not guessed. No try-on visualization is included yet.

Weight can be entered in kilograms or pounds; the database stores kilograms and remembers the chosen unit. Weight is saved but does not change a jeans recommendation unless a future retailer guide supplies a trustworthy weight-based comparison. Height checks a retailer's length guide when available; thigh circumference is compared only when the chart lists thigh measurements. If inseam is missing and no height guide gives a length, SizeScene recommends a waist and asks the shopper to choose a length on the product page. On stores that list waist and length independently, the popup shows both when it has length guidance but asks the shopper to confirm stock for the exact pair on the product page.

**Size rule:** Product options are the sizes a shopper can select, such as `W24 L30`. Size-guide rows such as `XS` and `S` are reference data for interpreting measurements; they are not treated as purchasable sizes unless those labels also appear in the product's size selector. Crossed-out or disabled options are reported separately as unavailable. Future recommendations must choose from actual product options.

## Load in Chrome

1. Open `chrome://extensions` in Google Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this `jeans-size-scanner` folder.
4. Open a jeans product page, then click the **SizeScene** toolbar icon. Create an account or log in, and save your measurements. Later opens go straight to the scan. Changing the fit preference replays the loading sequence before showing the updated size. Use **Rescan** to read the page again.

The extension asks for temporary access to the tab you click it on and local storage for the renewable login session. Measurements are saved in the `user_measurements` table in Supabase with row-level security. It also requests access to `modules.ecomid.com` so it can read the size-chart panel used by Weekday. It first uses the local scanner. On pages the local scanner cannot read reliably, the Berkeley test account can use AI-assisted extraction. Product-page sizing excerpts and labels of sizing controls are sent to the Supabase Edge Function and OpenAI. When a chart is an image, its retailer-hosted image URL and the product's listed size labels are sent for image reading; body measurements are not included in that request. For AI explanations, the shopper's saved measurements and checked recommendation facts are sent to those services on each scan and fit change. The explanation has a local fallback when AI is unavailable.

## AI-assisted scanning (test access)

For unfamiliar retailer layouts, `page-snapshot.js` collects a limited set of visible size controls, chart text, and fit notes from the product area. It excludes navigation and reviews. When choices or a body chart are missing, `size-actions.js` identifies safe sizing controls and the AI chooses which one to open. The extension makes at most four clicks, then rescans the page and accessible frames. After collecting the evidence, it closes newly opened embedded sizing panels, returns an already-open chart to its previous view, and collapses size dropdowns it opened. Retailer controls without a reliable close action may still need to be closed manually. It does not fill in retailer questionnaires, submit forms, or buy anything. `supabase/functions/analyze-listing/index.ts` then asks OpenAI to identify which evidence is relevant. The popup accepts only sizes from actual page controls and chart cells that occur in the captured evidence. The recommendation still runs locally using your saved measurements; AI cannot change the selected size.

The Edge Function still allows only the Berkeley test account while AI usage controls are being prepared. Other accounts can use local scanning and recommendations when the page supplies readable sizing. The OpenAI key stays in Supabase secrets. Do not put that key in extension files. Reload the unpacked extension after code updates.

## Account setup for the email-free test version

1. In the Supabase project, go to **Authentication → Providers → Email**. Enable email/password sign-up and turn **Confirm email** off. Without this setting, signup requires a confirmation email and the extension will show a setup error.
2. Apply `supabase/migrations/20261020_create_user_measurements.sql` in the project's SQL Editor if the `public.user_measurements` table is not present. The table is keyed by account ID and has policies that limit each shopper to their own row.
3. If the table already exists with the original seven columns, apply `supabase/migrations/20261116_require_height_weight_optional_inseam.sql`. This adds weight and its preferred unit, requires height and weight, and makes inseam optional. Complete any existing rows before applying it; the current test project had no rows when this change was prepared.
4. Keep this version limited to trusted testers. Email addresses are unverified and password reset is unavailable. Add a custom email sender, turn confirmation back on, build password recovery, and add AI request limits before a wider release.

If Supabase is paused, restore the project before testing account creation or cloud profile storage. A sizing database is not needed for extracting retailer details, but the account profile table is needed to remember measurements across devices.

The AI pass reads page text and visible sizing-chart images. It can open size charts behind recognizable sizing buttons, including Weekday's Find your size → Size chart flow. Image values are accepted only when they form a plausible body chart and match actual product size options. A successfully read chart is presented like a text chart; the image format alone does not add an estimate warning. Other embedded chart providers may require additional domain access. If the AI service fails, the extension keeps the local scan.

Some retailers load size charts only after you open their **Size Guide**. If the popup says it found no chart, open the guide on the product page and click **Refresh scan** again. Scanning works on normal web pages; Chrome restricts extensions on internal browser pages and the Chrome Web Store.

On AGOLDE, the product sizes are in a dropdown and the size chart opens as an image. The extension reads the orderable sizes and stock labels, then asks AI to read waist and hip measurements from the chart image. The chart is shown under source details, and sold-out sizes remain identified.

On Tank Air, the extension reads the numeric product choices and its grid-based size guide. It uses body measurements from the **Body** chart for a recommendation when available. The **Garment** chart describes the jeans themselves and is shown as reference information; if only garment measurements can be read, the numeric recommendation is labeled an estimate.

## Test

The tests use local sample product pages in headless Chrome and pure recommendation tests in Node.js. With Node.js and Playwright available, run `node --test tests/*.test.cjs`.
