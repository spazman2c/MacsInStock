const STORAGE_KEY = "macs-in-stock:stock-history:v1";
const MAX_ENTRIES = 10_000;

type Observation = { key: string; available: boolean };
type StockHistory = Record<string, string>;
type HistoryStorage = Pick<Storage, "getItem" | "setItem">;

export function pickupHistoryKey(zip: string, partNumber: string) {
  return `pickup:${zip}:${partNumber}`;
}

export function refurbishedHistoryKey(id: string) {
  return `refurbished:${id}`;
}

/** Records successful stock observations; missing, unavailable, and failed checks never erase history. */
export function observeStock(
  observations: Observation[],
  checkedAt: string,
  storage?: HistoryStorage,
): StockHistory {
  let history: StockHistory = {};
  try {
    storage ??= window.localStorage;
    const stored: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      history = Object.fromEntries(Object.entries(stored).filter(([, value]) =>
        typeof value === "string" && Number.isFinite(Date.parse(value)),
      ));
    }
  } catch {
    // Browsers can block storage; current stock results must still render.
  }

  const checkedTime = Date.parse(checkedAt);
  if (Number.isFinite(checkedTime)) {
    for (const { key, available } of observations) {
      if (available && checkedTime > Date.parse(history[key] ?? "1970-01-01")) {
        history[key] = new Date(checkedTime).toISOString();
      }
    }
  }

  history = Object.fromEntries(Object.entries(history)
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
    .slice(0, MAX_ENTRIES));
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Quota and privacy restrictions should not fail a stock lookup.
  }
  return history;
}
