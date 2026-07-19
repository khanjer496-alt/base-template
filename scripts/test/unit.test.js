const fmt = require('./build/format');
const bills = require('./build/bills');
const insights = require('./build/insights');
const seed = require('./build/seed');

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}\n    got ${a}\n    want ${e}`); }
}
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name} ${detail}`); }
}

// ── format ──
eq('formatAED with cents', fmt.formatAED(123456), 'AED 1,234.56');
eq('formatAED whole drops decimals', fmt.formatAED(120000), 'AED 1,200');
eq('formatAED forced no decimals rounds', fmt.formatAED(123456, { decimals: false }), 'AED 1,234');
eq('formatAED negative', fmt.formatAED(-50000), 'AED -500');
eq('formatAED millions grouping', fmt.formatAED(123456789), 'AED 1,234,567.89');
eq('parseAmountToFils decimal', fmt.parseAmountToFils('12.5'), 1250);
eq('parseAmountToFils with junk chars', fmt.parseAmountToFils('AED 1,234.56'), 123456);
eq('parseAmountToFils invalid', fmt.parseAmountToFils('abc'), null);
eq('parseAmountToFils zero', fmt.parseAmountToFils('0'), null);
eq('monthKey', fmt.monthKey('2026-07-18'), '2026-07');
eq('shiftMonthKey back over year', fmt.shiftMonthKey('2026-01', -1), '2025-12');
eq('shiftMonthKey forward', fmt.shiftMonthKey('2026-12', 1), '2027-01');
eq('daysInMonth feb non-leap', fmt.daysInMonth('2026-02'), 28);
eq('daysInMonth feb leap', fmt.daysInMonth('2028-02'), 29);
eq('shortDate', fmt.shortDate('2026-07-05'), '5 Jul');
eq('friendlyDate today', fmt.friendlyDate('2026-07-18', '2026-07-18'), 'Today');
eq('friendlyDate yesterday', fmt.friendlyDate('2026-07-17', '2026-07-18'), 'Yesterday');
eq('monthLabel short', fmt.monthLabel('2026-07', true), 'Jul 2026');

// ── bills ──
const today = new Date(2026, 6, 18); // 18 Jul 2026
const mkBill = (dueDay, paid = []) => ({ id: 'b', title: 'T', category: 'other', amountFils: 100, dueDay, paidMonths: paid });
eq('bill paid status', bills.billsForMonth([mkBill(25, ['2026-07'])], [], today)[0].status, 'paid');
eq('bill overdue', bills.billsForMonth([mkBill(5)], [], today)[0].status, 'overdue');
eq('bill due-soon (today)', bills.billsForMonth([mkBill(18)], [], today)[0].status, 'due-soon');
eq('bill due-soon (5d)', bills.billsForMonth([mkBill(23)], [], today)[0].status, 'due-soon');
eq('bill upcoming', bills.billsForMonth([mkBill(30)], [], today)[0].status, 'upcoming');
eq('bill dueDay 31 clamps in Jun', bills.billsForMonth([mkBill(31)], [], new Date(2026, 5, 15))[0].daysLeft, 15);
ok('bills sorted most urgent first',
  bills.billsForMonth([mkBill(30), mkBill(5), mkBill(20)], [], today).map(r => r.status).join() === 'overdue,due-soon,upcoming');

// ── insights ──
const txs = [
  { id: '1', type: 'income', amountFils: 1000000, category: 'salary', accountId: 'a', title: 'Salary', date: '2026-07-01' },
  { id: '2', type: 'expense', amountFils: 300000, category: 'groceries', accountId: 'a', title: 'Carrefour', date: '2026-07-05' },
  { id: '3', type: 'expense', amountFils: 100000, category: 'dining', accountId: 'a', title: 'Talabat', date: '2026-07-10' },
];
const sum = insights.summarizeMonth(txs, '2026-07');
eq('summarize income', sum.incomeFils, 1000000);
eq('summarize expense', sum.expenseFils, 400000);
eq('summarize top category', sum.byCategory[0].category, 'groceries');
ok('summarize share', Math.abs(sum.byCategory[0].share - 0.75) < 1e-9);
eq('other month empty', insights.summarizeMonth(txs, '2026-06').expenseFils, 0);

