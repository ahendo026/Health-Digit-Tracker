import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

export const DEFAULT_TIMEZONE = "America/New_York";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const TRAILING_OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})\s*$/i;

/**
 * Interpret a model-emitted wall-clock ISO string as local time in `timeZone`
 * and return the corresponding UTC instant. Any offset/Z suffix is stripped
 * first — screenshots show wall-clock time with no zone information, so a
 * model-appended offset is noise.
 */
export function wallClockToInstant(
  value: string | null | undefined,
  timeZone: string
): Date | null {
  if (!value) return null;
  const naive = value.trim().replace(TRAILING_OFFSET_RE, "");
  const d = fromZonedTime(naive, timeZone);
  return isNaN(d.getTime()) ? null : d;
}

/** Local "now" and "today" strings for the analysis prompt context block. */
export function zonedNowStrings(timeZone: string, now = new Date()) {
  return {
    nowLocal: formatInTimeZone(now, timeZone, "yyyy-MM-dd'T'HH:mm:ss"),
    todayDate: formatInTimeZone(now, timeZone, "yyyy-MM-dd"),
  };
}
