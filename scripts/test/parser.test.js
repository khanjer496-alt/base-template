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


// ── transfer hints: bank-side card payments are not spending ──
const bankLeg = parseSms('AED 3,240.00 was debited from your a/c XX9012 towards your Credit Card ending 4821');
if (bankLeg && bankLeg.kind === 'transaction' && bankLeg.transferHint === true) { pass++; console.log('✓ bank-side card payment flagged as transfer'); }
else { fail++; console.log('✗ bank-side card payment flagged as transfer', JSON.stringify(bankLeg && {k: bankLeg.kind, t: bankLeg.transferHint})); }

const ownTransfer = parseSms('AED 5,000.00 was debited from your account for own account transfer');
if (ownTransfer && ownTransfer.transferHint === true) { pass++; console.log('✓ own-account transfer flagged'); }
else { fail++; console.log('✗ own-account transfer flagged', JSON.stringify(ownTransfer)); }

const normalSpend = parseSms('Purchase of AED 187.50 with Debit Card ending 1234 at CARREFOUR on 17/07/2026');
if (normalSpend && normalSpend.transferHint === false) { pass++; console.log('✓ normal purchase not flagged as transfer'); }
else { fail++; console.log('✗ normal purchase not flagged as transfer'); }

// ── masked PANs and "has been paid" settlements (real-device formats) ──
const maskedPaid = parseSms('Your Credit Card 4782********4499 Has Been Paid AED 10,700.00. Thank you for banking with us.');
if (maskedPaid && maskedPaid.kind === 'cardPayment' && maskedPaid.card && maskedPaid.card.last4 === '4499' && maskedPaid.transferHint === true) {
  pass++; console.log('✓ masked-PAN "has been paid" is a card payment');
} else { fail++; console.log('✗ masked-PAN "has been paid" is a card payment', JSON.stringify(maskedPaid && { k: maskedPaid.kind, c: maskedPaid.card, m: maskedPaid.merchant })); }

const maskedPaid2 = parseSms('Payment of AED 7,663.00 has been received on your Credit Card 5492********3749.');
if (maskedPaid2 && maskedPaid2.kind === 'cardPayment' && maskedPaid2.card && maskedPaid2.card.last4 === '3749') {
  pass++; console.log('✓ masked-PAN payment-received keeps the LAST four digits');
} else { fail++; console.log('✗ masked-PAN payment-received keeps the LAST four digits', JSON.stringify(maskedPaid2 && maskedPaid2.card)); }

const maskedDebit = parseSms('AED 10,700.00 debited from your a/c XX9012 towards Credit Card 4782********4499 payment.');
if (maskedDebit && maskedDebit.transferHint === true && !/[*Xx]{2,}/.test(maskedDebit.merchant)) {
  pass++; console.log('✓ debit leg toward a masked card is a transfer, PAN never a merchant');
} else { fail++; console.log('✗ debit leg toward a masked card is a transfer, PAN never a merchant', JSON.stringify(maskedDebit && { t: maskedDebit.transferHint, m: maskedDebit.merchant })); }

const unknownDebit = parseSms('AED 250.00 was debited from your account XX9012 on 12/07/2026.');
if (unknownDebit && unknownDebit.merchant === 'Card purchase' && unknownDebit.transferHint === false) {
  pass++; console.log('✓ unknown-merchant debit titled Card purchase, not Card payment');
} else { fail++; console.log('✗ unknown-merchant debit titled Card purchase', JSON.stringify(unknownDebit && { m: unknownDebit.merchant, t: unknownDebit.transferHint })); }

// ── amount sanity + credit-card forcing ──
const absurd = parseSms('AED 100,181,428,624.00 was debited from your account XX9012.');
if (absurd === null) { pass++; console.log('✓ absurd amount (> AED 1M) rejected'); }
else { fail++; console.log('✗ absurd amount rejected', JSON.stringify(absurd.amountFils)); }

const bigButReal = parseSms('AED 550,000.00 was debited from your a/c XX9012 at EMAAR PROPERTIES.');
if (bigButReal && bigButReal.amountFils === 55000000) { pass++; console.log('✓ large-but-plausible amount kept'); }
else { fail++; console.log('✗ large-but-plausible amount kept', JSON.stringify(bigButReal && bigButReal.amountFils)); }

const stmtKind = parseSms('Statement generated. Total due AED 3,240.00, minimum due AED 162.00 by 05/08/2026 on your card ending 8573');
if (stmtKind && stmtKind.kind === 'cardStatement' && stmtKind.card && stmtKind.card.kind === 'credit') {
  pass++; console.log('✓ statement forces credit-card identity');
} else { fail++; console.log('✗ statement forces credit-card identity', JSON.stringify(stmtKind && stmtKind.card)); }

