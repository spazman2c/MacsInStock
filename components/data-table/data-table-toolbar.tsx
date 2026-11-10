"use client";

import type { ReactNode } from "react";
import type { Table } from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { columnLabel } from "./column-labels";
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
  const sort = table.getState().sorting[0];

  return (
    <div className="diceToolbar">
      <div className="diceToolbarMeta">
        <strong>{label ?? "Data table"}</strong>
        <span>
          {filteredCount.toLocaleString()} {filteredCount === 1 ? "configuration" : "configurations"}
          {filteredCount !== totalCount ? ` of ${totalCount.toLocaleString()}` : ""}
        </span>
      </div>
      <div className="diceToolbarActions">
        {children}
        <label className="mobileSorting">
          Sort by
          <select aria-label="Sort inventory by" value={sort?.id ?? ""} onChange={(event) => table.setSorting(event.target.value ? [{ id: event.target.value, desc: false }] : [])}>
            <option value="">Default</option>
            {table.getAllLeafColumns().filter((column) => column.getCanSort() && column.getIsVisible()).map((column) => <option key={column.id} value={column.id}>{columnLabel(column.id)}</option>)}
          </select>
          {sort ? <button type="button" className="secondaryButton" aria-label={`Sort ${sort.desc ? "ascending" : "descending"}`} onClick={() => table.setSorting([{ ...sort, desc: !sort.desc }])}>{sort.desc ? <ArrowDown size={14} /> : <ArrowUp size={14} />}</button> : null}
        </label>
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
