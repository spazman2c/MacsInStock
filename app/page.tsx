"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

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
  family: "MacBook Pro" | "Mac Studio" | "Mac mini";
  id: string;
  partNumber?: string;
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
  };
  searchableText: string;
  checkable: boolean;
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
  };
  models: Model[];
  error?: string;
};

type InventoryRow = {
  id: string;
  family: Model["family"];
  specs: string;
  location: string;
  quote: string;
  availability: "AVAILABLE" | "SOLD OUT";
  available: boolean;
  buyUrl: string;
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
  query: "",
};

const SAVED_ZIP_KEY = "macs-in-stock:saved-zip";
const REFRESH_SECONDS = 60;

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
  const [savedZip, setSavedZip] = useState("");
  const [nextRefreshIn, setNextRefreshIn] = useState(REFRESH_SECONDS);
  const savedZipRef = useRef("");
  const loadingRef = useRef(false);
  const normalizedZip = normalizeZip(zip);

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
      setData(payload);
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
    savedZipRef.current = savedZip;
  }, [savedZip]);

  useEffect(() => {
    const storedZip = normalizeZip(window.localStorage.getItem(SAVED_ZIP_KEY) ?? "");
    if (!storedZip) return;

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
    void runSearch(zip);
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
    families: optionSource?.families ?? ["MacBook Pro", "Mac Studio", "Mac mini"],
    chips: selectedFamily ? (optionSource?.chips[selectedFamily] ?? []) : [],
    cpuGpu: selectedFamily ? (optionSource?.cpuGpu[selectedFamily] ?? []) : [],
    sizes: selectedFamily ? (optionSource?.sizes[selectedFamily] ?? []) : [],
    finishes: selectedFamily ? (optionSource?.finishes[selectedFamily] ?? []) : [],
    displays: selectedFamily ? (optionSource?.displays[selectedFamily] ?? []) : [],
    memory: selectedFamily ? (optionSource?.memory[selectedFamily] ?? []) : [],
    storage: selectedFamily ? (optionSource?.storage[selectedFamily] ?? []) : [],
  };

  const { filteredModels, fallbackActive } = useMemo(() => {
    const models = data?.models ?? [];
    const query = specFilters.query.trim().toLowerCase();

    const exact = models.filter((model) => {
      if (specFilters.family !== "All" && model.family !== specFilters.family) return false;
      if (specFilters.chip !== "All" && model.filters.chip !== specFilters.chip) return false;
      if (specFilters.cpuGpu !== "All" && model.filters.cpuGpu !== specFilters.cpuGpu) return false;
      if (specFilters.size !== "All" && model.filters.size !== specFilters.size) return false;
      if (specFilters.finish !== "All" && model.filters.finish !== specFilters.finish) return false;
      if (specFilters.display !== "All" && model.filters.display !== specFilters.display) return false;
      if (specFilters.memory !== "All" && !model.searchableText.includes(specFilters.memory.toLowerCase())) return false;
      if (specFilters.storage !== "All" && !model.searchableText.includes(specFilters.storage.toLowerCase())) return false;
      if (query && !model.searchableText.includes(query)) return false;
      return true;
    });

    const hasSoftSpec = specFilters.memory !== "All" || specFilters.storage !== "All" || Boolean(query);
    if (exact.length || !hasSoftSpec) return { filteredModels: exact, fallbackActive: false };

    const similar = models.filter((model) => {
      if (specFilters.family !== "All" && model.family !== specFilters.family) return false;
      if (specFilters.chip !== "All" && model.filters.chip !== specFilters.chip) return false;
      if (specFilters.cpuGpu !== "All" && model.filters.cpuGpu !== specFilters.cpuGpu) return false;
      if (specFilters.size !== "All" && model.filters.size !== specFilters.size) return false;
      if (specFilters.finish !== "All" && model.filters.finish !== specFilters.finish) return false;
      if (specFilters.display !== "All" && model.filters.display !== specFilters.display) return false;
      return true;
    });

    return { filteredModels: similar, fallbackActive: similar.length > 0 };
  }, [data?.models, specFilters]);

  const availableTodayCount = data?.models.filter((model) => model.stores.some((store) => store.availableToday)).length ?? 0;
  const storeCount = new Set(data?.models.flatMap((model) => model.stores.map((store) => store.storeName)) ?? []).size;
  const inventoryRows = useMemo<InventoryRow[]>(
    () =>
      filteredModels.map((model) => {
        const todayStores = model.stores.filter((store) => store.availableToday);
        const nearestStore = todayStores[0] ?? model.stores[0];
        const available = todayStores.length > 0;

        return {
          id: model.id,
          family: model.family,
          specs: model.specs.join(" / "),
          location: nearestStore
            ? `${nearestStore.storeName}, ${nearestStore.city}, ${nearestStore.state}`
            : model.checkable
              ? "No same-day pickup near this ZIP"
              : "Configurable variant",
          quote: nearestStore?.quote ?? (model.checkable ? "No local pickup" : "No direct pickup SKU"),
          availability: available ? "AVAILABLE" : "SOLD OUT",
          available,
          buyUrl: model.buyUrl,
        };
      }),
    [filteredModels],
  );
  const columns = useMemo<ColumnDef<InventoryRow>[]>(
    () => [
      {
        accessorKey: "family",
        header: "Model",
        cell: ({ row }) => <span className="tableModel">{row.original.family}</span>,
      },
      {
        accessorKey: "specs",
        header: "Specs",
        cell: ({ row }) => <span className="tableSpecs">{row.original.specs}</span>,
      },
      {
        accessorKey: "location",
        header: "Location",
      },
      {
        accessorKey: "quote",
        header: "Pickup",
      },
      {
        accessorKey: "availability",
        header: "Availability",
        sortingFn: (a, b) => Number(b.original.available) - Number(a.original.available),
        cell: ({ row }) => (
          <span className={row.original.available ? "tableStatus available" : "tableStatus soldOut"}>
            {row.original.availability}
          </span>
        ),
      },
    ],
    [],
  );
  const table = useReactTable({
    data: inventoryRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <main>
      <section className="hero">
        <nav>
          <a className="brand" href="/">
            Macs In Stock
          </a>
          <span>Live Apple pickup lookup</span>
        </nav>

        <div className="heroGrid">
          <div>
            <p className="eyebrow">MacBook Pro, Mac Studio, and Mac mini</p>
            <h1>Find the Mac you can pick up near you.</h1>
            <p className="lede">
              Enter a ZIP code to check current Apple Store pickup quotes for standard Mac configurations, then filter
              by model and specs.
            </p>
          </div>

          <form className="searchPanel" onSubmit={onSubmit}>
            <label htmlFor="zip">ZIP code</label>
            <div className="searchRow">
              <input
                id="zip"
                inputMode="text"
                maxLength={10}
                pattern="[0-9]{5}([\\-\\s]?[0-9]{4})?"
                placeholder="10001 or 10001-1234"
                value={zip}
                onChange={(event) => setZip(event.target.value.replace(/[^\d-\s]/g, "").slice(0, 10))}
                required
              />
              <button type="submit" disabled={loading || !normalizedZip}>
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
                Saved ZIP {savedZip}. Auto-refreshing stock every {REFRESH_SECONDS} seconds
                {loading ? "." : `; next refresh in ${nextRefreshIn}s.`}
              </p>
            ) : (
              <p className="refreshStatus">Save a ZIP to refresh stock automatically every {REFRESH_SECONDS} seconds.</p>
            )}
            <p className="hint">Exact pickup checks use Apple retail part numbers. Custom specs fall back to similar standard models.</p>
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
            <span className="metricLabel">available now</span>
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
              disabled={!selectedFamily}
              onChange={(cpuGpu) => setSpecFilters((filters) => ({ ...filters, cpuGpu }))}
            />
            <Select
              label="Memory"
              value={specFilters.memory}
              options={["All", ...optionSet.memory]}
              disabled={!selectedFamily}
              onChange={(memory) => setSpecFilters((filters) => ({ ...filters, memory }))}
            />
            <Select
              label="Storage"
              value={specFilters.storage}
              options={["All", ...optionSet.storage]}
              disabled={!selectedFamily}
              onChange={(storage) => setSpecFilters((filters) => ({ ...filters, storage }))}
            />
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

          <label className="specSearch" htmlFor="spec-search">
            Search specs
            <input
              id="spec-search"
              placeholder="Try 64GB, 2TB, silver, M5 Max"
              value={specFilters.query}
              onChange={(event) => setSpecFilters((filters) => ({ ...filters, query: event.target.value }))}
            />
          </label>
        </div>

        {!data ? (
          <div className="empty">
            <h2>Start with a ZIP code.</h2>
            <p>The tracker will list each current Apple variant and its local pickup status.</p>
          </div>
        ) : (
          <>
          {data.availabilityError ? (
            <div className="fallbackNotice">
              Apple did not return pickup stores near {data.zip}: {data.availabilityError}
            </div>
          ) : null}
          {fallbackActive ? (
            <div className="fallbackNotice">
              No exact Apple-exposed variant matched every typed/custom spec. Showing closest variants for the selected
              model/chip, with live stock status where Apple provides a pickup SKU.
            </div>
          ) : null}
          {inventoryRows.length === 0 ? (
            <div className="empty">
              <h2>No matching pickup results.</h2>
              <p>Try removing one spec filter or search term.</p>
            </div>
          ) : (
            <DataTable table={table} />
          )}
          </>
        )}
      </section>
    </main>
  );
}

function DataTable({ table }: { table: ReturnType<typeof useReactTable<InventoryRow>> }) {
  return (
    <div className="dataTableShell">
      <table className="dataTable">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder ? null : (
                    <button
                      className="tableHeaderButton"
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span>
                        {header.column.getIsSorted() === "asc"
                          ? "ASC"
                          : header.column.getIsSorted() === "desc"
                            ? "DESC"
                            : ""}
                      </span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
