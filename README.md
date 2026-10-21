# SizeScene — size recommendation prototype

A local Chrome extension that scans the current jeans product page when opened and recommends an available size using waist, hip, and inseam measurements. The starting profile is 61 cm waist, 87 cm hip, and 72 cm inseam. The three-dot menu opens a page where those measurements can be edited. The profile and chosen fit preference are saved in Chrome's local extension storage.

The default fit is **As designed**, meaning the product's stated silhouette (for example, wide leg or low rise). **Closer** and **Roomier** move to adjacent available waist sizes when possible. Product advice such as “runs small” adjusts the starting size. Length is chosen from the available options closest to the user's inseam. The popup explains the evidence, any extra length, and measurements that the listing does not provide. If no matching body chart is found, a numeric size may be shown as a clearly marked estimate; letter-only sizes without a matching chart are not guessed. No try-on visualization is included yet.

Height and thigh circumference can be entered optionally. Height checks a retailer's length guide when available; thigh circumference is compared only when the chart lists thigh measurements. Weight is not collected because the current jeans charts use body dimensions rather than weight. On stores that list waist and length independently, the popup shows both but asks the shopper to confirm stock for the exact pair on the product page.

**Size rule:** Product options are the sizes a shopper can select, such as `W24 L30`. Size-guide rows such as `XS` and `S` are reference data for interpreting measurements; they are not treated as purchasable sizes unless those labels also appear in the product's size selector. Crossed-out or disabled options are reported separately as unavailable. Future recommendations must choose from actual product options.

## Load in Chrome

1. Open `chrome://extensions` in Google Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this `jeans-size-scanner` folder.
4. Open a jeans product page, then click the **SizeScene** toolbar icon. A short loading sequence appears while the popup scans the page and prepares a recommendation. Changing the fit preference replays the loading sequence before showing the updated size. Use **Refresh scan** to read the page again.

The extension asks for temporary access to the tab you click it on and local storage for measurements. It does not send page contents or personal measurements to a server. No API key or database is needed.

Some retailers load size charts only after you open their **Size Guide**. If the popup says it found no chart, open the guide on the product page and click **Refresh scan** again. Scanning works on normal web pages; Chrome restricts extensions on internal browser pages and the Chrome Web Store.

On AGOLDE, the product sizes are in a dropdown and the size chart opens as an image. The extension reads the orderable sizes, stock labels, fit notes, and listed inseam, but it cannot extract body measurements from the image. It therefore marks the numeric recommendation as an estimate and names the fit checks it cannot make.

On Tank Air, the extension reads the numeric product choices and its grid-based size guide. It uses body measurements from the **Body** chart for a recommendation when available. The **Garment** chart describes the jeans themselves and is shown as reference information; if only garment measurements can be read, the numeric recommendation is labeled an estimate.

## Test

The tests use local sample product pages in headless Chrome and pure recommendation tests in Node.js. With Node.js and Playwright available, run `node --test tests/*.test.cjs`.