const ins = insights.buildInsights(txs, [{ category: 'groceries', limitFils: 250000 }], '2026-07', new Date(2026, 6, 18));
ok('budget-over insight fires', ins.some(i => i.id === 'budget-over-groceries'));
ok('savings insight fires', ins.some(i => i.id === 'savings'));
ok('warnings ranked before neutral',
  ins.findIndex(i => i.tone === 'warning') < ins.findIndex(i => i.tone === 'neutral'));

eq('spentInMonthForCategory', insights.spentInMonthForCategory(txs, '2026-07', 'dining'), 100000);

// ── seed ──
const now = new Date(2026, 6, 18);
const s1 = seed.generateSeedTransactions(now);
const s2 = seed.generateSeedTransactions(now);
ok('seed deterministic', JSON.stringify(s1) === JSON.stringify(s2));
ok('seed sorted desc', s1.every((t, i) => i === 0 || s1[i - 1].date >= t.date));
ok('seed has salary each month', s1.filter(t => t.title === 'Salary').length === 4);
ok('seed no future dates', s1.every(t => t.date <= '2026-07-18'));
ok('seed reasonable volume', s1.length > 100 && s1.length < 400, `len=${s1.length}`);


// ── subscriptions (v2) ──
const subsLib = require('./build/subscriptions');
const subTx = (title, date, fils, cat = 'entertainment') => ({
  id: `${title}-${date}`, type: 'expense', amountFils: fils, category: cat,
  accountId: 'a', title, date,
});

const netflix = subsLib.detectSubscriptions([
  subTx('Netflix', '2026-04-03', 3900),
  subTx('Netflix', '2026-05-03', 3900),
  subTx('Netflix', '2026-06-03', 3900),
  subTx('Netflix', '2026-07-03', 4500),
]);
ok('subscription: monthly cadence detected', netflix.length === 1 && netflix[0].cadence === 'monthly');
ok('subscription: price increase flagged', netflix[0]?.priceIncreased === true);
eq('subscription: next expected ~30d later', netflix[0]?.nextExpectedISO, '2026-08-02');

const weekly = subsLib.detectSubscriptions([
  subTx('Padel Court', '2026-06-05', 8000, 'health'),
  subTx('Padel Court', '2026-06-12', 8000, 'health'),
  subTx('Padel Court', '2026-06-19', 8000, 'health'),
]);
ok('subscription: weekly cadence detected', weekly.length === 1 && weekly[0].cadence === 'weekly');
ok('subscription: weekly monthly-equivalent ~4.33x',
  Math.abs(weekly[0].monthlyEquivalentFils - Math.round(8000 * 4.33)) <= 1);

ok('subscription: known merchant needs only one interval',
  subsLib.detectSubscriptions([
    subTx('Spotify', '2026-06-10', 2100),
    subTx('Spotify', '2026-07-10', 2100),
  ]).length === 1);

ok('subscription: irregular merchant rejected',
  subsLib.detectSubscriptions([
    subTx('Random Shop', '2026-06-01', 5000, 'shopping'),
    subTx('Random Shop', '2026-06-11', 9000, 'shopping'),
    subTx('Random Shop', '2026-07-29', 2000, 'shopping'),
  ]).length === 0);

// ── recurring group classification ──
const rentSubs = subsLib.detectSubscriptions([
  subTx('Apartment Rent', '2026-05-01', 550000, 'rent'),
  subTx('Apartment Rent', '2026-06-01', 550000, 'rent'),
  subTx('Apartment Rent', '2026-07-01', 550000, 'rent'),
  subTx('DEWA Bill', '2026-05-25', 45000, 'utilities'),
  subTx('DEWA Bill', '2026-06-25', 46000, 'utilities'),
  subTx('DEWA Bill', '2026-07-25', 45500, 'utilities'),
  subTx('Netflix', '2026-06-03', 3900),
  subTx('Netflix', '2026-07-03', 3900),
]);
ok('groups: rent classified as housing', rentSubs.find(s => s.title === 'Apartment Rent')?.group === 'housing');
ok('groups: DEWA classified as utility', rentSubs.find(s => s.title === 'DEWA Bill')?.group === 'utility');
ok('groups: Netflix stays a subscription', rentSubs.find(s => s.title === 'Netflix')?.group === 'subscription');
ok('groups: trueSubscriptions excludes rent/utilities',
  subsLib.trueSubscriptions(rentSubs).length === 1 && subsLib.trueSubscriptions(rentSubs)[0].title === 'Netflix');

