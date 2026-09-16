export const ALMATY_TZ = "Asia/Almaty";

const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: ALMATY_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: ALMATY_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dayMonthFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: ALMATY_TZ,
  day: "numeric",
  month: "long",
});

const timeFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: ALMATY_TZ,
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 31.12.2026 18:30 (Астана) */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d).replace(",", "") : "—";
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : "—";
}

export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? timeFmt.format(d) : "—";
}

export function formatDayMonth(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dayMonthFmt.format(d) : "—";
}

/** "через 2 дня" / "3 часа назад" */
export function formatRelative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), "day");
  return formatDate(d);
}

export function isOverdue(deadline: string | Date | null | undefined): boolean {
  const d = toDate(deadline);
  return !!d && d.getTime() < Date.now();
}

/** Parses a "YYYY-MM-DD" + "HH:mm" pair entered in Almaty local time into an ISO UTC string. */
export function almatyInputToIso(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  // Asia/Almaty has a fixed UTC+05:00 offset (no DST since 2005; unified in 2024).
  const utcMs = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, (hh ?? 0) - 5, mm ?? 0, 0, 0);
  return new Date(utcMs).toISOString();
}

/** Splits an ISO timestamp into Almaty-local date/time input values. */
export function isoToAlmatyInputs(iso: string | null | undefined): { date: string; time: string } {
  const d = toDate(iso);
  if (!d) return { date: "", time: "18:00" };
  const shifted = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
  };
}

/** Days until the next occurrence of a birthday (month/day), in Almaty terms. */
export function daysUntilBirthday(birthday: string): number {
  const [, month, day] = birthday.split("-").map(Number);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(now.getUTCFullYear(), (month ?? 1) - 1, day ?? 1);
  if (next < todayUtc) next = Date.UTC(now.getUTCFullYear() + 1, (month ?? 1) - 1, day ?? 1);
  return Math.round((next - todayUtc) / 86_400_000);
}
