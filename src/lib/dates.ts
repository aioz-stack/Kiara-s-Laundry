/**
 * Calendar logic in the shop time zone. Safe to import from client and server.
 *
 * A "ymd" is a yyyy-MM-dd calendar day. Instants are stored in UTC; a report
 * range is the half-open interval [start of first day, start of day after last).
 */
import { TZDate } from "@date-fns/tz";
import {
  addDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";

export const DEFAULT_TIME_ZONE = "Asia/Manila";

const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export type DateRange = { from: string; to: string };
export type Granularity = "day" | "week" | "month";
export type PeriodPreset = "daily" | "weekly" | "monthly" | "yearly" | "custom";

function parseYmd(ymd: string): [number, number, number] {
  const match = YMD_PATTERN.exec(ymd);
  if (!match) throw new Error(`Invalid date: ${ymd}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** A plain Date for calendar arithmetic that never crosses a zone conversion. */
function calendarDate(ymd: string): Date {
  const [year, month, day] = parseYmd(ymd);
  return new Date(year, month - 1, day);
}

export function isValidYmd(ymd: string): boolean {
  const match = YMD_PATTERN.exec(ymd);
  if (!match) return false;
  return format(calendarDate(ymd), "yyyy-MM-dd") === ymd;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function formatInZone(date: Date, timeZone: string, pattern: string): string {
  return format(new TZDate(date, timeZone), pattern);
}

export function ymdInZone(date: Date, timeZone: string): string {
  return formatInZone(date, timeZone, "yyyy-MM-dd");
}

export function todayInZone(timeZone: string, now = new Date()): string {
  return ymdInZone(now, timeZone);
}

/** The UTC instant at which a calendar day starts in the given zone. */
export function startOfDayUtc(ymd: string, timeZone: string): Date {
  const [year, month, day] = parseYmd(ymd);
  return new Date(new TZDate(year, month - 1, day, timeZone).getTime());
}

export function rangeToUtc(range: DateRange, timeZone: string) {
  return {
    start: startOfDayUtc(range.from, timeZone),
    endExclusive: startOfDayUtc(shiftYmd(range.to, 1), timeZone),
  };
}

export function shiftYmd(ymd: string, days: number): string {
  return format(addDays(calendarDate(ymd), days), "yyyy-MM-dd");
}

/** Reads a `datetime-local` value as wall-clock time in the shop zone. */
export function localInputToUtc(value: string, timeZone: string): Date {
  const match = LOCAL_INPUT_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid date and time: ${value}`);
  const [, year, month, day, hour, minute] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return new Date(new TZDate(year, month - 1, day, hour, minute, timeZone).getTime());
}

export function utcToLocalInput(date: Date, timeZone: string): string {
  return formatInZone(date, timeZone, "yyyy-MM-dd'T'HH:mm");
}

/** Expense dates are SQL DATE columns: a calendar day held at UTC midnight. */
export function ymdToDateOnly(ymd: string): Date {
  const [year, month, day] = parseYmd(ymd);
  return new Date(Date.UTC(year, month - 1, day));
}

export function dateOnlyToYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The period containing the anchor day. Weeks run Monday to Sunday. */
export function periodRange(preset: Exclude<PeriodPreset, "custom">, anchor: string): DateRange {
  const date = calendarDate(anchor);
  const toYmd = (value: Date) => format(value, "yyyy-MM-dd");
  switch (preset) {
    case "daily":
      return { from: anchor, to: anchor };
    case "weekly":
      return {
        from: toYmd(startOfWeek(date, { weekStartsOn: 1 })),
        to: toYmd(endOfWeek(date, { weekStartsOn: 1 })),
      };
    case "monthly":
      return { from: toYmd(startOfMonth(date)), to: toYmd(endOfMonth(date)) };
    case "yearly":
      return { from: toYmd(startOfYear(date)), to: toYmd(endOfYear(date)) };
  }
}

/** Picks a chart bucket size that keeps a range readable. */
export function defaultGranularity(range: DateRange): Granularity {
  const days =
    (calendarDate(range.to).getTime() - calendarDate(range.from).getTime()) / 86_400_000 + 1;
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  return "month";
}

/** Every bucket start in the range, so days with no activity still chart as zero. */
export function bucketKeys(range: DateRange, granularity: Granularity): string[] {
  const interval = { start: calendarDate(range.from), end: calendarDate(range.to) };
  const dates =
    granularity === "day"
      ? eachDayOfInterval(interval)
      : granularity === "week"
        ? eachWeekOfInterval(interval, { weekStartsOn: 1 })
        : eachMonthOfInterval(interval);
  return dates.map((date) => format(date, "yyyy-MM-dd"));
}

export function bucketLabel(key: string, granularity: Granularity): string {
  const date = calendarDate(key);
  if (granularity === "month") return format(date, "MMM yyyy");
  return format(date, "MMM d");
}
