const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Formats fils as "1,234.56". Whole amounts drop the decimals: "1,234". */
export function formatAmount(fils: number, opts?: { decimals?: boolean }): string {
  const abs = Math.abs(Math.round(fils));
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const showDecimals = opts?.decimals ?? cents !== 0;
  const sign = fils < 0 ? '-' : '';
  const base = `${sign}${groupThousands(whole)}`;
  return showDecimals ? `${base}.${String(cents).padStart(2, '0')}` : base;
}

/** "AED 1,234.56" */
export function formatAED(fils: number, opts?: { decimals?: boolean }): string {
  return `AED ${formatAmount(fils, opts)}`;
}

/** Compact form for chart labels: "1.2k", "18k". */
export function formatCompactAED(fils: number): string {
  const aed = Math.abs(fils) / 100;
  if (aed >= 1000) {
    const k = aed / 1000;
    return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return String(Math.round(aed));
}

export function parseAmountToFils(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "2026-07" key for a date or ISO string. */
export function monthKey(date: string | Date): string {
  const iso = typeof date === 'string' ? date : toISODate(date);
  return iso.slice(0, 7);
}

export function monthLabel(key: string, short = false): string {
  const [y, m] = key.split('-').map(Number);
  const name = (short ? MONTHS_SHORT : MONTHS)[(m ?? 1) - 1];
  return `${name} ${y}`;
}

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** "Today", "Yesterday", or "Friday, 18 Jul". */
export function friendlyDate(iso: string, todayISO: string): string {
  if (iso === todayISO) return 'Today';
  const d = new Date(`${iso}T12:00:00`);
  const t = new Date(`${todayISO}T12:00:00`);
  if (Math.round((t.getTime() - d.getTime()) / 86400000) === 1) return 'Yesterday';
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
