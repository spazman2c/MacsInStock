"use client";

import type { Table } from "@tanstack/react-table";

import { columnLabel } from "./column-labels";

export function DataTableViewOptions<TData>({ table }: { table: Table<TData> }) {
  const hideableColumns = table.getAllLeafColumns().filter((column) => column.getCanHide());

  if (!hideableColumns.length) return null;

  return (
    <details className="diceViewOptions">
      <summary>Columns</summary>
      <div className="diceViewOptionsMenu">
        {hideableColumns.map((column) => (
          <label key={column.id}>
            <input
              type="checkbox"
              checked={column.getIsVisible()}
              onChange={(event) => column.toggleVisibility(event.target.checked)}
            />
            <span>{columnLabel(column.id)}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
