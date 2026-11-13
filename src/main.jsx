import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Edit3, MoreVertical, Plus, Trash2 } from 'lucide-react';
import './styles.css';
import { recognizeImageText } from './lib/ocr.js';
import { guardParsedOrderPrice, parseBrokerageBuyScreenshot, parsePositionRow, validateParsedBuy } from './lib/ocrParse.js';
import { usePersistentState } from './hooks/usePersistentState.js';
import { AppChrome } from './components/AppChrome.jsx';
import { TodayPage } from './pages/TodayPage.jsx';
import { BuyLogPage } from './pages/BuyLogPage.jsx';
import { CalendarPage } from './pages/CalendarPage.jsx';
import { ChartPage } from './pages/ChartPage.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { RecordBuyModal } from './components/modals/RecordBuyModal.jsx';
import { TradeDetailsModal } from './components/modals/TradeDetailsModal.jsx';
import { CalendarDayModal } from './components/modals/CalendarDayModal.jsx';
import { HoldingModal } from './components/modals/HoldingModal.jsx';
import { BrokerPriceModal } from './components/modals/BrokerPriceModal.jsx';
import { AddMoneyModal } from './components/AddMoneyModal.jsx';
import { LimitOrderModal } from './components/LimitOrderModal.jsx';
import { isLimitPriceReached } from './lib/orderLogic.js';

import { emptyForm, emptyBuyForm, money, percent, shares, fixedShares, usdCommission, formatDate, dateKey, NON_INVESTMENT_TICKERS, isInvestmentBuyLogRow, addDaysToDateKey, monthLabel, buildBuyCalendarDays, isManualRow, isUntrustedRow, formatSource, formatCadCostStatus, buySourceLabel, sourceBadgeClass, formatStatus, formatTodayStatus, formatShortReason, formatLastPrice, formatChange, deriveBrokerPreviousClose, numberOrNull, roundMoney, roundShares, convertAmountToCad, convertAmount, calculateBuyRecordPreview, defaultCurrency, validateHolding, getRangeStart, filterHistory, buildReport, buildBuyLogReport, buildSinceLastBuyMap, buildBoughtTodaySet } from './lib/appViewModel.jsx';

