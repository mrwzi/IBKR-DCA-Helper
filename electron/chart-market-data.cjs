const { normalizePriceSource } = require('./prices.cjs');
const { timeframeConfig, normalizeBars, normalizeInstrument, instrumentKey, providerLabel } = require('../src/lib/chartData.js');

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'User-Agent': 'DCA Helper/1.0', Accept: 'application/json', ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(error.name === 'AbortError' ? 'Request timed out' : error.message);
  } finally {
    clearTimeout(timeout);
  }
}

function quoteFromYahooResult(result, instrument) {
  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const timestamps = result.timestamp || [];
  let close = null;
  let timestamp = null;
  for (let index = timestamps.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(quote.close?.[index])) {
      close = Number(quote.close[index]);
      timestamp = Number(timestamps[index]);
      break;
    }
  }
  const latest = Number(meta.regularMarketPrice ?? close);
  return {
    price: Number.isFinite(latest) ? latest : null,
    timestamp: Number(meta.regularMarketTime ?? timestamp) || null,
    currency: String(meta.currency || instrument.currency || 'USD').toUpperCase(),
    marketState: meta.marketState || (meta.regularMarketTime ? 'REGULAR' : 'UNKNOWN'),
    exchange: meta.fullExchangeName || meta.exchangeName || instrument.exchange || '',
    name: meta.longName || meta.shortName || instrument.name,
    delayed: Boolean(meta.exchangeTimezoneName && meta.regularMarketTime && Number(meta.regularMarketTime) * 1000 < Date.now() - 70_000),
  };
}

function barsFromYahooResult(result) {
  const quote = result.indicators?.quote?.[0] || {};
  return normalizeBars((result.timestamp || []).map((time, index) => ({
    time,
    open: quote.open?.[index],
    high: quote.high?.[index],
    low: quote.low?.[index],
    close: quote.close?.[index],
    volume: quote.volume?.[index],
  })));
}

async function yahooSearch(query) {
  const text = String(query || '').trim();
  if (!text) return [];
  const json = await fetchJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(text)}&quotesCount=12&newsCount=0`);
  return (Array.isArray(json.quotes) ? json.quotes : [])
    .filter((quote) => quote.symbol && ['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'].includes(String(quote.quoteType || '').toUpperCase()))
    .map((quote) => normalizeInstrument({
      ticker: quote.symbol,
      providerSymbol: quote.symbol,
      name: quote.longname || quote.shortname || quote.symbol,
      exchange: quote.exchDisp || quote.exchange || '',
      currency: quote.currency || 'USD',
      securityType: quote.quoteType === 'ETF' ? 'ETF' : 'STK',
    }));
}

async function yahooSnapshot(instrument, timeframe) {
  const config = timeframeConfig(timeframe);
  const clean = normalizeInstrument(instrument);
  const symbol = encodeURIComponent(clean.providerSymbol || clean.ticker);
  const json = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${config.range}&interval=${config.interval}&includePrePost=false`);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(json.chart?.error?.description || 'Yahoo returned no chart history.');
  const bars = barsFromYahooResult(result);
  if (!bars.length) throw new Error('Yahoo returned no usable OHLC bars.');
  const quote = quoteFromYahooResult(result, clean);
  return { instrument: { ...clean, name: quote.name || clean.name, exchange: quote.exchange || clean.exchange, currency: quote.currency || clean.currency }, bars, quote, provider: 'Yahoo', status: quote.delayed ? 'DELAYED' : 'AVAILABLE' };
}

function relayUrl(path, settings) {
  const base = String(settings.ibkrRelayUrl || '').trim();
  if (!base) throw new Error('IBKR Relay URL is required.');
  return new URL(path, base.endsWith('/') ? base : `${base}/`);
}

function relayHeaders(settings) {
  const key = String(settings.ibkrRelayApiKey || '');
  if (!key) throw new Error('IBKR Relay API key is required.');
  return { 'x-api-key': key };
}