// Recurring payments in non-subscription categories are commitments, not subscriptions
const supplier = subsLib.detectSubscriptions([
  subTx('Fishbasket', '2026-05-03', 1070000, 'business'),
  subTx('Fishbasket', '2026-06-03', 1070000, 'business'),
  subTx('Fishbasket', '2026-07-03', 1070000, 'business'),
  subTx('Maid Salary', '2026-05-28', 250000, 'other'),
  subTx('Maid Salary', '2026-06-28', 250000, 'other'),
  subTx('Maid Salary', '2026-07-28', 250000, 'other'),
]);
ok('groups: business supplier is a commitment, not a subscription',
  supplier.find(s => s.title === 'Fishbasket')?.group === 'commitment');
ok('groups: recurring other-category payment is a commitment',
  supplier.find(s => s.title === 'Maid Salary')?.group === 'commitment');
ok('groups: commitments never count in trueSubscriptions',
  subsLib.trueSubscriptions(supplier).length === 0);
ok('groups: commitments listed under fixedCommitments',
  subsLib.fixedCommitments(supplier).length === 2);

// User dismissals remove a merchant from detection everywhere
const dismissed = subsLib.detectSubscriptions(
  [
    subTx('Netflix', '2026-06-03', 3900),
    subTx('Netflix', '2026-07-03', 3900),
    subTx('Spotify', '2026-06-10', 2100),
    subTx('Spotify', '2026-07-10', 2100),
  ],
  ['netflix'],
);
ok('dismiss: not-a-subscription merchant skipped',
  dismissed.length === 1 && dismissed[0].title === 'Spotify');

// Lapse detection: silence past ~2 cycles marks a subscription stopped
const lapsedRef = new Date(2026, 6, 19); // 19 Jul 2026
const lapsed = subsLib.detectSubscriptions(
  [
    subTx('Netflix', '2026-02-03', 3900),
    subTx('Netflix', '2026-03-03', 3900),
    subTx('Netflix', '2026-04-03', 3900), // silent since April
    subTx('Spotify', '2026-06-10', 2100),
    subTx('Spotify', '2026-07-10', 2100), // still charging
  ],
  [],
  lapsedRef,
);
ok('lapse: silent-for-months subscription marked stopped',
  lapsed.find(s => s.title === 'Netflix')?.status === 'stopped');
ok('lapse: recently charged subscription stays active',
  lapsed.find(s => s.title === 'Spotify')?.status === 'active');
ok('lapse: stopped subscriptions cost nothing in the monthly total',
  subsLib.subscriptionsMonthlyTotal(lapsed) === 2100);
ok('lapse: helper splits active and stopped',
  subsLib.activeSubscriptions(lapsed).length === 1 && subsLib.stoppedSubscriptions(lapsed).length === 1);

// Canonical names make variant descriptors group as ONE subscription
const gpt = subsLib.detectSubscriptions([
  subTx('ChatGPT', '2026-05-03', 7341),
  subTx('ChatGPT', '2026-06-03', 7341),
  subTx('ChatGPT', '2026-07-03', 7341),
  subTx('Real-Debrid', '2026-06-14', 1650),
  subTx('Real-Debrid', '2026-07-14', 1650),
  subTx('Claude', '2026-06-20', 7341),
  subTx('Claude', '2026-07-20', 7341),
]);
ok('online services detected as subscriptions',
  gpt.length === 3 && gpt.every(s => s.group === 'subscription'));
ok('ChatGPT cadence and next date known',
  gpt.find(s => s.title === 'ChatGPT')?.cadence === 'monthly' &&
  gpt.find(s => s.title === 'ChatGPT')?.nextExpectedISO === '2026-08-02');
ok('groups: fixedCommitments has rent + DEWA', subsLib.fixedCommitments(rentSubs).length === 2);