function App() {
  const [activeTab, setActiveTab] = usePersistentState('dca.activeTab', 'today');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [holdings, setHoldings] = useState([]);
  const [history, setHistory] = useState([]);
  const [buyLog, setBuyLog] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [cashSummary, setCashSummary] = useState({ balanceCAD: 0, transactions: [] });
  const [addMoneyOpen, setAddMoneyOpen] = useState(false);
  const [limitOrderOpen, setLimitOrderOpen] = useState(false);
  const [ibkrActivityStatus, setIbkrActivityStatus] = useState({ history: [], reminder: { due: false } });
  const [ibkrActivityPreview, setIbkrActivityPreview] = useState(null);
  const [ibkrImportStage, setIbkrImportStage] = useState('');
  const [plan, setPlan] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [holdingModalOpen, setHoldingModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const toastTimerRef = useRef(null);
  const [formError, setFormError] = useState('');
  const [formTouched, setFormTouched] = useState(false);
  const [settingsWarning, setSettingsWarning] = useState('');
  const [lookup, setLookup] = useState(null);
  const [lookupStatus, setLookupStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [checkingConnection, setCheckingConnection] = useState('');
  const [reportRange, setReportRange] = useState('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [buySearch, setBuySearch] = usePersistentState('dca.buySearch', '');
  const [buyTickerFilter, setBuyTickerFilter] = usePersistentState('dca.buyTickerFilter', 'all');
  const [buyDateFilter, setBuyDateFilter] = usePersistentState('dca.buyDateFilter', '');
  const [buySourceFilter, setBuySourceFilter] = usePersistentState('dca.buySourceFilter', 'all');
  const [buyCadFilter, setBuyCadFilter] = usePersistentState('dca.buyCadFilter', 'all');
  const [buySort, setBuySort] = usePersistentState('dca.buySort', 'dateDesc');
  const [selectedBuyLogRow, setSelectedBuyLogRow] = useState(null);
  const [calendarTickerFilter, setCalendarTickerFilter] = usePersistentState('dca.calendarTickerFilter', 'all');
  const [calendarView, setCalendarView] = usePersistentState('dca.calendarView', 'calendar');
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);
  const [holdingActionId, setHoldingActionId] = useState(null);
  const [buyModal, setBuyModal] = useState(null);
  const [buyForm, setBuyForm] = useState(emptyBuyForm);
  const [buyScanStatus, setBuyScanStatus] = useState('');
  const [buyScanReview, setBuyScanReview] = useState(null);
  const [buyScreenshotPreview, setBuyScreenshotPreview] = useState('');
  const [holdingScanStatus, setHoldingScanStatus] = useState('');
  const buyScanInputRef = useRef(null);
  const holdingScanInputRef = useRef(null);
  const [brokerModal, setBrokerModal] = useState(null);
  const [brokerForm, setBrokerForm] = useState({
    manualPriceOverride: '',
    manualPreviousCloseOverride: '',
    changeDollar: '',
    changePercent: '',
  });
  const lastRefreshAtRef = useRef(0);

  const api = window.dcaApi;

  useEffect(() => {
    if (!message) return undefined;
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setMessage('');
      toastTimerRef.current = null;
    }, 4000);
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [message]);

  async function reload() {
    const [nextHoldings, nextSettings, nextPlan, nextHistory, nextBuyLog, nextPendingOrders, nextIbkrStatus, nextCashSummary] = await Promise.all([
      api.listPortfolio(),
      api.getSettings(),
      api.calculatePlan(),
      api.listHistory(),
      api.listBuyLog(),
      api.listPendingOrders(),
      api.getIbkrActivityStatus(),
      api.getCashSummary(),
    ]);
    setHoldings(nextHoldings);
    setSettings(nextSettings);
    setPlan(nextPlan);
    setHistory(nextHistory);
    setBuyLog(nextBuyLog);
    setPendingOrders(nextPendingOrders);
    setIbkrActivityStatus(nextIbkrStatus);
    setCashSummary(nextCashSummary);
  }

  async function chooseIbkrActivityStatement(mode) {
    try {
      setIbkrImportStage('Choose the CSV file…');
      const result = await api.chooseIbkrActivityStatement(mode);
      if (!result?.canceled) {
        setIbkrImportStage('');
        setIbkrActivityPreview(result);
        if (result.preview?.statement?.selectionNotice) setMessage(result.preview.statement.selectionNotice);
      }
      else setIbkrImportStage('');
    } catch (error) { setIbkrImportStage(''); setMessage(error.message); }
  }

  async function applyIbkrActivityStatement() {
    if (!ibkrActivityPreview) return;
    setBusy(true);
    try {
      const result = await api.applyIbkrActivityStatement(ibkrActivityPreview.token);
      setIbkrActivityPreview(null);
      setIbkrImportStage('');
      await reload();
      setMessage(`IBKR statement applied and post-save audit passed (${result.verification.executionsChecked} executions, ${result.verification.holdingTotalsChecked} holding totals, no duplicate IDs). Backup: ${result.backupPath}`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function dismissIbkrActivityReminder() {
    await api.dismissIbkrActivityReminder(ibkrActivityStatus.reminder.month);
    setIbkrActivityStatus((current) => ({ ...current, reminder: { ...current.reminder, due: false } }));
  }

  useEffect(() => {
    reload().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    setFormError(validateHolding(form, 'dipRanking'));
  }, [form]);

  useEffect(() => {
    const symbol = form.ticker.trim();
    if (!symbol) {
      setLookup(null);
      setLookupStatus('');
      return undefined;
    }

    const timeout = setTimeout(async () => {
      setLookupStatus('Looking up symbol...');
      try {
        const result = await api.lookupSymbol(form.priceSymbol || symbol);
        setLookup(result);
        setLookupStatus('');
        setForm((current) => ({
          ...current,
          name: current.name || result.displayName || current.ticker.toUpperCase(),
          priceSymbol: current.priceSymbol || result.priceSymbol || current.ticker,
          currency: result.currency || defaultCurrency(current.ticker),
          ibkrSymbol: current.ibkrSymbol || current.ticker.toUpperCase(),
          ibkrCurrency: current.ibkrCurrency || result.currency || defaultCurrency(current.ticker),
        }));
      } catch (error) {
        setLookup(null);
        setLookupStatus(error.message);
      }
    }, 700);

    return () => clearTimeout(timeout);
  }, [form.ticker, form.priceSymbol]);

  const rows = plan?.rows || [];
  const currentPriceByTicker = useMemo(
    () => Object.fromEntries(
      rows
        .map((row) => [row.ticker, {
          lastPrice: Number(row.lastPrice),
          sessionLow: row.fetchedAt && String(row.fetchedAt).slice(0, 10) === new Date().toISOString().slice(0, 10) ? Number(row.sessionLow) : NaN,
          sessionHigh: row.fetchedAt && String(row.fetchedAt).slice(0, 10) === new Date().toISOString().slice(0, 10) ? Number(row.sessionHigh) : NaN,
        }])
        .filter(([, price]) => Number.isFinite(price.lastPrice) && price.lastPrice > 0),
    ),
    [rows],
  );
  const hasPendingLimitOrders = useMemo(
    () => pendingOrders.some((order) => String(order.orderType || '').toUpperCase() === 'LIMIT' && String(order.status || '').toUpperCase() !== 'CANCELLED'),
    [pendingOrders],
  );
  const isCashPool = false;
  const isDipRanking = true;
  const enabledHoldingCount = holdings.filter((holding) => holding.enabled).length;
  const formIsValid = formError === '';
  const hasHoldings = holdings.length > 0;
  const hasDcaRows = rows.length > 0;
  const canRefresh = !busy && enabledHoldingCount > 0;
  const canSaveToday = Boolean(plan) && hasDcaRows;
  const canExport = history.length > 0;
  const bestBuy = plan?.bestBuy;

  const targetStatus = useMemo(() => {
    if (!plan || !hasHoldings || isCashPool || isDipRanking) return null;
    return {
      text: `Target total: ${Number(plan.totalTargetPercent).toFixed(2)}%`,
      ok: plan.targetPercentValid,
    };
  }, [plan, hasHoldings, isCashPool, isDipRanking]);

  const filteredHistory = useMemo(
    () => filterHistory(history, reportRange, customStart, customEnd),
    [history, reportRange, customStart, customEnd],
  );
  const report = useMemo(() => buildReport(filteredHistory), [filteredHistory]);
  const buyLogReport = useMemo(() => buildBuyLogReport(buyLog, rows, holdings, settings), [buyLog, rows, holdings, settings]);
  const sinceLastBuyByTicker = useMemo(() => buildSinceLastBuyMap(buyLog, rows), [buyLog, rows]);
  const boughtTodayTickers = useMemo(() => buildBoughtTodaySet(buyLog), [buyLog]);
  const calendarDays = useMemo(() => buildBuyCalendarDays(calendarMonth, buyLog), [calendarMonth, buyLog]);
  const tickerOptions = useMemo(() => [...new Set(buyLog.map((buy) => buy.ticker).filter(Boolean))].sort(), [buyLog]);
  const filteredBuyLog = useMemo(() => {
    const query = buySearch.trim().toUpperCase();
    const rowsToShow = buyLog.filter((row) => {
      const rawSource = String(row.source || 'manual').toLowerCase();
      const source = rawSource === 'ibkr-activity' ? 'ibkr' : rawSource;
      const cadStatus = String(row.cadCostStatus || 'exact').toLowerCase();
      if (buyTickerFilter !== 'all' && row.ticker !== buyTickerFilter) return false;
      if (buyDateFilter && dateKey(row.boughtAt) !== buyDateFilter) return false;
      if (buySourceFilter !== 'all' && source !== buySourceFilter) return false;
      if (buyCadFilter !== 'all' && cadStatus !== buyCadFilter) return false;
      if (query && !`${row.ticker} ${row.note} ${row.ibkrTradeId || ''}`.toUpperCase().includes(query)) return false;
      return true;
    });
    return [...rowsToShow].sort((a, b) => {
      if (buySort === 'ticker') return String(a.ticker).localeCompare(String(b.ticker));
      if (buySort === 'sharesDesc') return Number(b.sharesBought) - Number(a.sharesBought);
      if (buySort === 'costDesc') return Number(b.totalCadCost) - Number(a.totalCadCost);
      if (buySort === 'dateAsc') return new Date(a.boughtAt) - new Date(b.boughtAt);
      return new Date(b.boughtAt) - new Date(a.boughtAt);
    });
  }, [buyLog, buySearch, buyTickerFilter, buyDateFilter, buySourceFilter, buyCadFilter, buySort]);
  const calendarFilteredDays = useMemo(
    () =>
      calendarDays.map((day) => {
        const buys = calendarTickerFilter === 'all' ? day.buys : day.buys.filter((buy) => buy.ticker === calendarTickerFilter);
        return { ...day, buys, totalCAD: buys.reduce((sum, buy) => sum + Number(buy.totalCadCost || 0), 0) };
      }),
    [calendarDays, calendarTickerFilter],
  );
  const buyRowsByTicker = useMemo(() => new Map(buyLogReport.tickerBreakdown.map((row) => [row.ticker, row])), [buyLogReport]);
  const portfolioValue = buyLogReport.currentValueCAD || plan?.currentPortfolioValueCAD || 0;
  const reconciliationIssues = buyLogReport.tickerBreakdown.filter(
    (row) =>
      (row.shareDifference != null && Math.abs(row.shareDifference) >= 0.00001) ||
      (row.avgPriceDifference != null && Math.abs(row.avgPriceDifference) >= 0.01),
  ).length;
  const calendarMonthTotal = calendarFilteredDays
    .filter((day) => day.inMonth)
    .reduce((sum, day) => sum + day.totalCAD, 0);
  const buyPreview = useMemo(
    () =>
      calculateBuyRecordPreview({
        mode: buyForm.mode,
        sharesBought: buyForm.sharesBought,
        cashPaidAmount: buyForm.cashPaidAmount,
        cashPaidCurrency: buyForm.cashPaidCurrency,
        buyPrice: buyForm.buyPrice,
        priceCurrency: buyForm.priceCurrency,
        feeAmount: buyForm.feeAmount,
        feeCurrency: buyForm.feeCurrency,
        usdCadRate: settings?.usdCadRate,
      }),
    [buyForm, settings?.usdCadRate],
  );
  const autoRefreshSeconds = Math.max(60, Number(settings?.autoRefreshIntervalSeconds) || 60);

  function updateForm(field, value) {
    setFormTouched(true);
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'ticker') {
        const clean = value.trim().toUpperCase();
        next.ticker = clean;
        if (!current.priceSymbol || current.priceSymbol === current.ticker) next.priceSymbol = clean;
        next.currency = defaultCurrency(clean);
        if (!current.ibkrSymbol || current.ibkrSymbol === current.ticker) next.ibkrSymbol = clean;
        if (!current.ibkrCurrency || current.ibkrCurrency === current.currency) next.ibkrCurrency = next.currency;
      }
      if (field === 'currency' && (!current.ibkrCurrency || current.ibkrCurrency === current.currency)) {
        next.ibkrCurrency = value;
      }
      return next;
    });
  }

  function findHoldingForBuy() {
    const requestedId = String(buyForm.holdingId || buyModal?.holdingId || buyModal?.id || '');
    const requestedTicker = String(buyForm.ticker || buyModal?.ticker || '').trim().toUpperCase();
    return (
      holdings.find((item) => requestedId && String(item.id) === requestedId) ||
      holdings.find(
        (item) =>
          requestedTicker &&
          (String(item.ticker || '').toUpperCase() === requestedTicker ||
            String(item.priceSymbol || '').toUpperCase() === requestedTicker),
      ) ||
      null
    );
  }

  function openAddHolding() {
    setForm(emptyForm);
    setLookup(null);
    setAdvancedOpen(false);
    setFormTouched(false);
    setHoldingScanStatus('');
    setHoldingModalOpen(true);
  }

  function openEditHolding(holding) {
    setHoldingScanStatus('');
    setForm({
      ...holding,
      targetPercent: holding.targetPercent ?? '',
      manualPriceOverride: holding.manualPriceOverride ?? '',
      manualPreviousCloseOverride: holding.manualPreviousCloseOverride ?? '',
      buySizeOverrideShares: holding.buySizeOverrideShares ?? '',
      ibkrSymbol: holding.ibkrSymbol ?? '',
      ibkrSecType: holding.ibkrSecType ?? 'STK',
      ibkrExchange: holding.ibkrExchange ?? 'SMART',
      ibkrCurrency: holding.ibkrCurrency ?? holding.currency ?? 'USD',
      ibkrPrimaryExchange: holding.ibkrPrimaryExchange ?? '',
      ibkrPositionShares: holding.ibkrPositionShares ?? '',
      ibkrAvgPrice: holding.ibkrAvgPrice ?? '',
      ibkrCostBasis: holding.ibkrCostBasis ?? '',
    });
    setAdvancedOpen(true);
    setFormTouched(false);
    setHoldingModalOpen(true);
  }

  async function handleHoldingScreenshot(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const ticker = (form.ticker || '').trim();
    if (!ticker) {
      setHoldingScanStatus('Enter the ticker first, then scan the screenshot.');
      return;
    }
    setHoldingScanStatus('Reading image…');
    try {
      const text = await recognizeImageText(file);
      const parsed = parsePositionRow(text, ticker);
      const filledFields = [];
      setForm((current) => {
        const next = { ...current };
        if (parsed.positionShares != null) {
          next.ibkrPositionShares = parsed.positionShares;
          filledFields.push('position shares');
        }
        if (parsed.avgPrice != null) {
          next.ibkrAvgPrice = parsed.avgPrice;
          filledFields.push('avg price');
        }
        if (parsed.costBasis != null) {
          next.ibkrCostBasis = parsed.costBasis;
          filledFields.push('cost basis');
        }
        return next;
      });
      if (filledFields.length === 0) {
        const numbers = parsed.candidateNumbers?.length ? ` Numbers found in that row: ${parsed.candidateNumbers.join(', ')}.` : '';
        setHoldingScanStatus(`Couldn't confidently read the IBKR numbers for ${ticker}.${numbers} Please enter them manually. ${parsed.warnings.join(' ')}`);
      } else {
        setHoldingScanStatus(`Filled in ${filledFields.join(', ')} from the screenshot — please double check before saving.`);
      }
    } catch (error) {
      setHoldingScanStatus(`Scan failed: ${error.message || 'unknown error'}`);
    }
  }

  async function saveHolding(event) {
    event.preventDefault();
    setFormTouched(true);
    const payload = {
      ...form,
      ticker: form.ticker.trim().toUpperCase(),
      priceSymbol: (form.priceSymbol || form.ticker).trim(),
      name: form.name.trim() || form.ticker.trim().toUpperCase(),
      lookupPrice: lookup
        ? {
            lastPrice: lookup.lastPrice,
            previousClose: lookup.previousClose,
            fetchedAt: new Date().toISOString(),
            source: lookup.source,
            sourceTime: lookup.sourceTime,
            isDelayed: lookup.isDelayed,
            isStale: lookup.isStale,
            warning: lookup.warning,
          }
        : null,
    };
    const error = validateHolding(payload, 'dipRanking');
    setFormError(error);
    if (error) return;

    setBusy(true);
    setMessage('');
    try {
      await api.saveHolding(payload);
      setForm(emptyForm);
      setLookup(null);
      setAdvancedOpen(false);
      setHoldingModalOpen(false);
      setFormTouched(false);
      await reload();
    } catch (saveError) {
      setFormError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteHolding(holding) {
    if (!window.confirm(`Delete ${holding.ticker}?`)) return;

    setBusy(true);
    try {
      await api.deleteHolding(holding.id);
      if (form.id === holding.id) setForm(emptyForm);
      await reload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function validateSettings(nextSettings) {
    if (Number(nextSettings.cashToInvestCAD) < 0) return 'Cash to invest CAD cannot be negative.';
    if (Number(nextSettings.cashPoolStartingCAD) < 0) return 'Cash pool CAD cannot be negative.';
    if (Number(nextSettings.cashPoolUsedCAD) < 0) return 'Cash used CAD cannot be negative.';
    if (Number(nextSettings.defaultBuySizeShares) <= 0) return 'Default buy size must be greater than zero.';
    if (Number(nextSettings.dipCashAvailableCAD) < 0) return 'Cash available CAD cannot be negative.';
    if (Number(nextSettings.autoRefreshIntervalSeconds) < 60) return 'Auto refresh interval cannot be below 60 seconds.';
    if (
      Number(nextSettings.minimumDip) >= 0 ||
      Number(nextSettings.biggerDipThreshold) >= 0 ||
      Number(nextSettings.hugeDipThreshold) >= 0 ||
      Number(nextSettings.cashPoolMinimumDip) >= 0 ||
      Number(nextSettings.cashPoolBiggerDipThreshold) >= 0 ||
      Number(nextSettings.cashPoolHugeDipThreshold) >= 0 ||
      Number(nextSettings.dipMinimumDip) >= 0 ||
      Number(nextSettings.dipStrongDip) >= 0 ||
      Number(nextSettings.dipHugeDip) >= 0
    ) {
      return 'Dip values should be negative, like -1.';
    }
    return '';
  }

  async function saveSettings(nextSettings) {
    const dipSettings = {
      ...nextSettings,
      strategyMode: 'dipRanking',
      autoRefreshIntervalSeconds: Math.max(60, Number(nextSettings.autoRefreshIntervalSeconds) || 60),
    };
    setSettings(dipSettings);
    const warning = validateSettings(dipSettings);
    setSettingsWarning(warning);
    if (Number(dipSettings.dipCashAvailableCAD) < 0) return;
    await api.saveSettings(dipSettings);
    await reload();
  }

  async function updateUsdCadRate(value) {
    await saveSettings({
      ...settings,
      usdCadRate: Number(value),
      usdCadRateSource: 'manual',
      usdCadRateUpdatedAt: new Date().toISOString(),
      usdCadRateWarning: '',
    });
  }

  async function saveCashTransaction(transaction) {
    setBusy(true);
    try {
      await api.saveCashTransaction(transaction);
      await reload();
      setMessage('Money added. Available cash was recalculated.');
      return true;
    } catch (error) { setMessage(error.message || 'Could not add money.'); }
    finally { setBusy(false); }
    return false;
  }

  async function saveLimitOrder(form) {
    const holding = holdings.find((item) => String(item.id) === String(form.holdingId))
      || holdings.find((item) => item.ticker === form.ticker);
    const mode = form.mode === 'cash' ? 'cash' : 'shares';
    const sharesBought = Number(form.sharesBought);
    const cashPaidAmount = Number(form.cashPaidAmount);
    const limitPrice = Number(form.limitPrice);
    const estimatedFeeAmount = form.estimatedFeeAmount === '' || form.estimatedFeeAmount == null ? null : Number(form.estimatedFeeAmount);
    if (!holding) {
      setMessage('Choose a holding for this limit order.');
      return;
    }
    if (mode === 'shares' && (!Number.isFinite(sharesBought) || sharesBought <= 0)) { setMessage('Quantity must be greater than zero.'); return; }
    if (mode === 'cash' && (!Number.isFinite(cashPaidAmount) || cashPaidAmount <= 0)) { setMessage('Cash amount must be greater than zero.'); return; }
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
      setMessage('Limit price must be greater than zero.');
      return;
    }
    if (estimatedFeeAmount != null && (!Number.isFinite(estimatedFeeAmount) || estimatedFeeAmount < 0)) {
      setMessage('Estimated fee must be zero or greater.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.savePendingOrder({
        holdingId: holding.id,
        ticker: holding.ticker,
        mode,
        sharesBought: mode === 'shares' ? sharesBought : null,
        cashPaidAmount: mode === 'cash' ? cashPaidAmount : null,
        cashPaidCurrency: form.cashPaidCurrency === 'CAD' ? 'CAD' : 'USD',
        orderType: 'LIMIT',
        orderSide: form.orderSide === 'SELL' ? 'SELL' : 'BUY',
        limitPrice,
        limitCurrency: form.limitCurrency === 'CAD' ? 'CAD' : 'USD',
        estimatedFeeAmount,
        feeCurrency: form.feeCurrency === 'USD' ? 'USD' : 'CAD',
        note: form.note,
        screenshotDataUrl: form.screenshotDataUrl,
      });
      if (result?.ok === false) {
        setMessage(result.error || 'Could not save limit order.');
        return;
      }
      setLimitOrderOpen(false);
      await reload();
      setActiveTab('buyLog');
      setMessage('Limit order saved. DCA Helper will flag it when the price reaches your target; complete it in IBKR.');
    } catch (error) {
      setMessage(error.message || 'Could not save limit order.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCashTransaction(id) {
    if (!window.confirm('Delete this cash activity?')) return;
    setBusy(true);
    try {
      await api.deleteCashTransaction(id);
      await reload();
      setMessage('Cash activity deleted. Available cash was recalculated.');
    } catch (error) { setMessage(error.message || 'Could not delete cash activity.'); }
    finally { setBusy(false); }
  }

  async function refreshPrices(options = { manual: true }) {
    if (!canRefresh) {
      if (options.auto) return;
      setMessage('Refresh Prices is available after at least one holding is enabled.');
      return;
    }
    if (options.auto && (busy || Date.now() - lastRefreshAtRef.current < 60000)) return;

    setBusy(true);
    if (!options.auto) {
      setMessage(
        options.refreshHistorical
          ? 'Refreshing latest prices, historical normal moves, and USD/CAD...'
          : 'Refreshing latest prices, previous closes, changes, and USD/CAD...',
      );
    }
    try {
      lastRefreshAtRef.current = Date.now();
      const result = await api.refreshPrices({
        manual: !options.auto,
        refreshHistorical: Boolean(options.refreshHistorical),
      });
      await reload();
      const warnings = [...(result.priceWarnings || []), result.fxWarning].filter(Boolean);
      if (!options.auto || warnings.length) {
        setMessage(
          warnings.length
            ? `Price refresh failed: ${warnings.join(' | ')}`
            : 'Prices refreshed. IBKR Preview is final.',
        );
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkIbkrConnection() {
    setCheckingConnection('ibkr');
    setConnectionStatus('Checking IBKR Relay...');
    try {
      const result = await api.checkIbkrConnection();
      setConnectionStatus(`${result.message}${result.ibkrConnected ? ' IB Gateway connected.' : ' Relay is up; IB Gateway status not confirmed.'}`);
    } catch (error) {
      setConnectionStatus(error.message);
    } finally {
      setCheckingConnection('');
    }
  }

  async function checkYahooConnection() {
    setCheckingConnection('yahoo');
    setConnectionStatus('Checking Yahoo...');
    try {
      const result = await api.checkYahooConnection();
      setConnectionStatus(result.message);
    } catch (error) {
      setConnectionStatus(error.message);
    } finally {
      setCheckingConnection('');
    }
  }

  useEffect(() => {
    if (enabledHoldingCount === 0 || (!settings?.autoRefreshEnabled && !hasPendingLimitOrders)) return undefined;
    const id = window.setInterval(() => {
      refreshPrices({ auto: true });
    }, autoRefreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [settings?.autoRefreshEnabled, autoRefreshSeconds, enabledHoldingCount, hasPendingLimitOrders]);

  useEffect(() => {
    const reached = pendingOrders.filter((order) => (
      String(order.orderType || '').toUpperCase() === 'LIMIT'
      && String(order.status || '').toUpperCase() === 'PENDING'
      && isLimitPriceReached(order, currentPriceByTicker?.[order.ticker])
    ));
    if (reached.length === 0) return undefined;
    let cancelled = false;
    Promise.all(reached.map((order) => api.markPendingOrderReady(order.id)))
      .then(() => { if (!cancelled) return reload(); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pendingOrders, currentPriceByTicker]);

  async function saveToday() {
    if (!canSaveToday) {
      setMessage('Save Today is available after there is at least one DCA row.');
      return;
    }
    await api.saveTodayHistory(plan);
    await reload();
    setMessage('Today history saved.');
  }

  async function exportCsv() {
    if (!canExport) {
      setMessage('Export CSV is available after saving history.');
      return;
    }
    const result = await api.exportCsv();
    if (result?.error) setMessage(result.error.message);
    else if (!result?.canceled) setMessage(`Exported CSV: ${result.filePath}`);
  }

  async function exportReportCsv() {
    if (buyLog.length === 0) {
      setMessage('No report rows to export for this range.');
      return;
    }
    const result = await api.exportBuyLogCsv();
    if (result?.error) setMessage(result.error.message);
    else if (!result?.canceled) setMessage(`Exported report CSV: ${result.filePath}`);
  }

  function openRecordBuy(seed = {}) {
    const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const seededHolding =
      holdings.find((item) => seed.holdingId && item.id === seed.holdingId) ||
      holdings.find((item) => seed.ticker && item.ticker === seed.ticker) ||
      holdings[0];
    setBuyScanStatus('');
    setBuyScanReview(null);
    setBuyScreenshotPreview('');
    setBuyModal({
      manual: true,
      global: true,
      holdingId: seededHolding?.id || '',
      ticker: seededHolding?.ticker || '',
    });
    setBuyForm({
      ...emptyBuyForm,
      holdingId: seededHolding?.id || '',
      ticker: seededHolding?.ticker || '',
      sharesBought: seed.estimatedShares || seed.suggestedShares || '',
      buyPrice: Number.isFinite(Number(seed.lastPrice)) ? Number(Number(seed.lastPrice).toFixed(4)) : '',
      priceCurrency: seededHolding?.currency || seed.currency || 'USD',
      cashPaidAmount: seed.suggestedBuyCAD || seed.estimatedCostCAD || '',
      cashPaidCurrency: seededHolding?.currency || seed.currency || 'USD',
      boughtAt: nowLocal,
    });
  }

  function openManualBuy() {
    openRecordBuy();
  }

  function editBuyLog(row) {
    const holding = holdings.find((item) => item.id === row.holdingId) || { id: row.holdingId, ticker: row.ticker };
    setBuyScanStatus('');
    setBuyScanReview(null);
    setBuyScreenshotPreview('');
    setBuyModal({ ...holding, ticker: row.ticker, holdingId: row.holdingId, isBuyLogEdit: true });
    setBuyForm({
      ...emptyBuyForm,
      id: row.id,
      holdingId: row.holdingId,
      ticker: row.ticker,
      sharesBought: row.sharesBought,
      buyPrice: row.buyPrice,
      priceCurrency: row.priceCurrency,
      feeAmount: row.feeCAD || '',
      feeCurrency: 'CAD',
      brokerTradeId: row.ibkrTradeId || '',
      boughtAt: row.boughtAt ? new Date(new Date(row.boughtAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
      note: row.note || '',
    });
  }

  async function handleBuyScreenshot(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await analyzeBuyScreenshotFile(file);
  }

  async function handleBuyPaste(event) {
    if (!buyModal) return;
    const imageFile = [...(event.clipboardData?.files || [])].find((file) => file.type.startsWith('image/'));
    const pastedText = event.clipboardData?.getData('text/plain');
    const target = event.target;
    const isEditingField = target instanceof HTMLElement && (
      target.matches('input, textarea, select') || target.isContentEditable
    );
    if (imageFile) {
      event.preventDefault();
      await analyzeBuyScreenshotFile(imageFile);
    } else if (pastedText?.trim() && !isEditingField) {
      event.preventDefault();
      await analyzeBuyText(pastedText);
    }
  }

  async function analyzeBuyScreenshotFile(file) {
    const previewDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Could not read the screenshot.'));
      reader.readAsDataURL(file);
    });
    setBuyScreenshotPreview(previewDataUrl);
    setBuyScanStatus('Reading image…');
    try {
      const text = await recognizeImageText(file);
      await analyzeBuyText(text);
    } catch (error) {
      setBuyScanStatus(`Scan failed: ${error.message || 'unknown error'}`);
    }
  }

  async function analyzeBuyText(text) {
    setBuyScanStatus('Analyzing screenshot text…');
    try {
      const knownTickers = holdings.map((h) => h.ticker).filter(Boolean);
      const currentHolding = holdings.find((h) => h.ticker === buyForm.ticker);
      const defaultCurrency = currentHolding?.currency || buyForm.priceCurrency || 'USD';
      const rawParsed = parseBrokerageBuyScreenshot(text, knownTickers, defaultCurrency);
      const parsedTicker = rawParsed.ticker || buyForm.ticker || buyModal?.ticker;
      const marketRow = rows.find((row) => row.ticker === parsedTicker);
      const parsed = validateParsedBuy(guardParsedOrderPrice(rawParsed, marketRow?.lastPrice, 0.15));
      const filledFields = [
        parsed.ticker ? 'ticker' : null,
        parsed.companyName ? 'company name' : null,
        parsed.boughtAt ? 'date/time' : null,
        parsed.mode ? `${parsed.mode} mode` : null,
        parsed.cashPaidAmount != null ? 'cash amount' : null,
        parsed.sharesBought != null ? 'shares bought' : null,
        parsed.buyPrice != null ? 'buy price' : null,
        parsed.feeAmount != null ? 'fee' : null,
        parsed.totalAmount != null ? 'total amount' : null,
        parsed.brokerTradeId ? 'broker trade ID' : null,
      ].filter(Boolean);
      setBuyForm((current) => {
        const sameTicker = !current.ticker || !parsed.ticker || current.ticker === parsed.ticker;
        const next = {
          ...current,
          // Multiple IBKR screenshots often contain complementary fields.
          // Preserve values from the previous scan when both scans refer to
          // the same ticker; only replace fields actually detected now.
          ...(sameTicker ? {} : {
            sharesBought: '',
            cashPaidAmount: '',
            buyPrice: '',
            feeAmount: '',
            brokerTradeId: '',
            totalAmount: '',
            boughtAt: '',
          }),
        };
        if (parsed.ticker) {
          next.ticker = parsed.ticker;
          const matchedHolding = holdings.find((h) => h.ticker === parsed.ticker);
          next.holdingId = matchedHolding?.id || next.holdingId;
          setBuyModal((modal) => ({
            ...(modal || {}),
            manual: true,
            global: true,
            holdingId: matchedHolding?.id || modal?.holdingId || '',
            ticker: matchedHolding?.ticker || parsed.ticker,
            companyName: parsed.companyName || modal?.companyName,
          }));
        }
        if (parsed.companyName) next.companyName = parsed.companyName;
        if (parsed.mode) next.mode = parsed.mode;
        if (parsed.sharesBought != null) {
          next.sharesBought = parsed.sharesBought;
        }
        if (parsed.cashPaidAmount != null) next.cashPaidAmount = parsed.cashPaidAmount;
        if (parsed.totalAmount != null) next.totalAmount = parsed.totalAmount;
        if (parsed.cashPaidCurrency) next.cashPaidCurrency = parsed.cashPaidCurrency;
        if (parsed.buyPrice != null) {
          next.buyPrice = parsed.buyPrice;
        }
        if (parsed.priceCurrency) next.priceCurrency = parsed.priceCurrency;
        if (parsed.feeAmount != null) {
          next.feeAmount = parsed.feeAmount;
        }
        if (parsed.feeCurrency) next.feeCurrency = parsed.feeCurrency;
        if (parsed.boughtAt) next.boughtAt = parsed.boughtAt;
        if (parsed.brokerTradeId) next.brokerTradeId = parsed.brokerTradeId;
        if (parsed.companyName && !next.note) next.note = `Detected company: ${parsed.companyName}`;
        return next;
      });
      setBuyScanReview(parsed);
      const issues = [...(parsed.blockingReasons || []), ...(parsed.warnings || []), ...(parsed.conflicts || [])];
      const warningText = issues.length ? ` (${issues.join(' ')})` : '';
      if (parsed.saveBlocked) {
        setBuyScanStatus(parsed.blockingReasons?.[0] || 'This screenshot cannot be saved as a completed buy.');
      } else if (filledFields.length === 0) {
        setBuyScanStatus(`Couldn't read useful data from that image.${warningText}`);
      } else {
        const missingPriceHelp = parsed.transactionStatus === 'executed' && parsed.buyPrice == null
          ? ' This Filled screen does not display the execution price. In IBKR, open View Trades and capture the row containing Fill Price.'
          : '';
        setBuyScanStatus(`Review required. Detected ${filledFields.join(', ')} from the screenshot and kept compatible values from earlier scans — nothing is saved until you confirm.${missingPriceHelp}${warningText}`);
      }
    } catch (error) {
      setBuyScanStatus(`Scan failed: ${error.message || 'unknown error'}`);
    }
  }

  function clearBuyScreenshotReview() {
    const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setBuyScanReview(null);
    setBuyScreenshotPreview('');
    setBuyScanStatus('Manual entry enabled. Enter only the values from a completed trade.');
    setBuyForm((current) => ({
      ...current,
      mode: 'shares',
      sharesBought: '',
      cashPaidAmount: '',
      buyPrice: '',
      feeAmount: '',
      brokerTradeId: '',
      totalAmount: '',
      boughtAt: nowLocal,
    }));
  }

  async function savePendingOrder() {
    if (buyScanReview?.transactionStatus !== 'preview') {
      setMessage('Only an unfilled order preview can be saved as pending.');
      return;
    }
    const result = await api.savePendingOrder({
      holdingId: buyForm.holdingId,
      ticker: buyForm.ticker,
      mode: buyForm.mode,
      sharesBought: buyForm.sharesBought,
      cashPaidAmount: buyForm.cashPaidAmount,
      cashPaidCurrency: buyForm.cashPaidCurrency,
      estimatedFeeAmount: buyForm.feeAmount,
      feeCurrency: buyForm.feeCurrency,
      visibleTotalAmount: buyForm.totalAmount,
      ocrText: buyScanReview.rawText,
      screenshotDataUrl: buyScreenshotPreview,
    });
    if (result?.ok === false) {
      setMessage(result.error || 'Could not save pending order.');
      return;
    }
    setBuyModal(null);
    setBuyScanReview(null);
    setBuyScreenshotPreview('');
    await reload();
    setActiveTab('buyLog');
    setMessage('Pending order saved. Finalize it after IBKR shows Filled.');
  }

  async function recordTransmittedPreview() {
    if (buyScanReview?.transactionStatus !== 'preview') return;
    const holding = findHoldingForBuy();
    const cashAmount = Number(buyScanReview.cashPaidAmount);
    const estimatedPrice = Number(buyScanReview.previewPriceEstimate);
    const feeAmount = Number(buyScanReview.feeAmount || 0);
    const currency = buyScanReview.cashPaidCurrency || buyForm.cashPaidCurrency || 'USD';
    if (!holding || !(cashAmount > 0) || !(estimatedPrice > 0)) {
      setMessage('Could not read the ticker, planned amount, and visible quote confidently.');
      return;
    }
    if (!window.confirm('Only continue after you clicked Transmit in IBKR. This records an estimated fill that should later be reconciled with IBKR.')) return;
    const rate = currency === 'USD' ? Number(settings.usdCadRate) : 1;
    if (!(rate > 0)) {
      setMessage('A valid USD/CAD rate is required to record this estimated buy.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.saveBuyLog({
        holdingId: holding.id,
        ticker: holding.ticker,
        priceSymbol: holding.priceSymbol,
        sharesBought: cashAmount / estimatedPrice,
        buyPrice: estimatedPrice,
        priceCurrency: currency,
        cadAmount: cashAmount * rate,
        feeCAD: feeAmount * rate,
        boughtAt: new Date().toISOString(),
        note: 'Estimated from transmitted IBKR confirmation; reconcile with the filled execution.',
        source: 'screenshot-estimated',
        planRow: buyModal,
      });
      if (result && result.ok === false) {
        setMessage(result.error || 'Could not save the estimated buy.');
        return;
      }
      if (buyModal?.pendingOrderId) await api.deletePendingOrder(buyModal.pendingOrderId);
      setBuyModal(null);
      setBuyScanReview(null);
      setBuyScreenshotPreview('');
      await reload();
      setMessage('Estimated buy recorded. Reconcile it later with the exact IBKR fill.');
    } catch (error) {
      setMessage(error.message || 'Could not save the estimated buy.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmPendingOrder(order) {
    const holding = holdings.find((item) => item.id === order.holdingId) || holdings.find((item) => item.ticker === order.ticker);
    const priceCurrency = order.limitCurrency === 'CAD' ? 'CAD' : 'USD';
    const buyPrice = Number(order.limitPrice);
    const feeAmount = Number(order.estimatedFeeAmount || 0);
    const feeCurrency = order.feeCurrency === 'CAD' ? 'CAD' : 'USD';
    const cashAmount = Number(order.cashPaidAmount);
    const savedShares = Number(order.sharesBought);
    const sharesBought = order.mode === 'shares'
      ? savedShares
      : convertAmount(cashAmount, order.cashPaidCurrency === 'CAD' ? 'CAD' : 'USD', priceCurrency, Number(settings?.usdCadRate));
    const grossCost = order.mode === 'shares' ? sharesBought * buyPrice : convertAmount(cashAmount, order.cashPaidCurrency === 'CAD' ? 'CAD' : 'USD', priceCurrency, Number(settings?.usdCadRate));
    const cadAmount = convertAmountToCad(grossCost, priceCurrency, Number(settings?.usdCadRate));
    const feeCAD = convertAmountToCad(feeAmount, feeCurrency, Number(settings?.usdCadRate));
    if (!holding || !(sharesBought > 0) || !(buyPrice > 0) || !(cadAmount > 0) || !(feeCAD >= 0)) {
      setMessage('The saved order is missing a usable amount, price, or exchange rate. Use Review fill for exact details.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.saveBuyLog({
        holdingId: holding.id,
        ticker: holding.ticker,
        priceSymbol: holding.priceSymbol,
        sharesBought,
        buyPrice,
        priceCurrency,
        cadAmount,
        feeCAD,
        boughtAt: order.triggeredAt || order.createdAt || new Date().toISOString(),
        note: 'Confirmed from saved limit order; reconcile with the exact IBKR fill if needed.',
        source: 'pending-confirmed',
        planRow: order,
      });
      if (result && result.ok === false) {
        setMessage(result.error || 'Could not record the filled order.');
        return;
      }
      await api.deletePendingOrder(order.id);
      await reload();
      setMessage(`${holding.ticker} marked filled. Shares and cash updated from the saved limit order.`);
    } catch (error) {
      setMessage(error.message || 'Could not record the filled order.');
    } finally {
      setBusy(false);
    }
  }

  function openPendingOrder(order) {
    const holding = holdings.find((item) => item.id === order.holdingId) || holdings.find((item) => item.ticker === order.ticker);
    setBuyScanStatus('Pending draft loaded. Replace estimates with the actual Filled trade values.');
    setBuyScanReview(null);
    setBuyScreenshotPreview('');
    setBuyModal({
      manual: true,
      global: true,
      pendingOrderId: order.id,
      holdingId: holding?.id || order.holdingId || '',
      ticker: holding?.ticker || order.ticker,
    });
    setBuyForm({
      ...emptyBuyForm,
      mode: order.mode || 'cash',
      holdingId: holding?.id || order.holdingId || '',
      ticker: holding?.ticker || order.ticker,
      sharesBought: order.sharesBought ?? '',
      cashPaidAmount: order.cashPaidAmount ?? '',
      cashPaidCurrency: order.cashPaidCurrency || holding?.currency || 'USD',
      priceCurrency: holding?.currency || order.cashPaidCurrency || 'USD',
      feeAmount: order.estimatedFeeAmount ?? '',
      feeCurrency: order.feeCurrency || 'USD',
      totalAmount: '',
      boughtAt: '',
      note: 'Finalized from pending IBKR order preview.',
    });
  }

  async function deletePendingOrder(order) {
    if (!window.confirm(`Delete pending order for ${order.ticker}?`)) return;
    await api.deletePendingOrder(order.id);
    await reload();
    setMessage('Pending order deleted. Completed trades were not changed.');
  }

  async function cancelPendingOrder(order) {
    if (String(order.status || '').toUpperCase() === 'CANCELLED') return;
    if (!window.confirm(`Mark the ${order.ticker} limit order as cancelled in IBKR?`)) return;
    setBusy(true);
    try {
      await api.cancelPendingOrder(order.id);
      await reload();
      setMessage('Order marked cancelled in IBKR. No shares or cash were changed.');
    } catch (error) { setMessage(error.message || 'Could not mark the order cancelled.'); }
    finally { setBusy(false); }
  }

  async function deleteBuyLogRecord(row) {
    if (!window.confirm(`Delete buy log record for ${row.ticker}?`)) return;
    setBusy(true);
    try {
      await api.deleteBuyLog(row.id);
      await reload();
      setMessage('Buy log record deleted and portfolio shares updated.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function openBrokerOverride(row) {
    setBrokerModal(row);
    setBrokerForm({
      manualPriceOverride: isManualRow(row) ? row.lastPrice || '' : '',
      manualPreviousCloseOverride: isManualRow(row) ? row.previousClose || '' : '',
      changeDollar: '',
      changePercent: '',
    });
  }

  async function saveBrokerOverride(event) {
    event.preventDefault();
    if (!brokerModal) return;
    const manualPriceOverride = Number(brokerForm.manualPriceOverride);
    const manualPreviousCloseOverride = deriveBrokerPreviousClose({
      lastPrice: brokerForm.manualPriceOverride,
      previousClose: brokerForm.manualPreviousCloseOverride,
      changeDollar: brokerForm.changeDollar,
      changePercent: brokerForm.changePercent,
    });
    if (!Number.isFinite(manualPriceOverride) || manualPriceOverride <= 0) {
      setMessage('Manual last price must be greater than zero.');
      return;
    }
    if (!Number.isFinite(manualPreviousCloseOverride) || manualPreviousCloseOverride <= 0) {
      setMessage('Enter previous close, change $, or change % so previous close can be calculated.');
      return;
    }
    const holding = holdings.find((item) => item.id === (brokerModal.holdingId || brokerModal.id));
    if (!holding) {
      setMessage('Holding not found.');
      return;
    }

    setBusy(true);
    try {
      await api.saveHolding({
        ...holding,
        manualPriceOverride,
        manualPreviousCloseOverride,
      });
      setBrokerModal(null);
      await reload();
      setMessage('Manual broker price override saved.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function markBought(event) {
    event.preventDefault();
    if (!buyModal) return;
    if (buyScanReview?.saveBlocked) {
      setMessage(buyScanReview.blockingReasons?.[0] || 'This screenshot does not show a completed buy execution.');
      return;
    }
    if (buyModal.pendingOrderId && !buyForm.boughtAt) {
      setMessage('Enter the actual execution date and time shown by IBKR before finalizing.');
      return;
    }
    const holding = findHoldingForBuy();
    const tickerLabel = buyForm.ticker || buyModal.ticker || 'selected ticker';
    if (!holding) {
      setMessage(`Could not find holding for ${tickerLabel}. Please refresh or re-add the ticker.`);
      return;
    }
    const sharesBought = Number(buyPreview.sharesBought);
    const buyPrice = Number(buyForm.buyPrice);
    const cadAmount = Number(buyPreview.convertedCadCost);
    const feeCAD = Number(buyPreview.feeCad);
    if (!Number.isFinite(sharesBought) || sharesBought <= 0) {
      setMessage('Shares bought must be greater than zero.');
      return;
    }
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
      setMessage('Buy price must be greater than zero.');
      return;
    }
    if (!Number.isFinite(cadAmount) || cadAmount <= 0) {
      setMessage('Converted CAD cost must be greater than zero.');
      return;
    }
    if (!Number.isFinite(feeCAD) || feeCAD < 0) {
      setMessage('Fee cannot be negative.');
      return;
    }

    setBusy(true);
    try {
      const result = await api.saveBuyLog({
        id: buyForm.id,
        holdingId: holding.id,
        ticker: holding.ticker,
        priceSymbol: holding.priceSymbol,
        sharesBought,
        buyPrice,
        priceCurrency: buyForm.priceCurrency,
        cadAmount,
        feeCAD,
        boughtAt: buyForm.boughtAt,
        note: buyForm.note,
        brokerTradeId: buyForm.brokerTradeId,
        source: buyScanReview ? 'screenshot' : 'manual',
        planRow: buyModal,
      });
      if (result && result.ok === false) {
        setMessage(result.error || 'Could not save buy log record.');
        return;
      }
      if (buyModal.pendingOrderId) await api.deletePendingOrder(buyModal.pendingOrderId);
      setBuyModal(null);
      setBuyForm(emptyBuyForm);
      setBuyScanReview(null);
      setBuyScreenshotPreview('');
      await reload();
      setMessage('Buy saved. Buy Log and current shares updated.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <AppChrome
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openManualBuy={openManualBuy}
        openAddMoney={() => setAddMoneyOpen(true)}
        openLimitOrder={() => setLimitOrderOpen(true)}
        canRecordBuy={holdings.length > 0}
        refreshPrices={refreshPrices}
        canRefresh={canRefresh}
        moreOpen={moreOpen}
        setMoreOpen={setMoreOpen}
        exportCsv={exportCsv}
        canExport={canExport}
        exportReportCsv={exportReportCsv}
        canExportBuyLog={buyLog.length > 0}
      />

      {activeTab === 'today' ? (
        <TodayPage {...{ MoreVertical, Plus, boughtTodayTickers, buyLogReport, buyRowsByTicker, deleteHolding, formatChange, formatLastPrice, formatSource, formatStatus, formatTodayStatus, hasHoldings, holdingActionId, holdings, isCashPool, isDipRanking, isUntrustedRow, money, openAddHolding, openEditHolding, percent, plan, portfolioValue, reconciliationIssues, rows, setActiveTab, setHoldingActionId, settings, shares, sinceLastBuyByTicker }} />
      ) : activeTab === 'buyLog' ? (
        <BuyLogPage {...{ Edit3, Trash2, buyCadFilter, buyDateFilter, buyLog, buySearch, buySort, buySourceFilter, buySourceLabel, buyTickerFilter, cancelPendingOrder, confirmPendingOrder, currentPriceByTicker, deleteBuyLogRecord, deletePendingOrder, editBuyLog, filteredBuyLog, formatCadCostStatus, formatDate, money, openPendingOrder, pendingOrders, setBuyCadFilter, setBuyDateFilter, setBuySearch, setBuySort, setBuySourceFilter, setBuyTickerFilter, setSelectedBuyLogRow, shares, sourceBadgeClass, tickerOptions }} />
      ) : activeTab === 'calendar' ? (
        <CalendarPage {...{ buyLog, calendarFilteredDays, calendarMonth, calendarMonthTotal, calendarTickerFilter, calendarView, formatDate, money, monthLabel, setCalendarMonth, setCalendarTickerFilter, setCalendarView, setSelectedBuyLogRow, setSelectedCalendarDay, shares, tickerOptions }} />
      ) : activeTab === 'chart' ? (
        <ChartPage holdings={holdings} buyLog={buyLog} settings={settings} />
      ) : activeTab === 'reports' ? (
        <ReportsPage {...{ buyLogReport, money, percent, portfolioValue, shares, usdCommission }} />
      ) : (
        <SettingsPage {...{ busy, checkIbkrConnection, checkYahooConnection, checkingConnection, chooseIbkrActivityStatement, connectionStatus, formatDate, ibkrActivityStatus, ibkrImportStage, money, saveSettings, settings, settingsWarning, updateUsdCadRate }} />
      )}

      {ibkrActivityStatus.reminder?.due && (
        <div className="ibkrReminder"><span><strong>Monthly IBKR check due</strong> Import the completed statement for {ibkrActivityStatus.reminder.month}.</span><div><button onClick={() => { setActiveTab('settings'); chooseIbkrActivityStatement('monthly'); }}>Import monthly CSV</button><button className="secondary" onClick={dismissIbkrActivityReminder}>Remind me next month</button></div></div>
      )}

      {ibkrActivityPreview && <div className="modalBackdrop"><section className="modal ibkrReconcileModal"><h2>Review {ibkrActivityPreview.preview.statement.statementType} reconciliation</h2><p>{ibkrActivityPreview.preview.statement.periodStart} to {ibkrActivityPreview.preview.statement.periodEnd} · {ibkrActivityPreview.preview.statement.tradeCount} completed buys</p><div className="reconcileCounts"><span><b>{ibkrActivityPreview.preview.counts.unchanged}</b> unchanged</span><span><b>{ibkrActivityPreview.preview.counts.corrected}</b> corrections</span><span><b>{ibkrActivityPreview.preview.counts.added}</b> missing trades</span><span><b>{ibkrActivityPreview.preview.counts.review}</b> need review</span></div><div className="reconcileChecks">{ibkrActivityPreview.preview.checks.map((check) => <div key={check.label} className={check.passed ? 'checkPassed' : 'checkFailed'}><b>{check.passed ? '✓' : '!'}</b><span><strong>{check.label}</strong><small>{check.detail}</small></span></div>)}</div><p className="muted">Apply corrects matched trades, adds missing trades, and reconciles available CAD cash to IBKR ending cash using one dated adjustment. Unmatched local records are never deleted. A database backup is created first. CAD conversions remain labeled estimated; exact USD execution values come from IBKR.</p>{ibkrActivityPreview.preview.review.length > 0 && <div className="warning">The unmatched local record will be kept unchanged: {ibkrActivityPreview.preview.review.map((r) => `${r.ticker} ${formatDate(r.boughtAt)}`).join(', ')}. You can apply the verified statement corrections now and review this record afterward.</div>}<div className="modalActions"><button disabled={busy || ibkrActivityPreview.preview.checks.some((check) => !check.passed && check.blocking)} onClick={applyIbkrActivityStatement}>{busy ? 'Backing up and applying…' : 'Back up and apply verified changes'}</button><button className="secondary" onClick={() => setIbkrActivityPreview(null)}>Cancel</button></div></section></div>}

      {selectedBuyLogRow && <TradeDetailsModal {...{ buySourceLabel, deleteBuyLogRecord, editBuyLog, formatCadCostStatus, formatDate, money, selectedBuyLogRow, setSelectedBuyLogRow, shares }} />}

      {selectedCalendarDay && <CalendarDayModal {...{ formatDate, money, selectedCalendarDay, setSelectedBuyLogRow, setSelectedCalendarDay, shares }} />}

      {holdingModalOpen && <HoldingModal {...{ advancedOpen, busy, emptyForm, form, formError, formIsValid, formTouched, handleHoldingScreenshot, holdingScanInputRef, holdingScanStatus, lookup, lookupStatus, money, percent, saveHolding, setAdvancedOpen, setForm, setFormTouched, setHoldingModalOpen, setLookup, updateForm }} />}

      {buyModal && <RecordBuyModal {...{ busy, buyForm, buyModal, buyPreview, buyScanInputRef, buyScanReview, buyScanStatus, buyScreenshotPreview, clearBuyScreenshotReview, handleBuyPaste, handleBuyScreenshot, holdings, markBought, money, recordTransmittedPreview, savePendingOrder, setBuyForm, setBuyModal, setBuyScreenshotPreview }} />}

      {brokerModal && <BrokerPriceModal {...{ brokerForm, brokerModal, busy, saveBrokerOverride, setBrokerForm, setBrokerModal }} />}

      {addMoneyOpen && <AddMoneyModal cashSummary={cashSummary} money={money} onSave={saveCashTransaction} onDelete={deleteCashTransaction} busy={busy} onClose={() => setAddMoneyOpen(false)} />}

      {limitOrderOpen && <LimitOrderModal holdings={holdings} busy={busy} onSave={saveLimitOrder} onClose={() => setLimitOrderOpen(false)} />}

      {message && (
        <div className="toast" role="status" aria-live="polite">
          <span>{message}</span>
          <button type="button" className="toastClose" aria-label="Close notification" onClick={() => setMessage('')}>
            x
          </button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
