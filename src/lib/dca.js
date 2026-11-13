function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function roundShares(value) {
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}

function isManualPriceSource(source) {
  return source === 'manual' || source === 'manual-last' || source === 'manual-ibkr';
}

function isVerifiedManualPriceSource(source) {
  return source === 'manual' || source === 'manual-ibkr';
}

function easternParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(date),
  };
}

function dateKeyDiffDays(laterKey, earlierKey) {
  const later = new Date(`${laterKey}T00:00:00Z`);
  const earlier = new Date(`${earlierKey}T00:00:00Z`);
  const diff = (later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000);
  return Number.isFinite(diff) ? diff : null;
}

function isWeekendLastTradingClose(sourceEt, nowEt) {
  const diffDays = dateKeyDiffDays(nowEt.dateKey, sourceEt.dateKey);
  return sourceEt.weekday === 'Fri' && ((nowEt.weekday === 'Sat' && diffDays === 1) || (nowEt.weekday === 'Sun' && diffDays === 2));
}

function evaluateMarketDataFreshness({ sourceTime, now = new Date(), priceSymbol = '', source = '' } = {}) {
  if (!sourceTime) {
    return {
      isStale: true,
      isDelayed: false,
      isCloseData: false,
      warning: 'Market data may be stale — verify with IBKR.',
      status: 'Missing market data time',
    };
  }

  const sourceDate = new Date(sourceTime);
  const nowDate = now instanceof Date ? now : new Date(now);
  const sourceMs = sourceDate.getTime();
  const nowMs = nowDate.getTime();
  if (!Number.isFinite(sourceMs) || !Number.isFinite(nowMs)) {
    return {
      isStale: true,
      isDelayed: false,
      isCloseData: false,
      warning: 'Market data may be stale — verify with IBKR.',
      status: 'Invalid market data time',
    };
  }

  const sourceEt = easternParts(sourceDate);
  const nowEt = easternParts(nowDate);
  const marketCloseMinutes = 16 * 60;
  const closeToleranceMinutes = 10;
  const isAroundRegularClose =
    sourceEt &&
    sourceEt.minutes >= marketCloseMinutes - closeToleranceMinutes &&
    sourceEt.minutes <= marketCloseMinutes + closeToleranceMinutes;

  if (sourceEt && nowEt && sourceEt.dateKey !== nowEt.dateKey && isAroundRegularClose && isWeekendLastTradingClose(sourceEt, nowEt)) {
    return {
      isStale: false,
      isDelayed: false,
      isCloseData: true,
      warning: '',
      status: 'Market closed / Last trading day close data',
    };
  }

  if (!sourceEt || !nowEt || sourceEt.dateKey !== nowEt.dateKey) {
    return {
      isStale: true,
      isDelayed: false,
      isCloseData: false,
      warning: 'Market data may be stale — verify with IBKR.',
      status: 'Previous trading day data',
    };
  }

  const marketOpenMinutes = 9 * 60 + 30;
  const oldDuringMarketMinutes = 20;
  const marketClosed = nowEt.minutes >= marketCloseMinutes;

  if (marketClosed && isAroundRegularClose) {
    return {
      isStale: false,
      isDelayed: false,
      isCloseData: true,
      warning: '',
      status: 'Market closed / Close data',
    };
  }

  const ageMinutes = (nowMs - sourceMs) / 60000;
  const marketOpen = nowEt.minutes >= marketOpenMinutes && nowEt.minutes < marketCloseMinutes;
  const isIntradaySource = String(source || '').includes('1m');
  const isStale = marketOpen && isIntradaySource && ageMinutes > oldDuringMarketMinutes;
  return {
    isStale,
    isDelayed: !isStale && ageMinutes > 15,
    isCloseData: false,
    warning: isStale ? 'Market data may be stale — verify with IBKR.' : !isStale && ageMinutes > 15 ? 'Yahoo market data may be delayed.' : '',
    status: isStale ? 'Stale during market hours' : '',
    priceSymbol,
  };
}