function relayContract(instrument) {
  const clean = normalizeInstrument(instrument);
  return {
    symbol: clean.ticker,
    secType: clean.securityType === 'ETF' ? 'STK' : clean.securityType,
    exchange: clean.exchange || 'SMART',
    currency: clean.currency,
    primaryExchange: clean.primaryExchange || undefined,
    conid: clean.contractId || undefined,
  };
}

async function relaySearch(query, settings) {
  const url = relayUrl('/search', settings);
  url.searchParams.set('q', String(query || '').trim());
  const json = await fetchJson(url, { headers: relayHeaders(settings) });
  if (!json.ok) throw new Error(json.error || 'IBKR Relay search failed.');
  return (Array.isArray(json.results) ? json.results : []).map((item) => normalizeInstrument({
    ticker: item.symbol,
    providerSymbol: item.symbol,
    name: item.name || item.symbol,
    exchange: item.exchange || item.primaryExchange || '',
    primaryExchange: item.primaryExchange || null,
    currency: item.currency || 'USD',
    securityType: item.secType || 'STK',
    contractId: item.conid || null,
  }));
}

async function relaySnapshot(instrument, timeframe, settings) {
  const config = timeframeConfig(timeframe);
  const clean = normalizeInstrument(instrument);
  const url = relayUrl('/history', settings);
  url.searchParams.set('contract', JSON.stringify(relayContract(clean)));
  url.searchParams.set('duration', config.relayDuration);
  url.searchParams.set('barSize', config.relayBarSize);
  const json = await fetchJson(url, { headers: relayHeaders(settings), timeoutMs: 20_000 });
  if (!json.ok) throw new Error(json.error || 'IBKR Relay historical request failed.');
  const bars = normalizeBars(json.bars || []);
  if (!bars.length) throw new Error('IBKR returned no usable OHLC bars.');
  const quote = json.quote || {};
  let latestQuote = {
    price: Number.isFinite(Number(quote.price)) ? Number(quote.price) : bars.at(-1).close,
    timestamp: Number(quote.timestamp) || bars.at(-1).time,
    currency: json.instrument?.currency || clean.currency,
    exchange: json.instrument?.exchange || clean.exchange,
    name: json.instrument?.name || clean.name,
    marketState: quote.marketState || 'HISTORICAL',
    delayed: Boolean(json.isDelayed),
  };
  let status = json.isDelayed ? 'DELAYED' : 'HISTORICAL';
  try {
    const priceUrl = relayUrl('/prices', settings);
    priceUrl.searchParams.set('symbols', clean.ticker);
    priceUrl.searchParams.set('contracts', JSON.stringify([relayContract(clean)]));
    const priceJson = await fetchJson(priceUrl, { headers: relayHeaders(settings) });
    const live = priceJson.prices?.[0];
    if (priceJson.ok && Number.isFinite(Number(live?.last))) {
      latestQuote = { ...latestQuote, price: Number(live.last), timestamp: live.marketDataTime ? Math.floor(new Date(live.marketDataTime).getTime() / 1000) : latestQuote.timestamp, marketState: live.isDelayed ? 'DELAYED' : 'LIVE', delayed: Boolean(live.isDelayed) };
      status = live.isDelayed ? 'DELAYED' : 'LIVE';
    }
  } catch {
    // Historical data remains valid; the UI explicitly labels this quote as historical.
  }
  return {
    instrument: { ...clean, name: json.instrument?.name || clean.name, exchange: json.instrument?.exchange || clean.exchange, currency: json.instrument?.currency || clean.currency },
    bars,
    quote: latestQuote,
    provider: 'IBKR Relay',
    status,
  };
}

async function searchSymbols(query, settings = {}) {
  const source = normalizePriceSource(settings.priceSource);
  if (source === 'Yahoo') return yahooSearch(query);
  if (source === 'IBKR Relay') return relaySearch(query, settings);
  try {
    return await relaySearch(query, settings);
  } catch (relayError) {
    const results = await yahooSearch(query);
    return results.map((result) => ({ ...result, fallbackNotice: `IBKR Relay unavailable: ${relayError.message}` }));
  }
}

