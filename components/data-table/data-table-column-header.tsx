"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Column } from "@tanstack/react-table";

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
}: {
  column: Column<TData, TValue>;
  title: string;
}) {
  const sorted = column.getIsSorted();

  if (!column.getCanSort()) {
    return <span>{title}</span>;
  }

  return (
    <button className="diceColumnHeader" aria-label={`Sort by ${title}${sorted ? `, currently ${sorted === "asc" ? "ascending" : "descending"}` : ""}`} aria-pressed={Boolean(sorted)} type="button" onClick={column.getToggleSortingHandler()}>
      <span>{title}</span>
      {sorted === "asc" ? <ArrowUp aria-hidden="true" className="diceSortIcon" /> : sorted === "desc" ? <ArrowDown aria-hidden="true" className="diceSortIcon" /> : <ArrowUpDown aria-hidden="true" className="diceSortIcon" />}
    </button>
  );
}