function selectFormulaExampleRow(rows = [], bestBuy = null) {
  if (bestBuy) return bestBuy;
  const usableRows = rows.filter((row) => row.changePercent != null && row.normalMovePercent != null && row.moveScore != null);
  const downRows = usableRows.filter((row) => Number(row.changePercent) < 0);
  const candidates = downRows.length ? downRows : usableRows;
  return candidates.sort((a, b) => {
    const scoreDiff = Number(b.moveScore ?? 0) - Number(a.moveScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return Number(a.changePercent ?? 0) - Number(b.changePercent ?? 0);
  })[0] || null;
}

function derivePreviousCloseFromBroker({ lastPrice, previousClose, changeDollar, changePercent }) {
  const last = finiteNumber(lastPrice);
  const previous = finiteNumber(previousClose);
  const dollar = finiteNumber(changeDollar);
  const percent = finiteNumber(changePercent);

  if (previous != null && previous > 0) return previous;
  if (last == null || last <= 0) return null;
  if (dollar != null) {
    const derived = last - dollar;
    return derived > 0 ? derived : null;
  }
  if (percent != null && percent !== -100) {
    const divisor = 1 + percent / 100;
    if (divisor <= 0) return null;
    const derived = last / divisor;
    return derived > 0 ? derived : null;
  }
  return null;
}

function applyBuyLogShareChange(currentShares, oldShares, newShares) {
  return Math.max((finiteNumber(currentShares) ?? 0) - (finiteNumber(oldShares) ?? 0) + (finiteNumber(newShares) ?? 0), 0);
}

function resolveBuyLogHolding(holdings = [], payload = {}) {
  const requestedId = finiteNumber(payload.holdingId);
  const requestedSymbol = String(payload.ticker || payload.priceSymbol || '').trim().toUpperCase();
  return (
    holdings.find((holding) => requestedId != null && Number(holding.id) === requestedId) ||
    holdings.find(
      (holding) =>
        requestedSymbol &&
        (String(holding.ticker || '').toUpperCase() === requestedSymbol ||
          String(holding.priceSymbol || '').toUpperCase() === requestedSymbol),
    ) ||
    null
  );
}

function summarizeBuyLog(buyLog = []) {
  const tickerTotals = new Map();
  const totals = buyLog.reduce(
    (acc, row) => {
      const shares = finiteNumber(row.sharesBought) ?? 0;
      const cadAmount = finiteNumber(row.cadAmount) ?? 0;
      const fee = finiteNumber(row.feeCAD) ?? 0;
      const total = finiteNumber(row.totalCadCost) ?? cadAmount + fee;
      acc.totalSharesBought += shares;
      acc.totalCadSpent += total;
      acc.totalFees += fee;
      tickerTotals.set(row.ticker, (tickerTotals.get(row.ticker) || 0) + shares);
      return acc;
    },
    { totalSharesBought: 0, totalCadSpent: 0, totalFees: 0 },
  );
  const mostBought = [...tickerTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    ...totals,
    averageBuyPrice: totals.totalSharesBought > 0 ? totals.totalCadSpent / totals.totalSharesBought : 0,
    mostBoughtTicker: mostBought ? mostBought[0] : null,
  };
}

function convertAmountToCad(amount, currency, usdCadRate) {
  const value = finiteNumber(amount);
  if (value == null) return null;
  if (currency === 'CAD') return value;
  const rate = finiteNumber(usdCadRate);
  if (currency === 'USD' && rate != null && rate > 0) return value * rate;
  return null;
}

function convertAmount(amount, fromCurrency, toCurrency, usdCadRate) {
  const value = finiteNumber(amount);
  if (value == null) return null;
  if (fromCurrency === toCurrency) return value;
  const rate = finiteNumber(usdCadRate);
  if (rate == null || rate <= 0) return null;
  if (fromCurrency === 'USD' && toCurrency === 'CAD') return value * rate;
  if (fromCurrency === 'CAD' && toCurrency === 'USD') return value / rate;
  return null;
}

function calculateBuyRecordPreview({
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
  const price = finiteNumber(buyPrice);
  const fee = finiteNumber(feeAmount) ?? 0;
  const cleanPriceCurrency = priceCurrency === 'CAD' ? 'CAD' : 'USD';
  const cleanCashCurrency = cashPaidCurrency === 'USD' ? 'USD' : 'CAD';
  const cleanFeeCurrency = feeCurrency === 'USD' ? 'USD' : 'CAD';
  let shares = finiteNumber(sharesBought);
  let grossCostInPriceCurrency = null;
  let convertedCadCost = null;

  if (mode === 'cash') {
    const cash = finiteNumber(cashPaidAmount);
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

function calculateNormalMovePercent(closes = []) {
  const moves = [];
  for (let index = 1; index < closes.length; index += 1) {
    const previous = finiteNumber(closes[index - 1]);
    const current = finiteNumber(closes[index]);
    if (previous != null && previous > 0 && current != null) {
      moves.push(Math.abs(((current - previous) / previous) * 100));
    }
  }
  if (moves.length === 0) return null;
  const average = moves.reduce((sum, value) => sum + value, 0) / moves.length;
  return average > 0 ? average : null;
}

function calculateMoveScore(todayChangePercent, normalMovePercent) {
  const change = finiteNumber(todayChangePercent);
  const normal = finiteNumber(normalMovePercent);
  if (change == null || normal == null || normal <= 0) return null;
  return Math.abs(change) / normal;
}

function getScoreThresholds(settings = {}) {
  return {
    meaningful: finiteNumber(settings.dipMeaningfulScore) ?? 1,
    strong: finiteNumber(settings.dipStrongScore) ?? 1.5,
    huge: finiteNumber(settings.dipHugeScore) ?? 2,
  };
}

function getDipStrength(moveScore, changePercent, settings = {}) {
  const score = finiteNumber(moveScore);
  const change = finiteNumber(changePercent);
  const thresholds = getScoreThresholds(settings);
  if (change != null && change >= 0) return 'Not down today';
  if (score != null) {
    if (score >= thresholds.huge) return 'Huge dip';
    if (score >= thresholds.strong) return 'Strong dip';
    if (score >= thresholds.meaningful) return 'Meaningful dip';
    if (change != null && change < 0 && score >= 0.85) return 'Near meaningful dip';
    return 'Normal move';
  }

  if (change == null) return 'Fixed rule';
  if (change <= Number(settings.dipHugeDip ?? -4)) return 'Huge dip';
  if (change <= Number(settings.dipStrongDip ?? -2.5)) return 'Strong dip';
  if (change <= Number(settings.dipMinimumDip ?? -1)) return 'Meaningful dip';
  return 'Fixed rule';
}

function getPriceForHolding(holding, pricesByHoldingId, settings = {}) {
  const manual = finiteNumber(holding.manualPriceOverride);
  const manualPreviousClose = finiteNumber(holding.manualPreviousCloseOverride);
  const priceRow = pricesByHoldingId.get(holding.id);
  const hasManualLast = manual && manual > 0;
  const hasManualPreviousClose = manualPreviousClose && manualPreviousClose > 0;
  const lastPrice = hasManualLast ? manual : finiteNumber(priceRow && priceRow.lastPrice);
  const previousClose =
    hasManualPreviousClose ? manualPreviousClose : finiteNumber(priceRow && priceRow.previousClose);
  const source = hasManualLast ? (hasManualPreviousClose ? 'manual-ibkr' : 'manual-last') : 'api';
  const sourceTime = priceRow && priceRow.sourceTime;
  const freshness =
    priceRow && !isVerifiedManualPriceSource(source)
      ? evaluateMarketDataFreshness({
          sourceTime,
          now: settings.now,
          priceSymbol: holding.priceSymbol || holding.ticker,
          source: priceRow.source,
        })
      : { isStale: false, isDelayed: false, warning: '', status: '' };
  return {
    lastPrice,
    previousClose,
    sessionLow: finiteNumber(priceRow && priceRow.sessionLow),
    sessionHigh: finiteNumber(priceRow && priceRow.sessionHigh),
    source,
    hasPriceRow: Boolean(priceRow),
    fetchedAt: priceRow && priceRow.fetchedAt,
    dataSource: priceRow && priceRow.source,
    sourceTime,
    isDelayed: Boolean(priceRow && (priceRow.isDelayed || freshness.isDelayed)),
    isStale: Boolean(priceRow && (freshness.isStale || (priceRow.isStale && !freshness.isCloseData))),
    warning: [priceRow && priceRow.warning, freshness.warning].filter(Boolean).join(' '),
    marketStatus: freshness.status,
    normalMovePercent:
      finiteNumber(priceRow && priceRow.normalMovePercent) && finiteNumber(priceRow && priceRow.normalMovePercent) > 0
        ? finiteNumber(priceRow && priceRow.normalMovePercent)
        : null,
    historicalWarning: priceRow && priceRow.historicalWarning,
    error: priceRow && priceRow.error,
  };
}

function missingDataReason(row) {
  if (row.priceError) return `Price refresh failed: ${row.priceError}`;
  if (row.isStale && !isVerifiedManualPriceSource(row.priceSource)) {
    return 'Yahoo data is stale or missing market timestamp. Use IBKR price or manual override.';
  }
  if (!row.hasPriceRow) return 'Press Refresh Prices to load market data.';
  return 'Press Refresh Prices to load market data.';
}

function getDipMultiplier(changePercent, settings) {
  if (changePercent <= Number(settings.hugeDipThreshold)) return 1.5;
  if (changePercent <= Number(settings.biggerDipThreshold)) return 1.25;
  if (changePercent <= Number(settings.minimumDip)) return 1;
  return 0;
}

function getCashPoolDipMultiplier(changePercent, settings) {
  if (changePercent <= Number(settings.cashPoolHugeDipThreshold ?? settings.hugeDipThreshold ?? -5)) return 2;
  if (changePercent <= Number(settings.cashPoolBiggerDipThreshold ?? settings.biggerDipThreshold ?? -3)) return 1.5;
  if (changePercent <= Number(settings.cashPoolMinimumDip ?? settings.minimumDip ?? -1)) return 1;
  return 0;
}

function getDipRankingAllocation(changePercent, settings) {
  if (changePercent <= Number(settings.dipHugeDip ?? -4)) return 0.75;
  if (changePercent <= Number(settings.dipStrongDip ?? -2.5)) return 0.5;
  if (changePercent <= Number(settings.dipMinimumDip ?? -1)) return 0.25;
  return 0;
}

function getDipScoreAllocation(moveScore, settings) {
  const score = finiteNumber(moveScore);
  if (score == null) return 0;
  const thresholds = getScoreThresholds(settings);
  if (score >= thresholds.huge) return 0.75;
  if (score >= thresholds.strong) return 0.5;
  if (score >= thresholds.meaningful) return 0.25;
  return 0;
}

function prepareRows({ holdings, prices, settings }) {
  const enabledHoldings = holdings.filter((holding) => holding.enabled !== false);
  const pricesByHoldingId = new Map(prices.map((price) => [price.holdingId, price]));
  const usdCadRate = finiteNumber(settings.usdCadRate);

  return {
    enabledHoldings,
    usdCadRate,
    rows: enabledHoldings.map((holding) => {
      const priceInfo = getPriceForHolding(holding, pricesByHoldingId, settings);
      const targetPercentInput = finiteNumber(holding.targetPercent);
      const sharesOwned = finiteNumber(holding.sharesOwned);
      const currency = holding.currency === 'USD' ? 'USD' : 'CAD';
      const priceCAD =
        priceInfo.lastPrice == null
          ? null
          : currency === 'CAD'
            ? priceInfo.lastPrice
            : usdCadRate == null
              ? null
              : priceInfo.lastPrice * usdCadRate;
      const currentValueCAD = sharesOwned == null || priceCAD == null ? null : sharesOwned * priceCAD;
      const changePercent =
        priceInfo.lastPrice == null || priceInfo.previousClose == null || priceInfo.previousClose <= 0
          ? null
          : ((priceInfo.lastPrice - priceInfo.previousClose) / priceInfo.previousClose) * 100;

      return {
        id: holding.id,
        holdingId: holding.id,
        ticker: holding.ticker,
        name: holding.name,
        priceSymbol: holding.priceSymbol,
        currency,
        targetPercentInput,
        targetPercent: targetPercentInput == null ? null : targetPercentInput / 100,
        sharesOwned,
        buySizeOverrideShares: finiteNumber(holding.buySizeOverrideShares),
        lastPrice: priceInfo.lastPrice,
        previousClose: priceInfo.previousClose,
        sessionLow: priceInfo.sessionLow,
        sessionHigh: priceInfo.sessionHigh,
        priceCAD,
        currentValueCAD,
        changePercent,
        priceSource: priceInfo.source,
        dataSource: isVerifiedManualPriceSource(priceInfo.source) ? 'Manual / IBKR' : priceInfo.dataSource || 'Yahoo',
        hasPriceRow: priceInfo.hasPriceRow,
        priceUpdatedAt: priceInfo.fetchedAt,
        sourceTime: priceInfo.sourceTime,
        isDelayed: priceInfo.isDelayed,
        isStale: priceInfo.isStale,
        priceWarning: priceInfo.warning,
        marketStatus: priceInfo.marketStatus,
        normalMovePercent: priceInfo.normalMovePercent,
        historicalWarning: priceInfo.historicalWarning,
        priceError: priceInfo.error,
      };
    }),
  };
}

function calculatePlan({ holdings = [], prices = [], settings = {} }) {
  const { enabledHoldings, usdCadRate, rows: preparedRows } = prepareRows({ holdings, prices, settings });
  const cashToInvestCAD = finiteNumber(settings.cashToInvestCAD) ?? 0;

  const currentPortfolioValueCAD = preparedRows.reduce((sum, row) => sum + (row.currentValueCAD ?? 0), 0);
  const portfolioAfterCashCAD = currentPortfolioValueCAD + cashToInvestCAD;

  const rows = preparedRows.map((row) => {
    const targetValueCAD = row.targetPercent == null ? null : row.targetPercent * portfolioAfterCashCAD;
    const gapToTargetCAD =
      targetValueCAD == null || row.currentValueCAD == null ? null : targetValueCAD - row.currentValueCAD;
    const normalSplitCAD = row.targetPercent == null ? null : cashToInvestCAD * row.targetPercent;
    let action = 'WAIT';
    let reason = '';
    let suggestedBuyCAD = 0;
    let score = null;

    if (
      row.lastPrice == null ||
      row.previousClose == null ||
      row.priceCAD == null ||
      row.currentValueCAD == null ||
      row.changePercent == null ||
      (row.isStale && !isVerifiedManualPriceSource(row.priceSource)) ||
      (row.currency === 'USD' && usdCadRate == null)
    ) {
      action = 'SKIP';
      reason = missingDataReason(row);
    } else if (row.targetPercent == null || row.targetPercent <= 0) {
      action = 'SKIP';
      reason = 'Target percent missing or zero';
    } else if (row.changePercent > Number(settings.minimumDip)) {
      action = 'WAIT';
      reason = 'Not red enough';
    } else if (gapToTargetCAD <= 0) {
      action = 'WAIT';
      reason = 'At or above target';
    } else {
      const dipMultiplier = getDipMultiplier(row.changePercent, settings);
      suggestedBuyCAD = Math.min(normalSplitCAD * dipMultiplier, gapToTargetCAD, cashToInvestCAD);
      const underTargetScore = Math.min(gapToTargetCAD / normalSplitCAD, 1) * 60;
      const dipScore = Math.min(Math.abs(row.changePercent) / 5, 1) * 40;
      score = underTargetScore + dipScore;
      action = 'BUY';
      reason = 'Under target and red enough';
    }

    return {
      ...row,
      targetValueCAD: targetValueCAD == null ? null : roundMoney(targetValueCAD),
      gapToTargetCAD: gapToTargetCAD == null ? null : roundMoney(gapToTargetCAD),
      normalSplitCAD: normalSplitCAD == null ? null : roundMoney(normalSplitCAD),
      suggestedBuyCAD: roundMoney(suggestedBuyCAD),
      currentValueCAD: row.currentValueCAD == null ? null : roundMoney(row.currentValueCAD),
      priceCAD: row.priceCAD == null ? null : roundMoney(row.priceCAD),
      changePercent: row.changePercent == null ? null : roundPercent(row.changePercent),
      score: score == null ? null : roundPercent(score),
      action,
      reason: [reason, row.priceWarning].filter(Boolean).join(' '),
    };
  });

  const buyRows = rows.filter((row) => row.action === 'BUY');
  const bestBuy = buyRows.length
    ? buyRows.reduce((best, row) => (row.score > best.score ? row : best), buyRows[0])
    : null;
  const totalTargetPercent = enabledHoldings.reduce((sum, holding) => sum + (finiteNumber(holding.targetPercent) ?? 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    strategyMode: 'target',
    cashToInvestCAD: roundMoney(cashToInvestCAD),
    usdCadRate,
    totalTargetPercent: roundPercent(totalTargetPercent),
    targetPercentValid: Math.abs(totalTargetPercent - 100) < 0.0001,
    currentPortfolioValueCAD: roundMoney(currentPortfolioValueCAD),
    portfolioAfterCashCAD: roundMoney(portfolioAfterCashCAD),
    rows,
    bestBuy,
  };
}

function calculateCashPoolPlan({ holdings = [], prices = [], settings = {} }) {
  const { usdCadRate, rows: preparedRows } = prepareRows({ holdings, prices, settings });
  const cashPoolStartingCAD = finiteNumber(settings.cashPoolStartingCAD) ?? 0;
  const cashPoolUsedCAD = finiteNumber(settings.cashPoolUsedCAD) ?? 0;
  const cashRemainingCAD = Math.max(cashPoolStartingCAD - cashPoolUsedCAD, 0);
  const defaultBuySizeShares = finiteNumber(settings.defaultBuySizeShares) ?? 0.1;
  const minimumDip = Number(settings.cashPoolMinimumDip ?? -1);
  const buyCountToday = finiteNumber(settings.buyCountToday) ?? 0;
  const maxBuysPerDay = finiteNumber(settings.maxBuysPerDay) ?? 1;
  const dailyLimitReached = buyCountToday >= maxBuysPerDay && (settings.allowMultipleBuysSameDay === false || maxBuysPerDay > 0);

  const rows = preparedRows.map((row) => {
    const baseBuySizeShares = row.buySizeOverrideShares && row.buySizeOverrideShares > 0 ? row.buySizeOverrideShares : defaultBuySizeShares;
    const dipMultiplier = row.changePercent == null ? 0 : getCashPoolDipMultiplier(row.changePercent, settings);
    const rawSuggestedShares = baseBuySizeShares * dipMultiplier;
    const rawCostCAD = row.priceCAD == null ? null : rawSuggestedShares * row.priceCAD;
    let action = 'WAIT';
    let reason = '';
    let suggestedShares = 0;
    let estimatedCostCAD = 0;

    if (
      row.lastPrice == null ||
      row.previousClose == null ||
      row.priceCAD == null ||
      row.changePercent == null ||
      (row.isStale && !isVerifiedManualPriceSource(row.priceSource)) ||
      (row.currency === 'USD' && usdCadRate == null)
    ) {
      action = 'SKIP';
      reason = missingDataReason(row);
    } else if (dailyLimitReached) {
      action = 'WAIT';
      reason = 'Daily buy limit reached';
    } else if (row.changePercent > minimumDip) {
      action = 'WAIT';
      reason = 'Not red enough';
    } else if (cashRemainingCAD < baseBuySizeShares * row.priceCAD) {
      action = 'WAIT';
      reason = 'Not enough cash remaining';
    } else {
      suggestedShares = rawCostCAD > cashRemainingCAD ? cashRemainingCAD / row.priceCAD : rawSuggestedShares;
      estimatedCostCAD = suggestedShares * row.priceCAD;
      action = 'BUY';
      reason = dipMultiplier >= 2 ? 'Huge dip and cash available' : dipMultiplier >= 1.5 ? 'Bigger dip and cash available' : 'Normal dip and cash available';
    }

    return {
      ...row,
      buySizeShares: roundPercent(baseBuySizeShares),
      suggestedShares: roundPercent(suggestedShares),
      estimatedCostCAD: roundMoney(estimatedCostCAD),
      cashRemainingAfterBuyCAD: roundMoney(cashRemainingCAD - estimatedCostCAD),
      currentValueCAD: row.currentValueCAD == null ? null : roundMoney(row.currentValueCAD),
      priceCAD: row.priceCAD == null ? null : roundMoney(row.priceCAD),
      changePercent: row.changePercent == null ? null : roundPercent(row.changePercent),
      action,
      reason: [reason, row.priceWarning].filter(Boolean).join(' '),
    };
  });

  const buyRows = rows.filter((row) => row.action === 'BUY');
  const bestBuy = buyRows.length
    ? buyRows.reduce((best, row) => (row.changePercent < best.changePercent ? row : best), buyRows[0])
    : null;

  return {
    generatedAt: new Date().toISOString(),
    strategyMode: 'cashPool',
    usdCadRate,
    cashPoolStartingCAD: roundMoney(cashPoolStartingCAD),
    cashPoolUsedCAD: roundMoney(cashPoolUsedCAD),
    cashPoolRemainingCAD: roundMoney(cashRemainingCAD),
    defaultBuySizeShares,
    rows,
    bestBuy,
  };
}

function calculateDipRankingPlan({ holdings = [], prices = [], settings = {} }) {
  const { usdCadRate, rows: preparedRows } = prepareRows({ holdings, prices, settings });
  const cashAvailableCAD = finiteNumber(settings.dipCashAvailableCAD) ?? 0;
  const minimumDip = Number(settings.dipMinimumDip ?? -1);
  const smallBuyWarningCAD = finiteNumber(settings.smallBuyWarningCAD) ?? 5;
  const thresholds = getScoreThresholds(settings);

  const initialRows = preparedRows.map((row) => {
    const changeDollar =
      row.lastPrice == null || row.previousClose == null ? null : row.lastPrice - row.previousClose;
    const fixedRuleWarning = 'Normal move unavailable — using fixed fallback rules.';
    const moveScore = calculateMoveScore(row.changePercent, row.normalMovePercent);
    const dipStrength = getDipStrength(moveScore, row.changePercent, settings);
    const hasStockSpecificMove = moveScore != null;
    const allocation = (() => {
      if (row.changePercent == null || row.changePercent >= 0) return 0;
      if (hasStockSpecificMove) return getDipScoreAllocation(moveScore, settings);
      return getDipRankingAllocation(row.changePercent, settings);
    })();
    let suggestedBuyCAD = Math.min(cashAvailableCAD * allocation, cashAvailableCAD);
    let action = 'WAIT';
    let reason = '';

    if (
      row.lastPrice == null ||
      row.previousClose == null ||
      row.previousClose <= 0 ||
      row.priceCAD == null ||
      row.changePercent == null ||
      (row.isStale && !isVerifiedManualPriceSource(row.priceSource)) ||
      (row.currency === 'USD' && usdCadRate == null)
    ) {
      action = 'SKIP';
      reason = row.priceError ? `Price refresh failed: ${row.priceError}` : 'Missing or stale data';
      suggestedBuyCAD = 0;
    } else if (row.changePercent >= 0) {
      action = 'WAIT';
      reason = 'Not down today';
      suggestedBuyCAD = 0;
    } else if (hasStockSpecificMove && moveScore < thresholds.meaningful) {
      action = 'WAIT';
      reason = `Move is still inside ${row.ticker}'s normal daily range.`;
      suggestedBuyCAD = 0;
    } else if (!hasStockSpecificMove && row.changePercent > minimumDip) {
      action = 'WAIT';
      reason = 'Drop is too small';
      suggestedBuyCAD = 0;
    } else {
      action = 'BUY';
      reason = hasStockSpecificMove
        ? 'Meaningful move versus normal daily range'
        : 'Biggest meaningful drop from yesterday';
    }

    const estimatedShares = row.priceCAD && suggestedBuyCAD > 0 ? suggestedBuyCAD / row.priceCAD : 0;

    return {
      ...row,
      changeDollar: changeDollar == null ? null : roundMoney(changeDollar),
      currentValueCAD: row.currentValueCAD == null ? null : roundMoney(row.currentValueCAD),
      priceCAD: row.priceCAD == null ? null : roundMoney(row.priceCAD),
      changePercent: row.changePercent == null ? null : roundPercent(row.changePercent),
      normalMovePercent: row.normalMovePercent == null ? null : roundPercent(row.normalMovePercent),
      moveScore: moveScore == null ? null : roundPercent(moveScore),
      dipStrength: hasStockSpecificMove || row.changePercent >= 0 ? dipStrength : 'Fixed rule',
      suggestedBuyCAD: roundMoney(suggestedBuyCAD),
      estimatedShares: roundPercent(estimatedShares),
      action,
      reason:
        action === 'SKIP' && row.isStale && !isVerifiedManualPriceSource(row.priceSource)
          ? 'Yahoo data is stale or missing market timestamp. Use IBKR price or manual override.'
          : [
              reason,
              suggestedBuyCAD > 0 && suggestedBuyCAD < smallBuyWarningCAD
                ? 'Small buy — check IBKR Preview and fees before placing order.'
                : '',
              row.priceWarning,
              row.historicalWarning || (!hasStockSpecificMove ? fixedRuleWarning : ''),
            ].filter(Boolean).join(' '),
    };
  });

  const rows = initialRows;

  const buyRows = rows.filter((row) => row.action === 'BUY');
  const bestBuy = buyRows.length
    ? buyRows.reduce((best, row) => {
        const rowScore = row.moveScore ?? 0;
        const bestScore = best.moveScore ?? 0;
        if (rowScore !== bestScore) return rowScore > bestScore ? row : best;
        return row.changePercent < best.changePercent ? row : best;
      }, buyRows[0])
    : null;
  const totalTargetPercent = holdings
    .filter((holding) => holding.enabled !== false)
    .reduce((sum, holding) => sum + (finiteNumber(holding.targetPercent) ?? 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    strategyMode: 'dipRanking',
    usdCadRate,
    cashAvailableCAD: roundMoney(cashAvailableCAD),
    minimumDip,
    meaningfulDipScore: thresholds.meaningful,
    strongDipScore: thresholds.strong,
    hugeDipScore: thresholds.huge,
    totalTargetPercent: roundPercent(totalTargetPercent),
    targetPercentValid: true,
    rows,
    bestBuy,
  };
}

function calculateStrategyPlan({ holdings = [], prices = [], settings = {} }) {
  if (!settings.strategyMode || settings.strategyMode === 'dipRanking') {
    return calculateDipRankingPlan({ holdings, prices, settings: { ...settings, strategyMode: 'dipRanking' } });
  }
  if (settings.strategyMode === 'cashPool') {
    return calculateCashPoolPlan({ holdings, prices, settings });
  }
  return calculatePlan({ holdings, prices, settings });
}

module.exports = {
  calculatePlan,
  calculateCashPoolPlan,
  calculateDipRankingPlan,
  calculateStrategyPlan,
  getDipMultiplier,
  getCashPoolDipMultiplier,
  getDipRankingAllocation,
  derivePreviousCloseFromBroker,
  isManualPriceSource,
  isVerifiedManualPriceSource,
  applyBuyLogShareChange,
  summarizeBuyLog,
  calculateBuyRecordPreview,
  convertAmountToCad,
  evaluateMarketDataFreshness,
  selectFormulaExampleRow,
  resolveBuyLogHolding,
  calculateNormalMovePercent,
  calculateMoveScore,
  getDipStrength,
};
