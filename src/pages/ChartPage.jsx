import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { TIMEFRAMES, normalizeInstrument } from '../lib/chartData.js';
import { FOUR_YEAR_CYCLE } from '../lib/chartCycle.js';
import { MarketChart } from '../components/charts/MarketChart.jsx';

function money(value, currency) {
  return Number.isFinite(Number(value)) ? new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(Number(value)) : '—';
}

function initialInstrument(holdings) {
  const holding = holdings.find((item) => item.enabled) || holdings[0];
  return holding ? normalizeInstrument({ ticker: holding.ticker, providerSymbol: holding.priceSymbol, name: holding.name, exchange: holding.ibkrPrimaryExchange || holding.ibkrExchange || '', primaryExchange: holding.ibkrPrimaryExchange, currency: holding.currency, securityType: holding.ibkrSecType || 'STK' }) : null;
}

export function ChartPage({ holdings = [], buyLog = [], settings = null }) {
  const api = window.dcaApi;
  const [instrument, setInstrument] = useState(() => initialInstrument(holdings));
  const [timeframe, setTimeframe] = useState('YTD');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchState, setSearchState] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCycle, setShowCycle] = useState(true);
  const [showBuys, setShowBuys] = useState(false);
  const [showAverageCost, setShowAverageCost] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!instrument && holdings.length) setInstrument(initialInstrument(holdings));
  }, [holdings, instrument]);

  const selectedBuys = useMemo(() => buyLog.filter((row) => String(row.ticker || '').toUpperCase() === String(instrument?.ticker || '').toUpperCase()), [buyLog, instrument]);
  const averageCost = useMemo(() => {
    const usable = selectedBuys.filter((row) => String(row.priceCurrency || '').toUpperCase() === String(instrument?.currency || '').toUpperCase());
    const shares = usable.reduce((total, row) => total + (Number(row.sharesBought) || 0), 0);
    return shares > 0 ? usable.reduce((total, row) => total + (Number(row.sharesBought) || 0) * (Number(row.buyPrice) || 0), 0) / shares : null;
  }, [selectedBuys, instrument]);

  const load = useCallback(async (forceRefresh = false) => {
    if (!instrument) return;
    const request = ++requestId.current;
    setLoading(true); setError('');
    try {
      const next = await api.loadChart({ instrument, timeframe, forceRefresh });
      if (request !== requestId.current) return;
      setSnapshot(next);
    } catch (loadError) {
      if (request === requestId.current) { setSnapshot(null); setError(loadError.message || 'Could not load market data.'); }
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [api, instrument, timeframe]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!instrument || !snapshot?.provider || snapshot.status === 'CACHED') return undefined;
    let active = true;
    const refreshQuote = async () => {
      try {
        const next = await api.getChartQuote({ instrument, provider: snapshot.provider });
        if (active) setSnapshot((current) => current && current.provider === next.provider ? { ...current, quote: next.quote, status: next.status, sourceLabel: next.sourceLabel } : current);
      } catch {
        // Preserve the verified chart and its visible source label if a quote refresh fails.
      }
    };
    const timer = window.setInterval(refreshQuote, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [api, instrument, snapshot?.provider, snapshot?.status]);

  useEffect(() => {
    const text = query.trim();
    if (!text) { setResults([]); setSearchState(''); return undefined; }
    let active = true;
    setSearchState('Searching…');
    const timer = window.setTimeout(async () => {
      try {
        const next = await api.searchChartSymbols(text);
        if (!active) return;
        setResults(next); setSearchState(next.length ? '' : 'No matching supported security found.');
      } catch (searchError) {
        if (active) { setResults([]); setSearchState(searchError.message || 'Search unavailable.'); }
      }
    }, 260);
    return () => { active = false; window.clearTimeout(timer); };
  }, [api, query]);

  const selectInstrument = (next) => {
    setInstrument(normalizeInstrument(next)); setQuery(''); setResults([]); setSnapshot(null); setError('');
  };
  const sourceText = snapshot?.sourceLabel || (settings?.priceSource === 'IBKR Relay' ? 'IBKR Relay • unavailable' : 'Market data unavailable');
  const quote = snapshot?.quote;

  return (
    <main className="layout chartWorkspace">
      <section className="panel chartPanel">
        <div className="sectionHead chartPageHead"><div><h2>Charts</h2><span>Market data stays separate from your portfolio and Buy Log.</span></div><button className="secondary" onClick={() => load(true)} disabled={loading || !instrument}><RefreshCw size={15} /> Refresh chart</button></div>
        <div className="chartToolbar">
          <div className="chartSearch"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker or company, e.g. NVDA or NVIDIA" aria-label="Search chart symbols" />{(results.length > 0 || searchState) && <div className="chartSearchResults" role="listbox">{searchState && <p>{searchState}</p>}{results.map((result) => <button key={[result.contractId || '', result.ticker, result.exchange, result.currency].join('|')} type="button" onClick={() => selectInstrument(result)}><strong>{result.ticker}</strong><span>{result.name}</span><small>{[result.exchange, result.currency].filter(Boolean).join(' · ')}</small></button>)}</div>}</div>
          <div className="timeframeButtons" aria-label="Chart timeframe">{TIMEFRAMES.map((item) => <button type="button" key={item.id} className={timeframe === item.id ? 'active' : 'secondary'} onClick={() => setTimeframe(item.id)}>{item.label}</button>)}</div>
        </div>
        {holdings.length > 0 && <div className="chartQuickSymbols"><span>Your portfolio</span>{holdings.filter((item) => item.enabled).map((holding) => <button key={holding.id} className={instrument?.ticker === holding.ticker ? 'active' : 'secondary'} onClick={() => selectInstrument({ ticker: holding.ticker, providerSymbol: holding.priceSymbol, name: holding.name, exchange: holding.ibkrPrimaryExchange || holding.ibkrExchange || '', primaryExchange: holding.ibkrPrimaryExchange, currency: holding.currency, securityType: holding.ibkrSecType || 'STK' })}>{holding.ticker}</button>)}</div>}
      </section>

      {!instrument ? <section className="panel emptyState">Search for a supported stock or ETF to begin. Charts are not limited to portfolio holdings.</section> : <>
        <section className="panel chartInstrumentPanel"><div><h2>{instrument.ticker} <span>{snapshot?.instrument?.name || instrument.name}</span></h2><p>{[snapshot?.instrument?.exchange || instrument.exchange, snapshot?.instrument?.currency || instrument.currency, snapshot?.instrument?.securityType || instrument.securityType].filter(Boolean).join(' · ')}</p></div><div className="chartQuote"><span>{sourceText}</span><strong>{money(quote?.price, quote?.currency || instrument.currency)}</strong><small>{quote?.marketState || 'Unknown market status'}{quote?.timestamp ? ` · ${new Date(quote.timestamp * 1000).toLocaleString()}` : ''}</small></div></section>
        <section className="panel chartDisplayPanel">
          <div className="chartToggles"><label className="toggle"><input type="checkbox" checked={showCycle} onChange={(event) => setShowCycle(event.target.checked)} />4-Year Cycle</label><label className="toggle"><input type="checkbox" checked={showBuys} onChange={(event) => setShowBuys(event.target.checked)} />My Buys</label><label className="toggle"><input type="checkbox" checked={showAverageCost} onChange={(event) => setShowAverageCost(event.target.checked)} disabled={averageCost == null} />Average Cost</label><label className="toggle"><input type="checkbox" checked={showVolume} onChange={(event) => setShowVolume(event.target.checked)} />Volume</label></div>
          {showCycle && <p className="chartCycleNote">{FOUR_YEAR_CYCLE.name}: 2014 is the cycle reference year; bearish years recur every {FOUR_YEAR_CYCLE.periodYears} years backward and forward (…2010, 2014, 2018, 2022, 2026, 2030…). Bands are a personal model only and never affect prices or DCA calculations.</p>}
          <div className="chartViewportFrame">
            <MarketChart dataKey={`${instrument.contractId || instrument.ticker}|${timeframe}`} bars={snapshot?.bars || []} buys={selectedBuys} averageCost={averageCost} showCycle={showCycle} showBuys={showBuys} showAverageCost={showAverageCost} showVolume={showVolume} />
            {loading && <div className="chartLoading"><i className="stageSpinner" /> Loading verified market data…</div>}
            {error && <div className="chartError"><strong>Market data unavailable</strong><span>{error}</span></div>}
            {!loading && !error && (!snapshot || !snapshot.bars?.length) && <div className="chartEmptyOverlay">No verified OHLC history is available for this instrument and timeframe.</div>}
          </div>
          <p className="chartAttribution">Charts powered by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a>. {snapshot?.fallbackReason || 'The source shown above is used for this chart; providers are never silently mixed.'}</p>
        </section>
      </>}
    </main>
  );
}
