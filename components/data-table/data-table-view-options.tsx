"use client";

import type { Table } from "@tanstack/react-table";

function titleFromColumn(id: string) {
  return id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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
            <span>{titleFromColumn(column.id)}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