// ── bill auto-reconciliation ──
const dewaBill = { id: 'b-dewa', title: 'DEWA Bill', category: 'utilities', amountFils: 45000, dueDay: 25, paidMonths: [] };
const dewaTx = [{ id: 'x1', type: 'expense', amountFils: 45500, category: 'utilities', accountId: 'a', title: 'DEWA', date: '2026-07-12', source: 'sms' }];
const recon1 = bills.billsForMonth([dewaBill], dewaTx, new Date(2026, 6, 18))[0];
ok('reconcile: imported DEWA debit marks bill paid', recon1.status === 'paid' && recon1.autoReconciled === true);
const wrongAmount = [{ ...dewaTx[0], amountFils: 90000 }];
ok('reconcile: amount outside ±15% does not match',
  bills.billsForMonth([dewaBill], wrongAmount, new Date(2026, 6, 18))[0].status !== 'paid');
const wrongMonth = [{ ...dewaTx[0], date: '2026-06-12' }];
ok('reconcile: other month does not match',
  bills.billsForMonth([dewaBill], wrongMonth, new Date(2026, 6, 18))[0].status !== 'paid');
const transferTx = [{ ...dewaTx[0], isTransfer: true }];
ok('reconcile: transfers never match bills',
  bills.billsForMonth([dewaBill], transferTx, new Date(2026, 6, 18))[0].status !== 'paid');

// ── cards & dues (v2) ──
const cardsLib = require('./build/cards');
const dueState = {
  accounts: [{ id: 'card1', name: 'Credit Card', kind: 'card', cardType: 'credit', openingFils: 0, color: '#fff' }],
  transactions: [],
  cardDues: [],
};
const due = { id: 'd1', accountId: 'card1', totalDueFils: 324000, minDueFils: 16200, dueDate: '2026-07-25', paidFils: 0 };

const ds1 = cardsLib.dueWithStatus(dueState, due, new Date(2026, 6, 18));
ok('due: upcoming 7d out', ds1.status === 'upcoming' && ds1.daysLeft === 7 && ds1.remainingFils === 324000);
ok('due: below minimum flagged', ds1.belowMinimum === true);

const ds2 = cardsLib.dueWithStatus(dueState, due, new Date(2026, 6, 23));
ok('due: urgent within 3d', ds2.status === 'urgent');

const ds3 = cardsLib.dueWithStatus(dueState, due, new Date(2026, 6, 28));
ok('due: overdue after date', ds3.status === 'overdue' && ds3.daysLeft === -3);

const paidState = {
  ...dueState,
  transactions: [{ id: 'p1', type: 'income', amountFils: 324000, category: 'other', accountId: 'card1', title: 'Card payment', date: '2026-07-20', isTransfer: true }],
};
const ds4 = cardsLib.dueWithStatus(paidState, due, new Date(2026, 6, 21));
ok('due: transfer payment settles it', ds4.status === 'settled' && ds4.remainingFils === 0);

const partialState = {
  ...dueState,
  transactions: [{ id: 'p2', type: 'income', amountFils: 100000, category: 'other', accountId: 'card1', title: 'Card payment', date: '2026-07-20', isTransfer: true }],
};
const ds5 = cardsLib.dueWithStatus(partialState, due, new Date(2026, 6, 21));
ok('due: partial payment reduces remaining', ds5.remainingFils === 224000 && ds5.status !== 'settled');
ok('due: partial above minimum clears flag', ds5.belowMinimum === false);

// ── analytics (v2) ──
const an = require('./build/analytics');
const aTx = [
  { id: '1', type: 'expense', amountFils: 50000, category: 'dining', accountId: 'a', title: 'Talabat', date: '2026-07-04' },
  { id: '2', type: 'expense', amountFils: 30000, category: 'dining', accountId: 'a', title: 'Talabat', date: '2026-07-11' },
  { id: '3', type: 'expense', amountFils: 20000, category: 'groceries', accountId: 'a', title: 'Carrefour', date: '2026-07-05' },
  { id: '4', type: 'expense', amountFils: 90000, category: 'dining', accountId: 'a', title: 'Talabat', date: '2026-06-10' },
  { id: '5', type: 'income', amountFils: 999, category: 'other', accountId: 'a', title: 'Pay', date: '2026-07-01', isTransfer: true },
];
const tm = an.topMerchants(aTx, '2026-07');
ok('analytics: top merchant aggregated', tm[0].title === 'Talabat' && tm[0].totalFils === 80000 && tm[0].count === 2);
const mv = an.categoryMovers(aTx, '2026-07');
ok('analytics: dining moved down vs June', mv.some(m => m.category === 'dining' && m.deltaFils === -10000));
const dw = an.dayOfWeekSpend(aTx, '2026-07');
ok('analytics: transfers excluded from weekday spend', dw.reduce((a, b) => a + b, 0) === 100000);

