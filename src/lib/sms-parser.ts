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

/** OTP / verification messages describe an ATTEMPT, not a completed transaction.
 * The actual debit alert arrives separately — importing both double-counts. */
const OTP_RE = /\botp\b|one[\s-]?time\s+(?:password|pin|code)|verification code|auth(?:oris|oriz)ation code|do not share|never share/i;
const DECLINED_RE = /declin|unsuccessful|insufficient|reversed|could not be (?:processed|completed)|has failed/i;
/** Marketing blasts often quote amounts ("Get AED 100 cashback!"). */
const PROMO_RE = /cashback offer|voucher|promo|discount|t&c|terms apply|shop now|hurry|limited time|congratulations|you (?:could|can) win|https?:\/\//i;

const AMOUNT_RE = /(?:AED|Dhs?\.?|د\.إ)\s*([\d,]+(?:\.\d{1,2})?)/gi;
/** Words that mean the amount right after them is a BALANCE, not the transaction. */
const BALANCE_PREFIX_RE = /(?:bal(?:ance)?|avl|avail(?:able)?|limit|outstanding|total)\s*(?:is|:|\.|-)?\s*$/i;

/** Stops the merchant capture before card/account/balance boilerplate. */
const MERCHANT_STOP =
  String.raw`(?=\s*(?:,|\.|;|\bon\b|\bwith\b|\busing\b|\bvia\b|\bending\b|\bcard\b|\ba\/c\b|\bacc(?:ount)?\b|\bref\b|\btxn\b|\bdated\b|\bavl\b|\bavail(?:able)?\b|\bbal(?:ance)?\b|\botp\b|\bfor\b|\bis\b|$))`;
const MERCHANT_RE = new RegExp(
  String.raw`(?:\bat|\bto|@)\s+([A-Za-z0-9][A-Za-z0-9 &'\-*]{1,40}?)` + MERCHANT_STOP,
  'gi',
);

/** "charged to your card at CAREEM" — skip the "to your card" match, take "at CAREEM". */
function extractMerchant(raw: string, re: RegExp): string {
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const candidate = match[1].trim().replace(/\s{2,}/g, ' ');
    if (/^your\b/i.test(candidate) || /^(?:the |an? )?account\b/i.test(candidate)) continue;
    if (candidate) return candidate;
    if (re.lastIndex === match.index) re.lastIndex++;
  }
  return '';
}

const DATE_RE = /\b(?:on|by|before)\s+(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i;

const CATEGORY_KEYWORDS: [RegExp, CategoryId][] = [
  [/carrefour|lulu|spinneys|union coop|choithram|grandiose|waitrose|noon minutes|instashop|careem quik|hypermarket|supermarket|grocer/i, 'groceries'],
  [/talabat|deliveroo|zomato|noon food|careem food|restaurant|cafe|coffee|starbucks|mcdonald|kfc|dining/i, 'dining'],
  [/careem|uber|taxi|rta|nol|salik|enoc|eppco|adnoc|petrol|fuel|metro|parking/i, 'transport'],
  [/dewa|sewa|fewa|addc|electricity|water|utility/i, 'utilities'],
  [/etisalat|\bdu\b|virgin mobile|telecom|mobile recharge|internet/i, 'telecom'],
  [/rent|ejari|landlord/i, 'rent'],
  [/tabby|tamara|postpay|amazon|noon(?!\s*(?:food|minutes))|shein|namshi|ikea|sharaf|mall|store|shop/i, 'shopping'],
  [/pharmacy|clinic|hospital|aster|medcare|nmc|dental|medical/i, 'health'],
  [/school|university|college|tuition|academy|nursery/i, 'education'],
  [/emirates(?!\s*nbd)|flydubai|etihad|airline|hotel|booking|airbnb|wizz/i, 'travel'],
  [/playstation|\bpsn\b|xbox|steam|nintendo|app store|google play|itunes|cinema|vox|reel|netflix|spotify|game|entertainment/i, 'entertainment'],
  [/donat|charity|zakat|sadaqah|dubai cares|red crescent/i, 'charity'],
  [/salary|payroll|wages/i, 'salary'],
];

export function guessCategory(text: string, type: TransactionType): CategoryId {
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return cat;
  }
  return type === 'income' ? 'business' : 'other';
}

/** Well-known UAE acronyms that should keep their capitalisation. */
const ACRONYMS = new Set([
  'RTA', 'KFC', 'FAB', 'DEWA', 'SEWA', 'FEWA', 'ADCB', 'ENBD', 'ENOC', 'ADNOC',
  'VOX', 'PSN', 'NMC', 'DXB', 'AUH', 'HSBC', 'CBD', 'RAK', 'DIB', 'ATM', 'NOL',
]);

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => {
      if (ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
      const lower = w.toLowerCase();
      return lower ? lower[0].toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

/**
 * Picks the transaction amount from a message, skipping amounts that are
 * balances/limits ("Avl bal AED 12,345.67"). Falls back to the first amount
 * when nothing else matches (useful for bill-due totals).
 */
function extractAmountFils(raw: string, allowBalanceFallback: boolean): number | null {
  AMOUNT_RE.lastIndex = 0;
  let first: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = AMOUNT_RE.exec(raw))) {
    const value = Math.round(Number(match[1].replace(/,/g, '')) * 100);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (first === null) first = value;
    const prefix = raw.slice(Math.max(0, match.index - 24), match.index);
    if (BALANCE_PREFIX_RE.test(prefix)) continue;
    return value;
  }
  return allowBalanceFallback ? first : null;
}

/** Parses a single bank-alert SMS. Returns null for non-transaction messages. */
export function parseSms(message: string): ParsedSms | null {
  const raw = message.trim();
  if (!raw) return null;

  // Not real money movements: OTP prompts, declines, marketing.
  if (OTP_RE.test(raw)) return null;
  if (DECLINED_RE.test(raw)) return null;

  const hasDebit = DEBIT_WORDS.test(raw);
  const hasCredit = CREDIT_WORDS.test(raw);
  const isBillDue = BILL_DUE_WORDS.test(raw) && !hasDebit && !hasCredit;

  if (PROMO_RE.test(raw) && !hasDebit && !hasCredit && !isBillDue) return null;
  // With no transaction verbs at all, an amount alone is not enough to trust.
  if (!hasDebit && !hasCredit && !isBillDue) return null;

  const amountFils = extractAmountFils(raw, isBillDue);
  if (!amountFils) return null;

  const type: TransactionType = !isBillDue && hasCredit && !hasDebit ? 'income' : 'expense';

  let merchant = '';
  if (isBillDue) {
    const billMatch = raw.match(BILL_MERCHANT_RE);
    merchant = billMatch ? billMatch[1].trim() : extractMerchant(raw, MERCHANT_RE);
  } else {
    merchant = extractMerchant(raw, MERCHANT_RE);
  }
  merchant = merchant.replace(/\s+(?:DXB|DUBAI|ABU DHABI|SHARJAH|AJMAN|ARE|UAE)$/i, '').trim();
  if (!merchant) {
    merchant = isBillDue ? 'Bill payment' : type === 'income' ? 'Incoming transfer' : 'Card payment';
  } else {
    merchant = titleCase(merchant);
  }

  let date: string | null = null;
  const dateMatch = raw.match(DATE_RE);
  if (dateMatch) {
    const [, d, m, yRaw] = dateMatch;
    const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    const day = Number(d);
    const month = Number(m);
    if (y >= 2000 && y <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
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
