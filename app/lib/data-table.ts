/**
 * Shared contracts for list endpoints + the BaseTable component.
 *
 * Pagination model: offset/page-based. The response carries `total` + `pageCount`
 * so the UI can render page numbers and "showing X–Y of Z". `cursor` is reserved
 * for a future keyset mode on very large feeds — unused today.
 */

export type SortDir = "asc" | "desc";

export interface SortState {
  field: string;
  dir: SortDir;
}

/** Query params a list endpoint accepts (sent by BaseTable). */
export interface ListQuery {
  page: number; // 1-based
  pageSize: number;
  search?: string;
  sort?: SortState | null;
  /** field -> selected value (exact match). Empty/absent = no filter. */
  filters?: Record<string, string>;
}

/** Standard list response shape every endpoint returns. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** Reserved for future keyset pagination; null for offset mode. */
  cursor?: string | null;
}

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export const MAX_PAGE_SIZE = 100;

/** Serialize a ListQuery into URL search params (client → API). */
export function listQueryToSearchParams(q: ListQuery): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("page", String(q.page));
  sp.set("pageSize", String(q.pageSize));
  if (q.search) sp.set("search", q.search);
  if (q.sort) {
    sp.set("sort", q.sort.field);
    sp.set("dir", q.sort.dir);
  }
  if (q.filters) {
    for (const [key, value] of Object.entries(q.filters)) {
      if (value) sp.set(`filter.${key}`, value);
    }
  }
  return sp;
}

/** Parse URL search params back into a ListQuery (API side), with clamping. */
export function parseListQuery(sp: URLSearchParams): ListQuery {
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(sp.get("pageSize")) || DEFAULT_PAGE_SIZE),
  );
  const search = sp.get("search") || undefined;
  const sortField = sp.get("sort");
  const sort: SortState | null = sortField
    ? { field: sortField, dir: sp.get("dir") === "desc" ? "desc" : "asc" }
    : null;

  const filters: Record<string, string> = {};
  for (const [key, value] of sp.entries()) {
    if (key.startsWith("filter.") && value) {
      filters[key.slice("filter.".length)] = value;
    }
  }

  return { page, pageSize, search, sort, filters };
}

/** Build a Paginated envelope from a slice + total. */
export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): Paginated<T> {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return {
    data,
    page,
    pageSize,
    total,
    pageCount,
    hasPrev: page > 1,
    hasNext: page < pageCount,
    cursor: null,
  };
}

/**
 * In-memory search / filter / sort / paginate. Used by demos and tests, and as
 * the reference for what the D1 server helper produces.
 */
export function clientPaginate<T extends Record<string, unknown>>(
  rows: T[],
  q: ListQuery,
  opts: { searchFields?: (keyof T)[] } = {},
): Paginated<T> {
  let out = [...rows];

  if (q.search && opts.searchFields?.length) {
    const term = q.search.toLowerCase();
    out = out.filter((r) =>
      opts.searchFields!.some((f) =>
        String(r[f] ?? "")
          .toLowerCase()
          .includes(term),
      ),
    );
  }

  if (q.filters) {
    for (const [key, value] of Object.entries(q.filters)) {
      if (!value) continue;
      out = out.filter((r) => String(r[key as keyof T] ?? "") === value);
    }
  }

  if (q.sort) {
    const { field, dir } = q.sort;
    out.sort((a, b) => {
      const av = a[field as keyof T];
      const bv = b[field as keyof T];
      if (av === bv) return 0;
      const cmp = av! > bv! ? 1 : -1;
      return dir === "desc" ? -cmp : cmp;
    });
  }

  const total = out.length;
  const start = (q.page - 1) * q.pageSize;
  const data = out.slice(start, start + q.pageSize);
  return paginate(data, total, q.page, q.pageSize);
}
