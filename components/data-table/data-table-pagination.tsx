"use client";

import type { Table } from "@tanstack/react-table";

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 25, 50, 100],
}: {
  table: Table<TData>;
  pageSizeOptions?: number[];
}) {
  const pagination = table.getState().pagination;
  const pageCount = table.getPageCount();

  if (!pageCount || pageCount <= 1) return null;

  return (
    <div className="dicePagination">
      <span>
        Page {pagination.pageIndex + 1} of {pageCount}
      </span>
      <label>
        Rows
        <select value={pagination.pageSize} onChange={(event) => table.setPageSize(Number(event.target.value))}>
          {pageSizeOptions.map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              {pageSize}
            </option>
          ))}
        </select>
      </label>
      <div className="dicePaginationButtons">
        <button type="button" className="secondaryButton" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
          First
        </button>
        <button type="button" className="secondaryButton" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Prev
        </button>
        <button type="button" className="secondaryButton" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </button>
        <button type="button" className="secondaryButton" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}>
          Last
        </button>
      </div>
    </div>
  );
}
