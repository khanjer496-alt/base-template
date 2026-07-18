/**
 * Compatibility layer over the v2 auto-import engine for screens that used
 * the original scan API. New code should use '@/lib/auto-import' directly.
 */
import {
  buildImportPlan,
  hasSmsPermission,
  isSmsScanningAvailable,
  requestSmsPermission,
  scanInbox,
} from '@/lib/auto-import';
import type { ParsedSms } from '@/lib/sms-parser';
import type { AppState, Transaction } from '@/lib/types';

export { hasSmsPermission, isSmsScanningAvailable, requestSmsPermission };

/**
 * Scans the last `days` days and returns parseable messages not already
 * recorded, for the manual review screen.
 */
export async function scanInboxForBankMessages(
  existing: Transaction[],
  days = 90,
): Promise<ParsedSms[]> {
  const sinceMs = Date.now() - days * 86400000;
  const { parsed, newestTs } = await scanInbox(sinceMs, {});
  const pseudoState = { transactions: existing, accounts: [], accountHints: {} } as unknown as AppState;
  const plan = buildImportPlan(parsed, pseudoState, newestTs);
  // Reconstruct the review list: deduped transactions + named bill reminders.
  const txKeys = new Set(
    plan.batch.transactions.map((t) => `${t.date}|${t.amountFils}|${t.title.toLowerCase()}`),
  );
  const out: ParsedSms[] = [];
  const seenBills = new Set<string>();
  for (const p of parsed) {
    if (p.kind === 'transaction') {
      const key = `${p.date}|${p.amountFils}|${p.merchant.toLowerCase()}`;
      if (txKeys.has(key)) {
        txKeys.delete(key); // keep each deduped tx once
        out.push(p);
      }
    } else if (p.kind === 'billDue' && p.merchant !== 'Bill payment') {
      const k = p.merchant.toLowerCase();
      if (!seenBills.has(k)) {
        seenBills.add(k);
        out.push(p);
      }
    }
  }
  return out;
}
