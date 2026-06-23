export type RefurbishedMac = {
  id: string;
  title: string;
  model: string;
  size?: string;
  releaseYear?: string;
  finish?: string;
  memory?: string;
  capacity?: string;
  chip?: string;
  price?: string;
  url: string;
  image?: string;
  description?: string;
  stores?: import("./apple").StoreAvailability[];
  searchableText: string;
};

export type RefurbishedFilterOptions = {
  models: string[];
  sizes: string[];
  releaseYears: string[];
  finishes: string[];
  memory: string[];
  capacity: string[];
};

type ProductJsonLd = {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  description?: string;
  color?: string;
  offers?: Array<{
    price?: number;
    priceCurrency?: string;
    sku?: string;
  }>;
};

type RefurbishedBootstrap = {
  dictionaries?: {
    dimensions?: Record<string, Record<string, { text?: string }>>;
  };
  tiles?: Array<{
    productDetailsUrl?: string;
    title?: string;
    partNumber?: string;
    image?: { sources?: Array<{ srcSet?: string }> };
    filters?: {
      dimensions?: {
        dimensionCapacity?: string;
        dimensionScreensize?: string;
        refurbClearModel?: string;
        dimensionRelYear?: string;
        dimensionColor?: string;
        tsMemorySize?: string;
      };
    };
    price?: { currentPrice?: { amount?: string; raw_amount?: string } };
  }>;
};

const REFURBISHED_URL = "https://www.apple.com/shop/refurbished/mac";

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  accept: "text/html,application/json",
};