// ── income is never a spending category; senders extracted after "from" ──
const payout = parseSms('AED 776.00 has been credited to your account XX0004 from TALABAT MIDDLE EAST');
if (payout && payout.type === 'income' && payout.merchant === 'Talabat Middle East' && payout.categoryGuess === 'business') {
  pass++; console.log('✓ Talabat payout is business income with sender name');
} else { fail++; console.log('✗ Talabat payout is business income with sender name', JSON.stringify(payout && { m: payout.merchant, c: payout.categoryGuess, t: payout.type })); }

const salaryStill = parseSms('Salary of AED 18,500.00 has been credited to your account ending 5678');
if (salaryStill && salaryStill.categoryGuess === 'salary') { pass++; console.log('✓ salary keyword still wins for income'); }
else { fail++; console.log('✗ salary keyword still wins for income', JSON.stringify(salaryStill && salaryStill.categoryGuess)); }

const spendStill = parseSms('Purchase of AED 55.00 at TALABAT with Debit Card ending 1234');
if (spendStill && spendStill.type === 'expense' && spendStill.categoryGuess === 'dining') {
  pass++; console.log('✓ Talabat spending still categorized dining');
} else { fail++; console.log('✗ Talabat spending still categorized dining', JSON.stringify(spendStill && spendStill.categoryGuess)); }

// ── comprehensive sweep: suffix amounts, ATM, fees, deposits, categories ──
t('amount BEFORE currency parses',
  'Your account XX9012 has been debited with 1,234.56 AED at CARREFOUR MALL OF EMIRATES on 15/07/2026',
  { amountFils: 123456, merchant: 'Carrefour Mall Of Emirates', category: 'groceries' });

const sfxBal = parseSms('Your a/c XX9012 is debited with 250.00 AED. Avl bal 12,500.00 AED');
if (sfxBal && sfxBal.amountFils === 25000) { pass++; console.log('✓ suffix amount skips suffix balance'); }
else { fail++; console.log('✗ suffix amount skips suffix balance', JSON.stringify(sfxBal && sfxBal.amountFils)); }

const atm = parseSms('AED 500.00 cash withdrawal from ATM at ENBD BRANCH DEIRA. Avl Bal AED 8,200.00');
if (atm && atm.merchant === 'ATM withdrawal' && atm.type === 'expense') { pass++; console.log('✓ ATM withdrawal titled correctly'); }
else { fail++; console.log('✗ ATM withdrawal titled correctly', JSON.stringify(atm && atm.merchant)); }

const fee = parseSms('Your card ending 1234 has been charged AED 262.50 as annual fee.');
if (fee && fee.merchant === 'Bank fee') { pass++; console.log('✓ bank fee titled correctly'); }
else { fail++; console.log('✗ bank fee titled correctly', JSON.stringify(fee && fee.merchant)); }

const dep = parseSms('AED 3,000.00 deposited into your account XX0002 via CDM.');
if (dep && dep.type === 'income' && dep.merchant === 'Cash deposit') { pass++; console.log('✓ cash deposit titled correctly'); }
else { fail++; console.log('✗ cash deposit titled correctly', JSON.stringify(dep && { m: dep.merchant, t: dep.type })); }

t('Emarat fuel is transport',
  'Purchase of AED 120.00 at EMARAT 1049 with Debit Card ending 1234',
  { category: 'transport' });

t('Empower is utilities',
  'Payment of AED 890.00 to EMPOWER with Debit Card ending 1234',
  { category: 'utilities' });

const noonCom = parseSms('Purchase of AED 55.00 at NOON COM with Credit Card ending 4821');
if (noonCom && noonCom.merchant === 'Noon') { pass++; console.log('✓ NOON COM normalizes to Noon'); }
else { fail++; console.log('✗ NOON COM normalizes to Noon', JSON.stringify(noonCom && noonCom.merchant)); }

const insur = parseSms('Purchase of AED 2,400.00 at SUKOON INSURANCE with Credit Card ending 4821');
if (insur && insur.categoryGuess === 'health') { pass++; console.log('✓ insurance categorized health'); }
else { fail++; console.log('✗ insurance categorized health', JSON.stringify(insur && insur.categoryGuess)); }

const remit = parseSms('Inward remittance of 5,000.00 AED has been credited to your account XX0002.');
if (remit && remit.type === 'income' && remit.transferHint === true && remit.merchant === 'Inward remittance') {
  pass++; console.log('✓ inward remittance is a transfer, not income');
} else { fail++; console.log('✗ inward remittance is a transfer, not income', JSON.stringify(remit && { t: remit.type, h: remit.transferHint, m: remit.merchant })); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
