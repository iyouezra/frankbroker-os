export const ADDIS_TIME_ZONE = "Africa/Addis_Ababa";

function parts(value: Date) {
  const rows = new Intl.DateTimeFormat("en-CA", {
    timeZone: ADDIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: string) => rows.find((row) => row.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: Number(get("hour")) };
}

/** Calendar date at the broker's mandated operating timezone. */
export function addisBusinessDate(value = new Date()) {
  const { year, month, day } = parts(value);
  return `${year}-${month}-${day}`;
}

export function addisYear(value = new Date()) {
  return Number(parts(value).year);
}

/** PostgreSQL DATE-compatible value for an Addis Ababa calendar date. */
export function addisDateOnly(value = new Date()) {
  return new Date(`${addisBusinessDate(value)}T00:00:00.000Z`);
}

/** Start of the Addis Ababa calendar day as an absolute timestamp. */
export function addisDayStart(value = new Date()) {
  return new Date(`${addisBusinessDate(value)}T00:00:00+03:00`);
}

export function formatAddisDashboardDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ADDIS_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value).replace(",", " ·").toUpperCase();
}

export function formatAddisBusinessDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ADDIS_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value).toUpperCase();
}

export function addisGreeting(value = new Date()) {
  const hour = parts(value).hour;
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDateKey(dateKey: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${dateKey}T00:00:00.000Z`));
}
