// Heuristic parsers that turn raw OCR text (from IBKR screenshots) into
// structured fields for the Record Buy form and the IBKR reconciliation
// fields. These are "best effort" — the caller should always let the user
// review the filled-in values before saving anything.

function toNumber(raw) {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toCommissionNumber(raw) {
  if (raw == null) return null;
  const clean = String(raw).replace(/,/g, '');
  if (/^0\d{2}$/.test(clean)) return Number(clean) / 100;
  return toNumber(clean);
}

function readOcrMoneyLine(text, labelPattern) {
  const line = String(text || '').match(new RegExp(`(?:${labelPattern})[^\\n]*`, 'i'))?.[0];
  if (!line) return null;
  const normalized = line.toUpperCase().replace(/\s+/g, '');
  const beforeCurrency = normalized.match(/([0-9OS.,]+)U[5S]D\b/)?.[1];
  if (!beforeCurrency) return null;
  const digits = beforeCurrency.replace(/O/g, '0').replace(/S/g, '5');
  return toCommissionNumber(digits);
}

function readOcrPrice(raw) {
  if (raw == null) return null;
  const clean = String(raw).replace(/,/g, '');
  if (/^\d{4,6}$/.test(clean)) return Number(clean) / 100;
  return toNumber(clean);
}

function findTicker(text, knownTickers) {
  if (!knownTickers || knownTickers.length === 0) return null;
  const upperText = text.toUpperCase();
  // Prefer a ticker that appears right after BUY/SELL, since that's the
  // most reliable spot on the order confirmation popup.
  const actionLineMatch = upperText.match(/\b(BUY|SELL)\b[^\n]*\b([A-Z]{1,6})\b\s*$/m);
  if (actionLineMatch) {
    const candidate = actionLineMatch[2];
    const hit = knownTickers.find((t) => t.toUpperCase() === candidate);
    if (hit) return hit;
  }
  // Otherwise, just look for any known ticker as a standalone word anywhere.
  for (const ticker of knownTickers) {
    const re = new RegExp(`\\b${ticker.toUpperCase()}\\b`);
    if (re.test(upperText)) return ticker;
  }
  return null;
}

function normalizeTradeId(raw) {
  if (!raw) return null;
  return String(raw).trim().replace(/\s+/g, '');
}

function detectCurrency(text, fallback = 'USD') {
  const upper = String(text || '').toUpperCase();
  if (/\bCAD\b|C\$/.test(upper)) return 'CAD';
  if (/\bUSD\b|US\$|\$/.test(upper)) return 'USD';
  return fallback === 'CAD' ? 'CAD' : 'USD';
}

function parseDateTimeLocal(text) {
  const value = String(text || '');
  const ymd = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (ymd) {
    const [, year, month, day, hour, minute] = ymd;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}`;
  }
  const mdy = value.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\b/i);
  if (mdy) {
    const [, month, day, year, rawHour, minute, , meridiem] = mdy;
    let hour = Number(rawHour);
    if (meridiem?.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (meridiem?.toUpperCase() === 'AM' && hour === 12) hour = 0;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}`;
  }
  return null;
}

function field(value, confidence, source = '') {
  return { value, confidence, source };
}

