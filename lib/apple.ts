export type MacFamily = "MacBook Pro" | "Mac Studio" | "Mac mini";

export type ModelFilters = {
  chip?: string;
  cpuGpu?: string;
  size?: string;
  finish?: string;
  display?: string;
  memory?: string;
  storage?: string;
};

export type MacModel = {
  family: MacFamily;
  id: string;
  partNumber?: string;
  title: string;
  price?: string;
  buyUrl: string;
  specs: string[];
  filters: ModelFilters;
  searchableText: string;
  checkable: boolean;
};

export type FilterOptions = {
  families: MacFamily[];
  chips: Record<string, string[]>;
  cpuGpu: Record<string, string[]>;
  sizes: Record<string, string[]>;
  finishes: Record<string, string[]>;
  displays: Record<string, string[]>;
  memory: Record<string, string[]>;
  storage: Record<string, string[]>;
};

export type StoreAvailability = {
  storeName: string;
  city: string;
  state: string;
  distance: string;
  address: string;
  phoneNumber?: string;
  partNumber: string;
  quote: string;
  pickupDisplay?: string;
  pickupType?: string;
  eligible: boolean;
  availableToday: boolean;
};

const PRODUCT_PAGES: Array<{ family: MacFamily; url: string }> = [
  { family: "MacBook Pro", url: "https://www.apple.com/shop/buy-mac/macbook-pro" },
  { family: "Mac Studio", url: "https://www.apple.com/shop/buy-mac/mac-studio" },
  { family: "Mac mini", url: "https://www.apple.com/shop/buy-mac/mac-mini" },
];

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  accept: "text/html,application/json",
};

type ProductSelectionData = {
  products: Array<{
    btrOrFdPartNumber?: string | null;
    priceKey?: string;
    dimensions?: Record<string, string>;
    isComingSoon?: boolean;
  }>;
  mainDisplayValues?: Record<string, Record<string, { header?: string } | unknown>>;
  configDisplayValues?: Record<string, Record<string, { header?: string } | string[] | unknown>>;
};

