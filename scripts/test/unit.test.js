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
eq('bill paid status', bills.billsForMonth([mkBill(25, ['2026-07'])], today)[0].status, 'paid');
eq('bill overdue', bills.billsForMonth([mkBill(5)], today)[0].status, 'overdue');
eq('bill due-soon (today)', bills.billsForMonth([mkBill(18)], today)[0].status, 'due-soon');
eq('bill due-soon (5d)', bills.billsForMonth([mkBill(23)], today)[0].status, 'due-soon');
eq('bill upcoming', bills.billsForMonth([mkBill(30)], today)[0].status, 'upcoming');
eq('bill dueDay 31 clamps in Jun', bills.billsForMonth([mkBill(31)], new Date(2026, 5, 15))[0].daysLeft, 15);
ok('bills sorted most urgent first',
  bills.billsForMonth([mkBill(30), mkBill(5), mkBill(20)], today).map(r => r.status).join() === 'overdue,due-soon,upcoming');

// ── detectRecurring ──
const rec = (title, dates, amounts) => dates.map((d, i) => ({
  id: `t${i}`, type: 'expense', amountFils: amounts[i] ?? amounts[0], category: 'other',
  accountId: 'a', title, date: d,
}));
const found = bills.detectRecurring(rec('Netflix', ['2026-05-03', '2026-06-03', '2026-07-03'], [3900]));
ok('recurring detected', found.length === 1 && found[0].title === 'Netflix');
eq('recurring typical day', found[0]?.typicalDay, 3);
ok('variable amounts rejected',
  bills.detectRecurring(rec('Shop', ['2026-05-03', '2026-06-03'], [1000, 5000])).length === 0);
ok('single month rejected',
  bills.detectRecurring(rec('Once', ['2026-07-01', '2026-07-15'], [1000])).length === 0);
ok('habit (many per month) rejected',
  bills.detectRecurring(rec('Coffee', ['2026-06-01','2026-06-05','2026-06-20','2026-07-02','2026-07-09'], [2000])).length === 0);

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
