import { describe, expect, it } from "vitest";
import {
  bucketKeys,
  dateOnlyToYmd,
  defaultGranularity,
  isValidTimeZone,
  isValidYmd,
  localInputToUtc,
  periodRange,
  rangeToUtc,
  shiftYmd,
  startOfDayUtc,
  todayInZone,
  utcToLocalInput,
  ymdInZone,
  ymdToDateOnly,
} from "@/lib/dates";

const MANILA = "Asia/Manila";

describe("shop-day boundaries", () => {
  it("starts a Manila day at 16:00 UTC the previous calendar day", () => {
    expect(startOfDayUtc("2026-03-10", MANILA).toISOString()).toBe("2026-03-09T16:00:00.000Z");
  });

  it("makes a day range half-open", () => {
    const { start, endExclusive } = rangeToUtc({ from: "2026-03-10", to: "2026-03-10" }, MANILA);
    expect(start.toISOString()).toBe("2026-03-09T16:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-03-10T16:00:00.000Z");
  });

  it("puts 23:59 UTC in the next Manila day", () => {
    expect(ymdInZone(new Date("2026-03-09T23:59:00Z"), MANILA)).toBe("2026-03-10");
  });

  it("uses the shop calendar for today, not the server clock", () => {
    expect(todayInZone(MANILA, new Date("2026-03-09T16:00:00Z"))).toBe("2026-03-10");
    expect(todayInZone(MANILA, new Date("2026-03-09T15:59:59Z"))).toBe("2026-03-09");
  });

  it("handles a zone with daylight saving", () => {
    const { start, endExclusive } = rangeToUtc(
      { from: "2026-03-08", to: "2026-03-08" },
      "America/New_York",
    );
    expect(endExclusive.getTime() - start.getTime()).toBe(23 * 3_600_000);
  });
});

describe("datetime inputs", () => {
  it("reads wall-clock time in the shop zone", () => {
    expect(localInputToUtc("2026-03-10T00:00", MANILA).toISOString()).toBe(
      "2026-03-09T16:00:00.000Z",
    );
  });

  it("round-trips", () => {
    const instant = localInputToUtc("2026-03-10T14:30", MANILA);
    expect(utcToLocalInput(instant, MANILA)).toBe("2026-03-10T14:30");
  });

  it("rejects malformed values", () => {
    expect(() => localInputToUtc("2026-03-10", MANILA)).toThrow();
  });
});

describe("calendar dates", () => {
  it("round-trips a date-only value", () => {
    expect(dateOnlyToYmd(ymdToDateOnly("2026-03-10"))).toBe("2026-03-10");
  });

  it("validates real dates only", () => {
    expect(isValidYmd("2026-02-28")).toBe(true);
    expect(isValidYmd("2026-02-30")).toBe(false);
    expect(isValidYmd("not-a-date")).toBe(false);
  });

  it("validates time zones", () => {
    expect(isValidTimeZone(MANILA)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("shifts across a month end", () => {
    expect(shiftYmd("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("periods", () => {
  it("runs weeks Monday to Sunday", () => {
    expect(periodRange("weekly", "2026-03-11")).toEqual({ from: "2026-03-09", to: "2026-03-15" });
    expect(periodRange("weekly", "2026-03-15")).toEqual({ from: "2026-03-09", to: "2026-03-15" });
  });

  it("covers a whole month, including leap February", () => {
    expect(periodRange("monthly", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("covers a whole year", () => {
    expect(periodRange("yearly", "2026-06-15")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("chooses a bucket size from the range length", () => {
    expect(defaultGranularity({ from: "2026-03-01", to: "2026-03-31" })).toBe("day");
    expect(defaultGranularity({ from: "2026-01-01", to: "2026-05-31" })).toBe("week");
    expect(defaultGranularity({ from: "2026-01-01", to: "2026-12-31" })).toBe("month");
  });

  it("lists every bucket so empty days chart as zero", () => {
    expect(bucketKeys({ from: "2026-03-09", to: "2026-03-11" }, "day")).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
    ]);
    expect(bucketKeys({ from: "2026-03-11", to: "2026-03-17" }, "week")).toEqual([
      "2026-03-09",
      "2026-03-16",
    ]);
    expect(bucketKeys({ from: "2026-01-15", to: "2026-03-02" }, "month")).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });
});
