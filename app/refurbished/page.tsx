"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColumnDef,
  PaginationState,
  SortingState,
  VisibilityState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";

type RefurbishedMac = {
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
  searchableText: string;
};

type RefurbishedResponse = {
  checkedAt: string;
  sourceUrl: string;
  products: RefurbishedMac[];
  filterOptions: {
    models: string[];
    sizes: string[];
    releaseYears: string[];
    finishes: string[];
    memory: string[];
    capacity: string[];
  };
  error?: string;
};

const defaultFilters = {
  model: "All",
  size: "All",
  releaseYear: "All",
  finish: "All",
  memory: "All",
  capacity: "All",
  query: "",
};

const REFRESH_SECONDS = 60;
type WebkitAudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function displayValue(value?: string) {
  return value || "-";
}

function formatCheckedAt(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function RefurbishedPage() {
  const [data, setData] = useState<RefurbishedResponse | null>(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextRefreshIn, setNextRefreshIn] = useState(REFRESH_SECONDS);
  const [alertIds, setAlertIds] = useState<Record<string, boolean>>({});
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "model", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const loadingRef = useRef(false);
  const alertIdsRef = useRef<Record<string, boolean>>({});
  const knownAvailableIdsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);

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

  const loadRefurbished = useCallback(async () => {
    loadingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/refurbished", { cache: "no-store" });
      const payload = (await response.json()) as RefurbishedResponse;

      if (!response.ok || payload.error) throw new Error(payload.error || "Apple refurbished lookup failed.");

      setData(payload);
      setNextRefreshIn(REFRESH_SECONDS);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Apple refurbished lookup failed.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRefurbished();
  }, [loadRefurbished]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNextRefreshIn((seconds) => {
        if (seconds > 1) return seconds - 1;
        if (!loadingRef.current) void loadRefurbished();
        return REFRESH_SECONDS;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [loadRefurbished]);

  useEffect(() => {
    alertIdsRef.current = alertIds;
  }, [alertIds]);

  useEffect(() => {
    const products = data?.products ?? [];
    const currentIds = new Set(products.map((product) => product.id));

    for (const product of products) {
      if (alertIdsRef.current[product.id] && !knownAvailableIdsRef.current.has(product.id)) {
        void playAlarm();
      }
    }

    knownAvailableIdsRef.current = currentIds;
  }, [data, playAlarm]);

  const products = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return (data?.products ?? []).filter((product) => {
      if (filters.model !== "All" && product.model !== filters.model) return false;
      if (filters.size !== "All" && product.size !== filters.size) return false;
      if (filters.releaseYear !== "All" && product.releaseYear !== filters.releaseYear) return false;
      if (filters.finish !== "All" && product.finish !== filters.finish) return false;
      if (filters.memory !== "All" && product.memory !== filters.memory) return false;
      if (filters.capacity !== "All" && product.capacity !== filters.capacity) return false;
      if (query && !product.searchableText.includes(query) && !product.title.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [data, filters]);

  const options = data?.filterOptions ?? {
    models: ["MacBook Air", "MacBook Pro", "iMac", "Mac mini", "Mac Studio", "Mac Pro", "Display"],
    sizes: [],
    releaseYears: [],
    finishes: [],
    memory: [],
    capacity: [],
  };

  const updateFilter = (key: keyof typeof defaultFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const toggleAlert = async (product: RefurbishedMac) => {
    setSoundEnabled(true);
    setAlertIds((current) => ({ ...current, [product.id]: !current[product.id] }));
    await playAlarm();
  };

  const columns = useMemo<ColumnDef<RefurbishedMac>[]>(
    () => [
      {
        accessorKey: "model",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Item" />,
        cell: ({ row }) => (
          <div className="modelCell">
            <button
              type="button"
              className={alertIds[row.original.id] ? "alarmButton active" : "alarmButton"}
              aria-label={`Sound alert for ${row.original.title}`}
              title="Sound alert"
              onClick={() => void toggleAlert(row.original)}
            />
            <a className="refurbProduct" href={row.original.url} target="_blank" rel="noreferrer">
              {row.original.image ? <img src={row.original.image} alt="" /> : <span />}
              <span>
                <strong>{row.original.model}</strong>
                <span>{row.original.chip || row.original.title}</span>
              </span>
            </a>
          </div>
        ),
      },
      {
        accessorKey: "id",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Model #" />,
        cell: ({ row }) => <span className="partNumber">{row.original.id}</span>,
      },
      {
        accessorKey: "size",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
        cell: ({ row }) => displayValue(row.original.size),
      },
      {
        accessorKey: "releaseYear",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Release" />,
        cell: ({ row }) => displayValue(row.original.releaseYear),
      },
      {
        accessorKey: "finish",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Finish" />,
        cell: ({ row }) => displayValue(row.original.finish),
      },
      {
        accessorKey: "memory",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Memory" />,
        cell: ({ row }) => displayValue(row.original.memory),
      },
      {
        accessorKey: "capacity",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Capacity" />,
        cell: ({ row }) => displayValue(row.original.capacity),
      },
      {
        accessorKey: "price",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
        cell: ({ row }) => displayValue(row.original.price),
      },
      {
        id: "status",
        header: "Status",
        cell: () => <span className="tableStatus available">Available to ship</span>,
        enableSorting: false,
      },
    ],
    [alertIds],
  );

  const table = useReactTable({
    data: products,
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

  return (
    <>
      <section className="refurbHero">
        <nav>
          <Link className="brand" href="/">
            <img src="/macs-in-stock-logo.png" alt="Macs in Stock" />
          </Link>
          <div className="navLinks">
            <a className="githubBadge" href="https://github.com/spazman2c/MacsInStock" target="_blank" rel="noreferrer">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
              GitHub
            </a>
            <Link className="buyLink secondaryButton" href="/">
              New Macs
            </Link>
          </div>
        </nav>

        <div className="heroGrid">
          <div>
            <p className="eyebrow">Apple refurbished</p>
            <h1>Track refurbished Mac inventory.</h1>
            <p className="lede">
              Browse current Apple certified refurbished Macs that are listed as available to ship, then filter by
              model, size, release year, finish, memory, and capacity.
            </p>
          </div>

          <div className="searchPanel">
            <span className="panelLabel">Available to ship</span>
            <button type="button" onClick={() => void loadRefurbished()} disabled={loading}>
              {loading ? "Refreshing" : "Refresh now"}
            </button>
            <p className="refreshStatus">
              Auto-refreshing every {REFRESH_SECONDS} seconds; next refresh in {nextRefreshIn}s.
            </p>
            <p className={soundEnabled ? "soundStatus enabled" : "soundStatus"}>
              Click a bell to enable a sound alert for a refurbished item while this page is open.
            </p>
            {error ? <p className="error">{error}</p> : null}
          </div>
        </div>
      </section>

      <main className="content">
        <section className="summary refurbishedSummary" aria-label="Refurbished summary">
          <div>
            <span className="metric">{data ? data.products.length : "-"}</span>
            <span className="metricLabel">available to ship</span>
          </div>
          <div>
            <span className="metric">{data ? products.length : "-"}</span>
            <span className="metricLabel">matching filters</span>
          </div>
          <div>
            <span className="metric">{options.models.length}</span>
            <span className="metricLabel">model groups tracked</span>
          </div>
          <div>
            <span className="metric small">{formatCheckedAt(data?.checkedAt)}</span>
            <span className="metricLabel">last refreshed</span>
          </div>
        </section>

        <section className="finderControls" aria-label="Refurbished filters">
          <div className="filterGrid refurbishedFilterGrid">
            <label className="selectLabel">
              Model
              <select value={filters.model} onChange={(event) => updateFilter("model", event.target.value)}>
                <option>All</option>
                {options.models.map((model) => (
                  <option key={model}>{model}</option>
                ))}
              </select>
            </label>
            <label className="selectLabel">
              Size
              <select value={filters.size} onChange={(event) => updateFilter("size", event.target.value)}>
                <option>All</option>
                {options.sizes.map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </label>
            <label className="selectLabel">
              Release year
              <select value={filters.releaseYear} onChange={(event) => updateFilter("releaseYear", event.target.value)}>
                <option>All</option>
                {options.releaseYears.map((year) => (
                  <option key={year}>{year}</option>
                ))}
              </select>
            </label>
            <label className="selectLabel">
              Finish
              <select value={filters.finish} onChange={(event) => updateFilter("finish", event.target.value)}>
                <option>All</option>
                {options.finishes.map((finish) => (
                  <option key={finish}>{finish}</option>
                ))}
              </select>
            </label>
            <label className="selectLabel">
              Memory
              <select value={filters.memory} onChange={(event) => updateFilter("memory", event.target.value)}>
                <option>All</option>
                {options.memory.map((memory) => (
                  <option key={memory}>{memory}</option>
                ))}
              </select>
            </label>
            <label className="selectLabel">
              Capacity
              <select value={filters.capacity} onChange={(event) => updateFilter("capacity", event.target.value)}>
                <option>All</option>
                {options.capacity.map((capacity) => (
                  <option key={capacity}>{capacity}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="specSearch">
            Search refurbished specs
            <input
              value={filters.query}
              onChange={(event) => updateFilter("query", event.target.value)}
              placeholder="Try M4, 24GB, silver, MacBook Air"
            />
          </label>
        </section>

        {!loading && !products.length ? (
          <section className="empty">
            <h2>No refurbished Macs found.</h2>
            <p>Try clearing a filter, or refresh again in a minute.</p>
          </section>
        ) : (
          <DataTable label="Refurbished inventory" table={table} className="refurbishedTable" />
        )}
      </main>
    </>
  );
}
