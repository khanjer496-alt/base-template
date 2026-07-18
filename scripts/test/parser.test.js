const { parseSms } = require('./build/sms-parser');

let pass = 0, fail = 0;
function t(name, msg, expect) {
  const p = parseSms(msg);
  const errs = [];
  if (expect === null) {
    if (p !== null) errs.push(`expected SKIP, got ${JSON.stringify({m:p.merchant,a:p.amountFils,k:p.kind,t:p.type})}`);
  } else {
    if (!p) errs.push('expected parse, got null');
    else {
      if (expect.merchant !== undefined && p.merchant !== expect.merchant) errs.push(`merchant "${p.merchant}" != "${expect.merchant}"`);
      if (expect.amountFils !== undefined && p.amountFils !== expect.amountFils) errs.push(`amount ${p.amountFils} != ${expect.amountFils}`);
      if (expect.kind !== undefined && p.kind !== expect.kind) errs.push(`kind ${p.kind} != ${expect.kind}`);
      if (expect.type !== undefined && p.type !== expect.type) errs.push(`type ${p.type} != ${expect.type}`);
      if (expect.category !== undefined && p.categoryGuess !== expect.category) errs.push(`cat ${p.categoryGuess} != ${expect.category}`);
      if (expect.date !== undefined && p.date !== expect.date) errs.push(`date ${p.date} != ${expect.date}`);
    }
  }
  if (errs.length) { fail++; console.log(`✗ ${name}\n    ${errs.join('\n    ')}`); }
  else { pass++; console.log(`✓ ${name}`); }
}

// ── The exact failure modes from the user's phone ──
t('merchant stops at "with"',
  'Purchase of AED 50.00 to TABBY with Credit Card ending 1234. Avl limit AED 5,000.00',
  { merchant: 'Tabby', amountFils: 5000, category: 'shopping', type: 'expense' });

t('noon minutes → groceries, stops at with',
  'AED 43.00 was debited for payment to NOON MINUTES with Card no. XX99',
  { merchant: 'Noon Minutes', amountFils: 4300, category: 'groceries' });

t('OTP messages are skipped entirely',
  'Your OTP for a purchase of AED 260.00 at AMAZON.AE is 482910. Do not share this code.',
  null);

t('balance amount is not mistaken for purchase (balance first)',
  'Avl Bal AED 19,053.20. Purchase of AED 190.53 at PLAYSTATION NETWORK on 15/07/2026',
  { merchant: 'Playstation Network', amountFils: 19053, category: 'entertainment' });

t('balance amount skipped when it comes after',
  'Purchase of AED 187.50 with Debit Card ending 1234 at CARREFOUR MALL OF EMIRATES, DUBAI on 17/07/2026. Avl balance AED 12,345.67',
  { merchant: 'Carrefour Mall Of Emirates', amountFils: 18750, date: '2026-07-17' });

// ── Regression coverage ──
t('salary credit, no fake merchant',
  'Salary of AED 18,500.00 has been credited to your account ending 5678',
  { merchant: 'Incoming transfer', type: 'income', amountFils: 1850000, category: 'salary' });

t('salik payment', 'AED 55.00 was debited from your account for payment to SALIK RECHARGE on 16/07/2026',
  { merchant: 'Salik Recharge', category: 'transport', date: '2026-07-16' });

t('bill due detected as reminder not expense',
  'Your DEWA bill of AED 450.00 is due on 25/07/2026. Please pay before the due date.',
  { kind: 'billDue', merchant: 'DEWA', amountFils: 45000, category: 'utilities', date: '2026-07-25' });

t('credit card minimum due is a bill',
  'Statement generated. Total due AED 3,240.00, minimum due AED 162.00 by 05/08/2026',
  { kind: 'billDue', amountFils: 324000 });

t('declined transaction skipped',
  'Your transaction of AED 500.00 at SHARAF DG was declined due to insufficient funds.',
  null);

t('promo message skipped',
  'Get AED 100 cashback offer when you shop now! T&C apply. https://promo.example',
  null);

t('refund is income',
  'Refund of AED 89.00 has been credited to your card from DELIVEROO',
  { type: 'income', amountFils: 8900 });

t('atm withdrawal',
  'AED 1,000.00 withdrawn from your account at ENBD ATM DEIRA on 12/07/2026. Available balance AED 4,210.11',
  { amountFils: 100000, type: 'expense' });

t('acronym kept in titlecase', 'Purchase of AED 30.00 at KFC with card ending 22',
  { merchant: 'KFC', category: 'dining' });

t('random chat message with amount is skipped',
  'Hey can you send me AED 200 for the dinner yesterday?',
  null);

t('careem ride', 'AED 34.50 was charged to your card at CAREEM on 14/07/2026',
  { merchant: 'Careem', category: 'transport' });

// ── v2: card identity, statements, payments, currency, overrides ──
const p1 = parseSms('Purchase of AED 250.00 with Credit Card ending 4821 at IKEA on 10/07/2026');
t('card identity extracted', 'Purchase of AED 250.00 with Credit Card ending 4821 at IKEA on 10/07/2026',
  { merchant: 'Ikea', kind: 'transaction' });
if (p1 && p1.card && p1.card.last4 === '4821' && p1.card.kind === 'credit') { pass++; console.log('✓ card last4 + credit kind'); }
else { fail++; console.log('✗ card last4 + credit kind', JSON.stringify(p1 && p1.card)); }

const p2 = parseSms('AED 90.00 was debited from a/c XX9012 for payment to DEWA');
if (p2 && p2.card && p2.card.last4 === '9012' && p2.card.kind === 'account') { pass++; console.log('✓ account hint extracted'); }
else { fail++; console.log('✗ account hint extracted', JSON.stringify(p2 && p2.card)); }

const stmt = parseSms('Your Credit Card ending 4821 statement is generated. Total due AED 3,240.00, minimum due AED 162.00 by 05/08/2026');
if (stmt && stmt.kind === 'cardStatement' && stmt.amountFils === 324000 && stmt.minDueFils === 16200 && stmt.date === '2026-08-05' && stmt.card.last4 === '4821') {
  pass++; console.log('✓ card statement parsed with min due + date');
} else { fail++; console.log('✗ card statement parsed', JSON.stringify(stmt)); }

const pay = parseSms('Payment of AED 3,240.00 received towards your Credit Card ending 4821. Thank you.');
if (pay && pay.kind === 'cardPayment' && pay.amountFils === 324000 && pay.card.last4 === '4821') {
  pass++; console.log('✓ card payment is a transfer, not spending');
} else { fail++; console.log('✗ card payment', JSON.stringify(pay)); }

t('multi-currency prefers AED in parens',
  'Purchase of USD 9.99 (AED 36.70) at NETFLIX with Credit Card ending 4821',
  { amountFils: 3670, merchant: 'Netflix', category: 'entertainment' });

t('foreign-only currency skipped',
  'Purchase of USD 49.99 at STEAM GAMES with Credit Card ending 4821',
  null);

const ov = parseSms('Purchase of AED 55.00 at MYSTERY VENDOR with card ending 11', { 'mystery vendor': 'health' });
if (ov && ov.categoryGuess === 'health') { pass++; console.log('✓ merchant override applied'); }
else { fail++; console.log('✗ merchant override applied', JSON.stringify(ov && ov.categoryGuess)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
