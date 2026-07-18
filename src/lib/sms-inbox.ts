import { PermissionsAndroid, Platform } from 'react-native';

import SmsReader from '../../modules/sms-reader';
import { toISODate } from '@/lib/format';
import { parseSms, type ParsedSms } from '@/lib/sms-parser';
import type { Transaction } from '@/lib/types';

const MAX_MESSAGES = 500;

/** True when running on Android with the native SMS module compiled in. */
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

function dedupeKey(date: string, amountFils: number, title: string): string {
  return `${date}|${amountFils}|${title.toLowerCase()}`;
}

/**
 * Reads the inbox for the last `days` days, parses bank-style messages, and
 * drops any that match an already-recorded transaction (same date + amount +
 * merchant), so repeated scans are idempotent.
 */
export async function scanInboxForBankMessages(
  existing: Transaction[],
  days = 90,
): Promise<ParsedSms[]> {
  if (!isSmsScanningAvailable() || !SmsReader) return [];

  const sinceMs = Date.now() - days * 86400000;
  const messages = await SmsReader.getInboxSms(sinceMs, MAX_MESSAGES);

  const seen = new Set(existing.map((t) => dedupeKey(t.date, t.amountFils, t.title)));
  const results: ParsedSms[] = [];

  const seenBills = new Set<string>();
  for (const sms of messages) {
    const parsed = parseSms(sms.body);
    if (!parsed) continue;
    // Prefer the date inside the message text; fall back to the SMS timestamp.
    const date = parsed.date ?? toISODate(new Date(sms.date));
    if (parsed.kind === 'billDue') {
      // Keep only the newest reminder per biller.
      const billKey = parsed.merchant.toLowerCase();
      if (seenBills.has(billKey)) continue;
      seenBills.add(billKey);
      results.push({ ...parsed, date });
      continue;
    }
    const key = dedupeKey(date, parsed.amountFils, parsed.merchant);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ ...parsed, date });
  }

  return results;
}
