"use client";

import { Fragment, type ReactNode } from "react";
import { flexRender, type Row, type Table } from "@tanstack/react-table";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";

export function DataTable<TData>({
  table,
  label,
  className,
  toolbar,
  renderSubRow,
}: {
  table: Table<TData>;
  label: string;
  className?: string;
  toolbar?: ReactNode;
  renderSubRow?: (row: Row<TData>) => ReactNode;
}) {
  return (
    <section className="diceDataTable" aria-label={label}>
      <DataTableToolbar table={table} label={label}>
        {toolbar}
      </DataTableToolbar>
      <div className="dataTableShell diceTableShell">
        <table className={["dataTable", className].filter(Boolean).join(" ")}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr data-selected={row.getIsSelected() || undefined}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                  {renderSubRow?.(row)}
                </Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={table.getAllLeafColumns().length}>
                  <div className="diceEmptyRow">No results.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DataTablePagination table={table} />
    </section>
  );
}
