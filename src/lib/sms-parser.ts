import type { CategoryId, TransactionType } from '@/lib/types';

export interface ParsedSms {
  /** 'transaction' = money already moved; 'billDue' = a payment reminder. */
  kind: 'transaction' | 'billDue';
  type: TransactionType;
  amountFils: number;
  merchant: string;
  /** ISO date if the message contained one, otherwise null (caller defaults to today). */
  date: string | null;
  /** For billDue messages: the due day of month, when present. */
  dueDay: number | null;
  categoryGuess: CategoryId;
  raw: string;
}

const CREDIT_WORDS = /credit(?:ed)?|received|salary|refund(?:ed)?|deposit(?:ed)?|transferred to your/i;
const DEBIT_WORDS = /purchase|debit(?:ed)?|spent|paid|payment(?!\s+due)|withdraw(?:n|al)?|was used|charged/i;
const BILL_DUE_WORDS = /\bdue\s+(?:on|by|date)\b|\bbill\b.*\b(?:due|generated|payable)\b|\bpayment\s+due\b|\bmin(?:imum)?\s+(?:amount\s+)?due\b/i;
const BILL_MERCHANT_RE = /(?:your|the)\s+([A-Za-z0-9][A-Za-z0-9 &.'\-]{1,30}?)\s+bill\b/i;

const AMOUNT_RE = /(?:AED|Dhs?\.?|د\.إ)\s*([\d,]+(?:\.\d{1,2})?)/i;
const MERCHANT_RE = /(?:\bat|\bto|@)\s+([A-Za-z0-9][A-Za-z0-9 &.'`*\-]{1,40}?)(?=\s*(?:,|\.\s|\bon\b|\bdated\b|\bAvl\b|\bavailable\b|\bbal\b|$))/i;
const DATE_RE = /\bon\s+(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i;

const CATEGORY_KEYWORDS: [RegExp, CategoryId][] = [
  [/carrefour|lulu|spinneys|union coop|choithram|grandiose|waitrose|hypermarket|supermarket|grocer/i, 'groceries'],
  [/talabat|deliveroo|zomato|noon food|careem food|restaurant|cafe|coffee|starbucks|mcdonald|kfc|dining/i, 'dining'],
  [/careem|uber|taxi|rta|nol|salik|enoc|eppco|adnoc|petrol|fuel|metro|parking/i, 'transport'],
  [/dewa|sewa|fewa|addc|electricity|water|utility/i, 'utilities'],
  [/etisalat|\bdu\b|virgin mobile|telecom|mobile recharge|internet/i, 'telecom'],
  [/rent|ejari|landlord/i, 'rent'],
  [/amazon|noon(?!\s*food)|shein|namshi|ikea|sharaf|mall|store|shop/i, 'shopping'],
  [/pharmacy|clinic|hospital|aster|medcare|nmc|dental|medical/i, 'health'],
  [/school|university|college|tuition|academy|nursery/i, 'education'],
  [/emirates(?!\s*nbd)|flydubai|etihad|airline|hotel|booking|airbnb|wizz/i, 'travel'],
  [/cinema|vox|reel|netflix|spotify|game|entertainment/i, 'entertainment'],
  [/donat|charity|zakat|sadaqah|dubai cares|red crescent/i, 'charity'],
  [/salary|payroll|wages/i, 'salary'],
];

export function guessCategory(text: string, type: TransactionType): CategoryId {
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return cat;
  }
  return type === 'income' ? 'business' : 'other';
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Parses a single bank-alert SMS. Returns null when no amount is found. */
export function parseSms(message: string): ParsedSms | null {
  const raw = message.trim();
  if (!raw) return null;

  const amountMatch = raw.match(AMOUNT_RE);
  if (!amountMatch) return null;
  const amountFils = Math.round(Number(amountMatch[1].replace(/,/g, '')) * 100);
  if (!Number.isFinite(amountFils) || amountFils <= 0) return null;

  const isBillDue = BILL_DUE_WORDS.test(raw) && !DEBIT_WORDS.test(raw) && !CREDIT_WORDS.test(raw);

  let type: TransactionType = 'expense';
  if (!isBillDue && CREDIT_WORDS.test(raw) && !DEBIT_WORDS.test(raw)) type = 'income';

  const merchantMatch = isBillDue ? raw.match(BILL_MERCHANT_RE) ?? raw.match(MERCHANT_RE) : raw.match(MERCHANT_RE);
  let merchant = merchantMatch ? merchantMatch[1].trim().replace(/\s{2,}/g, ' ') : '';
  // "credited to your account ending 1234" is not a merchant name.
  if (/^your\b/i.test(merchant) || /^(the |an? )?account\b/i.test(merchant)) merchant = '';
  if (isBillDue && !merchant) merchant = 'Bill payment';
  // Strip trailing city names banks often append ("CARREFOUR DUBAI ARE").
  merchant = merchant.replace(/\s+(?:DXB|DUBAI|ABU DHABI|SHARJAH|ARE|UAE)$/i, '').trim();
  if (!merchant) merchant = type === 'income' ? 'Incoming transfer' : 'Card payment';
  if (merchant === merchant.toUpperCase()) merchant = titleCase(merchant);

  let date: string | null = null;
  const dateMatch = raw.match(DATE_RE);
  if (dateMatch) {
    const [, d, m, yRaw] = dateMatch;
    const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    const day = Number(d);
    const month = Number(m);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      date = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return {
    kind: isBillDue ? 'billDue' : 'transaction',
    type,
    amountFils,
    merchant,
    date,
    dueDay: isBillDue && date ? Number(date.slice(8)) : null,
    categoryGuess: guessCategory(raw, type),
    raw,
  };
}

/** Parses pasted text that may contain several messages separated by blank lines. */
export function parseSmsBatch(text: string): ParsedSms[] {
  return text
    .split(/\n\s*\n/)
    .map(parseSms)
    .filter((p): p is ParsedSms => p !== null);
}
