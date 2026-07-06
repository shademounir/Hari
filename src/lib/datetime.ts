// Shared date/time helpers. `Intl.DateTimeFormat` construction is comparatively
// expensive (it resolves locale + timezone data each time), so we memoize the
// YYYY-MM-DD formatter per timezone rather than rebuilding it on every request
// and every getCurrentDateTime tool call.
const isoFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date in `timeZone`, formatted as YYYY-MM-DD (en-CA yields that). */
export function isoDateInTimeZone(date: Date, timeZone: string): string {
  let fmt = isoFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone });
    isoFormatters.set(timeZone, fmt);
  }
  return fmt.format(date);
}
