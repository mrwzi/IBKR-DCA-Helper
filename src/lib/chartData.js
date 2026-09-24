const { cycleBandsForTimestamps } = require('./chartCycle.js');

const TIMEFRAMES = Object.freeze([
  { id: '1D', label: '1D', range: '1d', interval: '5m', relayDuration: '1 D', relayBarSize: '5 mins', cacheTtlMs: 60_000 },
  { id: '5D', label: '5D', range: '5d', interval: '15m', relayDuration: '5 D', relayBarSize: '15 mins', cacheTtlMs: 5 * 60_000 },
  { id: '1M', label: '1M', range: '1mo', interval: '1h', relayDuration: '1 M', relayBarSize: '1 hour', cacheTtlMs: 15 * 60_000 },
  { id: '3M', label: '3M', range: '3mo', interval: '1d', relayDuration: '3 M', relayBarSize: '1 day', cacheTtlMs: 6 * 60 * 60_000 },
  { id: '6M', label: '6M', range: '6mo', interval: '1d', relayDuration: '6 M', relayBarSize: '1 day', cacheTtlMs: 6 * 60 * 60_000 },
  { id: 'YTD', label: 'YTD', range: 'ytd', interval: '1d', relayDuration: '1 Y', relayBarSize: '1 day', cacheTtlMs: 6 * 60 * 60_000 },
  { id: '1Y', label: '1Y', range: '1y', interval: '1d', relayDuration: '1 Y', relayBarSize: '1 day', cacheTtlMs: 6 * 60 * 60_000 },
  { id: '5Y', label: '5Y', range: '5y', interval: '1wk', relayDuration: '5 Y', relayBarSize: '1 week', cacheTtlMs: 24 * 60 * 60_000 },
  { id: '10Y', label: '10Y', range: '10y', interval: '1mo', relayDuration: '10 Y', relayBarSize: '1 month', cacheTtlMs: 24 * 60 * 60_000 },
  { id: 'MAX', label: 'MAX', range: 'max', interval: '1mo', relayDuration: '20 Y', relayBarSize: '1 month', cacheTtlMs: 24 * 60 * 60_000 },
]);

function timeframeConfig(id) {
  return TIMEFRAMES.find((item) => item.id === id) || TIMEFRAMES[5];
}

function normalizeInstrument(instrument = {}) {
  const ticker = String(instrument.ticker || instrument.symbol || '').trim().toUpperCase();
  if (!ticker) throw new Error('A chart symbol is required.');
  return {
    ticker,
    symbol: ticker,
    name: String(instrument.name || instrument.displayName || ticker).trim(),
    exchange: String(instrument.exchange || instrument.primaryExchange || '').trim(),
    currency: String(instrument.currency || 'USD').trim().toUpperCase(),
    securityType: String(instrument.securityType || instrument.secType || 'STK').trim().toUpperCase(),
    contractId: instrument.contractId || instrument.conid || null,
    primaryExchange: instrument.primaryExchange || null,
    providerSymbol: String(instrument.providerSymbol || ticker).trim(),
  };
}

function instrumentKey(instrument = {}) {
  const value = normalizeInstrument(instrument);
  return [value.contractId || '', value.ticker, value.exchange, value.currency, value.securityType].join('|');
}

function normalizeBars(rows = []) {
  const unique = new Map();
  for (const row of rows) {
    const time = Number(row.time ?? row.timestamp ?? row.barTime);
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    if (!Number.isInteger(time) || time <= 0 || ![open, high, low, close].every(Number.isFinite)) continue;
    if (high < Math.max(open, close) || low > Math.min(open, close) || high < low) continue;
    const volume = Number(row.volume);
    unique.set(time, {
      time,
      open,
      high,
      low,
      close,
      ...(Number.isFinite(volume) && volume >= 0 ? { volume } : {}),
    });
  }
  return [...unique.values()].sort((left, right) => left.time - right.time);
}

function chartCycleBandsForBars(bars) {
  const normalized = normalizeBars(bars);
  if (normalized.length === 0) return [];
  return cycleBandsForTimestamps(normalized.map((bar) => bar.time));
}

function providerLabel(provider, status = '') {
  const cleanProvider = String(provider || 'Unavailable');
  const cleanStatus = String(status || '').toUpperCase();
  return cleanStatus ? `${cleanProvider} • ${cleanStatus}` : cleanProvider;
}

function markersForBuys(buys = [], bars = []) {
  const candleTimes = normalizeBars(bars).map((bar) => bar.time);
  if (!candleTimes.length) return [];
  const markerByTime = new Map();
  for (const buy of buys) {
    const value = Date.parse(buy.boughtAt || buy.ibkrBoughtAtUtc || '');
    if (!Number.isFinite(value)) continue;
    const buyTime = Math.floor(value / 1000);
    let markerTime = candleTimes[0];
    for (const candleTime of candleTimes) {
      if (candleTime > buyTime) break;
      markerTime = candleTime;
    }
    const current = markerByTime.get(markerTime) || { shares: 0, count: 0 };
    current.shares += Number(buy.sharesBought) || 0;
    current.count += 1;
    markerByTime.set(markerTime, current);
  }
  return [...markerByTime.entries()].map(([time, value]) => ({
    time,
    position: 'belowBar',
    color: '#4fd48a',
    shape: 'arrowUp',
    text: value.count === 1 ? `Buy ${value.shares.toFixed(6)}` : `${value.count} buys`,
  }));
}

module.exports = { TIMEFRAMES, timeframeConfig, normalizeInstrument, instrumentKey, normalizeBars, chartCycleBandsForBars, providerLabel, markersForBuys };
