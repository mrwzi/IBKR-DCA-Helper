const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createDb } = require('./storage.cjs');
const { parseActivityStatement, buildPreview, validateStatementMode, reminderDue } = require('./ibkr-activity.cjs');
const { checkRelayConnection, checkYahooConnection, fetchPricesWithSource, fetchUsdCadRate, lookupSymbol } = require('./prices.cjs');
const { calculateStrategyPlan } = require('../src/lib/dca.js');
const { searchSymbols: searchChartSymbols, getChartSnapshot, getLatestQuote } = require('./chart-market-data.cjs');

let mainWindow;
let db;
let logFile;
const reconciliationPreviews = new Map();

const isDev = !app.isPackaged;

// Production updates keep the established profile so existing portfolio data
// survives upgrades. DCA_USER_DATA_DIR is reserved for isolated verification.
app.setPath('userData', process.env.DCA_USER_DATA_DIR || path.join(app.getPath('appData'), 'dca-helper'));

function writeLog(event, details = {}) {
  const line = `${new Date().toISOString()} ${event} ${JSON.stringify(details)}\n`;
  try {
    if (!logFile) {
      const logDir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      logFile = path.join(logDir, 'main.log');
    }
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (error) {
    console.error('Could not write startup log:', error);
  }
  console.log(line.trim());
}

process.on('uncaughtException', (error) => {
  writeLog('uncaught-exception', { message: error.message, stack: error.stack });
});

process.on('unhandledRejection', (error) => {
  writeLog('unhandled-rejection', { message: error?.message || String(error), stack: error?.stack });
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function createWindow() {
  writeLog('window-create-start', { isDev, userData: app.getPath('userData') });
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1020,
    minHeight: 680,
    backgroundColor: '#111317',
    title: 'DCA Helper',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  let shown = false;
  let visibilityFallback;
  const showWindow = (reason) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (shown) return;
    shown = true;
    if (visibilityFallback) clearTimeout(visibilityFallback);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    writeLog('window-shown', { reason });
  };

  mainWindow.once('ready-to-show', () => showWindow('ready-to-show'));
  visibilityFallback = setTimeout(() => showWindow('startup-timeout'), 8000);
  mainWindow.on('closed', () => {
    clearTimeout(visibilityFallback);
    mainWindow = null;
    writeLog('window-closed');
  });
  mainWindow.webContents.on('did-finish-load', () => {
    writeLog('renderer-loaded', { url: mainWindow?.webContents.getURL() });
    if (!shown) showWindow('did-finish-load');
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    writeLog('renderer-load-failed', { errorCode, errorDescription, validatedURL, isMainFrame });
    if (isMainFrame) showWindow('did-fail-load');
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeLog('renderer-process-gone', details);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) writeLog('renderer-console', { level, message, line, sourceId });
  });

  let loadPromise;
  if (isDev) {
    loadPromise = mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    const rendererPath = path.join(__dirname, '..', 'dist', 'index.html');
    writeLog('renderer-load-file', { rendererPath, exists: fs.existsSync(rendererPath) });
    loadPromise = mainWindow.loadFile(rendererPath);
  }
  loadPromise.catch((error) => {
    writeLog('renderer-load-rejected', { message: error.message, stack: error.stack });
    showWindow('load-rejected');
  });
}

app.whenReady().then(() => {
  writeLog('app-ready', { version: app.getVersion(), electron: process.versions.electron, modules: process.versions.modules });
  db = createDb(app.getPath('userData'));
  writeLog('database-opened');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  writeLog('startup-failed', { message: error.message, stack: error.stack });
  dialog.showErrorBox('DCA Helper failed to start', `${error.message}\n\nSee ${logFile || 'the application log'} for details.`);
  app.quit();
});

app.on('second-instance', () => {
  writeLog('second-instance');
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function serializeError(error) {
  return { message: error && error.message ? error.message : String(error) };
}

function historyRowsToCsv(history) {
  const rows = [
    [
      'Saved At',
      'Cash To Invest CAD',
      'USD/CAD Rate',
      'Ticker',
      'Price',
      'Previous Close',
      'Change %',
      'Current Value CAD',
      'Gap CAD',
      'Action',
      'Suggested Buy CAD',
      'Suggested Shares',
      'Estimated CAD Cost',
      'Actual Shares Bought',
      'Actual CAD Cost',
      'Reason',
      'Note',
    ],
    ...history.flatMap((entry) =>
      (entry.rows || []).map((row) => [
        entry.savedAt || entry.generatedAt || '',
        entry.cashToInvestCAD ?? '',
        entry.usdCadRate ?? '',
        row.ticker ?? '',
        row.lastPrice ?? '',
        row.previousClose ?? '',
        row.changePercent ?? '',
        row.currentValueCAD ?? '',
        row.gapToTargetCAD ?? '',
        row.action ?? '',
        row.suggestedBuyCAD ?? '',
        row.suggestedShares ?? '',
        row.estimatedCostCAD ?? '',
        row.actualSharesBought ?? '',
        row.actualCostCAD ?? '',
        row.reason ?? '',
        row.note ?? '',
      ]),
    ),
  ];

  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
}

function buyLogToCsv(buyLog) {
  const rows = [
    ['Date/time', 'Ticker', 'Shares Bought', 'Buy Price', 'Price Currency', 'CAD Amount', 'Fee', 'Total CAD Cost', 'Note'],
    ...buyLog.map((row) => [
      row.boughtAt ?? '',
      row.ticker ?? '',
      row.sharesBought ?? '',
      row.buyPrice ?? '',
      row.priceCurrency ?? '',
      row.cadAmount ?? '',
      row.feeCAD ?? '',
      row.totalCadCost ?? '',
      row.note ?? '',
    ]),
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
}

ipcMain.handle('portfolio:list', () => db.listHoldings());
ipcMain.handle('portfolio:save', (_event, holding) => {
  const saved = db.saveHolding(holding);
  const lookupPrice = holding.lookupPrice;
  if (
    saved &&
    lookupPrice &&
    Number.isFinite(Number(lookupPrice.lastPrice)) &&
    Number.isFinite(Number(lookupPrice.previousClose))
  ) {
    db.savePrice({
      holdingId: saved.id,
      priceSymbol: saved.priceSymbol,
      lastPrice: Number(lookupPrice.lastPrice),
      previousClose: Number(lookupPrice.previousClose),
      currency: saved.currency,
      fetchedAt: lookupPrice.fetchedAt || new Date().toISOString(),
      source: lookupPrice.source || 'Yahoo lookup',
      sourceTime: lookupPrice.sourceTime || null,
      isDelayed: Boolean(lookupPrice.isDelayed),
      isStale: Boolean(lookupPrice.isStale),
      warning: lookupPrice.warning || null,
      error: null,
    });
  }
  return saved;
});
ipcMain.handle('portfolio:delete', (_event, id) => db.deleteHolding(id));

ipcMain.handle('settings:get', () => db.getSettings());
ipcMain.handle('settings:save', (_event, settings) => db.saveSettings(settings));
ipcMain.handle('cash:getSummary', () => db.getCashSummary());
ipcMain.handle('cash:saveTransaction', (_event, transaction) => db.saveCashTransaction(transaction));
ipcMain.handle('cash:deleteTransaction', (_event, id) => db.deleteCashTransaction(id));

ipcMain.handle('ibkrActivity:status', () => {
  const history = db.listIbkrReconciliations();
  return { history, reminder: reminderDue(history, db.getSettings()) };
});
ipcMain.handle('ibkrActivity:dismissReminder', (_event, month) => {
  db.saveSettings({ ibkrReminderDismissedMonth: String(month || '') });
  return { ok: true };
});
ipcMain.handle('ibkrActivity:choosePreview', async (_event, mode) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose IBKR Activity Statement CSV', properties: ['openFile'],
    filters: [{ name: 'IBKR Activity Statement CSV', extensions: ['csv'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const filePath = result.filePaths[0];
  const contents = fs.readFileSync(filePath, 'utf8');
  const fileHash = crypto.createHash('sha256').update(contents).digest('hex');
  const statement = parseActivityStatement(contents);
  let statementType;
  let selectionNotice = '';
  try {
    statementType = validateStatementMode(statement, mode);
  } catch (selectedModeError) {
    const detectedMode = mode === 'ytd' ? 'monthly' : 'ytd';
    try {
      statementType = validateStatementMode(statement, detectedMode);
      selectionNotice = `You selected ${mode === 'ytd' ? 'Year-to-date' : 'Monthly'}, but this file is a valid ${statementType.toLowerCase()} statement. The app switched automatically.`;
      mode = detectedMode;
    } catch {
      throw selectedModeError;
    }
  }
  const preview = buildPreview(statement, db.listBuyLog(), db.getSettings().usdCadRate);
  preview.statement.statementType = statementType;
  preview.statement.requestedMode = mode;
  preview.statement.selectionNotice = selectionNotice;
  const token = crypto.randomUUID();
  reconciliationPreviews.set(token, { preview, metadata: { fileName: path.basename(filePath), fileHash } });
  return { canceled: false, token, preview };
});
ipcMain.handle('ibkrActivity:apply', (_event, token) => {
  const pending = reconciliationPreviews.get(String(token));
  if (!pending) throw new Error('This preview expired. Choose the statement again.');
  try { return db.applyIbkrReconciliation(pending.preview, pending.metadata); }
  finally { reconciliationPreviews.delete(String(token)); }
});

function sameLocalDate(isoValue) {
  if (!isoValue) return false;
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
}

ipcMain.handle('prices:refresh', async (_event, options = {}) => {
  const holdings = db.listHoldings();
  const enabled = holdings.filter((holding) => holding.enabled);
  const settings = db.getSettings();
  const existingPrices = db.listPrices();
  const existingByHoldingId = new Map(existingPrices.map((price) => [price.holdingId, price]));
  const today = new Date().toISOString().slice(0, 10);
  let usdCadRate = settings.usdCadRate;
  let fxWarning = '';
  const hasUsdTicker = enabled.some((holding) => holding.currency === 'USD');
  const manualRefresh = Boolean(options.manual);
  const forceHistorical = Boolean(options.refreshHistorical);

  if (hasUsdTicker && (manualRefresh || !sameLocalDate(settings.usdCadRateUpdatedAt))) {
    try {
      usdCadRate = await fetchUsdCadRate();
      db.saveSettings({
        usdCadRate,
        usdCadRateSource: 'fetched',
        usdCadRateUpdatedAt: new Date().toISOString(),
        usdCadRateWarning: '',
      });
    } catch (error) {
      fxWarning = error.message;
      db.saveSettings({
        usdCadRate,
        usdCadRateSource: 'manual',
        usdCadRateWarning: fxWarning,
      });
    }
  }

  const holdingsToRefresh = enabled.map((holding) => {
    const cached = existingByHoldingId.get(holding.id);
    const needsHistorical =
      forceHistorical ||
      !cached ||
      !Number.isFinite(Number(cached.normalMovePercent)) ||
      Number(cached.normalMovePercent) <= 0 ||
      cached.normalMoveDate !== today;
    return { ...holding, refreshHistorical: needsHistorical, cachedPreviousClose: cached?.previousClose ?? null };
  });

  const priceResults = await fetchPricesWithSource(holdingsToRefresh, settings);

  for (const result of priceResults) {
    db.savePrice(result);
    if (!result.error) {
      db.updateHoldingMarketData(result.holdingId, {
        displayName: result.displayName,
        priceSymbol: result.priceSymbol,
      });
    }
  }

  const priceWarnings = priceResults.filter((result) => result.error).map((result) => `${result.priceSymbol}: ${result.error}`);

  return {
    usdCadRate,
    fxWarning,
    priceWarnings,
    prices: db.listPrices(),
  };
});

ipcMain.handle('prices:list', () => db.listPrices());
ipcMain.handle('prices:lookupSymbol', (_event, symbol) => lookupSymbol(symbol));
ipcMain.handle('charts:searchSymbols', async (_event, query) => searchChartSymbols(query, db.getSettings()));
ipcMain.handle('charts:load', async (_event, request = {}) => {
  const instrument = request.instrument || {};
  const timeframe = request.timeframe || 'YTD';
  return getChartSnapshot({ instrument, timeframe, settings: db.getSettings(), db, forceRefresh: Boolean(request.forceRefresh) });
});
ipcMain.handle('charts:quote', async (_event, request = {}) => getLatestQuote({ instrument: request.instrument || {}, provider: request.provider, settings: db.getSettings() }));
ipcMain.handle('connection:checkIbkr', async () => checkRelayConnection(db.getSettings()));
ipcMain.handle('connection:checkYahoo', async () => checkYahooConnection());

ipcMain.handle('plan:calculate', () => {
  const holdings = db.listHoldings();
  const prices = db.listPrices();
  const settings = db.getSettings();
  const today = new Date().toISOString().slice(0, 10);
  const buyCountToday = db
    .listBuyLog()
    .filter((entry) => String(entry.boughtAt || '').slice(0, 10) === today)
    .length;
  return calculateStrategyPlan({ holdings, prices, settings: { ...settings, strategyMode: 'dipRanking', buyCountToday } });
});

ipcMain.handle('history:saveToday', (_event, plan) => db.saveHistory(plan));
ipcMain.handle('history:markBought', (_event, payload) => db.markBought(payload));
ipcMain.handle('buyLog:list', () => db.listBuyLog());
ipcMain.handle('buyLog:save', (_event, payload) => {
  try {
    return { ok: true, buyLog: db.saveBuyLog(payload) };
  } catch (error) {
    console.error('buyLog:save failed', {
      message: error.message,
      holdingId: payload && payload.holdingId,
      ticker: payload && payload.ticker,
      priceSymbol: payload && payload.priceSymbol,
    });
    return { ok: false, error: error.message || 'Could not save buy log record.' };
  }
});
ipcMain.handle('buyLog:delete', (_event, id) => db.deleteBuyLog(id));
ipcMain.handle('pendingOrders:list', () => db.listPendingOrders());
ipcMain.handle('pendingOrders:save', (_event, payload) => {
  try {
    return { ok: true, pendingOrders: db.savePendingOrder(payload) };
  } catch (error) {
    return { ok: false, error: error.message || 'Could not save pending order.' };
  }
});
ipcMain.handle('pendingOrders:delete', (_event, id) => db.deletePendingOrder(id));
ipcMain.handle('buyLog:exportCsv', async () => {
  try {
    const buyLog = db.listBuyLog();
    const defaultPath = path.join(app.getPath('documents'), `dca-buy-log-${new Date().toISOString().slice(0, 10)}.csv`);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Buy Log',
      defaultPath,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, buyLogToCsv(buyLog), 'utf8');
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    return { error: serializeError(error) };
  }
});
ipcMain.handle('history:list', () => db.listHistory());

ipcMain.handle('history:exportCsv', async () => {
  try {
    const history = db.listHistory();
    const defaultPath = path.join(app.getPath('documents'), `dca-history-${new Date().toISOString().slice(0, 10)}.csv`);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export DCA History',
      defaultPath,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(result.filePath, historyRowsToCsv(history), 'utf8');
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    return { error: serializeError(error) };
  }
});

ipcMain.handle('history:exportReportCsv', async (_event, history) => {
  try {
    const defaultPath = path.join(app.getPath('documents'), `dca-report-${new Date().toISOString().slice(0, 10)}.csv`);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export DCA Report',
      defaultPath,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(result.filePath, historyRowsToCsv(Array.isArray(history) ? history : []), 'utf8');
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    return { error: serializeError(error) };
  }
});
