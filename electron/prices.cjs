const { calculateNormalMovePercent, evaluateMarketDataFreshness } = require('../src/lib/dca.js');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'DCA Helper/1.0',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function normalizePriceSource(value) {
  const source = String(value || 'Yahoo').trim().toLowerCase();
  if (source === 'ibkr relay' || source === 'ibkr') return 'IBKR Relay';
  if (source === 'auto') return 'Auto';
  return 'Yahoo';
}

async function fetchUsdCadRate() {
  try {
    const json = await fetchJson('https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1');
    const observation = json.observations && json.observations[0];
    const value = observation && observation.FXUSDCAD && observation.FXUSDCAD.v;
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid USD/CAD rate');
    return rate;
  } catch (error) {
    throw new Error(`Bank of Canada USD/CAD refresh failed: ${error.message}`);
  }
}

function lastValidPoint(result) {
  const timestamps = result.timestamp || [];
  const quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
  const closes = quote && Array.isArray(quote.close) ? quote.close : [];
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(closes[index]) && Number.isFinite(timestamps[index])) {
      return { price: Number(closes[index]), timestamp: Number(timestamps[index]) };
    }
  }
  return null;
}

function validRangeExtreme(result, field) {
  const quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
  const values = quote && Array.isArray(quote[field]) ? quote[field] : [];
  const validValues = values.filter((value) => Number.isFinite(value)).map(Number);
  if (validValues.length === 0) return null;
  return field === 'low' ? Math.min(...validValues) : Math.max(...validValues);
}

function parseYahooResult(json, symbolToFetch, holding, sourceMode) {
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error('No Yahoo chart result');

  const meta = result.meta || {};
  const latestPoint = lastValidPoint(result);
  const lastPrice = Number(latestPoint?.price ?? meta.regularMarketPrice);
  const previousClose = Number(meta.previousClose ?? meta.chartPreviousClose);
  const sourceTimestamp = Number(latestPoint?.timestamp ?? meta.regularMarketTime);

  if (!Number.isFinite(lastPrice) || !Number.isFinite(previousClose) || previousClose <= 0) {
    throw new Error('Missing last price or previous close');
  }

  const sourceTimeMs = Number.isFinite(sourceTimestamp) ? sourceTimestamp * 1000 : Date.now();
  const sourceTime = new Date(sourceTimeMs).toISOString();
  const freshness = evaluateMarketDataFreshness({
    sourceTime,
    priceSymbol: symbolToFetch,
    source: `Yahoo ${sourceMode}`,
  });
  const isStale = freshness.isStale;
  const isDelayed = Boolean(meta.exchangeTimezoneName && freshness.isDelayed);
  const warning = freshness.warning;

  return {
    holdingId: holding.id,
    priceSymbol: meta.symbol || symbolToFetch,
    lastPrice,
    previousClose,
    sessionLow: validRangeExtreme(result, 'low'),
    sessionHigh: validRangeExtreme(result, 'high'),
    currency: holding.currency,
    displayName: meta.longName || meta.shortName || null,
    fetchedAt: new Date().toISOString(),
    source: `Yahoo ${sourceMode}`,
    sourceTime,
    isDelayed,
    isStale,
    warning,
    error: null,
  };
}

