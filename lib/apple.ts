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
  configuredPartNumber?: string;
  optionPartNumbers?: string[];
  configurationParts?: Record<string, string>;
  availabilitySource: "exact" | "configured" | "none";
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

export type DeliveryAvailability = {
  id: string;
  quote: string;
  address?: string;
  buyable: boolean;
  available: boolean;
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

const CONFIGURED_OPTION_CACHE = new Map<string, string[]>();

type ProductSelectionData = {
  products: Array<{
    aosContainerPartNumber?: string;
    type?: string;
    btrOrFdPartNumber?: string | null;
    productConfiguration?: Record<string, string>;
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

function standardMemoryFor(family: MacFamily, chip?: string, cpuGpu?: string) {
  if (!chip) return undefined;
  if (family === "Mac Studio") {
    if (chip.includes("M3 Ultra")) return "96GB";
    if (chip.includes("M4 Max")) return "36GB";
  }
  if (family === "Mac mini") {
    if (chip.includes("M4 Pro")) return "24GB";
    if (chip.includes("M4 chip")) return "16GB";
  }
  if (family !== "MacBook Pro") return undefined;
  if (!cpuGpu) return undefined;
  if (chip.includes("M5 chip")) return "16GB";
  if (cpuGpu.includes("M5 Pro")) return "24GB";
  if (cpuGpu.includes("18-core CPU, 32-core GPU")) return "36GB";
  if (cpuGpu.includes("18-core CPU, 40-core GPU")) return "48GB";
  return undefined;
}

function standardStorageFor(family: MacFamily, chip?: string) {
  if (family === "Mac Studio" && chip?.includes("M3 Ultra")) return "1TB";
  if (family === "MacBook Pro" && chip?.includes("M5 Max")) return "1TB";
  if (family === "MacBook Pro" || family === "Mac Studio" || family === "Mac mini") return "512GB";
  return undefined;
}

function configuredPathSegment(filters: ModelFilters) {
  const pieces = [
    filters.size,
    filters.finish,
    filters.display?.replace("display", "display"),
    filters.chip ? `Apple ${filters.chip}` : undefined,
    filters.cpuGpu,
    filters.memory ? `${filters.memory} memory` : undefined,
    filters.storage ? `${filters.storage} storage` : undefined,
  ];

  return pieces
    .filter((piece): piece is string => Boolean(piece))
    .join(" ")
    .toLowerCase()
    .replace(/cpu,\s*/g, "cpu ")
    .replace(/gpu/g, "gpu")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function configuredBuyUrl(url: string, family: MacFamily, titleSpecs: string[], filters: ModelFilters) {
  const pathSegment = configuredPathSegment(filters);
  const params = new URLSearchParams({ model: family, spec: titleSpecs.join(", ") });
  return pathSegment ? `${url}/${pathSegment}?${params.toString()}` : `${url}?${params.toString()}`;
}

function configuredDeliveryKey(partNumber: string, optionPartNumbers: string[]) {
  return `${partNumber}${[...optionPartNumbers].sort().join("")}`;
}

function memoryOptionsFor(family: MacFamily, chip?: string) {
  if (family !== "MacBook Pro") return [standardMemoryFor(family, chip)];
  if (!chip) return [undefined];
  if (chip.includes("M5 chip")) return ["16GB", "24GB", "32GB"];
  if (chip.includes("M5 Pro")) return ["24GB", "48GB"];
  if (chip.includes("M5 Max")) return ["36GB", "48GB", "64GB", "128GB"];
  return [undefined];
}

function storageOptionsFor(family: MacFamily, chip?: string) {
  if (family !== "MacBook Pro") return [standardStorageFor(family, chip)];
  return ["512GB", "1TB", "2TB", "4TB", "8TB"];
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

function capacityValue(value: string) {
  const match = value.match(/([\d.]+)\s*(TB|GB)/i);
  if (!match) return Number.POSITIVE_INFINITY;
  const amount = Number(match[1]);
  return match[2].toUpperCase() === "TB" ? amount * 1024 : amount;
}

function sizeValue(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*-?\s*inch/i);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function chipRank(value: string) {
  const generation = Number(value.match(/M(\d+)/i)?.[1] ?? 0);
  const classRank = value.includes("Ultra") ? 4 : value.includes("Max") ? 3 : value.includes("Pro") ? 2 : 1;
  return generation * 10 + classRank;
}

function coreValues(value: string) {
  const cpu = Number(value.match(/(\d+)-core CPU/i)?.[1] ?? 0);
  const gpu = Number(value.match(/(\d+)-core GPU/i)?.[1] ?? 0);
  return { cpu, gpu };
}

function ordered(values: Array<string | undefined>, kind: keyof FilterOptions) {
  const uniqueValues = unique(values);
  const preferredFinish = ["Silver", "Space Gray", "Space Black", "Starlight", "Sky Blue", "Midnight", "Blue", "Purple", "Pink", "Orange", "Yellow", "Green"];
  const preferredDisplay = ["Standard display", "Nano-texture display"];

  return uniqueValues.sort((a, b) => {
    if (kind === "chips") return chipRank(b) - chipRank(a) || a.localeCompare(b);
    if (kind === "cpuGpu") {
      const chipDelta = chipRank(b) - chipRank(a);
      if (chipDelta) return chipDelta;
      const aCores = coreValues(a);
      const bCores = coreValues(b);
      return bCores.cpu - aCores.cpu || bCores.gpu - aCores.gpu || a.localeCompare(b);
    }
    if (kind === "memory" || kind === "storage") return capacityValue(a) - capacityValue(b) || a.localeCompare(b);
    if (kind === "sizes") return sizeValue(a) - sizeValue(b) || a.localeCompare(b);
    if (kind === "finishes") {
      const aIndex = preferredFinish.indexOf(a);
      const bIndex = preferredFinish.indexOf(b);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex) || a.localeCompare(b);
    }
    if (kind === "displays") {
      const aIndex = preferredDisplay.indexOf(a);
      const bIndex = preferredDisplay.indexOf(b);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex) || a.localeCompare(b);
    }
    return a.localeCompare(b);
  });
}

function pushOption(target: string[], value?: string) {
  if (value) target.push(value);
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

  const models = pages.flatMap(({ family, url, html }) => {
    const data = JSON.parse(extractBalancedObject(html, "productSelectionData:")) as ProductSelectionData;

    return data.products
      .filter((product) => !product.isComingSoon)
      .flatMap((product, index) => {
        const dimensions = product.dimensions ?? {};
        const baseFilters = filtersFromDimensions(data, dimensions);
        const standardMemory = standardMemoryFor(family, baseFilters.chip, baseFilters.cpuGpu);
        const standardStorage = standardStorageFor(family, baseFilters.chip);
        const variants: MacModel[] = [];

        for (const memory of memoryOptionsFor(family, baseFilters.chip)) {
          for (const storage of storageOptionsFor(family, baseFilters.chip)) {
            const isStandardConfig = memory === standardMemory && storage === standardStorage;
            const partNumber = isStandardConfig ? (product.btrOrFdPartNumber ?? undefined) : undefined;
            const configuredPartNumber = product.aosContainerPartNumber;
            const configurationParts = product.productConfiguration ?? {};
            const optionPartNumbers = Object.values(configurationParts).filter(Boolean).sort();
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
            const searchableText = [family, partNumber, configuredPartNumber, product.priceKey, ...titleSpecs].join(" ").toLowerCase();

            variants.push({
              id,
              family,
              partNumber,
              configuredPartNumber,
              optionPartNumbers,
              configurationParts,
              availabilitySource: partNumber ? "exact" : configuredPartNumber ? "configured" : "none",
              title: `${family} ${titleSpecs.join(", ")}`,
              price: priceFor(data, product.priceKey),
              buyUrl: partNumber
                ? `${url}?product=${encodeURIComponent(partNumber)}`
                : configuredBuyUrl(url, family, titleSpecs, filters),
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

  const options = models.reduce<FilterOptions>(
    (acc, model) => {
      const family = model.family;
      acc.chips[family] ??= [];
      acc.cpuGpu[family] ??= [];
      acc.sizes[family] ??= [];
      acc.finishes[family] ??= [];
      acc.displays[family] ??= [];
      acc.memory[family] ??= [];
      acc.storage[family] ??= [];
      pushOption(acc.chips[family], model.filters.chip);
      pushOption(acc.cpuGpu[family], model.filters.cpuGpu);
      pushOption(acc.sizes[family], model.filters.size);
      pushOption(acc.finishes[family], model.filters.finish);
      pushOption(acc.displays[family], model.filters.display);
      pushOption(acc.memory[family], model.filters.memory);
      pushOption(acc.storage[family], model.filters.storage);
      return acc;
    },
    {
      families: PRODUCT_PAGES.map((page) => page.family),
      chips: {},
      cpuGpu: {},
      sizes: {},
      finishes: {},
      displays: {},
      memory: {},
      storage: {},
    },
  );

  return {
    models,
    filterOptions: {
      ...options,
      chips: Object.fromEntries(Object.entries(options.chips).map(([family, values]) => [family, ordered(values, "chips")])),
      cpuGpu: Object.fromEntries(Object.entries(options.cpuGpu).map(([family, values]) => [family, ordered(values, "cpuGpu")])),
      sizes: Object.fromEntries(Object.entries(options.sizes).map(([family, values]) => [family, ordered(values, "sizes")])),
      finishes: Object.fromEntries(Object.entries(options.finishes).map(([family, values]) => [family, ordered(values, "finishes")])),
      displays: Object.fromEntries(Object.entries(options.displays).map(([family, values]) => [family, ordered(values, "displays")])),
      memory: Object.fromEntries(Object.entries(options.memory).map(([family, values]) => [family, ordered(values, "memory")])),
      storage: Object.fromEntries(Object.entries(options.storage).map(([family, values]) => [family, ordered(values, "storage")])),
    },
  };
}

function selectedOptionPartsFromPage(html: string) {
  try {
    const selections = JSON.parse(extractBalancedObject(html, '"userSelections"')) as Record<
      string,
      { partNumber?: string } | string | undefined
    >;

    return {
      keyboard: typeof selections.KEYBOARD_LANGUAGE === "object" ? selections.KEYBOARD_LANGUAGE?.partNumber : undefined,
      memory: typeof selections.MEMORY === "object" ? selections.MEMORY?.partNumber : undefined,
      power_adapter: typeof selections.POWER_ADAPTER === "object" ? selections.POWER_ADAPTER?.partNumber : undefined,
      storage: typeof selections.STORAGE === "object" ? selections.STORAGE?.partNumber : undefined,
    };
  } catch {
    return {};
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function getConfiguredOptionPartNumbers(model: MacModel) {
  if (!model.configuredPartNumber) return [];
  const cached = CONFIGURED_OPTION_CACHE.get(model.buyUrl);
  if (cached) return cached;

  const html = await fetchProductPage(model.buyUrl);
  const selectedParts = selectedOptionPartsFromPage(html);
  const configurationParts = {
    ...(model.configurationParts ?? {}),
    ...Object.fromEntries(Object.entries(selectedParts).filter((entry): entry is [string, string] => Boolean(entry[1]))),
  };
  const optionPartNumbers = Object.values(configurationParts).filter(Boolean).sort();
  CONFIGURED_OPTION_CACHE.set(model.buyUrl, optionPartNumbers);
  return optionPartNumbers;
}

export async function getConfiguredDeliveryAvailability(zip: string, models: MacModel[]) {
  const configuredModels = models.filter((model) => model.configuredPartNumber);
  const resolvedModels = (
    await mapWithConcurrency(configuredModels, 8, async (model) => {
      const optionPartNumbers = await getConfiguredOptionPartNumbers(model);
      return optionPartNumbers.length ? { model, optionPartNumbers } : undefined;
    })
  ).filter(
    (entry): entry is { model: MacModel; optionPartNumbers: string[] } =>
      Boolean(entry?.model.configuredPartNumber && entry.optionPartNumbers.length),
  );

  const results: DeliveryAvailability[] = [];
  const batchSize = 20;

  async function fetchDeliveryBatch(batch: typeof resolvedModels): Promise<DeliveryAvailability[]> {
    const params = new URLSearchParams({ location: zip });

    batch.forEach(({ model, optionPartNumbers }, index) => {
      params.set(`parts.${index}`, model.configuredPartNumber ?? "");
      params.set(`option.${index}`, optionPartNumbers.join(","));
      params.set(`mts.${index}`, "regular");
    });

    const response = await fetch(`https://www.apple.com/shop/delivery-message?${params.toString()}`, {
      headers: HEADERS,
      cache: "no-store",
    });

    if (!response.ok) {
      if (batch.length > 1) {
        const midpoint = Math.ceil(batch.length / 2);
        const [left, right] = await Promise.all([
          fetchDeliveryBatch(batch.slice(0, midpoint)),
          fetchDeliveryBatch(batch.slice(midpoint)),
        ]);
        return [...left, ...right];
      }

      return [
        {
          id: batch[0].model.id,
          quote: `Apple delivery lookup returned ${response.status}`,
          buyable: false,
          available: false,
        },
      ];
    }

    const payload = await response.json();
    const deliveryMessage = payload?.body?.content?.deliveryMessage as Record<
      string,
      {
        regular?: {
          deliveryOptionMessages?: Array<{ displayName?: string }>;
          stickyMessageSTH?: string;
          address?: { postalCode?: string };
          buyability?: { isBuyable?: boolean };
          isBuyable?: boolean;
        };
      }
    >;

    const batchResults: DeliveryAvailability[] = [];

    for (const { model, optionPartNumbers } of batch) {
      const partNumber = model.configuredPartNumber;
      if (!partNumber) continue;

      const regular = deliveryMessage?.[configuredDeliveryKey(partNumber, optionPartNumbers)]?.regular;
      if (!regular) {
        batchResults.push({
          id: model.id,
          quote: "Unavailable",
          buyable: false,
          available: false,
        });
        continue;
      }

      const quote =
        regular.deliveryOptionMessages?.find((message) => message.displayName)?.displayName ??
        cleanHtml(regular.stickyMessageSTH ?? "") ??
        "Delivery available";
      const buyable = Boolean(regular.buyability?.isBuyable ?? regular.isBuyable);

      batchResults.push({
        id: model.id,
        quote,
        address: regular.address?.postalCode ? `Delivers to ${regular.address.postalCode}` : undefined,
        buyable,
        available: buyable,
      });
    }

    return batchResults;
  }

  for (let offset = 0; offset < resolvedModels.length; offset += batchSize) {
    const batch = resolvedModels.slice(offset, offset + batchSize);
    results.push(...(await fetchDeliveryBatch(batch)));
  }

  return results;
}

export async function getCurrentMacModels(): Promise<MacModel[]> {
  const catalog = await getCurrentMacCatalog();
  return catalog.models;
}

export async function getPickupAvailability(zip: string, partNumbers: string[]) {
  const params = new URLSearchParams({ location: zip, little: "true" });
  partNumbers.forEach((part, index) => params.set(`parts.${index}`, part));

  const url = `https://www.apple.com/shop/retail/pickup-message?${params.toString()}`;
  let response = await fetch(url, {
    headers: HEADERS,
    cache: "no-store",
  });

  if (!response.ok && [429, 500, 503, 541].includes(response.status)) {
    response = await fetch(url, {
      headers: HEADERS,
      cache: "no-store",
    });
  }

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
