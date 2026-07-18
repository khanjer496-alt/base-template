import type { CategoryId, TransactionType } from '@/lib/types';

export interface ParsedCard {
  last4: string;
  kind: 'credit' | 'debit' | 'account';
}

export interface ParsedSms {
  /**
   * transaction — money moved; billDue — a payment reminder;
   * cardStatement — credit card statement with a due date;
   * cardPayment — payment received toward a credit card (a transfer, not spending).
   */
  kind: 'transaction' | 'billDue' | 'cardStatement' | 'cardPayment';
  type: TransactionType;
  amountFils: number;
  merchant: string;
  /** ISO date if the message contained one, otherwise null (caller defaults to today). */
  date: string | null;
  /** For billDue/cardStatement: the day of month it's due, when present. */
  dueDay: number | null;
  /** For cardStatement: minimum amount due, when present. */
  minDueFils: number | null;
  /** Card/account the message refers to, when identifiable. */
  card: ParsedCard | null;
  /** Bank-side leg of a card payment / own-account transfer: money moved, not spent. */
  transferHint: boolean;
  categoryGuess: CategoryId;
  raw: string;
}

const CREDIT_WORDS = /credit(?:ed)?|received|salary|refund(?:ed)?|deposit(?:ed)?|transferred to your/i;
const DEBIT_WORDS = /purchase|debit(?:ed)?|spent|paid|payment(?!\s+(?:due|of\s+AED[\d,. ]+(?:is\s+)?received))|withdraw(?:n|al)?|was used|charged/i;
const BILL_DUE_WORDS = /\bdue\s+(?:on|by|date)\b|\bbill\b.*\b(?:due|generated|payable)\b|\bpayment\s+due\b|\bmin(?:imum)?\s+(?:amount\s+)?due\b/i;
const BILL_MERCHANT_RE = /(?:your|the)\s+([A-Za-z0-9][A-Za-z0-9 &.'\-]{1,30}?)\s+bill\b/i;

/** Credit-card statement: has "statement"/"total due" language plus a card reference. */
const STATEMENT_RE = /statement|total\s+(?:amount\s+)?due|outstanding\s+(?:amount|balance)\s+of/i;
/** Payment INTO a card: settles dues rather than spending. */
const CARD_PAYMENT_RE = /payment\s+(?:of\s+(?:AED|Dhs?\.?)\s*[\d,.]+\s+)?(?:is\s+|was\s+|has\s+been\s+)?(?:received|credited|processed)\s+(?:towards?|to|on|for)\s+your\s+(?:credit\s+)?card|received\s+payment\s+for\s+your\s+(?:credit\s+)?card|thank you for (?:your )?payment.*card/i;

/** OTP / verification messages describe an ATTEMPT, not a completed transaction. */
const OTP_RE = /\botp\b|one[\s-]?time\s+(?:password|pin|code)|verification code|auth(?:oris|oriz)ation code|do not share|never share/i;
const DECLINED_RE = /declin|unsuccessful|insufficient|reversed|could not be (?:processed|completed)|has failed/i;
const PROMO_RE = /cashback offer|voucher|promo|discount|t&c|terms apply|shop now|hurry|limited time|congratulations|you (?:could|can) win|https?:\/\//i;

const AED_AMOUNT_RE = /(?:AED|Dhs?\.?|د\.إ)\s*([\d,]+(?:\.\d{1,2})?)/gi;
const BALANCE_PREFIX_RE = /(?:bal(?:ance)?|avl|avail(?:able)?|limit|outstanding|total)\s*(?:is|:|\.|-)?\s*$/i;
const MIN_DUE_RE = /min(?:imum)?\s+(?:amount\s+)?due\s*(?:of|:|is)?\s*(?:AED|Dhs?\.?)\s*([\d,]+(?:\.\d{1,2})?)/i;

/** Card identity: "Credit Card ending 1234", "Debit Card ..5678", "a/c XX9012", "card no. *1234". */
const CARD_RE = /(credit|debit)?\s*card(?:\s*(?:no\.?|number))?\s*(?:ending(?:\s+in)?|\.\.+|x+|\*+)?\s*(\d{4})\b/i;
const ACCOUNT_RE = /a\/?c(?:count)?\s*(?:no\.?)?\s*(?:ending(?:\s+in)?|\.\.+|x+|\*+)?\s*(\d{4})\b/i;

const MERCHANT_STOP =
  String.raw`(?=\s*(?:,|\.|;|\bon\b|\bwith\b|\busing\b|\bvia\b|\bending\b|\bcard\b|\ba\/c\b|\bacc(?:ount)?\b|\bref\b|\btxn\b|\bdated\b|\bavl\b|\bavail(?:able)?\b|\bbal(?:ance)?\b|\botp\b|\bfor\b|\bis\b|$))`;
const MERCHANT_RE = new RegExp(
  String.raw`(?:\bat|\bto|@)\s+([A-Za-z0-9][A-Za-z0-9 &'\-*]{1,40}?)` + MERCHANT_STOP,
  'gi',
);

const DATE_RE = /\b(?:on|by|before)\s+(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i;

/** Debit messages that are actually transfers: paying a card bill, moving between own accounts. */
const TRANSFER_HINT_RE =
  /(?:towards?|for)\s+your\s+(?:credit\s+)?card|credit\s+card\s+(?:bill\s+)?payment|own\s+account\s+transfer|transfer\s+to\s+(?:your\s+)?own\s+account|self\s+transfer/i;

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
  [/playstation|\bpsn\b|xbox|steam|nintendo|app store|google play|itunes|cinema|vox|reel|netflix|spotify|anghami|shahid|osn|starz|game|entertainment/i, 'entertainment'],
  [/donat|charity|zakat|sadaqah|dubai cares|red crescent/i, 'charity'],
  [/salary|payroll|wages/i, 'salary'],
];

export function guessCategory(
  text: string,
  type: TransactionType,
  overrides?: Record<string, CategoryId>,
  merchant?: string,
): CategoryId {
  if (overrides && merchant) {
    const hit = overrides[merchant.trim().toLowerCase()];
    if (hit) return hit;
  }
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return cat;
  }
  return type === 'income' ? 'business' : 'other';
}

const ACRONYMS = new Set([
  'RTA', 'KFC', 'FAB', 'DEWA', 'SEWA', 'FEWA', 'ADCB', 'ENBD', 'ENOC', 'ADNOC',
  'VOX', 'PSN', 'NMC', 'DXB', 'AUH', 'HSBC', 'CBD', 'RAK', 'DIB', 'ATM', 'NOL', 'OSN',
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

function extractAmountFils(raw: string, allowBalanceFallback: boolean): number | null {
  AED_AMOUNT_RE.lastIndex = 0;
  let first: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = AED_AMOUNT_RE.exec(raw))) {
    const value = Math.round(Number(match[1].replace(/,/g, '')) * 100);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (first === null) first = value;
    const prefix = raw.slice(Math.max(0, match.index - 24), match.index);
    if (BALANCE_PREFIX_RE.test(prefix)) continue;
    return value;
  }
  return allowBalanceFallback ? first : null;
}

function extractMerchant(raw: string, re: RegExp): string {
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const candidate = match[1].trim().replace(/\s{2,}/g, ' ');
    if (/^your\b/i.test(candidate) || /^(?:the |an? )?account\b/i.test(candidate)) continue;
    if (/^\d+$/.test(candidate)) continue; // bare digits are a card number, not a merchant
    if (candidate) return candidate;
    if (re.lastIndex === match.index) re.lastIndex++;
  }
  return '';
}