function cacheIsFresh(cache, timeframe) {
  if (!cache?.bars?.length || !cache.fetchedAt) return false;
  return Date.now() - new Date(cache.fetchedAt).getTime() < timeframeConfig(timeframe).cacheTtlMs;
}

async function getChartSnapshot({ instrument, timeframe, settings, db, forceRefresh = false }) {
  const clean = normalizeInstrument(instrument);
  const config = timeframeConfig(timeframe);
  const requested = normalizePriceSource(settings.priceSource);
  const preferred = requested === 'Yahoo' ? 'Yahoo' : 'IBKR Relay';
  const cached = db.listMarketBars({ instrumentKey: instrumentKey(clean), provider: preferred, interval: config.interval });
  const fallbackCache = requested === 'Auto'
    ? db.listMarketBars({ instrumentKey: instrumentKey(clean), provider: 'Yahoo', interval: config.interval })
    : null;
  const cache = cacheIsFresh(cached, timeframe) ? { data: cached, provider: preferred, status: 'CACHED' }
    : cacheIsFresh(fallbackCache, timeframe) ? { data: fallbackCache, provider: 'Yahoo', status: 'FALLBACK • CACHED' }
      : null;
  if (!forceRefresh && cache) {
    return {
      instrument: clean,
      bars: cache.data.bars,
      quote: { price: cache.data.bars.at(-1).close, timestamp: cache.data.bars.at(-1).time, currency: clean.currency, exchange: clean.exchange, name: clean.name, marketState: 'CACHED', delayed: true },
      provider: cache.provider,
      status: cache.status,
      cache: true,
      sourceLabel: providerLabel(cache.provider, cache.status),
    };
  }

  let snapshot;
  if (requested === 'Yahoo') snapshot = await yahooSnapshot(clean, timeframe);
  else if (requested === 'IBKR Relay') snapshot = await relaySnapshot(clean, timeframe, settings);
  else {
    try {
      snapshot = await relaySnapshot(clean, timeframe, settings);
    } catch (relayError) {
      snapshot = await yahooSnapshot(clean, timeframe);
      snapshot.status = 'FALLBACK';
      snapshot.fallbackReason = `IBKR Relay unavailable: ${relayError.message}`;
    }
  }
  db.upsertMarketBars({ instrumentKey: instrumentKey(clean), provider: snapshot.provider, interval: config.interval, bars: snapshot.bars, fetchedAt: new Date().toISOString(), splitAdjustment: snapshot.provider === 'Yahoo' ? 'provider-adjusted' : 'provider-reported' });
  return { ...snapshot, cache: false, sourceLabel: providerLabel(snapshot.provider, snapshot.status) };
}

async function getLatestQuote({ instrument, provider, settings }) {
  const snapshot = String(provider) === 'IBKR Relay'
    ? await relaySnapshot(instrument, '1D', settings)
    : await yahooSnapshot(instrument, '1D');
  return { quote: snapshot.quote, provider: snapshot.provider, status: snapshot.status, sourceLabel: providerLabel(snapshot.provider, snapshot.status) };
}

// The renderer never talks to a provider directly. This polling adapter gives
// callers a subscription-shaped API while the existing HTTP relay remains
// read-only and has no WebSocket endpoint. It is intentionally opt-in.
function subscribeQuote({ instrument, timeframe, settings, db, onQuote, intervalMs = 20_000 }) {
  let active = true;
  let running = false;
  const tick = async () => {
    if (!active || running) return;
    running = true;
    try {
      const snapshot = await getChartSnapshot({ instrument, timeframe, settings, db, forceRefresh: true });
      if (active) onQuote?.(snapshot.quote, snapshot);
    } catch (error) {
      if (active) onQuote?.(null, { error: error.message });
    } finally { running = false; }
  };
  const timer = setInterval(tick, Math.max(10_000, Number(intervalMs) || 20_000));
  return () => { active = false; clearInterval(timer); };
}

module.exports = { searchSymbols, getChartSnapshot, getLatestQuote, subscribeQuote, yahooSnapshot, relaySnapshot, normalizeBars, normalizeInstrument, instrumentKey };
