/** Helpers for reading URL search params in Server Components. */

export type SearchParams = Record<string, string | string[] | undefined>;

export function firstParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single || undefined;
}

export function pageParam(params: SearchParams): number {
  const page = Number(firstParam(params, "page"));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function directionParam(params: SearchParams): "asc" | "desc" | undefined {
  const direction = firstParam(params, "direction");
  return direction === "asc" || direction === "desc" ? direction : undefined;
}

export function enumParam<T extends string>(
  params: SearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = firstParam(params, key);
  return allowed.includes(value as T) ? (value as T) : undefined;
}