function extractCard(raw: string): ParsedCard | null {
  const cardMatch = raw.match(CARD_RE);
  if (cardMatch) {
    const kindWord = cardMatch[1]?.toLowerCase();
    return {
      last4: cardMatch[2],
      kind: kindWord === 'credit' ? 'credit' : kindWord === 'debit' ? 'debit' : 'debit',
    };
  }
  const accMatch = raw.match(ACCOUNT_RE);
  if (accMatch) return { last4: accMatch[1], kind: 'account' };
  return null;
}

function extractDate(raw: string): string | null {
  const dateMatch = raw.match(DATE_RE);
  if (!dateMatch) return null;
  const [, d, m, yRaw] = dateMatch;
  const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
  const day = Number(d);
  const month = Number(m);
  if (y >= 2000 && y <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

/** Parses a single bank-alert SMS. Returns null for non-transaction messages. */
export function parseSms(
  message: string,
  overrides?: Record<string, CategoryId>,
): ParsedSms | null {
  const raw = message.trim();
  if (!raw) return null;

  if (OTP_RE.test(raw)) return null;
  if (DECLINED_RE.test(raw)) return null;

  const card = extractCard(raw);
  const date = extractDate(raw);

  // Card payment received (transfer into the card) — before debit detection,
  // since these messages also contain the word "payment".
  if (card?.kind !== 'account' && card && CARD_PAYMENT_RE.test(raw)) {
    const amountFils = extractAmountFils(raw, true);
    if (!amountFils) return null;
    return {
      kind: 'cardPayment',
      type: 'expense',
      amountFils,
      merchant: `Card •${card.last4} payment`,
      date,
      dueDay: null,
      minDueFils: null,
      card,
      transferHint: true,
      categoryGuess: 'other',
      raw,
    };
  }

  // Credit-card statement with dues.
  if (card && STATEMENT_RE.test(raw) && BILL_DUE_WORDS.test(raw)) {
    const amountFils = extractAmountFils(raw, true);
    if (!amountFils) return null;
    const minMatch = raw.match(MIN_DUE_RE);
    return {
      kind: 'cardStatement',
      type: 'expense',
      amountFils,
      merchant: `Card •${card.last4}`,
      date,
      dueDay: date ? Number(date.slice(8)) : null,
      minDueFils: minMatch ? Math.round(Number(minMatch[1].replace(/,/g, '')) * 100) : null,
      card,
      transferHint: false,
      categoryGuess: 'other',
      raw,
    };
  }

  const hasDebit = DEBIT_WORDS.test(raw);
  const hasCredit = CREDIT_WORDS.test(raw);
  const isBillDue = BILL_DUE_WORDS.test(raw) && !hasDebit && !hasCredit;

  if (PROMO_RE.test(raw) && !hasDebit && !hasCredit && !isBillDue) return null;
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

  return {
    kind: isBillDue ? 'billDue' : 'transaction',
    type,
    amountFils,
    merchant,
    date,
    dueDay: isBillDue && date ? Number(date.slice(8)) : null,
    minDueFils: null,
    card,
    transferHint: !isBillDue && TRANSFER_HINT_RE.test(raw),
    categoryGuess: guessCategory(raw, type, overrides, merchant),
    raw,
  };
}

/** Parses pasted text that may contain several messages separated by blank lines. */
export function parseSmsBatch(
  text: string,
  overrides?: Record<string, CategoryId>,
): ParsedSms[] {
  return text
    .split(/\n\s*\n/)
    .map((m) => parseSms(m, overrides))
    .filter((p): p is ParsedSms => p !== null);
}
