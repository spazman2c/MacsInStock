"use client";

import { Bell, BellRing } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColumnDef,
  PaginationState,
  Row,
  SortingState,
  VisibilityState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { LastStocked } from "@/components/last-stocked";
import { observeStock, pickupHistoryKey } from "@/lib/stock-history";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";

type Store = {
  storeName: string;
  city: string;
  state: string;
  distance: string;
  address: string;
  phoneNumber?: string;
  quote: string;
  availableToday: boolean;
  eligible: boolean;
};

type Model = {
  family: "MacBook Pro" | "MacBook Pro PROLED" | "Mac Studio" | "Mac mini" | "iPhone Duo";
  id: string;
  partNumber?: string;
  configuredPartNumber?: string;
  optionPartNumbers?: string[];
  availabilitySource: "exact" | "configured" | "none";
  title: string;
  price?: string;
  buyUrl: string;
  specs: string[];
  filters: {
    chip?: string;
    cpuGpu?: string;
    size?: string;
    finish?: string;
    display?: string;
    memory?: string;
    storage?: string;
    carrier?: string;
  };
  searchableText: string;
  checkable: boolean;
  lastStockedAt?: string;
  stores: Store[];
};

type SearchResponse = {
  zip: string;
  checkedAt: string;
  availabilityError?: string;
  filterOptions: {
    families: Model["family"][];
    chips: Record<string, string[]>;
    cpuGpu: Record<string, string[]>;
    sizes: Record<string, string[]>;
    finishes: Record<string, string[]>;
    displays: Record<string, string[]>;
    memory: Record<string, string[]>;
    storage: Record<string, string[]>;
    carriers: Record<string, string[]>;
  };
  models: Model[];
  error?: string;
};

type InventoryRow = {
  id: string;
  family: Model["family"];
  label: string;
  partNumber: string;
  buyUrl: string;
  chip: string;
  cores: string;
  memory: string;
  storage: string;
  finish: string;
  carrier: string;
  detail: string;
  availabilitySource: Model["availabilitySource"];
  availability: "AVAILABLE" | "SOLD OUT" | "NO PICKUP" | "UNKNOWN";
  available: boolean;
  lastStockedAt?: string;
  stores: Store[];
  checkable: boolean;
};

const defaultSpecFilters = {
  family: "All",
  chip: "All",
  cpuGpu: "All",
  size: "All",
  finish: "All",
  display: "All",
  memory: "All",
  storage: "All",
  carrier: "All",
  query: "",
};

const SAVED_ZIP_KEY = "macs-in-stock:saved-zip";
const REFRESH_SECONDS = 60;
type WebkitAudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function normalizeZip(value: string) {
  const match = value.trim().match(/^(\d{5})(?:[-\s]?\d{4})?$/);
  return match?.[1] ?? "";
}

