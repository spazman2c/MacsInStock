# Macs In Stock

A small Next.js app that checks Apple Store pickup availability by ZIP code for current MacBook Pro, MacBook Pro PROLED, Mac Studio, and Mac mini configurations.

## How it works

- Fetches Apple buy pages server-side, including the separate PROLED XDR catalog, and parses current model part numbers.
- Includes all PROLED sizes, finishes, display glass options, and supported chip, memory, and storage combinations (up to 128GB and 16TB).
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