// ── period model ──
const per = require('./build/period');
const pTx = [
  { id: 'q1', type: 'expense', amountFils: 10000, category: 'dining', accountId: 'a', title: 'A', date: '2025-11-20' },
  { id: 'q2', type: 'expense', amountFils: 20000, category: 'dining', accountId: 'a', title: 'B', date: '2026-03-05' },
];
ok('period: string coerces to month', per.toPeriod('2026-07').mode === 'month');
ok('period: inPeriod month', per.inPeriod('2026-07-15', '2026-07') && !per.inPeriod('2026-06-30', '2026-07'));
ok('period: inPeriod year', per.inPeriod('2026-01-01', { mode: 'year', year: 2026 }) && !per.inPeriod('2025-12-31', { mode: 'year', year: 2026 }));
ok('period: inPeriod range inclusive', per.inPeriod('2026-07-01', { mode: 'range', from: '2026-07-01', to: '2026-07-10' }) && per.inPeriod('2026-07-10', { mode: 'range', from: '2026-07-01', to: '2026-07-10' }) && !per.inPeriod('2026-07-11', { mode: 'range', from: '2026-07-01', to: '2026-07-10' }));
ok('period: inPeriod all', per.inPeriod('1999-01-01', { mode: 'all' }));

ok('period: previous month wraps year', per.previousPeriod('2026-01').key === '2025-12');
ok('period: previous year', per.previousPeriod({ mode: 'year', year: 2026 }).year === 2025);
const prevRange = per.previousPeriod({ mode: 'range', from: '2026-07-11', to: '2026-07-20' });
ok('period: previous range equal length', prevRange.from === '2026-07-01' && prevRange.to === '2026-07-10');
ok('period: all has no previous', per.previousPeriod({ mode: 'all' }) === null);

const pNow = new Date(2026, 6, 18); // 18 Jul 2026
ok('period: current month detected', per.isCurrentMonth('2026-07', pNow) && !per.isCurrentMonth('2026-06', pNow));
ok('period: elapsed days current month', per.elapsedDays('2026-07', pNow, []) === 18);
ok('period: elapsed days past month is full', per.elapsedDays('2026-06', pNow, []) === 30);
ok('period: elapsed days future month is zero', per.elapsedDays('2026-08', pNow, []) === 0);
ok('period: elapsed days current year', per.elapsedDays({ mode: 'year', year: 2026 }, pNow, []) === 199);
ok('period: elapsed days range clamps at today', per.elapsedDays({ mode: 'range', from: '2026-07-10', to: '2026-07-31' }, pNow, []) === 9);
ok('period: elapsed days all from earliest tx', per.elapsedDays({ mode: 'all' }, pNow, pTx) === 241);

ok('period: end of past month', per.periodEndISO('2026-06', pNow) === '2026-06-30');
ok('period: end of current month clamps to today', per.periodEndISO('2026-07', pNow) === '2026-07-18');
ok('period: end of past year', per.periodEndISO({ mode: 'year', year: 2025 }, pNow) === '2025-12-31');
ok('period: end of range', per.periodEndISO({ mode: 'range', from: '2026-05-01', to: '2026-05-20' }, pNow) === '2026-05-20');
ok('period: label month', per.periodLabel('2026-07').length > 0);

// summarize + movers accept Period objects
const yearSum = insights.summarizeMonth(aTx, { mode: 'year', year: 2026 });
ok('period: year summary aggregates all months', yearSum.expenseFils === 190000);
const allSum = insights.summarizeMonth(aTx, { mode: 'all' });
ok('period: all-time summary equals year here', allSum.expenseFils === 190000);
ok('period: movers empty for all-time', an.categoryMovers(aTx, { mode: 'all' }).length === 0);
const rangeTop = an.topMerchants(aTx, { mode: 'range', from: '2026-07-01', to: '2026-07-05' });
ok('period: range-scoped top merchants', rangeTop[0].totalFils === 50000 && rangeTop.length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
