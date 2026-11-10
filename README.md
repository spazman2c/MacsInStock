# Macs In Stock

A small Next.js app that checks Apple Store pickup availability by ZIP code for current MacBook Pro, MacBook Pro PROLED, Mac Studio, Mac mini, and iPhone Duo configurations.

## How it works

- Fetches Apple buy pages server-side, including the separate PROLED XDR catalog, and parses current model part numbers.
- Includes all PROLED sizes, finishes, display glass options, and supported chip, memory, and storage combinations (up to 128GB and 16TB).
- Includes every iPhone Duo finish, storage capacity, and carrier purchase option from Apple’s US catalog. Carrier options share hardware pickup quotes; activation is confirmed on Apple’s site.
- Calls Apple's pickup JSON endpoint in real time for the entered ZIP code.
- Displays nearby store pickup quotes and highlights models available today.

Customized CTO builds usually do not have stable public pickup part numbers, so customized variants are listed as NO PICKUP and link to their Apple configuration; pickup is checked for configurations Apple exposes with retail part numbers.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js.

## Publish

This app is ready for Vercel or any host that supports Next.js app routes.

```bash
npm run build
```

Deploy the repository and keep the `/api/search` route server-side; the Apple lookup should not run directly from the browser.

## Stock history

Both inventory tables include a sortable **Last stocked** column. It records the last successful observation of availability in this browser, persists in local storage across reloads, and keeps pickup history separate by ZIP and retail part number. Carrier options for the same iPhone share hardware history. Refurbished shipping history is tracked separately. Unavailable products and failed checks preserve prior timestamps; custom configurations without pickup SKUs show **Not tracked**. Products without an observation show **Not observed**.

Apple does not supply historical restock dates. History starts with checks made on this device, and is not shared between visitors or devices. A shared historical feed would require persistent server storage and scheduled stock checks. Clearing browser storage clears history; storage restrictions can prevent it from persisting. The most recent 10,000 product/area observations are retained.