function cleanText(value = "") {
  return value
    .replace(/[\u2011\u2012\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHtml(value = "") {
  return cleanText(value.replace(/<[^>]+>/g, ""));
}

function extractBalancedObject(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return undefined;

  const start = source.indexOf("{", markerIndex);
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  return undefined;
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

const ALL_REFURBISHED_MODELS = ["MacBook Air", "MacBook Pro", "iMac", "Mac mini", "Mac Studio", "Mac Pro", "Display"];

function modelFromTitle(title: string) {
  if (/MacBook Air/i.test(title)) return "MacBook Air";
  if (/MacBook Pro/i.test(title)) return "MacBook Pro";
  if (/Mac mini/i.test(title)) return "Mac mini";
  if (/Mac Studio/i.test(title)) return "Mac Studio";
  if (/Mac Pro/i.test(title)) return "Mac Pro";
  if (/iMac/i.test(title)) return "iMac";
  if (/Studio Display|Display/i.test(title)) return "Display";
  return "Other";
}

function labelFromDictionary(
  dictionaries: RefurbishedBootstrap["dictionaries"],
  dimension: string,
  value?: string,
) {
  if (!value) return undefined;
  return dictionaries?.dimensions?.[dimension]?.[value]?.text ?? cleanText(value).replace(/^(\d+)(inch)$/i, "$1-inch").toUpperCase();
}

function firstMatch(source: string, pattern: RegExp) {
  const match = source.match(pattern);
  return match?.[1] ? cleanText(match[1]) : undefined;
}

function specsFromProduct(product: ProductJsonLd): RefurbishedMac | undefined {
  const title = cleanText(product.name);
  const url = product.url;
  const sku = product.offers?.[0]?.sku;

  if (!title || !url || !sku) return undefined;

  const description = cleanText(product.description);
  const combined = cleanText(`${title} ${description}`);
  const releaseYear = firstMatch(description, /Originally released [A-Za-z]+\s+(\d{4})/i);
  const size = firstMatch(combined, /(\d+(?:\.\d+)?-inch)/i);
  const memory = firstMatch(combined, /(\d+(?:\.\d+)?\s?(?:GB|TB))\s+unified memory/i)?.replace(/\s/g, "");
  const capacity = firstMatch(combined, /(\d+(?:\.\d+)?\s?(?:GB|TB))\s+SSD/i)?.replace(/\s/g, "");
  const chip = firstMatch(combined, /(Apple\s+M\d(?:\s?(?:Pro|Max|Ultra))?\s+chip(?:\s+with\s+\d+[- ]Core CPU\s+and\s+\d+[- ]Core GPU)?)/i);
  const price = product.offers?.[0]?.price;

  return {
    id: sku,
    title,
    model: modelFromTitle(title),
    size,
    releaseYear,
    finish: product.color ? cleanText(product.color) : firstMatch(title, /-\s*([A-Za-z ]+)$/),
    memory,
    capacity,
    chip,
    price: typeof price === "number" ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : undefined,
    url,
    image: product.image,
    description,
    searchableText: [title, sku, description, product.color].join(" ").toLowerCase(),
  };
}

function productsFromBootstrap(html: string) {
  const objectSource = extractBalancedObject(html, "window.REFURB_GRID_BOOTSTRAP");
  if (!objectSource) return [];

  const bootstrap = JSON.parse(objectSource) as RefurbishedBootstrap;

  return (bootstrap.tiles ?? [])
    .map((tile): RefurbishedMac | undefined => {
      const title = cleanText(tile.title);
      const sku = tile.partNumber;
      const dimensions = tile.filters?.dimensions;
      const relativeUrl = tile.productDetailsUrl?.split("?")[0];

      if (!title || !sku || !relativeUrl) return undefined;

      const url = new URL(relativeUrl, "https://www.apple.com").toString();
      const rawPrice = tile.price?.currentPrice?.raw_amount;
      const price = rawPrice
        ? `$${Number(rawPrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
        : cleanHtml(tile.price?.currentPrice?.amount);
      const image = tile.image?.sources?.[0]?.srcSet;
      const model =
        labelFromDictionary(bootstrap.dictionaries, "refurbClearModel", dimensions?.refurbClearModel) ??
        modelFromTitle(title);
      const size = labelFromDictionary(bootstrap.dictionaries, "dimensionScreensize", dimensions?.dimensionScreensize);
      const releaseYear = labelFromDictionary(bootstrap.dictionaries, "dimensionRelYear", dimensions?.dimensionRelYear);
      const finish = labelFromDictionary(bootstrap.dictionaries, "dimensionColor", dimensions?.dimensionColor);
      const memory = labelFromDictionary(bootstrap.dictionaries, "tsMemorySize", dimensions?.tsMemorySize);
      const capacity = labelFromDictionary(bootstrap.dictionaries, "dimensionCapacity", dimensions?.dimensionCapacity);
      const chip = firstMatch(title, /(Apple\s+M\d(?:\s?(?:Pro|Max|Ultra))?\s+chip(?:\s+with\s+\d+[- ]Core CPU\s+and\s+\d+[- ]Core GPU)?)/i);

      return {
        id: sku,
        title,
        model,
        size,
        releaseYear,
        finish,
        memory,
        capacity,
        chip,
        price,
        url,
        image,
        searchableText: [title, sku, model, size, releaseYear, finish, memory, capacity].join(" ").toLowerCase(),
      };
    })
    .filter((product): product is RefurbishedMac => Boolean(product));
}

function extractJsonLdProducts(html: string) {
  const products: RefurbishedMac[] = [];
  const scriptPattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html))) {
    try {
      const payload = JSON.parse(match[1]) as ProductJsonLd;
      if (payload["@type"] !== "Product") continue;
      const product = specsFromProduct(payload);
      if (product) products.push(product);
    } catch {
      continue;
    }
  }

  return products;
}

export async function getRefurbishedCatalog(): Promise<{
  checkedAt: string;
  sourceUrl: string;
  products: RefurbishedMac[];
  filterOptions: RefurbishedFilterOptions;
}> {
  const response = await fetch(REFURBISHED_URL, {
    headers: HEADERS,
    next: { revalidate: 60 },
  });

  if (!response.ok) throw new Error(`Apple refurbished page returned ${response.status}`);

  const html = await response.text();
  const products = productsFromBootstrap(html);
  const fallbackProducts = products.length ? products : extractJsonLdProducts(html);

  return {
    checkedAt: new Date().toISOString(),
    sourceUrl: REFURBISHED_URL,
    products: fallbackProducts,
    filterOptions: {
      models: ALL_REFURBISHED_MODELS,
      sizes: unique(fallbackProducts.map((product) => product.size)),
      releaseYears: unique(fallbackProducts.map((product) => product.releaseYear)).sort().reverse(),
      finishes: unique(fallbackProducts.map((product) => product.finish)),
      memory: unique(fallbackProducts.map((product) => product.memory)),
      capacity: unique(fallbackProducts.map((product) => product.capacity)),
    },
  };
}