async function fetchYahooChart(symbolToFetch, range, interval) {
  const encoded = encodeURIComponent(symbolToFetch);
  return fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=${range}&interval=${interval}&includePrePost=false`);
}

function dailyClosesFromYahoo(json) {
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error('No Yahoo historical result');
  const quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
  const closes = quote && Array.isArray(quote.close) ? quote.close : [];
  return closes.filter((value) => Number.isFinite(value)).map(Number);
}

async function fetchYahooNormalMove(symbolToFetch) {
  const json = await fetchYahooChart(symbolToFetch, '3mo', '1d');
  const normalMovePercent = calculateNormalMovePercent(dailyClosesFromYahoo(json).slice(-21));
  if (!Number.isFinite(normalMovePercent) || normalMovePercent <= 0) {
    throw new Error('Not enough historical daily closes');
  }
  return normalMovePercent;
}

async function fetchYahooPrice(holding) {
  const symbolToFetch = String(holding.priceSymbol || holding.ticker || '').trim();
  try {
    return parseYahooResult(await fetchYahooChart(symbolToFetch, '1d', '1m'), symbolToFetch, holding, '1m');
  } catch (intradayError) {
    try {
      const daily = parseYahooResult(await fetchYahooChart(symbolToFetch, '5d', '1d'), symbolToFetch, holding, '1d');
      return {
        ...daily,
        warning: [daily.warning, `Intraday Yahoo refresh failed: ${intradayError.message}`].filter(Boolean).join(' '),
      };
    } catch (dailyError) {
      throw new Error(`Intraday: ${intradayError.message}; Daily: ${dailyError.message}`);
    }
  }
}

async function fetchYahooPriceWithFallback(holding) {
  let price;
  try {
    price = await fetchYahooPrice(holding);
  } catch (primaryError) {
    const ticker = String(holding.ticker || '').trim();
    const priceSymbol = String(holding.priceSymbol || '').trim();
    if (ticker && ticker.toUpperCase() !== priceSymbol.toUpperCase()) {
      try {
        const fallback = await fetchYahooPrice({ ...holding, priceSymbol: ticker });
        price = {
          ...fallback,
          error: null,
          warning: [fallback.warning, `Stored price symbol ${priceSymbol} failed; refreshed with ${ticker}.`].filter(Boolean).join(' '),
        };
      } catch (fallbackError) {
        throw new Error(`${priceSymbol}: ${primaryError.message}; ${ticker}: ${fallbackError.message}`);
      }
    } else {
      throw primaryError;
    }
  }

  if (!holding.refreshHistorical) {
    return price;
  }

  try {
    return {
      ...price,
      normalMovePercent: await fetchYahooNormalMove(price.priceSymbol),
      normalMoveDate: new Date().toISOString().slice(0, 10),
      historicalWarning: null,
    };
  } catch (historicalError) {
    return {
      ...price,
      normalMovePercent: null,
      normalMoveDate: null,
      historicalWarning: `Historical data unavailable for ${price.priceSymbol}. Using fixed fallback rules. Normal move unavailable — using fixed fallback rules. ${historicalError.message}`,
    };
  }
}

function relaySymbolForHolding(holding) {
  return String(holding.ibkrSymbol || holding.priceSymbol || holding.ticker || '').trim().toUpperCase();
}

function relayContractForHolding(holding) {
  return {
    symbol: relaySymbolForHolding(holding),
    displaySymbol: holding.ticker,
    secType: String(holding.ibkrSecType || 'STK').trim().toUpperCase(),
    exchange: String(holding.ibkrExchange || 'SMART').trim().toUpperCase(),
    currency: holding.ibkrCurrency || holding.currency || 'USD',
    primaryExchange: holding.ibkrPrimaryExchange || undefined,
    yahooSymbol: holding.priceSymbol,
  };
}

async function attachHistoricalNormalMove(price, holding) {
  if (!holding.refreshHistorical) return price;

  try {
    return {
      ...price,
      normalMovePercent: await fetchYahooNormalMove(holding.priceSymbol || holding.ticker),
      normalMoveDate: new Date().toISOString().slice(0, 10),
      historicalWarning: null,
    };
  } catch (historicalError) {
    return {
      ...price,
      normalMovePercent: null,
      normalMoveDate: null,
      historicalWarning: `Historical data unavailable for ${holding.priceSymbol || holding.ticker}. Using fixed fallback rules. Normal move unavailable — using fixed fallback rules. ${historicalError.message}`,
    };
  }
}

async function fetchYahooPreviousClose(holding) {
  const symbol = String(holding.priceSymbol || holding.ticker || '').trim();
  if (!symbol) throw new Error('Missing Yahoo symbol for previous close fallback');
  const yahooPrice = await fetchYahooPriceWithFallback({ ...holding, priceSymbol: symbol, refreshHistorical: false });
  const previousClose = Number(yahooPrice.previousClose);
  if (!Number.isFinite(previousClose) || previousClose <= 0) {
    throw new Error(`Yahoo previous close unavailable for ${symbol}`);
  }
  return {
    previousClose,
    priceSymbol: yahooPrice.priceSymbol || symbol,
  };
}

async function resolveRelayPreviousClose(item, holding) {
  const relayPreviousClose = Number(item.previousClose);
  if (Number.isFinite(relayPreviousClose) && relayPreviousClose > 0) {
    return { previousClose: relayPreviousClose, sourceSuffix: '' };
  }

  try {
    const yahoo = await fetchYahooPreviousClose(holding);
    return { previousClose: yahoo.previousClose, sourceSuffix: ' + Yahoo close' };
  } catch (yahooError) {
    const cachedPreviousClose = Number(holding.cachedPreviousClose);
    if (Number.isFinite(cachedPreviousClose) && cachedPreviousClose > 0) {
      return { previousClose: cachedPreviousClose, sourceSuffix: ' + cached close' };
    }
    throw new Error(`Relay returned IBKR last price but no previous close. Yahoo fallback failed: ${yahooError.message}`);
  }
}

async function mapRelayPriceToHolding(item, holding) {
  const lastPrice = Number(item.last ?? (Number(item.bid) + Number(item.ask)) / 2);
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
    throw new Error(item.error || item.message || 'Relay returned missing last price');
  }

  const previousCloseInfo = await resolveRelayPreviousClose(item, holding);
  const previousClose = previousCloseInfo.previousClose;
  const sourceTime = item.marketDataTime || null;
  const source = `${item.source || (item.isDelayed ? 'IBKR delayed' : 'IBKR')}${previousCloseInfo.sourceSuffix}`;
  const freshness = evaluateMarketDataFreshness({
    sourceTime,
    priceSymbol: holding.priceSymbol || holding.ticker,
    source,
  });

  return {
    holdingId: holding.id,
    priceSymbol: holding.priceSymbol || holding.ticker,
    lastPrice,
    previousClose,
    sessionLow: Number.isFinite(Number(item.sessionLow ?? item.dayLow ?? item.low)) ? Number(item.sessionLow ?? item.dayLow ?? item.low) : null,
    sessionHigh: Number.isFinite(Number(item.sessionHigh ?? item.dayHigh ?? item.high)) ? Number(item.sessionHigh ?? item.dayHigh ?? item.high) : null,
    currency: item.currency === 'CAD' || item.currency === 'USD' ? item.currency : holding.currency,
    displayName: null,
    fetchedAt: new Date().toISOString(),
    source,
    sourceTime,
    isDelayed: Boolean(item.isDelayed),
    isStale: freshness.isStale,
    warning: [freshness.warning, item.message, previousCloseInfo.sourceSuffix ? 'Previous close filled from fallback data.' : ''].filter(Boolean).join(' ') || null,
    error: item.status && item.status !== 'ok' && item.status !== 'delayed' ? item.status : null,
  };
}

async function fetchRelayPrices(holdings, settings = {}) {
  const relayUrl = String(settings.ibkrRelayUrl || '').trim();
  const apiKey = String(settings.ibkrRelayApiKey || '');
  if (!relayUrl) throw new Error('IBKR Relay URL is required.');
  if (!apiKey) throw new Error('IBKR Relay API key is required.');

  const url = new URL('/prices', relayUrl.endsWith('/') ? relayUrl : `${relayUrl}/`);
  const symbols = holdings.map(relaySymbolForHolding).filter(Boolean);
  url.searchParams.set('symbols', symbols.join(','));
  url.searchParams.set('contracts', JSON.stringify(holdings.map(relayContractForHolding)));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const json = await fetchJson(url.toString(), {
      signal: controller.signal,
      headers: { 'x-api-key': apiKey },
    });
    if (!json.ok) throw new Error(json.error || 'IBKR Relay returned an error');
    const prices = Array.isArray(json.prices) ? json.prices : [];
    const bySymbol = new Map(
      prices.map((price) => [String(price.symbol || '').trim().toUpperCase(), price]),
    );

    return Promise.all(
      holdings.map(async (holding) => {
        try {
          const keys = [relaySymbolForHolding(holding), holding.ticker, holding.priceSymbol].map((value) =>
            String(value || '').trim().toUpperCase(),
          );
          const item = keys.map((key) => bySymbol.get(key)).find(Boolean);
          if (!item) throw new Error(`IBKR Relay did not return ${relaySymbolForHolding(holding)}`);
          return attachHistoricalNormalMove(await mapRelayPriceToHolding(item, holding), holding);
        } catch (error) {
          return {
            holdingId: holding.id,
            priceSymbol: holding.priceSymbol,
            lastPrice: null,
            previousClose: null,
            currency: holding.currency,
            fetchedAt: new Date().toISOString(),
            source: 'IBKR',
            error: error.message,
          };
        }
      }),
    );
  } catch (error) {
    throw new Error(`IBKR Relay refresh failed: ${error.name === 'AbortError' ? 'Request timed out' : error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkRelayConnection(settings = {}) {
  const relayUrl = String(settings.ibkrRelayUrl || '').trim();
  const apiKey = String(settings.ibkrRelayApiKey || '');
  if (!relayUrl) throw new Error('IBKR Relay URL is required.');
  if (!apiKey) throw new Error('IBKR Relay API key is required.');

  const url = new URL('/health', relayUrl.endsWith('/') ? relayUrl : `${relayUrl}/`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const json = await fetchJson(url.toString(), {
      signal: controller.signal,
      headers: { 'x-api-key': apiKey },
    });
    if (!json.ok) throw new Error(json.error || 'IBKR Relay health check failed');
    return {
      ok: true,
      source: 'IBKR Relay',
      message: `IBKR Relay reachable. Mode: ${json.mode || 'read-only'}.`,
      ibkrConnected: Boolean(json.ibkrConnected),
      mode: json.mode || 'read-only',
    };
  } catch (error) {
    throw new Error(`IBKR Relay check failed: ${error.name === 'AbortError' ? 'Request timed out' : error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkYahooConnection() {
  try {
    const json = await fetchYahooChart('SPY', '5d', '1d');
    const result = json.chart && json.chart.result && json.chart.result[0];
    if (!result) throw new Error('No Yahoo chart result');
    return {
      ok: true,
      source: 'Yahoo',
      message: 'Yahoo price data reachable.',
    };
  } catch (error) {
    throw new Error(`Yahoo check failed: ${error.message}`);
  }
}

async function lookupSymbol(symbol) {
  const cleanSymbol = String(symbol || '').trim();
  if (!cleanSymbol) throw new Error('Symbol is required.');

  const defaultCurrency = cleanSymbol.toUpperCase().endsWith('.TO') ? 'CAD' : 'USD';
  const encoded = encodeURIComponent(cleanSymbol);
  const [priceResult, searchResult] = await Promise.allSettled([
    fetchYahooPrice({ id: 0, ticker: cleanSymbol, priceSymbol: cleanSymbol, currency: defaultCurrency }),
    fetchJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encoded}&quotesCount=8&newsCount=0`),
  ]);

  if (priceResult.status === 'rejected') {
    throw new Error(`Yahoo lookup failed: ${priceResult.reason.message}`);
  }

  const price = priceResult.value;
  const searchQuotes =
    searchResult.status === 'fulfilled' && Array.isArray(searchResult.value.quotes)
      ? searchResult.value.quotes
      : [];
  const searchQuote =
    searchQuotes.find((quote) => String(quote.symbol || '').toUpperCase() === cleanSymbol.toUpperCase()) ||
    searchQuotes[0] ||
    {};
  const currency = price.currency === 'CAD' || price.currency === 'USD' ? price.currency : defaultCurrency;
  const changePercent =
    Number.isFinite(price.lastPrice) && Number.isFinite(price.previousClose) && price.previousClose > 0
      ? ((price.lastPrice - price.previousClose) / price.previousClose) * 100
      : null;

  return {
    symbol: cleanSymbol.toUpperCase(),
    displayName: searchQuote.longname || searchQuote.shortname || price.displayName || cleanSymbol.toUpperCase(),
    priceSymbol: price.priceSymbol || cleanSymbol,
    currency,
    lastPrice: Number.isFinite(price.lastPrice) ? price.lastPrice : null,
    previousClose: Number.isFinite(price.previousClose) ? price.previousClose : null,
    changePercent,
    fetchedAt: price.fetchedAt || new Date().toISOString(),
    source: price.source,
    sourceTime: price.sourceTime,
    isDelayed: price.isDelayed,
    isStale: price.isStale,
    warning: price.warning,
  };
}

async function fetchPrices(holdings) {
  return Promise.all(
    holdings.map(async (holding) => {
      try {
        return await fetchYahooPriceWithFallback(holding);
      } catch (error) {
        return {
          holdingId: holding.id,
          priceSymbol: holding.priceSymbol,
          lastPrice: null,
          previousClose: null,
          currency: holding.currency,
          fetchedAt: new Date().toISOString(),
          error: error.message,
        };
      }
    }),
  );
}

async function mergeAutoRelayWithYahooFallback(holdings, relayResults, relayError = null) {
  const relayByHoldingId = new Map(relayResults.map((result) => [result.holdingId, result]));
  const holdingsNeedingYahoo = relayError
    ? holdings
    : holdings.filter((holding) => {
        const result = relayByHoldingId.get(holding.id);
        return !result || result.error || !Number.isFinite(Number(result.lastPrice)) || Number(result.lastPrice) <= 0;
      });

  if (holdingsNeedingYahoo.length === 0) return relayResults;

  const yahooResults = await fetchPrices(holdingsNeedingYahoo);
  const yahooByHoldingId = new Map(yahooResults.map((result) => [result.holdingId, result]));
  const relayErrorMessage = relayError ? relayError.message : '';

  return holdings.map((holding) => {
    const relayResult = relayByHoldingId.get(holding.id);
    const shouldUseYahoo =
      relayError ||
      !relayResult ||
      relayResult.error ||
      !Number.isFinite(Number(relayResult.lastPrice)) ||
      Number(relayResult.lastPrice) <= 0;

    if (!shouldUseYahoo) return relayResult;

    const yahooResult = yahooByHoldingId.get(holding.id);
    if (!yahooResult) {
      return relayResult || {
        holdingId: holding.id,
        priceSymbol: holding.priceSymbol,
        lastPrice: null,
        previousClose: null,
        currency: holding.currency,
        fetchedAt: new Date().toISOString(),
        source: 'Yahoo fallback',
        error: relayErrorMessage || 'Auto mode fallback did not return data.',
      };
    }

    const fallbackReason = relayErrorMessage || relayResult?.error || 'IBKR Relay returned missing or invalid last price.';
    return {
      ...yahooResult,
      source: yahooResult.error ? yahooResult.source : 'Yahoo fallback',
      warning: [yahooResult.warning, `IBKR Relay failed for ${holding.ticker}: ${fallbackReason}. Yahoo fallback used.`]
        .filter(Boolean)
        .join(' '),
    };
  });
}

async function fetchPricesWithSource(holdings, settings = {}) {
  const source = normalizePriceSource(settings.priceSource);
  if (source === 'IBKR Relay') {
    try {
      return await fetchRelayPrices(holdings, settings);
    } catch (error) {
      return holdings.map((holding) => ({
        holdingId: holding.id,
        priceSymbol: holding.priceSymbol,
        lastPrice: null,
        previousClose: null,
        currency: holding.currency,
        fetchedAt: new Date().toISOString(),
        source: 'IBKR',
        error: error.message,
      }));
    }
  }

  if (source === 'Auto') {
    try {
      const relayResults = await fetchRelayPrices(holdings, settings);
      return mergeAutoRelayWithYahooFallback(holdings, relayResults);
    } catch (relayError) {
      return mergeAutoRelayWithYahooFallback(holdings, [], relayError);
    }
  }

  return fetchPrices(holdings);
}

module.exports = {
  fetchPrices,
  fetchPricesWithSource,
  fetchRelayPrices,
  fetchUsdCadRate,
  mergeAutoRelayWithYahooFallback,
  checkRelayConnection,
  checkYahooConnection,
  lookupSymbol,
  dailyClosesFromYahoo,
  fetchYahooNormalMove,
  normalizePriceSource,
};
