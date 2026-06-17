import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  LayoutGrid,
  List as ListIcon,
  Search,
  Table2,
} from "lucide-react";

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type ListQuery,
  type Paginated,
} from "~/lib/data-table";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

export type ViewMode = "table" | "list" | "grid";

export interface FilterDef {
  /** Column/field id sent to the API. */
  id: string;
  label: string;
  options: { label: string; value: string }[];
}

export interface BaseTableProps<T> {
  /** Stable base key for the query cache, e.g. ["inquiries"]. */
  queryKey: unknown[];
  /** Fetches one page given the current query state. */
  queryFn: (query: ListQuery) => Promise<Paginated<T>>;
  /** Column defs (table mode). Set `enableSorting` per column. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  getRowId: (row: T) => string;

  searchable?: boolean;
  searchPlaceholder?: string;
  filters?: FilterDef[];

  pageSize?: number;
  pageSizeOptions?: number[];

  modes?: ViewMode[];
  defaultMode?: ViewMode;
  renderGridItem?: (row: T) => React.ReactNode;
  renderListItem?: (row: T) => React.ReactNode;

  emptyMessage?: string;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const MODE_ICON: Record<ViewMode, React.ComponentType<{ className?: string }>> = {
  table: Table2,
  list: ListIcon,
  grid: LayoutGrid,
};

export function BaseTable<T>({
  queryKey,
  queryFn,
  columns,
  getRowId,
  searchable = true,
  searchPlaceholder = "Search…",
  filters = [],
  pageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  modes = ["table", "list", "grid"],
  defaultMode,
  renderGridItem,
  renderListItem,
  emptyMessage = "No results.",
}: BaseTableProps<T>) {
  const [mode, setMode] = React.useState<ViewMode>(defaultMode ?? modes[0]);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [searchInput, setSearchInput] = React.useState("");
  const [activeFilters, setActiveFilters] = React.useState<
    Record<string, string>
  >({});
  const search = useDebounced(searchInput);

  // Any change to search/filters should send us back to the first page.
  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [search, activeFilters]);

  const listQuery: ListQuery = {
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    search: search || undefined,
    sort: sorting[0]
      ? { field: sorting[0].id, dir: sorting[0].desc ? "desc" : "asc" }
      : null,
    filters: activeFilters,
  };

  const query = useQuery({
    queryKey: [...queryKey, listQuery],
    queryFn: () => queryFn(listQuery),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.data ?? [];

  const table = useReactTable({
    data: rows,
    columns,
    getRowId,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: query.data?.pageCount ?? -1,
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
  });

  const total = query.data?.total ?? 0;
  const start = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const end = Math.min(start + pagination.pageSize - 1, total);
  const showLoading = query.isPending;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-8"
              />
            </div>
          )}
          {filters.map((f) => (
            <Select
              key={f.id}
              value={activeFilters[f.id] ?? "all"}
              onValueChange={(value) =>
                setActiveFilters((prev) => {
                  const next = { ...prev };
                  if (value === "all") delete next[f.id];
                  else next[f.id] = value;
                  return next;
                })
              }
            >
              <SelectTrigger className="w-auto min-w-32" size="sm">
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {f.label.toLowerCase()}</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>

        {modes.length > 1 && (
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {modes.map((m) => {
              const Icon = MODE_ICON[m];
              return (
                <Button
                  key={m}
                  type="button"
                  variant={mode === m ? "secondary" : "ghost"}
                  size="icon"
                  className="size-7"
                  aria-pressed={mode === m}
                  aria-label={`${m} view`}
                  onClick={() => setMode(m)}
                >
                  <Icon className="size-4" />
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Body */}
      <div className={cn(query.isFetching && "opacity-70 transition-opacity")}>
        {mode === "table" && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => {
                      const canSort = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:text-foreground"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {sorted === "asc" ? (
                                <ArrowUp className="size-3.5" />
                              ) : sorted === "desc" ? (
                                <ArrowDown className="size-3.5" />
                              ) : (
                                <ChevronsUpDown className="size-3.5 text-muted-foreground" />
                              )}
                            </button>
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {showLoading ? (
                  <SkeletonRows
                    rows={pagination.pageSize}
                    cols={table.getAllLeafColumns().length}
                  />
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={table.getAllLeafColumns().length}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {mode === "grid" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {showLoading ? (
              Array.from({ length: pagination.pageSize }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-lg" />
              ))
            ) : rows.length === 0 ? (
              <p className="col-span-full py-12 text-center text-muted-foreground">
                {emptyMessage}
              </p>
            ) : (
              rows.map((row) => (
                <React.Fragment key={getRowId(row)}>
                  {renderGridItem?.(row)}
                </React.Fragment>
              ))
            )}
          </div>
        )}

        {mode === "list" && (
          <div className="flex flex-col divide-y rounded-md border">
            {showLoading ? (
              Array.from({ length: pagination.pageSize }).map((_, i) => (
                <div key={i} className="p-3">
                  <Skeleton className="h-10 w-full" />
                </div>
              ))
            ) : rows.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">
                {emptyMessage}
              </p>
            ) : (
              rows.map((row) => (
                <React.Fragment key={getRowId(row)}>
                  {renderListItem?.(row)}
                </React.Fragment>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer / pagination */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {total > 0 ? `Showing ${start}–${end} of ${total}` : "No results"}
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-18">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm text-muted-foreground">
            Page {pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