export function validateParsedBuy(parsed = {}) {
  const warnings = [...(parsed.warnings || [])];
  const conflicts = [];
  const blockingReasons = [...(parsed.blockingReasons || [])];
  const upperTicker = String(parsed.ticker || '').toUpperCase();
  const isNonInvestmentTicker = ['CASH', 'USD', 'USD.CAD', 'FXCONV'].includes(upperTicker);
  const hasExplicitNonInvestmentActivity = /\b(FXCONV|USD\.CAD|DEPOSIT|WITHDRAWAL)\b/i.test(parsed.rawText || '');
  if (upperTicker && !/^[A-Z][A-Z0-9.-]{0,9}$/.test(upperTicker)) {
    conflicts.push('Ticker format looks unusual.');
  }
  if (parsed.action && parsed.action !== 'BUY') {
    blockingReasons.push(`Detected ${parsed.action}, not a BUY execution.`);
  }
  if (parsed.transactionStatus === 'preview') {
    blockingReasons.push('IBKR order preview detected; a Filled confirmation is required to record an execution.');
  } else if (parsed.transactionStatus !== 'executed') {
    blockingReasons.push('No completed execution was detected. Upload a screenshot showing Filled or Executed details.');
  }
  if (isNonInvestmentTicker || hasExplicitNonInvestmentActivity) {
    blockingReasons.push('This is cash or FX activity, not a stock/ETF buy.');
  }
  const shares = toNumber(parsed.sharesBought);
  const price = toNumber(parsed.buyPrice);
  const total = toNumber(parsed.totalAmount);
  const fee = toNumber(parsed.feeAmount) ?? 0;
  if (shares != null && price != null && shares > 0 && price > 0) {
    const gross = shares * price;
    if (total != null && Math.abs((gross + fee - total) / Math.max(total, 1)) > 0.02) {
      conflicts.push('Shares × price plus commission does not match the visible total.');
    }
  }
  if (!parsed.ticker) warnings.push('Ticker is uncertain. Pick the holding manually.');
  if (parsed.mode === 'cash') {
    const cashAmount = toNumber(parsed.cashPaidAmount);
    if (cashAmount == null || cashAmount <= 0) warnings.push('Cash amount is missing or invalid.');
  } else if (shares == null || shares <= 0) {
    warnings.push('Shares are missing or invalid.');
  }
  if (price == null || price <= 0) warnings.push('Execution price is missing or invalid.');
  if (!parsed.boughtAt) warnings.push('Trade date/time is uncertain.');
  if (!parsed.priceCurrency) warnings.push('Currency is uncertain.');
  return {
    ...parsed,
    warnings: [...new Set(warnings)],
    conflicts: [...new Set(conflicts)],
    blockingReasons: [...new Set(blockingReasons)],
    saveBlocked: blockingReasons.length > 0,
    needsReview: warnings.length > 0 || conflicts.length > 0 || blockingReasons.length > 0,
  };
}

