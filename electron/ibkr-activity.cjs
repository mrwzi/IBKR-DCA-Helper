const crypto = require('crypto');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function number(value) {
  const parsed = Number(String(value ?? '').replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function easternToUtc(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2}),\s*(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  let guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  for (let i = 0; i < 2; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    guess += Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - shown;
  }
  return new Date(guess).toISOString();
}

function parsePeriod(value) {
  const matches = [...String(value || '').matchAll(/([A-Za-z]+) (\d{1,2}), (\d{4})/g)];
  if (matches.length < 2) return {};
  const iso = (m) => new Date(`${m[1]} ${m[2]}, ${m[3]} 12:00:00 UTC`).toISOString().slice(0, 10);
  return { periodStart: iso(matches[0]), periodEnd: iso(matches[1]) };
}

function parseActivityStatement(text) {
  const rows = parseCsv(String(text || '').replace(/^\uFEFF/, ''));
  const headers = new Map();
  const result = { trades: [], positions: [], cash: null, account: null, currency: null };
  let periodStart, periodEnd;
  for (const cells of rows) {
    const [section, kind] = cells;
    if (section === 'Statement' && kind === 'Data' && cells[2] === 'Period') ({ periodStart, periodEnd } = parsePeriod(cells[3]));
    if (section === 'Account Information' && kind === 'Data') {
      const header = headers.get(section);
      if (header) {
        const item = Object.fromEntries(header.map((key, i) => [key, cells[i + 2]]));
        if (item['Field Name'] === 'Account') result.account = item['Field Value'];
        if (item['Field Name'] === 'Base Currency') result.currency = item['Field Value'];
      }
    }
    if (kind === 'Header') { headers.set(section, cells.slice(2)); continue; }
    if (kind !== 'Data') continue;
    const header = headers.get(section);
    if (!header) continue;
    const item = Object.fromEntries(header.map((key, i) => [key, cells[i + 2]]));
    if (section === 'Trades' && item['Asset Category'] === 'Stocks' && item.DataDiscriminator === 'Order') {
      const quantity = number(item.Quantity);
      const price = number(item['T. Price']);
      const commission = Math.abs(number(item['Comm/Fee']) || 0);
      const gross = Math.abs(number(item.Proceeds) || 0);
      if (!item.Symbol || !quantity || quantity <= 0 || !price) continue;
      const boughtAt = easternToUtc(item['Date/Time']);
      const fingerprint = crypto.createHash('sha256').update([item.Symbol, boughtAt, item.Quantity, item['T. Price'], item['Comm/Fee']].join('|')).digest('hex').slice(0, 24);
      result.trades.push({
        ticker: item.Symbol.toUpperCase(), boughtAt, sharesBought: quantity, sharesText: item.Quantity,
        buyPrice: price, buyPriceText: item['T. Price'], grossUsd: gross, commissionUsd: commission,
        allInUsd: Math.abs(number(item.Basis) || gross + commission), brokerTradeId: `activity:${fingerprint}`,
      });
    } else if (section === 'Open Positions' && item['Asset Category'] === 'Stocks') {
      result.positions.push({ ticker: String(item.Symbol || '').toUpperCase(), shares: number(item.Quantity), price: number(item['Close Price']), avgPrice: number(item['Cost Price']), costBasis: Math.abs(number(item['Cost Basis']) || 0) });
    } else if (section === 'Cash Report' && item.Currency === 'CAD' && item['Currency Summary'] === 'Ending Cash') {
      result.cash = number(item.Total);
    }
  }
  if (!periodStart || !periodEnd) throw new Error('This is not a readable IBKR Activity Statement CSV (statement period is missing).');
  // A completed statement may legitimately contain no stock buys (for example,
  // a quiet month) while still carrying ending positions or cash. Keep that
  // statement importable for reconciliation; reject only a file with no
  // recognizable activity data at all.
  if (!result.trades.length && !result.positions.length && result.cash == null) {
    throw new Error('No completed stock buys, ending positions, or CAD cash were found in this statement.');
  }
  return { ...result, periodStart, periodEnd };
}

function close(a, b, tolerance) { return Number.isFinite(+a) && Number.isFinite(+b) && Math.abs(+a - +b) <= tolerance; }

function buildPreview(statement, localRows, usdCadRate = 1, localCashBalanceCAD = null) {
  const unused = new Set(localRows.map((row) => row.id));
  const actions = [];
  for (const trade of statement.trades) {
    const candidates = localRows.filter((row) => unused.has(row.id) && String(row.ticker).toUpperCase() === trade.ticker);
    let match = candidates.find((row) => row.ibkrTradeId === trade.brokerTradeId);
    if (!match) match = candidates.find((row) => Math.abs(new Date(row.boughtAt) - new Date(trade.boughtAt)) <= 2000 && close(row.sharesBought, trade.sharesBought, 1e-8));
    if (!match) match = candidates.find((row) => String(row.boughtAt).slice(0, 10) === trade.boughtAt.slice(0, 10) && close(row.sharesBought, trade.sharesBought, 1e-6));
    if (!match) {
      const scored = candidates.filter((row) => ['screenshot-estimated', 'screenshot', 'manual'].includes(String(row.source || ''))).map((row) => {
        const hours = Math.abs(new Date(row.boughtAt) - new Date(trade.boughtAt)) / 36e5;
        const localGross = row.grossUsd != null && Number.isFinite(Number(row.grossUsd)) ? Number(row.grossUsd) : Number(row.sharesBought) * Number(row.buyPrice);
        const grossDifference = Math.abs(localGross - trade.grossUsd);
        return { row, hours, grossDifference, score: hours + grossDifference * 24 };
      }).filter((item) => item.hours <= 48 && item.grossDifference <= 0.5).sort((a, b) => a.score - b.score);
      if (scored.length === 1 || (scored[0] && scored[1] && scored[1].score - scored[0].score > 2)) match = scored[0]?.row;
    }
    const cadAmount = trade.grossUsd * Number(usdCadRate || 1);
    const feeCAD = trade.commissionUsd * Number(usdCadRate || 1);
    const exact = match && close(match.sharesBought, trade.sharesBought, 1e-8) && close(match.buyPrice, trade.buyPrice, 1e-6) && close(match.grossUsd, trade.grossUsd, 1e-6) && close(match.commissionUsd, trade.commissionUsd, 1e-6);
    const type = !match ? 'added' : exact ? 'unchanged' : 'corrected';
    if (match) unused.delete(match.id);
    actions.push({ type, localId: match?.id || null, ...trade, cadAmount, feeCAD });
  }
  const periodExtras = localRows.filter((row) => unused.has(row.id) && row.boughtAt >= `${statement.periodStart}T00:00:00` && row.boughtAt <= `${statement.periodEnd}T23:59:59.999Z`);
  const review = periodExtras.map((row) => ({ type: 'review', localId: row.id, ticker: row.ticker, boughtAt: row.boughtAt, reason: 'Local trade was not matched to this statement; it will not be deleted.' }));
  const hasLaterLocalTrades = localRows.some((row) => row.boughtAt > `${statement.periodEnd}T23:59:59.999Z`);
  const duplicateFingerprints = statement.trades.length - new Set(statement.trades.map((trade) => trade.brokerTradeId)).size;
  const invalidArithmetic = statement.trades.filter((trade) => !close(trade.allInUsd, trade.grossUsd + trade.commissionUsd, 0.000002)).length;
  const statementCashCAD = statement.cash == null ? null : Number.isFinite(Number(statement.cash)) ? Number(statement.cash) : null;
  const ledgerCashCAD = localCashBalanceCAD == null ? null : Number.isFinite(Number(localCashBalanceCAD)) ? Number(localCashBalanceCAD) : null;
  const cashDifferenceCAD = statementCashCAD == null || ledgerCashCAD == null ? null : statementCashCAD - ledgerCashCAD;
  const cashDetail = statementCashCAD == null
    ? 'No CAD ending cash was included; the existing cash ledger will remain unchanged.'
    : ledgerCashCAD == null
      ? `IBKR ending cash is ${statementCashCAD.toFixed(2)} CAD; it will be reconciled during apply.`
      : Math.abs(cashDifferenceCAD) <= 0.005
        ? `Ledger at period end and IBKR both show ${statementCashCAD.toFixed(2)} CAD.`
        : `Ledger at period end ${ledgerCashCAD.toFixed(2)} CAD → IBKR ${statementCashCAD.toFixed(2)} CAD; a ${cashDifferenceCAD >= 0 ? '+' : ''}${cashDifferenceCAD.toFixed(2)} CAD adjustment will be added.`;
  return {
    statement: { account: statement.account, currency: statement.currency, periodStart: statement.periodStart, periodEnd: statement.periodEnd, tradeCount: statement.trades.length, cash: statement.cash, positions: statement.positions, positionUpdateEligible: !hasLaterLocalTrades, ledgerCashCAD, cashDifferenceCAD },
    actions, review,
    counts: ['unchanged', 'corrected', 'added'].reduce((out, key) => ({ ...out, [key]: actions.filter((a) => a.type === key).length }), { review: periodExtras.length }),
    checks: [
      { label: 'Statement period detected', passed: true, detail: `${statement.periodStart} — ${statement.periodEnd}`, blocking: false },
      { label: 'Completed stock executions parsed', passed: true, detail: statement.trades.length ? `${statement.trades.length} buys` : 'No buys in this period; positions/cash only', blocking: false },
      { label: 'Duplicate execution fingerprints', passed: duplicateFingerprints === 0, detail: duplicateFingerprints === 0 ? 'None' : `${duplicateFingerprints} found`, blocking: true },
      { label: 'USD totals and commissions balance', passed: invalidArithmetic === 0, detail: invalidArithmetic === 0 ? 'All rows balanced' : `${invalidArithmetic} rows differ`, blocking: true },
      { label: 'Available CAD cash reconciled', passed: true, detail: cashDetail, blocking: false },
      { label: 'Every statement execution has a safe action', passed: actions.length === statement.trades.length, detail: `${actions.filter((a) => a.type === 'unchanged').length} unchanged, ${actions.filter((a) => a.type === 'corrected').length} corrected, ${actions.filter((a) => a.type === 'added').length} added`, blocking: false },
      { label: 'Local records needing review', passed: review.length === 0, detail: review.length === 0 ? 'None' : `${review.length} retained unchanged; review after applying`, blocking: false },
      { label: 'Ending IBKR positions checked', passed: statement.positions.length > 0, detail: hasLaterLocalTrades ? `${statement.positions.length} holdings; reference only because newer trades exist` : `${statement.positions.length} holdings; safe to update`, blocking: false },
    ],
  };
}

function validateStatementMode(statement, mode) {
  const start = new Date(`${statement.periodStart}T12:00:00Z`);
  const end = new Date(`${statement.periodEnd}T12:00:00Z`);
  if (mode === 'ytd') {
    if (start.getUTCMonth() !== 0 || start.getUTCDate() !== 1 || start.getUTCFullYear() !== end.getUTCFullYear()) throw new Error(`Year-to-date requires January 1 through a later date in the same year. This file covers ${statement.periodStart} to ${statement.periodEnd}.`);
    return 'Year-to-date';
  }
  if (mode === 'monthly') {
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    if (start.getUTCDate() !== 1 || end.getUTCDate() !== lastDay || start.getUTCMonth() !== end.getUTCMonth() || start.getUTCFullYear() !== end.getUTCFullYear()) throw new Error(`Monthly reconciliation requires a completed full calendar month. This file covers ${statement.periodStart} to ${statement.periodEnd}.`);
    return 'Completed month';
  }
  throw new Error('Choose Monthly or Year-to-date before selecting a statement.');
}

function previousMonthKey(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
}

function reminderDue(history, settings = {}, now = new Date()) {
  const month = previousMonthKey(now);
  // A new installation has no statement history to reconcile yet. Showing a
  // monthly overdue banner before the user has even completed setup is noisy
  // and misleading. The reminder starts only after the first successful IBKR
  // statement import establishes that this is the user's chosen workflow.
  if (!Array.isArray(history) || history.length === 0) return { due: false, month };
  if (now.getDate() < 3 || settings.ibkrReminderDismissedMonth === month) return { due: false, month };
  const [year, mon] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
  const covered = history.some((item) => item.periodStart <= start && item.periodEnd >= end);
  return { due: !covered, month };
}

module.exports = { parseCsv, parseActivityStatement, buildPreview, validateStatementMode, easternToUtc, reminderDue, previousMonthKey };
