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
const CARD_PAYMENT_RE = /payment\s+(?:of\s+(?:AED|Dhs?\.?)\s*[\d,.]+\s+)?(?:is\s+|was\s+|has\s+been\s+)?(?:received|credited|processed)\s+(?:towards?|to|on|for)\s+(?:your\s+)?(?:credit\s+)?card|received\s+payment\s+for\s+your\s+(?:credit\s+)?card|thank you for (?:your )?payment.*card|card\s+(?:no\.?\s*)?[\dXx*•]*\s*has\s+been\s+paid/i;

/** OTP / verification messages describe an ATTEMPT, not a completed transaction. */
const OTP_RE = /\botp\b|one[\s-]?time\s+(?:password|pin|code)|verification code|auth(?:oris|oriz)ation code|do not share|never share/i;
/** Pre-auth holds are not postings; the real charge arrives as its own SMS. */
const PREAUTH_RE = /pre-?auth|amount\s+(?:has been\s+)?blocked|hold\s+(?:of|amount|placed)|temporary\s+hold/i;
const DECLINED_RE = /declin|unsuccessful|insufficient|reversed|could not be (?:processed|completed)|has failed/i;
const PROMO_RE = /cashback offer|voucher|promo|discount|t&c|terms apply|shop now|hurry|limited time|congratulations|you (?:could|can) win|https?:\/\//i;

const AED_AMOUNT_RE = /(?:AED|Dhs?\.?|د\.إ)\s*([\d,]+(?:\.\d{1,2})?)/gi;
/** Amount BEFORE the currency: "1,234.56 AED debited" — common ENBD/FAB form. */
const AED_SUFFIX_RE = /([\d,]+(?:\.\d{1,2})?)\s*(?:AED|Dhs?\.?)(?![A-Za-z])/gi;
/**
 * A single SMS transaction above AED 1,000,000 is almost certainly a misread
 * balance, loan figure, or reference number — never spending.
 */
const MAX_PLAUSIBLE_AMOUNT_FILS = 100_000_000;
const BALANCE_PREFIX_RE = /(?:bal(?:ance)?|avl|avail(?:able)?|limit|outstanding|total)\s*(?:is|:|\.|-)?\s*$/i;
const MIN_DUE_RE = /min(?:imum)?\s+(?:amount\s+)?due\s*(?:of|:|is)?\s*(?:AED|Dhs?\.?)\s*([\d,]+(?:\.\d{1,2})?)/i;

/** Card identity: "Credit Card ending 1234", "Debit Card ..5678", "a/c XX9012", "card no. *1234". */
const CARD_RE = /(credit|debit)?\s*card(?:\s*(?:no\.?|number))?\s*(?:ending(?:\s+in)?|\.\.+|x+|\*+)?\s*(\d{4})\b/i;
const ACCOUNT_RE = /a\/?c(?:count)?\s*(?:no\.?)?\s*(?:ending(?:\s+in)?|\.\.+|x+|\*+)?\s*(\d{4})\b/i;
/** Fully masked PAN like "4782********4499" — the LAST four digits identify the card. */
const MASKED_PAN_RE = /\b\d{4,6}[Xx*•]{2,}(\d{4})\b/;

const MERCHANT_STOP =
  String.raw`(?=\s*(?:,|\.|;|\bon\b|\bwith\b|\busing\b|\bvia\b|\bending\b|\bcard\b|\ba\/c\b|\bacc(?:ount)?\b|\bref\b|\btxn\b|\bdated\b|\bavl\b|\bavail(?:able)?\b|\bbal(?:ance)?\b|\botp\b|\bfor\b|\bis\b|\bhas\b|\bhave\b|\bwas\b|\bwill\b|$))`;
const MERCHANT_RE = new RegExp(
  String.raw`(?:\bat|\bto|\bfrom|@)\s+([A-Za-z0-9][A-Za-z0-9 &'\-*]{1,40}?)` + MERCHANT_STOP,
  'gi',
);

