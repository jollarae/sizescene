# SizeScene — size recommendation prototype

A local Chrome extension that scans the current jeans product page when opened and recommends an available size using waist, hip, and inseam measurements. The starting profile is 61 cm waist, 87 cm hip, and 72 cm inseam. The three-dot menu opens a page where those measurements can be edited. The profile and chosen fit preference are saved in Chrome's local extension storage.

The default fit is **As designed**, meaning the product's stated silhouette (for example, wide leg or low rise). **Closer** and **Roomier** move to adjacent available waist sizes when possible. Product advice such as “runs small” adjusts the starting size. Length is chosen from the available options closest to the user's inseam. **Why this size?** shows up to three short, checked reasons and one relevant caveat. **See source details** opens the product options, size guide, and retailer notes. A small note at the bottom of each recommendation reminds shoppers that actual fit may vary. An `L30` size label is not presented as a measured garment inseam. If no matching body chart is found, a numeric size may be shown as a clearly marked estimate; letter-only sizes without a matching chart are not guessed. No try-on visualization is included yet.

Height and thigh circumference can be entered optionally. Height checks a retailer's length guide when available; thigh circumference is compared only when the chart lists thigh measurements. Weight is not collected because the current jeans charts use body dimensions rather than weight. On stores that list waist and length independently, the popup shows both but asks the shopper to confirm stock for the exact pair on the product page.

**Size rule:** Product options are the sizes a shopper can select, such as `W24 L30`. Size-guide rows such as `XS` and `S` are reference data for interpreting measurements; they are not treated as purchasable sizes unless those labels also appear in the product's size selector. Crossed-out or disabled options are reported separately as unavailable. Future recommendations must choose from actual product options.

## Load in Chrome

1. Open `chrome://extensions` in Google Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this `jeans-size-scanner` folder.
4. Open a jeans product page, then click the **SizeScene** toolbar icon. A short loading sequence appears while the popup scans the page and prepares a recommendation. Changing the fit preference replays the loading sequence before showing the updated size. Use **Refresh scan** to read the page again.

The extension asks for temporary access to the tab you click it on and local storage for measurements. It also requests access to `modules.ecomid.com` so it can read the size-chart panel used by Weekday. It first uses the local scanner. On pages the local scanner cannot read reliably, a signed-in test account can use AI-assisted extraction. Product-page sizing excerpts and labels of sizing controls are sent to the Supabase Edge Function and OpenAI. When a chart is an image, its retailer-hosted image URL and the product's listed size labels are sent for image reading; body measurements are not included in that request. When signed in, a separate explanation request sends the shopper's saved measurements and checked recommendation facts to those services on each scan and fit change. Measurements remain saved locally; this request does not store them in a new database. The explanation has a local fallback when AI is unavailable.

## AI-assisted scanning (test access)

For unfamiliar retailer layouts, `page-snapshot.js` collects a limited set of visible size controls, chart text, and fit notes from the product area. It excludes navigation and reviews. When choices or a body chart are missing, `size-actions.js` identifies safe sizing controls and the AI chooses which one to open. The extension makes at most four clicks, then rescans the page and accessible frames. After collecting the evidence, it closes newly opened embedded sizing panels, returns an already-open chart to its previous view, and collapses size dropdowns it opened. Retailer controls without a reliable close action may still need to be closed manually. It does not fill in retailer questionnaires, submit forms, or buy anything. `supabase/functions/analyze-listing/index.ts` then asks OpenAI to identify which evidence is relevant. The popup accepts only sizes from actual page controls and chart cells that occur in the captured evidence. The recommendation still runs locally using your saved measurements; AI cannot change the selected size.

The fallback is enabled for the Berkeley test account. Open the three-dot menu, use **AI scan access** to request a sign-in link, then copy the email button's link address and paste it into the extension. If you already opened the link and Chrome shows a localhost error, copy that tab's full address instead; Supabase has already placed the session in its URL fragment. The Edge Function rejects other accounts and keeps the OpenAI key in Supabase secrets. Do not put that key in extension files. Reload the unpacked extension after code updates.

The test flow uses Supabase's default magic-link email because this project's Free plan cannot edit email templates without custom SMTP. Supabase's default email sender can send only to addresses on the project's team; if sign-in reports that the address is not authorized, use custom SMTP for this Berkeley address. Public release still needs per-user usage limits, a general sign-in policy, and a production email sender; this test build must not be published yet. A sizing database is not needed for extraction itself.

The AI pass reads page text and visible sizing-chart images. It can open size charts behind recognizable sizing buttons, including Weekday's Find your size → Size chart flow. Image values are accepted only when they form a plausible body chart and match actual product size options. A successfully read chart is presented like a text chart; the image format alone does not add an estimate warning. Other embedded chart providers may require additional domain access. If the AI service fails, the extension keeps the local scan.

Some retailers load size charts only after you open their **Size Guide**. If the popup says it found no chart, open the guide on the product page and click **Refresh scan** again. Scanning works on normal web pages; Chrome restricts extensions on internal browser pages and the Chrome Web Store.

On AGOLDE, the product sizes are in a dropdown and the size chart opens as an image. The extension reads the orderable sizes and stock labels, then asks AI to read waist and hip measurements from the chart image. The chart is shown under source details, and sold-out sizes remain identified.

On Tank Air, the extension reads the numeric product choices and its grid-based size guide. It uses body measurements from the **Body** chart for a recommendation when available. The **Garment** chart describes the jeans themselves and is shown as reference information; if only garment measurements can be read, the numeric recommendation is labeled an estimate.

## Test

The tests use local sample product pages in headless Chrome and pure recommendation tests in Node.js. With Node.js and Playwright available, run `node --test tests/*.test.cjs`.
