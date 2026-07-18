import { PermissionsAndroid, Platform } from 'react-native';

import SmsReader, { type RawSms } from '../../modules/sms-reader';
import { cardAccountName, colorForHint } from '@/lib/cards';
import { toISODate } from '@/lib/format';
import { parseSms, type ParsedSms } from '@/lib/sms-parser';
import type { Account, AppState, CardDue, Transaction } from '@/lib/types';
import type { ImportBatchInput } from '@/lib/store';

const PAGE_SIZE = 1000;
const MAX_PAGES = 40; // 40k messages is far beyond any real inbox

export function isSmsScanningAvailable(): boolean {
  return Platform.OS === 'android' && SmsReader != null;
}

export async function hasSmsPermission(): Promise<boolean> {
  if (!isSmsScanningAvailable()) return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
}

export async function requestSmsPermission(): Promise<boolean> {
  if (!isSmsScanningAvailable()) return false;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: 'Read bank SMS',
    message:
      'Wafra scans your inbox for bank alert messages to log transactions automatically. ' +
      'Messages are processed on this device only and never leave it.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export interface ScanResult {
  parsed: ParsedSms[];
  /** Timestamp of the newest message seen, for incremental scans. */
  newestTs: number;
  scannedCount: number;
}

/**
 * Reads the inbox from `sinceMs` to now in pages (full history when sinceMs = 0)
 * and parses every message. onProgress fires per page for UI feedback.
 */
export async function scanInbox(
  sinceMs: number,
  overrides: Record<string, import('@/lib/types').CategoryId>,
  onProgress?: (scanned: number, found: number) => void,
): Promise<ScanResult> {
  if (!isSmsScanningAvailable() || !SmsReader) {
    return { parsed: [], newestTs: sinceMs, scannedCount: 0 };
  }

  const parsed: (ParsedSms & { smsTs: number })[] = [];
  let newestTs = sinceMs;
  let untilMs = Date.now() + 60_000;
  let scannedCount = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch: RawSms[] = await SmsReader.getInboxSms(sinceMs, untilMs, PAGE_SIZE);
    if (batch.length === 0) break;
    scannedCount += batch.length;
    for (const sms of batch) {
      if (sms.date > newestTs) newestTs = sms.date;
      const p = parseSms(sms.body, overrides);
      if (!p) continue;
      parsed.push({ ...p, date: p.date ?? toISODate(new Date(sms.date)), smsTs: sms.date });
    }
    onProgress?.(scannedCount, parsed.length);
    untilMs = batch[batch.length - 1].date; // page ends exclusive, walk backwards
    if (batch.length < PAGE_SIZE) break;
  }

  // Oldest-first so account auto-creation sees the earliest occurrence first.
  parsed.sort((a, b) => a.smsTs - b.smsTs);
  return { parsed, newestTs, scannedCount };
}

export interface ImportPlan {
  batch: ImportBatchInput;
  txCount: number;
  newAccountCount: number;
  dueCount: number;
  billDues: ParsedSms[];
}

function dedupeKey(date: string, amountFils: number, title: string): string {
  return `${date}|${amountFils}|${title.toLowerCase()}`;
}

/**
 * Turns parsed messages into a single importable batch:
 * maps card hints to accounts (auto-creating unseen cards), skips duplicates,
 * converts card payments to transfers, and statements to card dues.
 */
export function buildImportPlan(
  parsed: ParsedSms[],
  state: AppState,
  newestTs: number,
): ImportPlan {
  const seen = new Set(
    state.transactions.map((t) => dedupeKey(t.date, t.amountFils, t.title)),
  );
  const hints: Record<string, string> = { ...state.accountHints };
  const newAccounts: Omit<Account, 'id'>[] = [];
  const newHints: Record<string, string> = {};
  const transactions: Omit<Transaction, 'id'>[] = [];
  const newDues: Omit<CardDue, 'id'>[] = [];
  const billDues: ParsedSms[] = [];
  const fallbackAccountId = state.accounts[0]?.id ?? '';

  const resolveAccount = (p: ParsedSms): string => {
    if (!p.card) return fallbackAccountId;
    const { last4, kind } = p.card;
    if (hints[last4]) return hints[last4];
    // An account the user created earlier with a matching last4 wins.
    const existing = state.accounts.find((a) => a.last4 === last4);
    if (existing) {
      hints[last4] = existing.id;
      newHints[last4] = existing.id;
      return existing.id;
    }
    // Auto-create; reference by index until the store assigns real ids.
    const idx = newAccounts.length;
    newAccounts.push({
      name: cardAccountName(last4, kind),
      kind: kind === 'credit' || kind === 'debit' ? 'card' : 'bank',
      cardType: kind === 'credit' ? 'credit' : kind === 'debit' ? 'debit' : undefined,
      last4,
      openingFils: 0,
      color: colorForHint(last4),
    });
    const ref = String(idx);
    hints[last4] = ref;
    newHints[last4] = ref;
    return ref;
  };

  for (const p of parsed) {
    const date = p.date ?? toISODate(new Date());
    if (p.kind === 'billDue') {
      if (p.merchant !== 'Bill payment') billDues.push(p);
      continue;
    }
    if (p.kind === 'cardStatement') {
      if (!p.card || !p.date) continue;
      const accountId = resolveAccount(p);
      newDues.push({
        accountId,
        totalDueFils: p.amountFils,
        minDueFils: p.minDueFils ?? Math.round(p.amountFils * 0.05),
        dueDate: p.date,
        paidFils: 0,
      });
      continue;
    }
    if (p.kind === 'cardPayment') {
      const accountId = resolveAccount(p);
      const key = dedupeKey(date, p.amountFils, p.merchant);
      if (seen.has(key)) continue;
      seen.add(key);
      transactions.push({
        type: 'income', // money arriving INTO the card account
        amountFils: p.amountFils,
        category: 'other',
        accountId,
        title: p.merchant,
        date,
        source: 'sms',
        isTransfer: true,
      });
      continue;
    }
    // Plain transaction
    const key = dedupeKey(date, p.amountFils, p.merchant);
    if (seen.has(key)) continue;
    seen.add(key);
    transactions.push({
      type: p.type,
      amountFils: p.amountFils,
      category: p.categoryGuess,
      accountId: resolveAccount(p),
      title: p.merchant,
      date,
      source: 'sms',
    });
  }

  return {
    batch: { transactions, newAccounts, newHints, newDues, lastScanTs: newestTs },
    txCount: transactions.length,
    newAccountCount: newAccounts.length,
    dueCount: newDues.length,
    billDues,
  };
}
