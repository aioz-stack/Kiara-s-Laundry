import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Query = Record<string, string | undefined>;

function hrefWith(path: string, query: Query, changes: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...changes })) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export type FilterSelect = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
};

export type SortChoice = {
  options: { value: string; label: string }[];
  /** Shown when the URL has no sort. */
  defaultValue: string;
};

/** A plain GET form: filters live in the URL and work without client code. */
export function FilterBar({
  path,
  query,
  searchPlaceholder,
  selects = [],
  dates = true,
  dateLabel = "Date",
  sort,
}: {
  path: string;
  query: Query;
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  dates?: boolean;
  dateLabel?: string;
  sort?: SortChoice;
}) {
  const currentSort = query.sort ?? sort?.defaultValue ?? "";
  // A column header may have set a sort the dropdown does not list; keep it.
  const sortFromHeader = sort && !sort.options.some((option) => option.value === currentSort);
  const hasFilters = Object.entries(query).some(
    ([key, value]) => value && !["sort", "direction", "page"].includes(key),
  );
  return (
    <form
      action={path}
      className="no-print mb-4 flex flex-wrap items-end gap-3"
      role="search"
      aria-label="Filter results"
    >
      {searchPlaceholder ? (
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="filter-q">Search</Label>
          <Input
            id="filter-q"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder={searchPlaceholder}
          />
        </div>
      ) : null}
      {selects.map((select) => (
        <div key={select.name} className="flex flex-col gap-1.5">
          <Label htmlFor={`filter-${select.name}`}>{select.label}</Label>
          <NativeSelect
            id={`filter-${select.name}`}
            name={select.name}
            defaultValue={query[select.name] ?? ""}
            className="w-auto min-w-36"
          >
            <option value="">All</option>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      ))}
      {dates ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-from">{dateLabel} from</Label>
            <Input
              id="filter-from"
              name="from"
              type="date"
              defaultValue={query.from}
              className="w-auto"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-to">{dateLabel} to</Label>
            <Input
              id="filter-to"
              name="to"
              type="date"
              defaultValue={query.to}
              className="w-auto"
            />
          </div>
        </>
      ) : null}
      {sort ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-sort">Sort by</Label>
          <NativeSelect
            id="filter-sort"
            name="sort"
            defaultValue={currentSort}
            className="w-auto min-w-36"
          >
            {sortFromHeader ? <option value={currentSort}>Column header</option> : null}
            {sort.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : query.sort ? (
        <input type="hidden" name="sort" value={query.sort} />
      ) : null}
      {/* Each dropdown sort has its own natural direction; only header sorts keep theirs. */}
      {query.direction && (!sort || sortFromHeader) ? (
        <input type="hidden" name="direction" value={query.direction} />
      ) : null}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
      {hasFilters ? (
        <Button asChild variant="ghost">
          <Link href={path}>Clear</Link>
        </Button>
      ) : null}
    </form>
  );
}

export function SortableHead({
  path,
  query,
  field,
  defaultDirection = "desc",
  className,
  children,
}: {
  path: string;
  query: Query;
  field: string;
  defaultDirection?: "asc" | "desc";
  className?: string;
  children: ReactNode;
}) {
  const active = query.sort === field;
  const next = active && query.direction === "asc" ? "desc" : active ? "asc" : defaultDirection;
  const Icon = query.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (query.direction === "asc" ? "ascending" : "descending") : undefined}
    >
      <Link
        href={hrefWith(path, query, { sort: field, direction: next, page: undefined })}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {children}
        {active ? <Icon className="size-3" aria-hidden /> : null}
      </Link>
    </TableHead>
  );
}

export function Pagination({
  path,
  query,
  page,
  pageSize,
  total,
}: {
  path: string;
  query: Query;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className="no-print flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground"
    >
      <span>
        {first}–{last} of {total}
      </span>
      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
            {page > 1 ? (
              <Link href={hrefWith(path, query, { page: String(page - 1) })}>
                <ChevronLeft aria-hidden /> Previous
              </Link>
            ) : (
              <>
                <ChevronLeft aria-hidden /> Previous
              </>
            )}
          </Button>
          <Button asChild={page < pages} variant="outline" size="sm" disabled={page >= pages}>
            {page < pages ? (
              <Link href={hrefWith(path, query, { page: String(page + 1) })}>
                Next <ChevronRight aria-hidden />
              </Link>
            ) : (
              <>
                Next <ChevronRight aria-hidden />
              </>
            )}
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