function extractBalancedObject(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Missing ${marker}`);

  const start = source.indexOf("{", markerIndex);
  if (start === -1) throw new Error(`Missing object for ${marker}`);

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

  throw new Error(`Unterminated object for ${marker}`);
}

function cleanHtml(value: string) {
  return value
    .replace(/<as-footnote[\s\S]*?<\/as-footnote>/g, "")
    .replace(/<div[\s\S]*$/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8209;|‑/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function labelFor(data: ProductSelectionData, key: string, value: string) {
  const entry = data.mainDisplayValues?.[key]?.[value] ?? data.configDisplayValues?.[key]?.[value];
  if (!entry || typeof entry !== "object" || !("header" in entry)) {
    if (key.includes("cpuCoreCount-gpuCoreCount")) {
      const match = value.match(/(\d+)-(\d+)$/);
      if (match) return `${match[1]}-core CPU, ${match[2]}-core GPU`;
    }
    return value;
  }
  const header = (entry as { header?: string }).header;
  return header ? cleanHtml(header) : value;
}

function filtersFromDimensions(data: ProductSelectionData, dimensions: Record<string, string>): ModelFilters {
  return {
    chip: dimensions["processor-dimensionChip"]
      ? labelFor(data, "processor-dimensionChip", dimensions["processor-dimensionChip"])
      : undefined,
    cpuGpu: dimensions["processor-dimensionChip-cpuCoreCount-gpuCoreCount"]
      ? labelFor(
          data,
          "processor-dimensionChip-cpuCoreCount-gpuCoreCount",
          dimensions["processor-dimensionChip-cpuCoreCount-gpuCoreCount"],
        )
      : undefined,
    size: dimensions["chassis-dimensionScreensize"]
      ? labelFor(data, "chassis-dimensionScreensize", dimensions["chassis-dimensionScreensize"])
      : undefined,
    finish: dimensions["chassis-dimensionColor"]
      ? labelFor(data, "chassis-dimensionColor", dimensions["chassis-dimensionColor"])
      : undefined,
    display: dimensions["display-dimensionFinish"]
      ? labelFor(data, "display-dimensionFinish", dimensions["display-dimensionFinish"])
      : undefined,
  };
}

function memoryOptionsFor(family: MacFamily, chip?: string) {
  if (family !== "MacBook Pro") return [undefined];
  if (!chip) return [undefined];
  if (chip.includes("M5 chip")) return ["16GB", "24GB", "32GB"];
  if (chip.includes("M5 Pro")) return ["24GB", "48GB"];
  if (chip.includes("M5 Max")) return ["36GB", "48GB", "64GB", "128GB"];
  return [undefined];
}

function storageOptionsFor(family: MacFamily) {
  if (family !== "MacBook Pro") return [undefined];
  return ["1TB", "2TB", "4TB", "8TB"];
}

function defaultMemoryFor(family: MacFamily, cpuGpu?: string) {
  if (family !== "MacBook Pro") return undefined;
  if (!cpuGpu) return undefined;
  if (cpuGpu.includes("M5 chip")) return "24GB";
  if (cpuGpu.includes("M5 Pro")) return "24GB";
  if (cpuGpu.includes("18-core CPU, 32-core GPU")) return "36GB";
  if (cpuGpu.includes("18-core CPU, 40-core GPU")) return "48GB";
  return undefined;
}

function defaultStorageFor(family: MacFamily) {
  if (family !== "MacBook Pro") return undefined;
  return "1TB";
}

function priceFor(data: ProductSelectionData, priceKey?: string) {
  if (!priceKey) return undefined;
  const prices = data.mainDisplayValues?.prices as
    | Record<string, { currentPrice?: { amount?: string }; fullPrice?: string }>
    | undefined;
  const price = prices?.[priceKey];
  return price?.currentPrice?.amount ?? (price?.fullPrice ? cleanHtml(price.fullPrice) : undefined);
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function optionValues(data: ProductSelectionData, key: string) {
  const source = data.mainDisplayValues?.[key] ?? data.configDisplayValues?.[key];
  if (!source) return [];
  const order = Array.isArray(source.variantOrder) ? (source.variantOrder as string[]) : Object.keys(source);
  return order.filter((value) => value !== "variantOrder").map((value) => labelFor(data, key, value));
}

async function fetchProductPage(url: string) {
  const response = await fetch(url, {
    headers: HEADERS,
    next: { revalidate: 60 * 60 },
  });

  if (!response.ok) throw new Error(`Apple product page returned ${response.status}`);
  return response.text();
}

export async function getCurrentMacCatalog(): Promise<{ models: MacModel[]; filterOptions: FilterOptions }> {
  const pages = await Promise.all(
    PRODUCT_PAGES.map(async (page) => ({
      ...page,
      html: await fetchProductPage(page.url),
    })),
  );

  const options: FilterOptions = {
    families: PRODUCT_PAGES.map((page) => page.family),
    chips: {},
    cpuGpu: {},
    sizes: {},
    finishes: {},
    displays: {},
    memory: {},
    storage: {},
  };

  const models = pages.flatMap(({ family, url, html }) => {
    const data = JSON.parse(extractBalancedObject(html, "productSelectionData:")) as ProductSelectionData;
    options.chips[family] = optionValues(data, "processor-dimensionChip");
    options.cpuGpu[family] = optionValues(data, "processor-dimensionChip-cpuCoreCount-gpuCoreCount");
    options.sizes[family] = optionValues(data, "chassis-dimensionScreensize");
    options.finishes[family] = optionValues(data, "chassis-dimensionColor");
    options.displays[family] = optionValues(data, "display-dimensionFinish");
    options.memory[family] = optionValues(data, "memory-dimensionMemory");
    options.storage[family] = optionValues(data, "storage-dimensionCapacity");

    return data.products
      .filter((product) => !product.isComingSoon)
      .flatMap((product, index) => {
        const dimensions = product.dimensions ?? {};
        const baseFilters = filtersFromDimensions(data, dimensions);
        const defaultMemory = defaultMemoryFor(family, baseFilters.cpuGpu);
        const defaultStorage = defaultStorageFor(family);
        const variants: MacModel[] = [];

        for (const memory of memoryOptionsFor(family, baseFilters.chip)) {
          for (const storage of storageOptionsFor(family)) {
            const isDefaultConfig =
              family !== "MacBook Pro" || (memory === defaultMemory && storage === defaultStorage);
            const partNumber = isDefaultConfig ? (product.btrOrFdPartNumber ?? undefined) : undefined;
            const filters = { ...baseFilters, memory, storage };
            const titleSpecs = [
              filters.finish,
              filters.chip,
              filters.cpuGpu,
              filters.memory,
              filters.storage,
              filters.display,
              filters.size,
            ].filter((spec): spec is string => Boolean(spec));
            const id = partNumber ?? `${family}-${product.priceKey ?? index}-${memory ?? "base"}-${storage ?? "base"}`;
            const searchableText = [family, partNumber, product.priceKey, ...titleSpecs].join(" ").toLowerCase();

            variants.push({
              id,
              family,
              partNumber,
              title: `${family} ${titleSpecs.join(", ")}`,
              price: priceFor(data, product.priceKey),
              buyUrl: partNumber ? `${url}?product=${encodeURIComponent(partNumber)}` : url,
              specs: titleSpecs,
              filters,
              searchableText,
              checkable: Boolean(partNumber),
            });
          }
        }

        return variants;
      });
  });

  return {
    models,
    filterOptions: {
      ...options,
      chips: Object.fromEntries(Object.entries(options.chips).map(([family, values]) => [family, unique(values)])),
      cpuGpu: Object.fromEntries(Object.entries(options.cpuGpu).map(([family, values]) => [family, unique(values)])),
      sizes: Object.fromEntries(Object.entries(options.sizes).map(([family, values]) => [family, unique(values)])),
      finishes: Object.fromEntries(Object.entries(options.finishes).map(([family, values]) => [family, unique(values)])),
      displays: Object.fromEntries(Object.entries(options.displays).map(([family, values]) => [family, unique(values)])),
      memory: Object.fromEntries(Object.entries(options.memory).map(([family, values]) => [family, unique(values)])),
      storage: Object.fromEntries(Object.entries(options.storage).map(([family, values]) => [family, unique(values)])),
    },
  };
}

export async function getCurrentMacModels(): Promise<MacModel[]> {
  const catalog = await getCurrentMacCatalog();
  return catalog.models;
}

export async function getPickupAvailability(zip: string, partNumbers: string[]) {
  const params = new URLSearchParams({ location: zip, little: "true" });
  partNumbers.forEach((part, index) => params.set(`parts.${index}`, part));

  const response = await fetch(`https://www.apple.com/shop/retail/pickup-message?${params.toString()}`, {
    headers: HEADERS,
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Apple pickup endpoint returned ${response.status}`);

  const payload = await response.json();
  const locationError = typeof payload?.body?.errorMessage === "string" ? payload.body.errorMessage : undefined;
  const stores = (payload?.body?.stores ?? []) as Array<{
    storeName?: string;
    city?: string;
    state?: string;
    storeDistanceWithUnit?: string;
    phoneNumber?: string;
    address?: { address?: string; address2?: string };
    partsAvailability?: Record<
      string,
      {
        storePickEligible?: boolean;
        pickupSearchQuote?: string;
        pickupDisplay?: string;
        pickupType?: string;
        messageTypes?: { regular?: { storePickupQuote?: string; storePickupQuote2_0?: string } };
      }
    >;
  }>;

  const results: StoreAvailability[] = [];

  for (const store of stores) {
    for (const partNumber of partNumbers) {
      const availability = store.partsAvailability?.[partNumber];
      if (!availability) continue;

      const quote =
        availability.messageTypes?.regular?.storePickupQuote2_0 ??
        availability.messageTypes?.regular?.storePickupQuote ??
        availability.pickupSearchQuote ??
        "Unavailable";

      results.push({
        storeName: store.storeName ?? "Apple Store",
        city: store.city ?? "",
        state: store.state ?? "",
        distance: store.storeDistanceWithUnit ?? "",
        address: [store.address?.address, store.address?.address2].filter(Boolean).join(", "),
        phoneNumber: store.phoneNumber,
        partNumber,
        quote,
        pickupDisplay: availability.pickupDisplay,
        pickupType: availability.pickupType,
        eligible: Boolean(availability.storePickEligible),
        availableToday: /available today|today/i.test(quote) || availability.pickupDisplay === "available",
      });
    }
  }

  return { results, locationError };
}