const DATE_RE = /\b(?:on|by|before)\s+(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i;

const ATM_RE = /\batm\b|cash\s+withdrawal/i;
const FEE_RE = /\bfees?\b|\bcharges?\s+(?:of|:)|service charge|\bvat\b|annual membership/i;
const DEPOSIT_RE = /cash\s+deposit|\bcdm\b|deposit(?:ed)?\s+(?:in|into|to)\b/i;

/** Debit messages that are actually transfers: paying a card bill, moving between own accounts. */
const TRANSFER_HINT_RE =
  /(?:towards?|for)\s+(?:your\s+(?:credit\s+)?card|credit\s+card|card\s+(?:no\.?\s*)?[\dXx*•])|credit\s+card\s+(?:bill\s+)?payment|c\/?c\s+payment|card\s+settlement|own\s+account\s+transfer|transfer\s+to\s+(?:your\s+)?own\s+account|self\s+transfer|inward\s+remittance/i;

const CATEGORY_KEYWORDS: [RegExp, CategoryId][] = [
  [/carrefour|lulu|spinneys|union coop|choithram|grandiose|waitrose|nesto|al maya|west zone|viva supermarket|\bcoop\b|noon minutes|instashop|careem quik|talabat mart|hypermarket|supermarket|grocer|fresh market|baqala/i, 'groceries'],
  [/talabat|deliveroo|zomato|noon food|careem food|eateasy|restaurant|cafe|coffee|starbucks|costa|tim hortons|mcdonald|kfc|hardee|subway|shawarma|cafeteria|dining|bakery/i, 'dining'],
  [/careem|uber|taxi|\brta\b|\bnol\b|salik|darb|enoc|eppco|adnoc|emarat|petrol|fuel|metro|parking|valet/i, 'transport'],
  [/dewa|sewa|fewa|addc|aadc|empower|lootah|tabreed|electricity|water|cooling|utility/i, 'utilities'],
  [/etisalat|\bdu\b|virgin mobile|telecom|mobile recharge|internet|five telecom/i, 'telecom'],
  [/rent|ejari|landlord/i, 'rent'],
  [/tabby|tamara|postpay|cashew|amazon|noon(?!\s*(?:food|minutes))|shein|temu|aliexpress|namshi|ounass|ikea|home centre|sharaf|jumbo|emax|dubizzle|mall|store|shop/i, 'shopping'],
  [/pharmacy|clinic|hospital|aster|medcare|\bnmc\b|mediclinic|saudi german|dental|medical|optic|sukoon|\bdaman\b|\baxa\b|insurance/i, 'health'],
  [/school|university|college|tuition|academy|nursery|\bgems\b|taaleem|kumon/i, 'education'],
  [/emirates(?!\s*nbd)|flydubai|etihad|air arabia|airline|hotel|booking|airbnb|agoda|wizz|visa fee/i, 'travel'],
  [/playstation|\bpsn\b|xbox|steam|nintendo|app store|google play|itunes|cinema|vox|reel|novo|netflix|spotify|anghami|shahid|osn|starz|game|entertainment/i, 'entertainment'],
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
  // Money coming IN is never dining/groceries/etc — a Talabat payout is
  // business revenue, not food spending. Refunds, cashback, and bank
  // interest/profit are offsets, not revenue, so they stay out of Business.
  if (type === 'income') {
    if (/salary|payroll|wages/i.test(text)) return 'salary';
    if (/refund|reversal|cashback|\binterest\b|\bprofit\b/i.test(text)) return 'other';
    return 'business';
  }
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return cat;
  }
  return 'other';
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
  // Gather candidates from both currency positions, in message order.
  const candidates: { index: number; value: number }[] = [];
  AED_AMOUNT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = AED_AMOUNT_RE.exec(raw))) {
    candidates.push({ index: match.index, value: Math.round(Number(match[1].replace(/,/g, '')) * 100) });
  }
  AED_SUFFIX_RE.lastIndex = 0;
  while ((match = AED_SUFFIX_RE.exec(raw))) {
    // Skip digits glued to identifiers ("a/c XX9012 AED..." must not read 9012).
    const before = match.index > 0 ? raw[match.index - 1] : ' ';
    if (/[A-Za-z0-9*•.]/.test(before)) continue;
    // Skip if this is the number part of a prefix match ("AED 100" also ends before "AED"? no —
    // but "AED 100.00 AED"-style doubles resolve identically, so duplicates are harmless).
    candidates.push({ index: match.index, value: Math.round(Number(match[1].replace(/,/g, '')) * 100) });
  }
  candidates.sort((a, b) => a.index - b.index);

  let first: number | null = null;
  for (const c of candidates) {
    if (!Number.isFinite(c.value) || c.value <= 0 || c.value > MAX_PLAUSIBLE_AMOUNT_FILS) continue;
    if (first === null) first = c.value;
    const prefix = raw.slice(Math.max(0, c.index - 24), c.index);
    if (BALANCE_PREFIX_RE.test(prefix)) continue;
    return c.value;
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
    if (/\d{4}[Xx*•]{2,}/.test(candidate) || /^\d{6,}/.test(candidate)) continue; // masked PANs
    if (candidate) return candidate;
    if (re.lastIndex === match.index) re.lastIndex++;
  }
  return '';
}

function extractCard(raw: string): ParsedCard | null {
  // Masked PANs first: CARD_RE would otherwise grab the FIRST four digits of
  // "Credit Card 4782********4499" as the identity.
  const masked = raw.match(MASKED_PAN_RE);
  if (masked) {
    return { last4: masked[1], kind: /credit/i.test(raw) ? 'credit' : 'debit' };
  }
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
  if (PREAUTH_RE.test(raw)) return null;

  const card = extractCard(raw);
  const date = extractDate(raw);

  // Card payment received (transfer into the card) — before debit detection,
  // since these messages also contain the word "payment". Only credit cards
  // receive payments, whatever the message called the card.
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
      card: { ...card, kind: 'credit' },
      transferHint: true,
      categoryGuess: 'other',
      raw,
    };
  }

  // Credit-card statement with dues. Statements only exist for credit cards.
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
      card: { ...card, kind: 'credit' },
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
  const transferHint = !isBillDue && TRANSFER_HINT_RE.test(raw);
  merchant = merchant
    .replace(/\s+(?:DXB|DUBAI|ABU DHABI|SHARJAH|AJMAN|ARE|UAE)$/i, '')
    .replace(/(?:\s+COM|\.com)$/i, '') // "NOON COM" / "noon.com" → "NOON"
    .trim();
  if (!merchant) {
    // No merchant in the message: name the row by what actually happened.
    merchant = isBillDue
      ? 'Bill payment'
      : type === 'income'
        ? DEPOSIT_RE.test(raw)
          ? 'Cash deposit'
          : /inward\s+remittance/i.test(raw)
            ? 'Inward remittance'
            : 'Incoming transfer'
        : transferHint
          ? 'Card payment'
          : ATM_RE.test(raw)
            ? 'ATM withdrawal'
            : /cheque|\bchq\b/i.test(raw)
              ? 'Cheque'
              : FEE_RE.test(raw)
                ? 'Bank fee'
                : 'Card purchase';
  } else {
    merchant = titleCase(merchant);
  }
  // ATM messages usually name a location; the row is still a cash withdrawal.
  if (!isBillDue && type === 'expense' && !transferHint && ATM_RE.test(raw)) {
    merchant = 'ATM withdrawal';
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
    transferHint,
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
