"use client";

import type { ReactNode } from "react";
import type { Table } from "@tanstack/react-table";
import { DataTableViewOptions } from "./data-table-view-options";

export function DataTableToolbar<TData>({
  table,
  children,
  label,
}: {
  table: Table<TData>;
  children?: ReactNode;
  label?: string;
}) {
  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = table.getCoreRowModel().rows.length;
  const sortedColumns = table.getState().sorting.length;

  return (
    <div className="diceToolbar">
      <div className="diceToolbarMeta">
        <strong>{label ?? "Data table"}</strong>
        <span>
          {filteredCount} of {totalCount} rows
          {sortedColumns ? ` · ${sortedColumns} sorted` : ""}
        </span>
      </div>
      <div className="diceToolbarActions">
        {children}
        {sortedColumns ? (
          <button type="button" className="textButton" onClick={() => table.resetSorting()}>
            Reset sort
          </button>
        ) : null}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