export function parseBrokerageBuyScreenshot(text, knownTickers = [], defaultPriceCurrency = 'USD') {
  const rawText = String(text || '');
  const upper = rawText.toUpperCase();
  const warnings = [];
  const fieldConfidence = {};
  const result = {
    action: null,
    ticker: null,
    companyName: null,
    mode: 'shares',
    sharesBought: null,
    cashPaidAmount: null,
    cashPaidCurrency: null,
    buyPrice: null,
    previewPriceEstimate: null,
    orderType: null,
    routing: null,
    timeInForce: null,
    limitPrice: null,
    priceCurrency: detectCurrency(rawText, defaultPriceCurrency),
    feeAmount: null,
    feeCurrency: null,
    totalAmount: null,
    brokerTradeId: null,
    boughtAt: null,
    warnings,
    fieldConfidence,
    rawText,
    transactionStatus: 'unknown',
    blockingReasons: [],
  };

  if (!rawText.trim()) return validateParsedBuy({ ...result, warnings: ['No text recognized in the image.'] });

  const isOrderPreview = /\bORDER\s+CONFIRMATION\b|\bORDER\s+PREVIEW\b|\bTRANSMIT\b|\bORDER\s+TYPE\b/i.test(rawText);
  const hasExecutionEvidence = /\b(?:ORDER\s+)?FILLED\b|\bEXECUTED\b|\bEXECUTION\s+PRICE\b|\bFILL\s+PRICE\b|\bTRADE\s+ID\b|\bEXECUTION\s+ID\b/i.test(rawText);
  result.transactionStatus = isOrderPreview && !hasExecutionEvidence ? 'preview' : hasExecutionEvidence ? 'executed' : 'unknown';

  if (result.transactionStatus === 'preview') {
    const orderTypeMatch = rawText.match(/\bOrder\s*Type\s*[:\-]?\s*(Market|Limit)\b/i);
    if (orderTypeMatch) {
      result.orderType = orderTypeMatch[1].toUpperCase();
      fieldConfidence.orderType = field(result.orderType, 0.95, 'order type line');
    }
    const routingMatch = rawText.match(/\bRouting\s*[:\-]?\s*([A-Z]{2,12})\b/i);
    if (routingMatch) {
      result.routing = routingMatch[1].toUpperCase();
      fieldConfidence.routing = field(result.routing, 0.9, 'routing line');
    }
    const tifMatch = rawText.match(/\bTime\s+in\s+Force\s*[:\-]?\s*([A-Z]{2,8})\b/i);
    if (tifMatch) {
      result.timeInForce = tifMatch[1].toUpperCase();
      fieldConfidence.timeInForce = field(result.timeInForce, 0.9, 'time in force line');
    }
    const limitMatch = rawText.match(/\bLimit\s*Price\s*[:\-]?\s*([\d,.]+)/i);
    if (limitMatch) {
      result.limitPrice = readOcrPrice(limitMatch[1]);
      fieldConfidence.limitPrice = field(result.limitPrice, 0.9, 'limit price line');
    }
    const mainQuote = rawText.match(/(?:^|\n)[^\n]*?\b([1-9]\d{1,3})[. ](\d{2})\s+Quantity\b/i);
    const askQuote = rawText.match(/\bAsk\b[^\n\d]{0,12}(?:\d+\s*x\s*)?([\d,.]+)/i);
    const visibleQuote = mainQuote ? Number(`${mainQuote[1]}.${mainQuote[2]}`) : askQuote ? readOcrPrice(askQuote[1]) : null;
    result.previewPriceEstimate = result.orderType === 'LIMIT' && result.limitPrice ? result.limitPrice : visibleQuote;
    if (result.previewPriceEstimate != null) {
      fieldConfidence.previewPriceEstimate = field(result.previewPriceEstimate, 0.75, 'visible preview quote; not an execution price');
    }
  }

  const actionMatch = upper.match(/\b(BUY|SELL|BOT|SLD)\b/);
  if (actionMatch) {
    result.action = actionMatch[1] === 'BOT' ? 'BUY' : actionMatch[1] === 'SLD' ? 'SELL' : actionMatch[1];
    fieldConfidence.action = field(result.action, 0.95, 'action keyword');
  }

  const ticker = findTicker(rawText, knownTickers) || upper.match(/\b(?:BUY|BOT)\s+(?:[\d,.]+\s*)?(?:USD|CAD)?\s*([A-Z][A-Z0-9.-]{0,9})\b/)?.[1];
  if (ticker) {
    result.ticker = ticker.toUpperCase();
    fieldConfidence.ticker = field(result.ticker, knownTickers.map((t) => t.toUpperCase()).includes(result.ticker) ? 0.95 : 0.7, 'ticker match');
  }

  const companyMatch =
    rawText.match(/\b(?:Description|Company|Security)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 .,&'-]{3,60})/i);
  if (companyMatch) {
    result.companyName = companyMatch[1].trim();
    fieldConfidence.companyName = field(result.companyName, 0.6, 'description line');
  }

  const cashOrderMatch = rawText.match(/\b(?:BUY|BOT)\s+([\d,.]+)\s+(USD|CAD)\s+([A-Z][A-Z0-9.-]{0,9})\b/i);
  if (cashOrderMatch) {
    result.mode = 'cash';
    result.cashPaidAmount = toNumber(cashOrderMatch[1]);
    result.cashPaidCurrency = cashOrderMatch[2].toUpperCase();
    fieldConfidence.cashPaidAmount = field(result.cashPaidAmount, 0.95, 'cash order header');
  }

  const quantityMatch =
    rawText.match(/\b(?:Quantity|Qty|Shares)\s*[:-]?\s*([\d,.]+)(?:\s*(USD|CAD))?/i) ||
    rawText.match(/\bBought\s+([\d,.]+)\s+[A-Z][A-Z0-9.-]{0,9}\b/i) ||
    rawText.match(/\b(?:BUY|BOT)\s+([\d,.]+)\s+(?!USD|CAD\b)[A-Z][A-Z0-9.-]{0,9}\b/i);
  if (quantityMatch) {
    if (quantityMatch[2]) {
      result.mode = 'cash';
      result.cashPaidAmount = toNumber(quantityMatch[1]);
      result.cashPaidCurrency = quantityMatch[2].toUpperCase();
      fieldConfidence.cashPaidAmount = field(result.cashPaidAmount, 0.9, 'cash quantity line');
    } else if (result.mode !== 'cash') {
      result.sharesBought = toNumber(quantityMatch[1]);
      fieldConfidence.sharesBought = field(result.sharesBought, 0.9, 'share quantity line');
    }
  }

  const priceMatch =
    rawText.match(/\b(?:Execution price|Fill price|Filled price|Avg Fill Price|Average Fill Price)\s*[:-]?\s*(?:US\$|C\$|\$)?([\d,.]+)/i) ||
    rawText.match(/\b(?:Execution price|Fill price|Filled price|Avg Fill Price|Average Fill Price)\s*[:-]?\s*(USD|CAD)\s*(?:US\$|C\$|\$)?([\d,.]+)/i);
  if (priceMatch) {
    result.buyPrice = toNumber(priceMatch[2] || priceMatch[1]);
    if (priceMatch[1] === 'USD' || priceMatch[1] === 'CAD') result.priceCurrency = priceMatch[1];
    fieldConfidence.buyPrice = field(result.buyPrice, 0.85, 'price line');
  }

  const feeMatch = rawText.match(/\b(?:Commission|Commissions|Fee|Fees)\s*(?:\(?(?:est\.?)?\)?)?\s*[:-]?\s*(?:US\$|C\$|\$)?([\d,.]+)\s*(USD|CAD)?/i);
  if (feeMatch) {
    result.feeAmount = readOcrMoneyLine(rawText, 'Commissions?|Fees?') ?? toCommissionNumber(feeMatch[1]);
    result.feeCurrency = (feeMatch[2] || result.priceCurrency || defaultPriceCurrency || 'USD').toUpperCase();
    fieldConfidence.feeAmount = field(result.feeAmount, 0.85, 'commission line');
  }

  const totalMatch =
    rawText.match(/\b(?:Tota(?:l)?|Net Amount)\s*[:-]?\s*(?:US\$|C\$|\$)?([\d,.]+)\s*(USD|CAD)?/i) ||
    rawText.match(/\bAmount\s*[:-]?\s*(?:US\$|C\$|\$)?([\d,.]+)\s*(USD|CAD)?/i);
  if (totalMatch) {
    result.totalAmount = toNumber(totalMatch[1]);
    if (result.cashPaidAmount == null) result.cashPaidAmount = result.totalAmount;
    if (!result.cashPaidCurrency) result.cashPaidCurrency = (totalMatch[2] || result.priceCurrency || defaultPriceCurrency || 'USD').toUpperCase();
    fieldConfidence.totalAmount = field(result.totalAmount, 0.75, 'total line');
  }

  if (result.mode === 'cash' && result.cashPaidAmount != null && result.totalAmount != null) {
    const visibleFee = result.totalAmount - result.cashPaidAmount;
    if (visibleFee >= 0 && visibleFee <= Math.max(5, result.cashPaidAmount * 0.25) && Math.abs(visibleFee - Number(result.feeAmount || 0)) > 0.000001) {
      result.feeAmount = Number(visibleFee.toFixed(6));
      fieldConfidence.feeAmount = field(result.feeAmount, 0.9, 'visible total minus amount');
      warnings.push('Recovered the commission from the visible amount and total.');
    }
  }

  if (result.mode === 'cash' && result.cashPaidAmount != null && result.feeAmount != null && result.totalAmount != null) {
    const expectedTotal = result.cashPaidAmount + result.feeAmount;
    const relativeError = Math.abs(result.totalAmount - expectedTotal) / Math.max(expectedTotal, 1);
    if (relativeError > 0.05) {
      const corrected = [10, 100, 1000]
        .map((divisor) => result.totalAmount / divisor)
        .find((candidate) => Math.abs(candidate - expectedTotal) / Math.max(expectedTotal, 1) <= 0.02);
      if (corrected != null) {
        result.totalAmount = Number(corrected.toFixed(6));
        fieldConfidence.totalAmount = field(result.totalAmount, 0.65, 'OCR decimal correction');
        warnings.push('Corrected a likely missing decimal in the preview total.');
      }
    }
  }

  const tradeIdMatch = rawText.match(/\b(?:Trade ID|Trade Id|Exec(?:ution)? ID|Execution Id|Order ID|Order #)\s*[:#-]?\s*([A-Z0-9.:-]{6,})/i);
  if (tradeIdMatch) {
    result.brokerTradeId = normalizeTradeId(tradeIdMatch[1]);
    fieldConfidence.brokerTradeId = field(result.brokerTradeId, 0.9, 'trade id line');
  }

  const dateTime = parseDateTimeLocal(rawText);
  if (dateTime) {
    result.boughtAt = dateTime;
    fieldConfidence.boughtAt = field(dateTime, 0.8, 'date/time text');
  }

  if (result.mode !== 'cash' && result.sharesBought != null && result.buyPrice != null) {
    result.mode = 'shares';
  }

  return validateParsedBuy(result);
}

/**
 * Parses OCR text from an IBKR "Order Confirmation" popup (the dialog that
 * shows Action / Quantity / Amount / Commissions / Total) into fields for
 * the Record Buy form.
 *
 * @param {string} text raw OCR text
 * @param {string[]} knownTickers tickers already in the portfolio
 * @param {string} defaultPriceCurrency currency to assume for the live quote if none is detected (usually the holding's own currency)
 */
export function parseOrderConfirmation(text, knownTickers = [], defaultPriceCurrency = 'USD') {
  const warnings = [];
  const result = {
    ticker: null,
    mode: null, // 'cash' | 'shares'
    sharesBought: null,
    cashPaidAmount: null,
    cashPaidCurrency: null,
    buyPrice: null,
    priceCurrency: defaultPriceCurrency,
    feeAmount: null,
    feeCurrency: null,
  };

  if (!text || !text.trim()) {
    warnings.push('No text recognized in the image.');
    return { ...result, warnings };
  }

  const ticker = findTicker(text, knownTickers);
  if (ticker) {
    result.ticker = ticker;
  } else {
    warnings.push("Couldn't confidently match a ticker already in your Portfolio — pick it manually.");
  }

  // Header line style: "BUY 5 USD QQQM" (cash/notional order) or
  // "BUY 0.7488 QQQM" (share-quantity order).
  const headerMatch = text.match(/\b(BUY|SELL)\s+([\d,.]+)\s*(USD|CAD)?\s+[A-Za-z]{1,6}\b/i);
  if (headerMatch) {
    const qty = toNumber(headerMatch[2]);
    const unit = headerMatch[3];
    if (unit) {
      result.mode = 'cash';
      result.cashPaidAmount = qty;
      result.cashPaidCurrency = unit.toUpperCase();
    } else if (qty != null) {
      result.mode = 'shares';
      result.sharesBought = qty;
    }
  }

  // "Quantity" line is the most reliable fallback/cross-check.
  const quantityMatch = text.match(/Quantity\s*[:\-]?\s*([\d,.]+)\s*(USD|CAD)?/i);
  if (quantityMatch) {
    const qty = toNumber(quantityMatch[1]);
    const unit = quantityMatch[2];
    if (unit) {
      result.mode = result.mode || 'cash';
      if (result.cashPaidAmount == null) result.cashPaidAmount = qty;
      if (!result.cashPaidCurrency) result.cashPaidCurrency = unit.toUpperCase();
    } else if (qty != null && result.mode !== 'cash') {
      result.mode = result.mode || 'shares';
      if (result.sharesBought == null) result.sharesBought = qty;
    }
  }

  // "Amount" line confirms/fills the cash amount for cash-mode orders.
  const amountMatch = text.match(/\bAmount\s*[:\-]?\s*([\d,.]+)\s*(USD|CAD)?/i);
  if (amountMatch) {
    const amt = toNumber(amountMatch[1]);
    const unit = amountMatch[2];
    if (result.mode === 'cash' || result.mode == null) {
      result.mode = 'cash';
      if (result.cashPaidAmount == null) result.cashPaidAmount = amt;
      if (!result.cashPaidCurrency && unit) result.cashPaidCurrency = unit.toUpperCase();
    }
  }

  // Commission / fee.
  const feeMatch = text.match(/Commission[s]?\s*(?:\(?est\.?\)?)?\s*[:\-]?\s*([\d,.]+)\s*(USD|CAD)?/i);
  if (feeMatch) {
    result.feeAmount = toCommissionNumber(feeMatch[1]);
    result.feeCurrency = (feeMatch[2] || result.cashPaidCurrency || defaultPriceCurrency || 'USD').toUpperCase();
  }

  // Buy price: prefer the live Ask quote (closest to an actual buy fill),
  // then Bid, then any standalone price-looking number near the top.
  const askMatch = text.match(/\bAsk\b[^\d\-]{0,12}(?:\d+\s*x\s*)?([\d,.]+)/i);
  const bidMatch = text.match(/\bBid\b[^\d\-]{0,12}(?:\d+\s*x\s*)?([\d,.]+)/i);
  if (askMatch) {
    result.buyPrice = toNumber(askMatch[1]);
  } else if (bidMatch) {
    result.buyPrice = toNumber(bidMatch[1]);
  } else {
    const priceMatch = text.match(/(?:^|\n)\s*\$?(\d{1,4}\.\d{2})\b(?!\s*%)/);
    if (priceMatch) result.buyPrice = toNumber(priceMatch[1]);
  }

  if (result.cashPaidCurrency) result.priceCurrency = result.cashPaidCurrency;

  if (!result.mode) warnings.push("Couldn't tell cash-amount mode from share-quantity mode — check the Quantity field.");
  if (result.mode === 'cash' && result.cashPaidAmount == null) warnings.push('Could not read the cash amount.');
  if (result.mode === 'shares' && result.sharesBought == null) warnings.push('Could not read the share quantity.');
  if (result.buyPrice == null) warnings.push('Could not read a buy price — the live quote may not have been visible in the screenshot.');
  if (result.feeAmount == null) warnings.push('Could not read a commission/fee — defaulting to blank.');

  return { ...result, warnings };
}

export function guardParsedOrderPrice(parsed, marketPrice, tolerance = 0.15) {
  const result = {
    ...parsed,
    warnings: [...(parsed?.warnings || [])],
  };
  const referencePrice = toNumber(marketPrice);
  if (referencePrice == null || referencePrice <= 0) return result;

  if (result.buyPrice == null) {
    result.warnings.push(`The current app price is ${referencePrice}, but it was not used because a real execution price is required.`);
    return result;
  }

  const differencePercent = Math.abs(result.buyPrice - referencePrice) / referencePrice;
  if (differencePercent > tolerance) {
    result.warnings.push(`The detected execution price is far from the current app price ${referencePrice}. Verify it against the Filled trade screenshot.`);
  }

  return result;
}

/**
 * Parses OCR text from an IBKR Positions table row into
 * { positionShares, avgPrice, costBasis }, using the fact that
 * costBasis ≈ positionShares × avgPrice to auto-identify which numbers
 * are which, regardless of exact column order (OCR often garbles table
 * alignment).
 *
 * @param {string} text raw OCR text
 * @param {string} ticker the ticker whose row to look for
 */
export function parsePositionRow(text, ticker) {
  const warnings = [];
  const result = { positionShares: null, avgPrice: null, costBasis: null, candidateNumbers: [] };

  if (!text || !text.trim()) {
    warnings.push('No text recognized in the image.');
    return { ...result, warnings };
  }

  const lines = text.split(/\r?\n/);
  const tickerRe = new RegExp(`\\b${ticker}\\b`, 'i');
  const line = lines.find((l) => tickerRe.test(l));

  if (!line) {
    const posMatch = text.match(/\bPOS\b[^\d\-]{0,12}(-?\d[\d,]*\.?\d*)/i);
    if (posMatch) {
      result.positionShares = toNumber(posMatch[1]);
      result.candidateNumbers = result.positionShares == null ? [] : [result.positionShares];
      warnings.push(`Read POS value from chart screenshot, but could not read Avg Price or Cost Basis for "${ticker}".`);
      return { ...result, warnings };
    }
    warnings.push(`Couldn't find a row containing "${ticker}" in the image.`);
    return { ...result, warnings };
  }

  const numberMatches = [...line.matchAll(/-?\d[\d,]*\.?\d*/g)]
    .map((m) => toNumber(m[0]))
    .filter((n) => n != null && n >= 0);

  result.candidateNumbers = numberMatches;

  let best = null;
  for (let i = 0; i < numberMatches.length; i++) {
    for (let j = 0; j < numberMatches.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < numberMatches.length; k++) {
        if (k === i || k === j) continue;
        const shares = numberMatches[i];
        const avgPrice = numberMatches[j];
        const costBasis = numberMatches[k];
        if (shares <= 0 || shares >= 100000 || avgPrice <= 0 || costBasis <= 0) continue;
        const predicted = shares * avgPrice;
        if (predicted === 0) continue;
        const relError = Math.abs(predicted - costBasis) / costBasis;
        if (relError < 0.06 && (!best || relError < best.relError)) {
          best = { shares, avgPrice, costBasis, relError };
        }
      }
    }
  }

  if (best) {
    result.positionShares = best.shares;
    result.avgPrice = best.avgPrice;
    result.costBasis = best.costBasis;
  } else {
    warnings.push('Found the row, but could not confidently tell which numbers are Position / Avg Price / Cost Basis. Check the recognized numbers below and enter them manually.');
  }

  return { ...result, warnings };
}
