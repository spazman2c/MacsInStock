"use client";

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
    <button className="diceColumnHeader" type="button" onClick={column.getToggleSortingHandler()}>
      <span>{title}</span>
      <span aria-hidden="true" className="diceSortIcon">
        {sorted === "asc" ? "ASC" : sorted === "desc" ? "DESC" : "SORT"}
      </span>
    </button>
  );
}