export default function Home() {
  const [zip, setZip] = useState("");
  const [specFilters, setSpecFilters] = useState(defaultSpecFilters);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "availability", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [savedZip, setSavedZip] = useState("");
  const [nextRefreshIn, setNextRefreshIn] = useState(REFRESH_SECONDS);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [alertIds, setAlertIds] = useState<Record<string, boolean>>({});
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const savedZipRef = useRef("");
  const loadingRef = useRef(false);
  const soundEnabledRef = useRef(false);
  const alertIdsRef = useRef<Record<string, boolean>>({});
  const lastAvailabilityRef = useRef<Record<string, boolean>>({});
  const loadedSavedZipRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const normalizedZip = normalizeZip(zip);

  const playAlarm = useCallback(async () => {
    const AudioContextClass = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    if (context.state === "suspended") await context.resume();

    const start = context.currentTime + 0.02;
    for (let index = 0; index < 6; index += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const toneStart = start + index * 0.2;
      const toneEnd = toneStart + 0.15;

      oscillator.type = index % 2 ? "sawtooth" : "square";
      oscillator.frequency.setValueAtTime(520, toneStart);
      oscillator.frequency.exponentialRampToValueAtTime(1180, toneEnd);
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.18, toneStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneEnd + 0.02);
    }
  }, []);

  const runSearch = useCallback(async (zipToSearch: string) => {
    const lookupZip = normalizeZip(zipToSearch);
    if (!lookupZip) {
      setError("Enter a valid US ZIP code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/search?zip=${encodeURIComponent(lookupZip)}`, { cache: "no-store" });
      const payload = (await response.json()) as SearchResponse;
      if (!response.ok) throw new Error(payload.error ?? "Search failed.");
      const history = observeStock(payload.models.flatMap((model) => model.partNumber ? [{
        key: pickupHistoryKey(payload.zip, model.partNumber),
        available: !payload.availabilityError && model.stores.some((store) => store.availableToday),
      }] : []), payload.checkedAt);
      setData({ ...payload, models: payload.models.map((model) => ({
        ...model,
        lastStockedAt: model.partNumber ? history[pickupHistoryKey(payload.zip, model.partNumber)] : undefined,
      })) });
      setZip(lookupZip);
      setNextRefreshIn(REFRESH_SECONDS);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const viewerId = window.sessionStorage.getItem("macs-in-stock:viewer-id") ?? crypto.randomUUID();
    window.sessionStorage.setItem("macs-in-stock:viewer-id", viewerId);

    async function updateViewer(active = true) {
      try {
        const response = await fetch("/api/viewers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: viewerId, active }),
          cache: "no-store",
        });
        const payload = (await response.json()) as { count?: number };
        if (typeof payload.count === "number") setViewerCount(payload.count);
      } catch {
        // Viewer count is informational; stock lookup should keep working if it fails.
      }
    }

    void updateViewer();
    const interval = window.setInterval(() => void updateViewer(), 10_000);

    function markInactive() {
      navigator.sendBeacon?.("/api/viewers", JSON.stringify({ id: viewerId, active: false }));
    }

    window.addEventListener("pagehide", markInactive);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", markInactive);
      void updateViewer(false);
    };
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    alertIdsRef.current = alertIds;
  }, [alertIds]);

  useEffect(() => {
    savedZipRef.current = savedZip;
  }, [savedZip]);

  useEffect(() => {
    if (loadedSavedZipRef.current) return;
    const storedZip = normalizeZip(window.localStorage.getItem(SAVED_ZIP_KEY) ?? "");
    if (!storedZip) return;

    loadedSavedZipRef.current = true;
    setSavedZip(storedZip);
    setZip(storedZip);
    void runSearch(storedZip);
  }, [runSearch]);

  useEffect(() => {
    if (!savedZip) return;

    const interval = window.setInterval(() => {
      setNextRefreshIn((seconds) => {
        if (seconds > 1) return seconds - 1;
        if (savedZipRef.current && !loadingRef.current) void runSearch(savedZipRef.current);
        return REFRESH_SECONDS;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [runSearch, savedZip]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formZip = new FormData(event.currentTarget).get("zip");
    void runSearch(typeof formZip === "string" ? formZip : zip);
  }

  function saveCurrentZip() {
    if (!normalizedZip) return;
    window.localStorage.setItem(SAVED_ZIP_KEY, normalizedZip);
    setSavedZip(normalizedZip);
    setZip(normalizedZip);
    setNextRefreshIn(REFRESH_SECONDS);
    void runSearch(normalizedZip);
  }

  function clearSavedZip() {
    window.localStorage.removeItem(SAVED_ZIP_KEY);
    setSavedZip("");
    setNextRefreshIn(REFRESH_SECONDS);
  }

  const selectedFamily = specFilters.family === "All" ? undefined : specFilters.family;
  const optionSource = data?.filterOptions;

  const optionSet = {
    families: optionSource?.families ?? ["MacBook Pro", "MacBook Pro PROLED", "Mac Studio", "Mac mini", "iPhone Duo"],
    chips: selectedFamily ? (optionSource?.chips[selectedFamily] ?? []) : [],
    cpuGpu: selectedFamily ? (optionSource?.cpuGpu[selectedFamily] ?? []) : [],
    sizes: selectedFamily ? (optionSource?.sizes[selectedFamily] ?? []) : [],
    finishes: selectedFamily ? (optionSource?.finishes[selectedFamily] ?? []) : [],
    displays: selectedFamily ? (optionSource?.displays[selectedFamily] ?? []) : [],
    memory: selectedFamily ? (optionSource?.memory[selectedFamily] ?? []) : [],
    storage: selectedFamily ? (optionSource?.storage[selectedFamily] ?? []) : [],
    carriers: selectedFamily ? (optionSource?.carriers[selectedFamily] ?? []) : [],
  };

  const filteredModels = useMemo(() => {
    const models = data?.models ?? [];
    const queryTokens = specFilters.query
      .trim()
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);

    return models.filter((model) => {
      if (specFilters.family !== "All" && model.family !== specFilters.family) return false;
      if (specFilters.chip !== "All" && model.filters.chip !== specFilters.chip) return false;
      if (specFilters.cpuGpu !== "All" && model.filters.cpuGpu !== specFilters.cpuGpu) return false;
      if (specFilters.size !== "All" && model.filters.size !== specFilters.size) return false;
      if (specFilters.finish !== "All" && model.filters.finish !== specFilters.finish) return false;
      if (specFilters.display !== "All" && model.filters.display !== specFilters.display) return false;
      if (specFilters.carrier !== "All" && model.filters.carrier !== specFilters.carrier) return false;
      if (specFilters.memory !== "All" && !model.searchableText.includes(specFilters.memory.toLowerCase())) return false;
      if (specFilters.storage !== "All" && !model.searchableText.includes(specFilters.storage.toLowerCase())) return false;
      if (queryTokens.length && !queryTokens.every((token) => model.searchableText.includes(token))) return false;
      return true;
    });
  }, [data?.models, specFilters]);

  const availableTodayCount = data?.models.filter((model) => model.stores.some((store) => store.availableToday)).length ?? 0;
  const storeCount = new Set(data?.models.flatMap((model) => model.stores.map((store) => store.storeName)) ?? []).size;
  const inventoryRows = useMemo<InventoryRow[]>(
    () =>
      filteredModels.map((model) => {
        const todayStores = model.stores.filter((store) => store.availableToday);
        const available = todayStores.length > 0;
        const availability =
          model.availabilitySource === "configured"
            ? "NO PICKUP"
            : data?.availabilityError
            ? "UNKNOWN"
            : available
              ? "AVAILABLE"
              : "SOLD OUT";

        return {
          id: model.id,
          family: model.family,
          label: [model.family, model.filters.chip, model.filters.cpuGpu, model.filters.memory, model.filters.storage, model.filters.finish, model.filters.carrier]
            .filter(Boolean)
            .join(", "),
          partNumber: model.partNumber ?? "Configured",
          availabilitySource: model.availabilitySource,
          buyUrl: model.buyUrl,
          chip: model.filters.chip ?? "-",
          cores: model.filters.cpuGpu ?? "-",
          memory: model.filters.memory ?? "-",
          storage: model.filters.storage ?? "-",
          finish: model.filters.finish ?? "-",
          carrier: model.filters.carrier ?? "-",
          detail: [model.filters.size, model.filters.display].filter(Boolean).join(" · "),
          availability,
          available,
          stores: model.stores.slice(0, 5),
          checkable: model.checkable,
          lastStockedAt: model.lastStockedAt,
        };
      }),
    [data?.availabilityError, filteredModels],
  );
  useEffect(() => {
    const nextAvailability = Object.fromEntries(inventoryRows.map((row) => [row.id, row.available]));

    if (soundEnabledRef.current) {
      for (const row of inventoryRows) {
        if (alertIdsRef.current[row.id] && row.available && !lastAvailabilityRef.current[row.id]) {
          void playAlarm();
        }
      }
    }

    lastAvailabilityRef.current = nextAvailability;
  }, [data?.checkedAt, inventoryRows, playAlarm]);

  const toggleModelAlert = useCallback(
    async (row: InventoryRow) => {
      const isEnabling = !alertIdsRef.current[row.id];
      if (isEnabling) {
        setSoundEnabled(true);
        soundEnabledRef.current = true;
        if (row.available) {
          lastAvailabilityRef.current[row.id] = true;
          void playAlarm();
        }
      }

      setAlertIds((currentAlerts) => ({ ...currentAlerts, [row.id]: isEnabling }));
    },
    [playAlarm],
  );

  const toggleLocations = useCallback((rowId: string) => {
    setExpandedRows((rows) => ({ ...rows, [rowId]: !rows[rowId] }));
  }, []);
  const columns = useMemo<ColumnDef<InventoryRow>[]>(
    () => [
      {
        accessorKey: "family",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Model" />,
        cell: ({ row }) => (
          <span className="modelCell">
            <button
              aria-label={`${alertIds[row.original.id] ? "Disable" : "Enable"} stock alert for ${row.original.label}`}
              className={alertIds[row.original.id] ? "alarmButton active" : "alarmButton"}
              title={`${alertIds[row.original.id] ? "Disable" : "Enable"} stock alert`}
              type="button"
              onClick={() => void toggleModelAlert(row.original)}
            >
              {alertIds[row.original.id] ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
            </button>
            <a className="tableModel modelLink" href={row.original.buyUrl} rel="noreferrer" target="_blank">
              <span>{row.original.family}</span>
              {row.original.detail ? <span className="modelSubtitle">{row.original.detail}</span> : null}
            </a>
          </span>
        ),
      },
      {
        accessorKey: "partNumber",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Model #" />,
        cell: ({ row }) => <span className="partNumber">{row.original.partNumber}</span>,
      },
      {
        accessorKey: "chip",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Chip" />,
      },
      {
        accessorKey: "cores",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Cores" />,
        cell: ({ row }) => <span className="tableCores">{row.original.cores}</span>,
      },
      {
        accessorKey: "memory",
        header: ({ column }) => <DataTableColumnHeader column={column} title="RAM" />,
      },
      {
        accessorKey: "storage",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Storage" />,
      },
      {
        accessorKey: "finish",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Finish" />,
      },
      {
        accessorKey: "carrier",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Carrier" />,
      },
      {
        accessorKey: "availability",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Pickup" />,
        sortingFn: (a, b) => Number(b.original.available) - Number(a.original.available),
        cell: ({ row }) => (
          <span
            className={
              row.original.availability === "UNKNOWN"
                ? "tableStatus unknown"
                : row.original.availability === "NO PICKUP"
                  ? "tableStatus configured"
                : row.original.available
                  ? "tableStatus available"
                  : "tableStatus soldOut"
            }
          >
            {row.original.availability}
          </span>
        ),
      },
      {
        accessorKey: "lastStockedAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Last stocked" />,
        sortingFn: (a, b) => Date.parse(a.original.lastStockedAt ?? "1970-01-01") - Date.parse(b.original.lastStockedAt ?? "1970-01-01"),
        cell: ({ row }) => <LastStocked at={row.original.lastStockedAt} tracked={row.original.checkable} />,
      },
      {
        id: "locations",
        header: "Stores",
        enableSorting: false,
        cell: ({ row }) => {
          const storeCount = row.original.stores.length;
          const label = storeCount
            ? `${expandedRows[row.original.id] ? "Hide" : "Show"} ${Math.min(storeCount, 5)}`
              : row.original.availability === "UNKNOWN"
                ? "Unavailable"
              : row.original.checkable
                ? "No stores"
                : "No pickup";

          return (
            <button
              className="locationButton"
              type="button"
              disabled={!storeCount}
              onClick={() => toggleLocations(row.original.id)}
            >
              {label}
            </button>
          );
        },
      },
    ],
    [alertIds, expandedRows, toggleLocations, toggleModelAlert],
  );
  const table = useReactTable({
    data: inventoryRows,
    columns,
    state: { sorting, pagination, columnVisibility },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
  });

  const renderLocationRow = useCallback(
    (row: Row<InventoryRow>) =>
      expandedRows[row.original.id] ? (
        <tr className="locationRow" key={`${row.id}-locations`}>
          <td colSpan={row.getVisibleCells().length}>
            <div className="locationList">
              {row.original.stores.map((store) => (
                <div className="locationItem" key={`${row.original.id}-${store.storeName}`}>
                  <div>
                    <strong>{store.storeName}</strong>
                    <span>
                      {store.city}, {store.state} {store.distance ? `- ${store.distance}` : ""}
                    </span>
                    {store.address ? <span>{store.address}</span> : null}
                  </div>
                  <span className={store.availableToday ? "storeQuote availableQuote" : "storeQuote"}>{store.quote}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      ) : null,
    [expandedRows],
  );

  return (
    <main>
      <section className="hero">
        <nav>
          <a className="brand" href="/">
            <img alt="Macs In Stock" src="/macs-in-stock-logo.png" />
          </a>
          <div className="navLinks">
            <a className="navLink" href="/refurbished">Refurbished</a>
            <span className="viewerBadge" title="Live viewers on this server">
              <span aria-hidden="true" />
              {viewerCount ?? "-"} live
            </span>
            <a
              aria-label="Open spazman2c/MacsInStock on GitHub"
              className="githubBadge"
              href="https://github.com/spazman2c/MacsInStock"
              rel="noreferrer"
              target="_blank"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56v-2.14c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.16 1.18A10.96 10.96 0 0 1 12 6.09c.98 0 1.96.13 2.88.39 2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.42.36.78 1.06.78 2.15v3.13c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              <span>GitHub</span>
            </a>
          </div>
        </nav>

        <div className="heroGrid">
          <div>
            <p className="eyebrow">Apple Store availability</p>
            <h1>Your next Mac or iPhone.<br />Ready for pickup.</h1>
            <p className="lede">
              Find the right configuration at an Apple Store near you. Live pickup checks for Macs and iPhone Duo.
            </p>
          </div>

          <form className="searchPanel" onSubmit={onSubmit}>
            <label htmlFor="zip">ZIP code</label>
            <div className="searchRow">
              <input
                id="zip"
                inputMode="text"
                maxLength={10}
                name="zip"
                pattern="[0-9]{5}([\\-\\s]?[0-9]{4})?"
                placeholder="Enter ZIP code"
                value={zip}
                onChange={(event) => setZip(event.target.value.replace(/[^\d-\s]/g, "").slice(0, 10))}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? "Checking" : "Check stock"}
              </button>
            </div>
            <div className="saveRow">
              <button className="secondaryButton" type="button" disabled={!normalizedZip} onClick={saveCurrentZip}>
                Save ZIP
              </button>
              {savedZip ? (
                <button className="textButton" type="button" onClick={clearSavedZip}>
                  Clear saved
                </button>
              ) : null}
            </div>
            {error ? <p className="error">{error}</p> : null}
            {savedZip ? (
              <p className="refreshStatus">
                Saved {savedZip} · {loading ? "Refreshing…" : `Refreshes in ${nextRefreshIn}s`}
              </p>
            ) : (
              <p className="refreshStatus">Save your ZIP for automatic checks every minute.</p>
            )}
            <details className="searchHelp">
              <summary>Pickup &amp; stock alerts</summary>
            <p className={soundEnabled ? "soundStatus enabled" : "soundStatus"}>
              {soundEnabled
                ? `Alert sounds enabled for ${Object.values(alertIds).filter(Boolean).length} model alerts.`
                : "Click a bell beside a model to enable sound alerts while this page is open."}
            </p>
            <p className="hint">Available means Apple Store pickup only. Configured models link to the exact Apple build but are not counted as pickup stock without a pickup SKU.</p>
            </details>
          </form>
        </div>
      </section>

      <section className="content">
        <div className="summary">
          <div>
            <span className="metric">{data ? data.models.length : "-"}</span>
            <span className="metricLabel">variants tracked</span>
          </div>
          <div>
            <span className="metric">{data ? availableTodayCount : "-"}</span>
            <span className="metricLabel">pickup available now</span>
          </div>
          <div>
            <span className="metric">{data ? storeCount : "-"}</span>
            <span className="metricLabel">stores checked</span>
          </div>
          <div>
            <span className="metric small">{data ? new Date(data.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "-"}</span>
            <span className="metricLabel">last refreshed</span>
          </div>
        </div>

        <div className="finderControls">
          <div className="filterHeading">
            <div><h2>Find your configuration</h2><p>Choose a model. Fine-tune the details.</p></div>
            <label className="specSearch" htmlFor="spec-search">
              Search specs
              <input
                id="spec-search"
                placeholder="Try 64GB, 2TB, M5 Max, Night Sky, Verizon"
                value={specFilters.query}
                onChange={(event) => setSpecFilters((filters) => ({ ...filters, query: event.target.value }))}
              />
            </label>
          </div>
          <div className="filterGrid">
            <Select
              label="Model"
              value={specFilters.family}
              options={["All", ...optionSet.families]}
              onChange={(family) =>
                setSpecFilters({ ...defaultSpecFilters, family })
              }
            />
            <Select
              label="Chip"
              value={specFilters.chip}
              options={["All", ...optionSet.chips]}
              disabled={!selectedFamily}
              onChange={(chip) => setSpecFilters((filters) => ({ ...filters, chip }))}
            />
            <Select
              label="CPU / GPU"
              value={specFilters.cpuGpu}
              options={["All", ...optionSet.cpuGpu]}
              disabled={!selectedFamily || !optionSet.cpuGpu.length}
              onChange={(cpuGpu) => setSpecFilters((filters) => ({ ...filters, cpuGpu }))}
            />
            <Select
              label="Memory"
              value={specFilters.memory}
              options={["All", ...optionSet.memory]}
              disabled={!selectedFamily || !optionSet.memory.length}
              onChange={(memory) => setSpecFilters((filters) => ({ ...filters, memory }))}
            />
            <Select
              label="Storage"
              value={specFilters.storage}
              options={["All", ...optionSet.storage]}
              disabled={!selectedFamily}
              onChange={(storage) => setSpecFilters((filters) => ({ ...filters, storage }))}
            />
            {optionSet.finishes.length ? (
              <Select
                label="Finish"
                value={specFilters.finish}
                options={["All", ...optionSet.finishes]}
                onChange={(finish) => setSpecFilters((filters) => ({ ...filters, finish }))}
              />
            ) : null}
            {optionSet.carriers.length ? (
              <Select
                label="Carrier"
                value={specFilters.carrier}
                options={["All", ...optionSet.carriers]}
                onChange={(carrier) => setSpecFilters((filters) => ({ ...filters, carrier }))}
              />
            ) : null}
            {optionSet.sizes.length ? (
              <Select
                label="Size"
                value={specFilters.size}
                options={["All", ...optionSet.sizes]}
                disabled={!selectedFamily}
                onChange={(size) => setSpecFilters((filters) => ({ ...filters, size }))}
              />
            ) : null}
            {optionSet.displays.length ? (
              <Select
                label="Display"
                value={specFilters.display}
                options={["All", ...optionSet.displays]}
                disabled={!selectedFamily}
                onChange={(display) => setSpecFilters((filters) => ({ ...filters, display }))}
              />
            ) : null}
          </div>


        </div>

        <p className="hint">Last stocked is the last time this browser observed pickup stock near the selected ZIP, saved on this device. It is not Apple’s restock date. History starts with your checks.</p>
        {!data ? (
          <div className="empty">
            <h2>Start with a ZIP code.</h2>
            <p>The tracker will list each current Apple variant and its local pickup status.</p>
          </div>
        ) : (
          <>
          {inventoryRows.some((row) => row.family === "iPhone Duo") ? (
            <p className="inventoryNote">iPhone pickup quotes reflect device stock. Confirm carrier activation options on Apple’s site.</p>
          ) : null}
          {data.availabilityError ? (
            <div className="fallbackNotice">
              Apple did not return pickup stores near {data.zip}: {data.availabilityError}
            </div>
          ) : null}
          {inventoryRows.length === 0 ? (
            <div className="empty">
              <h2>No exact matching models.</h2>
              <p>Try removing one spec filter or search term.</p>
            </div>
          ) : (
            <DataTable label="Pickup inventory" table={table} renderSubRow={renderLocationRow} />
          )}
          </>
        )}

        <div className="refurbishedCta">
          <div>
            <h2>Are you looking for refurbished?</h2>
            <p>Track Apple certified refurbished Mac inventory with filters for model, size, release year, finish, memory, and capacity.</p>
          </div>
          <a className="buyLink" href="/refurbished">
            Browse refurbished
          </a>
        </div>
      </section>
    </main>
  );
}

function Select({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="selectLabel">
      {label}
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
