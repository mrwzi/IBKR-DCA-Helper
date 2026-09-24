export const emptyForm = {
  id: null,
  ticker: '',
  name: '',
  priceSymbol: '',
  currency: 'USD',
  targetPercent: '',
  sharesOwned: '',
  manualPriceOverride: '',
  manualPreviousCloseOverride: '',
  buySizeOverrideShares: '',
  ibkrSymbol: '',
  ibkrSecType: 'STK',
  ibkrExchange: 'SMART',
  ibkrCurrency: 'USD',
  ibkrPrimaryExchange: '',
  ibkrPositionShares: '',
  ibkrAvgPrice: '',
  ibkrCostBasis: '',
  enabled: true,
};

export const emptyBuyForm = {
  id: null,
  mode: 'shares',
  holdingId: '',
  ticker: '',
  companyName: '',
  sharesBought: '',
  cashPaidAmount: '',
  cashPaidCurrency: 'USD',
  buyPrice: '',
  priceCurrency: 'USD',
  feeAmount: '',
  feeCurrency: 'CAD',
  brokerTradeId: '',
  totalAmount: '',
  boughtAt: '',
  note: '',
};

export function money(value) {
  return value == null ? '-' : `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function percent(value) {
  return value == null ? '-' : `${Number(value).toFixed(2)}%`;
}

export function shares(value) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return Number(Number(value).toFixed(6)).toString();
}

export function fixedShares(value, digits = 4) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return Number(value).toFixed(digits);
}

export function usdCommission(value) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return `$${Number(value).toFixed(8)} USD`;
}

export function formatDate(value) {
  if (!value || value === '0') return 'Never';
  return new Date(value).toLocaleString('en-CA', { timeZone: 'America/Toronto' });
}

export function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return `${year}-${month}-${day}`;
}

export const NON_INVESTMENT_TICKERS = new Set(['CASH', 'USD', 'USD.CAD', 'FXCONV']);

export function isInvestmentBuyLogRow(row) {
  const ticker = String(row?.ticker || '').trim().toUpperCase();
  return Boolean(ticker) && !NON_INVESTMENT_TICKERS.has(ticker);
}

export function addDaysToDateKey(key, days) {
  const [year, month, day] = String(key || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function buildBuyCalendarDays(monthDate, buyLog = []) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - mondayOffset);

  const buysByDate = new Map();
  for (const buy of buyLog.filter(isInvestmentBuyLogRow)) {
    const key = dateKey(buy.boughtAt);
    if (!key) continue;
    if (!buysByDate.has(key)) buysByDate.set(key, []);
    buysByDate.get(key).push(buy);
  }

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dateKey(date);
    const buys = [...(buysByDate.get(key) || [])].sort((a, b) => new Date(a.boughtAt) - new Date(b.boughtAt));
    return {
      key,
      date,
      inMonth: date.getMonth() === monthDate.getMonth(),
      isToday: key === dateKey(new Date()),
      buys,
      totalCAD: buys.reduce((sum, buy) => sum + Number(buy.totalCadCost || 0), 0),
    };
  });
}

export function isManualRow(row) {
  return row.priceSource === 'manual' || row.priceSource === 'manual-ibkr';
}

export function isUntrustedRow(row) {
  return Boolean(row.isStale && !isManualRow(row));
}

export function formatSource(row) {
  if (isManualRow(row)) return 'Manual / IBKR';
  if (row.priceSource === 'manual-last') return 'Manual last / Yahoo previous close';
  return row.dataSource || 'Yahoo';
}

export function formatCadCostStatus(row) {
  if (row.cadCostStatus === 'exact') return 'Exact';
  if (row.cadCostStatus === 'estimated') return 'Estimated';
  return 'Unavailable';
}

export function buySourceLabel(row) {
  if (row.source === 'ibkr') return 'IBKR';
  if (row.source === 'ibkr-activity') return 'IBKR statement';
  if (row.source === 'screenshot-estimated') return 'Screenshot estimate';
  if (row.source === 'screenshot') return 'Screenshot';
  return 'Manual';
}

export function sourceBadgeClass(row) {
  if (row.source === 'ibkr' || row.source === 'ibkr-activity') return 'badge buy';
  if (row.source === 'screenshot' || row.source === 'screenshot-estimated') return 'badge manual';
  return 'badge wait';
}

export function formatStatus(row) {
  const stale = row.isStale && !isManualRow(row);
  return <span className={`badge ${stale ? 'skip' : row.action.toLowerCase()}`}>{stale ? `${row.action} - Stale` : row.action}</span>;
}

export function formatTodayStatus(row, sinceLastBuy, boughtToday) {
  if (boughtToday) return <span className="badge bought">BOUGHT</span>;
  const hasLastBuyPercent = sinceLastBuy?.percent != null;
  if (row.action === 'BUY' && hasLastBuyPercent && Number(sinceLastBuy.percent) > -2) {
    return <span className="badge wait">WAIT</span>;
  }
  return formatStatus(row);
}

export function formatShortReason(row) {
  if (row.isStale && !isManualRow(row)) return 'Stale data';
  if (row.changePercent != null && Number(row.changePercent) >= 0) return 'Not down today';
  if (row.dipStrength === 'Near meaningful dip') return 'Near meaningful dip';
  if (row.dipStrength === 'Normal move') return 'Normal move';
  if (row.dipStrength === 'Meaningful dip') return 'Meaningful dip';
  if (row.dipStrength === 'Strong dip') return 'Strong dip';
  if (row.dipStrength === 'Huge dip') return 'Huge dip';
  if (String(row.reason || '').includes('Normal move unavailable')) return 'Fixed fallback rules';
  return row.reason || '-';
}

export function formatLastPrice(row) {
  if (isUntrustedRow(row)) return <span className="staleText">Stale: {money(row.lastPrice)}</span>;
  return money(row.lastPrice);
}

export function formatChange(row) {
  if (isUntrustedRow(row)) return <span className="staleText">Not trusted</span>;
  const changeDollar =
    row.lastPrice == null || row.previousClose == null ? null : Number(row.lastPrice) - Number(row.previousClose);
  return `${money(changeDollar)} / ${percent(row.changePercent)}`;
}

export function deriveBrokerPreviousClose({ lastPrice, previousClose, changeDollar, changePercent }) {
  const last = numberOrNull(lastPrice);
  const previous = numberOrNull(previousClose);
  const dollar = numberOrNull(changeDollar);
  const percentValue = numberOrNull(changePercent);

  if (previous != null && previous > 0) return previous;
  if (last == null || last <= 0) return null;
  if (dollar != null) {
    const derived = last - dollar;
    return derived > 0 ? derived : null;
  }
  if (percentValue != null && percentValue !== -100) {
    const divisor = 1 + percentValue / 100;
    if (divisor <= 0) return null;
    const derived = last / divisor;
    return derived > 0 ? derived : null;
  }
  return null;
}

export function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function roundShares(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

export function convertAmountToCad(amount, currency, usdCadRate) {
  const value = numberOrNull(amount);
  if (value == null) return null;
  if (currency === 'CAD') return value;
  const rate = numberOrNull(usdCadRate);
  if (currency === 'USD' && rate != null && rate > 0) return value * rate;
  return null;
}

export function convertAmount(amount, fromCurrency, toCurrency, usdCadRate) {
  const value = numberOrNull(amount);
  if (value == null) return null;
  if (fromCurrency === toCurrency) return value;
  const rate = numberOrNull(usdCadRate);
  if (rate == null || rate <= 0) return null;
  if (fromCurrency === 'USD' && toCurrency === 'CAD') return value * rate;
  if (fromCurrency === 'CAD' && toCurrency === 'USD') return value / rate;
  return null;
}

export function calculateBuyRecordPreview({
  mode = 'shares',
  sharesBought,
  cashPaidAmount,
  cashPaidCurrency = 'CAD',
  buyPrice,
  priceCurrency = 'USD',
  feeAmount,
  feeCurrency = 'CAD',
  usdCadRate,
} = {}) {
  const price = numberOrNull(buyPrice);
  const fee = numberOrNull(feeAmount) ?? 0;
  const cleanPriceCurrency = priceCurrency === 'CAD' ? 'CAD' : 'USD';
  const cleanCashCurrency = cashPaidCurrency === 'USD' ? 'USD' : 'CAD';
  const cleanFeeCurrency = feeCurrency === 'USD' ? 'USD' : 'CAD';
  let shares = numberOrNull(sharesBought);
  let grossCostInPriceCurrency = null;
  let convertedCadCost = null;

  if (mode === 'cash') {
    const cash = numberOrNull(cashPaidAmount);
    if (cash != null && cash > 0 && price != null && price > 0) {
      const cashInPriceCurrency = convertAmount(cash, cleanCashCurrency, cleanPriceCurrency, usdCadRate);
      shares = cashInPriceCurrency == null ? null : cashInPriceCurrency / price;
      grossCostInPriceCurrency = cashInPriceCurrency;
      convertedCadCost = convertAmountToCad(cash, cleanCashCurrency, usdCadRate);
    }
  } else if (shares != null && shares > 0 && price != null && price > 0) {
    grossCostInPriceCurrency = shares * price;
    convertedCadCost = convertAmountToCad(grossCostInPriceCurrency, cleanPriceCurrency, usdCadRate);
  }

  const feeCad = fee <= 0 ? 0 : convertAmountToCad(fee, cleanFeeCurrency, usdCadRate);
  const totalCadCost = convertedCadCost == null || feeCad == null ? null : convertedCadCost + feeCad;

  return {
    mode,
    sharesBought: shares == null ? null : roundShares(shares),
    grossCost: grossCostInPriceCurrency == null ? null : roundMoney(grossCostInPriceCurrency),
    grossCurrency: cleanPriceCurrency,
    convertedCadCost: convertedCadCost == null ? null : roundMoney(convertedCadCost),
    feeCad: feeCad == null ? null : roundMoney(feeCad),
    totalCadCost: totalCadCost == null ? null : roundMoney(totalCadCost),
  };
}

export function defaultCurrency(symbol) {
  return String(symbol || '').trim().toUpperCase().endsWith('.TO') ? 'CAD' : 'USD';
}

export function validateHolding(form, strategyMode = 'dipRanking') {
  const targetPercent = numberOrNull(form.targetPercent);
  const sharesOwned = numberOrNull(form.sharesOwned);
  const manualPriceOverride = numberOrNull(form.manualPriceOverride);
  const manualPreviousCloseOverride = numberOrNull(form.manualPreviousCloseOverride);
  const buySizeOverrideShares = numberOrNull(form.buySizeOverrideShares);
  const ibkrPositionShares = numberOrNull(form.ibkrPositionShares);
  const ibkrAvgPrice = numberOrNull(form.ibkrAvgPrice);
  const ibkrCostBasis = numberOrNull(form.ibkrCostBasis);

  if (!form.ticker.trim()) return 'Symbol is required.';
  if (strategyMode !== 'dipRanking' && !form.priceSymbol.trim()) return 'Price symbol is required.';
  if (form.currency !== 'CAD' && form.currency !== 'USD') return 'Currency must be CAD or USD.';
  if (strategyMode !== 'cashPool' && strategyMode !== 'dipRanking' && targetPercent == null) return 'Target % is required.';
  if (targetPercent < 0) return 'Target % cannot be negative.';
  if (targetPercent > 100) return 'Target % cannot be above 100.';
  if (sharesOwned == null) return 'Current shares is required.';
  if (sharesOwned < 0) return 'Current shares cannot be negative.';
  if (manualPriceOverride != null && manualPriceOverride < 0) return 'Manual price override cannot be negative.';
  if (manualPreviousCloseOverride != null && manualPreviousCloseOverride <= 0) return 'Manual previous close override must be greater than zero.';
  if (buySizeOverrideShares != null && buySizeOverrideShares <= 0) return 'Buy size override must be greater than zero.';
  if (ibkrPositionShares != null && ibkrPositionShares < 0) return 'IBKR position shares cannot be negative.';
  if (ibkrAvgPrice != null && ibkrAvgPrice < 0) return 'IBKR average price cannot be negative.';
  if (ibkrCostBasis != null && ibkrCostBasis < 0) return 'IBKR cost basis cannot be negative.';
  return '';
}

export function getRangeStart(mode, customStart) {
  const now = new Date();
  if (mode === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (mode === 'week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - start.getDay());
    return start;
  }
  if (mode === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (mode === 'custom' && customStart) return new Date(`${customStart}T00:00:00`);
  return null;
}

export function filterHistory(history, mode, customStart, customEnd) {
  const start = getRangeStart(mode, customStart);
  const end = mode === 'custom' && customEnd ? new Date(`${customEnd}T23:59:59`) : null;
  return history.filter((entry) => {
    const date = new Date(entry.savedAt || entry.generatedAt);
    if (Number.isNaN(date.getTime())) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
}

export function buildReport(entries) {
  const rows = entries.flatMap((entry) => entry.rows || []);
  const buyRows = rows.filter((row) => row.action === 'BUY');
  const tickerTotals = new Map();

  for (const row of buyRows) {
    tickerTotals.set(row.ticker, (tickerTotals.get(row.ticker) || 0) + Number(row.actualCostCAD ?? row.estimatedCostCAD ?? row.suggestedBuyCAD ?? 0));
  }

  const mostSuggested = [...tickerTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const bestDip = rows
    .filter((row) => row.changePercent != null)
    .sort((a, b) => Number(a.changePercent) - Number(b.changePercent))[0];

  return {
    totalCashPool: entries.reduce((max, entry) => Math.max(max, Number(entry.cashPoolStartingCAD || 0)), 0),
    cashUsed: entries.reduce((max, entry) => Math.max(max, Number(entry.cashPoolUsedCAD || 0)), 0),
    cashRemaining: entries.reduce((value, entry) => Number(entry.cashPoolRemainingCAD ?? value), 0),
    totalSuggestedBuys: buyRows.reduce((sum, row) => sum + Number(row.estimatedCostCAD ?? row.suggestedBuyCAD ?? 0), 0),
    totalSavedBuys: buyRows.reduce((sum, row) => sum + Number(row.actualCostCAD ?? 0), 0),
    allBuys: buyRows.length,
    buySignals: buyRows.length,
    waitSignals: rows.filter((row) => row.action === 'WAIT').length,
    bestDip: bestDip ? `${bestDip.ticker} ${Number(bestDip.changePercent).toFixed(2)}%` : '-',
    mostSuggestedTicker: mostSuggested ? `${mostSuggested[0]} (${money(mostSuggested[1])})` : '-',
  };
}

export function buildBuyLogReport(buyLog, dcaRows = [], holdings = [], settings = {}) {
  const now = new Date();
  const todayKey = dateKey(now);
  const startOfWeekOffset = (new Date(`${todayKey}T12:00:00.000Z`).getUTCDay() + 6) % 7;
  const startWeekKey = addDaysToDateKey(todayKey, -startOfWeekOffset);
  const startMonthKey = `${todayKey.slice(0, 8)}01`;
  const reportBuyLog = buyLog.filter(isInvestmentBuyLogRow);
  const tickerTotals = new Map();
  const costByTicker = new Map();
  const beforeFeeCostByTicker = new Map();
  const feesByTicker = new Map();
  const usdCommissionsByTicker = new Map();
  const grossBuyValueByTicker = new Map();
  const priceCurrencyByTicker = new Map();
  const lastBuyByTicker = new Map();
  const totals = reportBuyLog.reduce(
    (acc, row) => {
      const total = Number(row.totalCadCost ?? Number(row.cadAmount || 0) + Number(row.feeCAD || 0));
      const fee = Number(row.feeCAD || 0);
      const commissionUsd = Number(row.commissionUsd || 0);
      const beforeFee = Number(row.cadAmount || Math.max(total - fee, 0));
      const shares = Number(row.sharesBought || 0);
      const buyPrice = Number(row.buyPrice || 0);
      acc.shares += shares;
      acc.spent += total;
      acc.fees += fee;
      acc.usdCommissions += commissionUsd;
      tickerTotals.set(row.ticker, (tickerTotals.get(row.ticker) || 0) + shares);
      costByTicker.set(row.ticker, (costByTicker.get(row.ticker) || 0) + total);
      beforeFeeCostByTicker.set(row.ticker, (beforeFeeCostByTicker.get(row.ticker) || 0) + beforeFee);
      feesByTicker.set(row.ticker, (feesByTicker.get(row.ticker) || 0) + fee);
      usdCommissionsByTicker.set(row.ticker, (usdCommissionsByTicker.get(row.ticker) || 0) + commissionUsd);
      grossBuyValueByTicker.set(row.ticker, (grossBuyValueByTicker.get(row.ticker) || 0) + shares * buyPrice);
      priceCurrencyByTicker.set(row.ticker, row.priceCurrency || priceCurrencyByTicker.get(row.ticker) || '');
      const currentLastBuy = lastBuyByTicker.get(row.ticker);
      if (!currentLastBuy || new Date(row.boughtAt).getTime() > new Date(currentLastBuy.boughtAt).getTime()) {
        lastBuyByTicker.set(row.ticker, row);
      }
      return acc;
    },
    { shares: 0, spent: 0, fees: 0, usdCommissions: 0 },
  );
  const mostBought = [...tickerTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const countFromKey = (startKey) => reportBuyLog.filter((row) => dateKey(row.boughtAt) >= startKey).length;
  const rowsByTicker = new Map(dcaRows.map((row) => [row.ticker, row]));
  const holdingsByTicker = new Map(holdings.map((holding) => [holding.ticker, holding]));
  const values = [...tickerTotals.entries()].map(([ticker, shares]) => {
    const row = rowsByTicker.get(ticker);
    const holding = holdingsByTicker.get(ticker);
    const priceCAD = Number(row?.priceCAD);
    const lastPrice = Number(row?.lastPrice);
    const previousClose = Number(row?.previousClose);
    const currentPrice = Number.isFinite(lastPrice) ? lastPrice : null;
    const currentValueCAD = Number.isFinite(priceCAD) ? shares * priceCAD : 0;
    const costBeforeFees = beforeFeeCostByTicker.get(ticker) || 0;
    const fees = feesByTicker.get(ticker) || 0;
    const totalCostAfterFees = costByTicker.get(ticker) || 0;
    const lastBuy = lastBuyByTicker.get(ticker);
    const lastBuyPrice = Number(lastBuy?.buyPrice);
    const lastBuyCurrency = lastBuy?.priceCurrency || '';
    const sinceLastBuyPercent =
      currentPrice != null &&
      Number.isFinite(lastBuyPrice) &&
      lastBuyPrice > 0 &&
      (!lastBuyCurrency || !row?.currency || lastBuyCurrency === row.currency)
        ? ((currentPrice - lastBuyPrice) / lastBuyPrice) * 100
        : null;
    const dailyPLCAD =
      Number.isFinite(priceCAD) && Number.isFinite(lastPrice) && lastPrice > 0 && Number.isFinite(previousClose)
        ? shares * (priceCAD - previousClose * (priceCAD / lastPrice))
        : 0;
    const unrealizedBeforeFeesCAD = currentValueCAD - costBeforeFees;
    const netPLAfterFeesCAD = currentValueCAD - totalCostAfterFees;
    const hasIbkrPositionShares = holding?.ibkrPositionShares != null && Number.isFinite(Number(holding.ibkrPositionShares));
    const hasIbkrAvgPrice = holding?.ibkrAvgPrice != null && Number.isFinite(Number(holding.ibkrAvgPrice));
    const hasIbkrCostBasis = holding?.ibkrCostBasis != null && Number.isFinite(Number(holding.ibkrCostBasis));
    const ibkrPositionShares = hasIbkrPositionShares ? Number(holding.ibkrPositionShares) : null;
    const ibkrAvgPrice = hasIbkrAvgPrice ? Number(holding.ibkrAvgPrice) : null;
    const ibkrCostBasis = hasIbkrCostBasis ? Number(holding.ibkrCostBasis) : null;
    const appAvgPrice = shares > 0 ? (grossBuyValueByTicker.get(ticker) || 0) / shares : 0;
    const rowFxRate =
      Number.isFinite(priceCAD) && Number.isFinite(lastPrice) && lastPrice > 0 ? priceCAD / lastPrice : null;
    const fallbackFxRate = Number(settings?.usdCadRate);
    const usdCadRate = row?.currency === 'USD' ? rowFxRate || (Number.isFinite(fallbackFxRate) ? fallbackFxRate : null) : 1;
    const ibkrCostBasisCADEstimate =
      hasIbkrCostBasis && usdCadRate != null ? ibkrCostBasis * usdCadRate : null;
    return {
      ticker,
      shares,
      ibkrPositionShares: hasIbkrPositionShares ? ibkrPositionShares : null,
      shareDifference: hasIbkrPositionShares ? shares - ibkrPositionShares : null,
      currentPrice,
      priceCurrency: row?.currency || priceCurrencyByTicker.get(ticker) || '',
      lastBuyPrice: Number.isFinite(lastBuyPrice) && lastBuyPrice > 0 ? lastBuyPrice : null,
      lastBuyCurrency,
      sinceLastBuyPercent,
      currentValueCAD,
      costBeforeFees,
      fees,
      usdCommissions: usdCommissionsByTicker.get(ticker) || 0,
      totalCostAfterFees,
      dailyPLCAD,
      unrealizedBeforeFeesCAD,
      netPLAfterFeesCAD,
      netPLPercent: totalCostAfterFees > 0 ? (netPLAfterFeesCAD / totalCostAfterFees) * 100 : 0,
      avgBuyPriceTickerCurrency: appAvgPrice,
      ibkrAvgPrice: hasIbkrAvgPrice ? ibkrAvgPrice : null,
      avgPriceDifference: hasIbkrAvgPrice ? appAvgPrice - ibkrAvgPrice : null,
      ibkrCostBasis: hasIbkrCostBasis ? ibkrCostBasis : null,
      ibkrCostBasisCADEstimate,
      costBasisDifference: ibkrCostBasisCADEstimate == null ? null : totalCostAfterFees - ibkrCostBasisCADEstimate,
      avgCostShareCADInclFees: shares > 0 ? totalCostAfterFees / shares : 0,
      profitCAD: netPLAfterFeesCAD,
    };
  });
  const currentValueCAD = values.reduce((sum, row) => sum + row.currentValueCAD, 0);
  const dailyPLCAD = values.reduce((sum, row) => sum + row.dailyPLCAD, 0);
  const costBasisBeforeFeesCAD = values.reduce((sum, row) => sum + row.costBeforeFees, 0);
  const unrealizedBeforeFeesCAD = currentValueCAD - costBasisBeforeFeesCAD;
  const netPLAfterFeesCAD = currentValueCAD - totals.spent;
  const displayedNetPLAfterFeesCAD = values.reduce(
    (sum, row) => sum + Number(row.netPLAfterFeesCAD.toFixed(2)),
    0,
  );
  const netPLAfterFeesPercent = totals.spent > 0 ? (netPLAfterFeesCAD / totals.spent) * 100 : 0;
  const bestProfit = values.length ? values.sort((a, b) => b.profitCAD - a.profitCAD)[0] : null;

  return {
    totalExecutions: reportBuyLog.length,
    totalSharesBought: Number(totals.shares.toFixed(6)),
    totalSharesBoughtText: fixedShares(totals.shares, 4),
    totalCadSpent: totals.spent,
    currentValueCAD,
    dailyPLCAD,
    costBasisBeforeFeesCAD,
    unrealizedBeforeFeesCAD,
    netPLAfterFeesCAD,
    displayedNetPLAfterFeesCAD,
    netPLAfterFeesPercent,
    averageCostShareCADInclFees: totals.shares > 0 ? totals.spent / totals.shares : 0,
    totalFees: totals.fees,
    totalUsdCommissions: totals.usdCommissions,
    buysToday: countFromKey(todayKey),
    buysThisWeek: countFromKey(startWeekKey),
    buysThisMonth: countFromKey(startMonthKey),
    mostBoughtTicker: mostBought ? `${mostBought[0]} (${shares(mostBought[1])})` : '-',
    bestProfitTicker: bestProfit ? `${bestProfit.ticker} (${money(bestProfit.profitCAD)})` : '-',
    tickerBreakdown: values,
  };
}

export function buildSinceLastBuyMap(buyLog, dcaRows = []) {
  const rowsByTicker = new Map(dcaRows.map((row) => [row.ticker, row]));
  const latestBuyByTicker = new Map();

  for (const buy of buyLog.filter(isInvestmentBuyLogRow)) {
    const current = latestBuyByTicker.get(buy.ticker);
    if (!current || new Date(buy.boughtAt).getTime() > new Date(current.boughtAt).getTime()) {
      latestBuyByTicker.set(buy.ticker, buy);
    }
  }

  return new Map(
    [...latestBuyByTicker.entries()].map(([ticker, buy]) => {
      const row = rowsByTicker.get(ticker);
      const currentPrice = Number(row?.lastPrice);
      const lastBuyPrice = Number(buy.buyPrice);
      const lastBuyCurrency = buy.priceCurrency || '';
      const canCompare =
        Number.isFinite(currentPrice) &&
        Number.isFinite(lastBuyPrice) &&
        lastBuyPrice > 0 &&
        (!lastBuyCurrency || !row?.currency || lastBuyCurrency === row.currency);

      return [
        ticker,
        {
          lastBuyPrice: Number.isFinite(lastBuyPrice) && lastBuyPrice > 0 ? lastBuyPrice : null,
          lastBuyCurrency,
          percent: canCompare ? ((currentPrice - lastBuyPrice) / lastBuyPrice) * 100 : null,
        },
      ];
    }),
  );
}

export function buildBoughtTodaySet(buyLog = []) {
  const today = dateKey(new Date());
  return new Set(
    buyLog
      .filter(isInvestmentBuyLogRow)
      .filter((buy) => dateKey(buy.boughtAt) === today)
      .map((buy) => String(buy.ticker || '').toUpperCase()),
  );
}
