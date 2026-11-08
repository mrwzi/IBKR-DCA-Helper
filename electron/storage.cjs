const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_SETTINGS = {
  cashToInvestCAD: 0,
  strategyMode: 'dipRanking',
  cashPoolStartingCAD: 500,
  cashPoolUsedCAD: 0,
  defaultBuySizeShares: 0.1,
  cashPoolMinimumDip: -1,
  cashPoolBiggerDipThreshold: -3,
  cashPoolHugeDipThreshold: -5,
  maxBuysPerDay: 1,
  allowMultipleBuysSameDay: false,
  dipCashAvailableCAD: 0,
  dipMinimumDip: -1,
  dipStrongDip: -2.5,
  dipHugeDip: -4,
  dipMeaningfulScore: 1,
  dipStrongScore: 1.5,
  dipHugeScore: 2,
  dipMinimumOrderCAD: 50,
  dipMaxOneBuyPerDay: false,
  autoRefreshEnabled: false,
  autoRefreshIntervalSeconds: 60,
  minimumDip: -1,
  biggerDipThreshold: -3,
  hugeDipThreshold: -5,
  usdCadRate: 1.35,
  usdCadRateSource: 'manual',
  usdCadRateUpdatedAt: '',
  usdCadRateWarning: '',
  priceSource: 'Yahoo',
  ibkrRelayUrl: '',
};

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function decimalParts(value) {
  const text = String(value);
  const [wholeRaw, fractionRaw = ''] = text.split('.');
  const negative = wholeRaw.startsWith('-');
  const whole = negative ? wholeRaw.slice(1) : wholeRaw;
  return { negative, whole: whole || '0', fraction: fractionRaw };
}

function decimalToScaled(value, scale) {
  const { negative, whole, fraction } = decimalParts(value);
  const padded = (fraction + '0'.repeat(scale)).slice(0, scale);
  const result = BigInt(`${whole}${padded}` || '0');
  return negative ? -result : result;
}

function scaledToDecimal(value, scale) {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function decimalAdd(values, scale = 12) {
  return scaledToDecimal(values.reduce((sum, value) => sum + decimalToScaled(value, scale), 0n), scale);
}

function decimalMultiply(a, b, scale = 12) {
  const left = decimalToScaled(a, scale);
  const right = decimalToScaled(b, scale);
  return scaledToDecimal((left * right) / 10n ** BigInt(scale), scale);
}

function normalizeHolding(row) {
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    priceSymbol: row.price_symbol,
    currency: row.currency,
    targetPercent: row.target_percent,
    sharesOwned: row.shares_owned,
    manualPriceOverride: row.manual_price_override,
    manualPreviousCloseOverride: row.manual_previous_close_override,
    buySizeOverrideShares: row.buy_size_override_shares,
    ibkrSymbol: row.ibkr_symbol,
    ibkrSecType: row.ibkr_sec_type || 'STK',
    ibkrExchange: row.ibkr_exchange || 'SMART',
    ibkrCurrency: row.ibkr_currency || row.currency,
    ibkrPrimaryExchange: row.ibkr_primary_exchange,
    ibkrPositionShares: row.ibkr_position_shares,
    ibkrAvgPrice: row.ibkr_avg_price,
    ibkrCostBasis: row.ibkr_cost_basis,
    enabled: Boolean(row.enabled),
  };
}

function normalizeBuyLog(row) {
  const totalCadCost = Number(row.cad_amount || 0) + Number(row.fee_cad || 0);
  return {
    id: row.id,
    holdingId: row.holding_id,
    ticker: row.ticker,
    sharesBought: row.shares_bought,
    buyPrice: row.buy_price,
    priceCurrency: row.price_currency,
    cadAmount: row.cad_amount,
    feeCAD: row.fee_cad,
    totalCadCost,
    boughtAt: row.bought_at,
    note: row.note || '',
    ibkrTradeId: row.ibkr_trade_id || null,
    ibkrBoughtAtUtc: row.ibkr_bought_at_utc || row.bought_at,
    sharesBoughtText: row.shares_bought_text || String(row.shares_bought),
    buyPriceText: row.buy_price_text || String(row.buy_price),
    grossUsd: row.gross_usd,
    grossUsdText: row.gross_usd_text || (row.gross_usd == null ? null : String(row.gross_usd)),
    commissionUsd: row.commission_usd,
    commissionUsdText: row.commission_usd_text || (row.commission_usd == null ? null : String(row.commission_usd)),
    allInUsdCost: row.all_in_usd_cost,
    allInUsdCostText: row.all_in_usd_cost_text || (row.all_in_usd_cost == null ? null : String(row.all_in_usd_cost)),
    cadCostStatus: row.cad_cost_status || 'exact',
    source: row.source || 'manual',
    cashTransactionId: row.cash_transaction_id || null,
  };
}

function normalizePendingOrder(row) {
  const utcTimestamp = (value) => {
    if (!value) return value;
    return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${String(value).replace(' ', 'T')}Z`;
  };
  return {
    id: row.id,
    holdingId: row.holding_id,
    ticker: row.ticker,
    mode: row.order_mode,
    sharesBought: row.shares_amount,
    cashPaidAmount: row.cash_amount,
    cashPaidCurrency: row.cash_currency,
    estimatedFeeAmount: row.estimated_fee_amount,
    feeCurrency: row.fee_currency,
    visibleTotalAmount: row.visible_total_amount,
    orderType: row.order_type || 'MARKET',
    orderSide: row.order_side || 'BUY',
    limitPrice: row.limit_price,
    limitCurrency: row.limit_currency || row.cash_currency || 'USD',
    status: row.status || 'PENDING',
    triggeredAt: utcTimestamp(row.triggered_at),
    note: row.note || '',
    ocrText: row.ocr_text || '',
    createdAt: utcTimestamp(row.created_at),
    updatedAt: utcTimestamp(row.updated_at),
  };
}

function shouldIgnoreIncomingPrice(existing, price) {
  return Boolean(
    existing &&
      existing.fetched_at &&
      price.fetchedAt &&
      new Date(price.fetchedAt).getTime() < new Date(existing.fetched_at).getTime(),
  );
}

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function createDb(userDataPath) {
  const dbPath = path.join(userDataPath, 'dca-helper.sqlite');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      name TEXT NOT NULL,
      price_symbol TEXT NOT NULL,
      currency TEXT NOT NULL CHECK(currency IN ('CAD', 'USD')),
      target_percent REAL,
      shares_owned REAL NOT NULL DEFAULT 0,
      manual_price_override REAL,
      manual_previous_close_override REAL,
      buy_size_override_shares REAL,
      ibkr_symbol TEXT,
      ibkr_sec_type TEXT,
      ibkr_exchange TEXT,
      ibkr_currency TEXT,
      ibkr_primary_exchange TEXT,
      ibkr_position_shares REAL,
      ibkr_avg_price REAL,
      ibkr_cost_basis REAL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prices (
      holding_id INTEGER PRIMARY KEY,
      price_symbol TEXT NOT NULL,
      last_price REAL,
      previous_close REAL,
      currency TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      error TEXT,
      source TEXT,
      source_time TEXT,
      is_delayed INTEGER,
      is_stale INTEGER,
      warning TEXT,
      normal_move_percent REAL,
      normal_move_date TEXT,
      historical_warning TEXT,
      FOREIGN KEY (holding_id) REFERENCES holdings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saved_at TEXT NOT NULL,
      snapshot_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS buy_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holding_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      shares_bought REAL NOT NULL,
      buy_price REAL NOT NULL,
      price_currency TEXT NOT NULL CHECK(price_currency IN ('CAD', 'USD')),
      cad_amount REAL NOT NULL,
      fee_cad REAL NOT NULL DEFAULT 0,
      bought_at TEXT NOT NULL,
      note TEXT,
      ibkr_trade_id TEXT,
      ibkr_bought_at_utc TEXT,
      shares_bought_text TEXT,
      buy_price_text TEXT,
      gross_usd REAL,
      gross_usd_text TEXT,
      commission_usd REAL,
      commission_usd_text TEXT,
      all_in_usd_cost REAL,
      all_in_usd_cost_text TEXT,
      cad_cost_status TEXT NOT NULL DEFAULT 'exact',
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (holding_id) REFERENCES holdings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cash_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('opening-balance', 'deposit', 'withdrawal', 'dividend', 'interest', 'fee', 'adjustment', 'buy')),
      amount_cad REAL NOT NULL,
      occurred_at TEXT NOT NULL,
      note TEXT,
      buy_log_id INTEGER UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (buy_log_id) REFERENCES buy_log(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cash_transactions_occurred_at ON cash_transactions(occurred_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS pending_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holding_id INTEGER,
      ticker TEXT NOT NULL,
      order_mode TEXT NOT NULL CHECK(order_mode IN ('cash', 'shares')),
      shares_amount REAL,
      cash_amount REAL,
      cash_currency TEXT CHECK(cash_currency IN ('CAD', 'USD')),
      estimated_fee_amount REAL,
      fee_currency TEXT CHECK(fee_currency IN ('CAD', 'USD')),
      visible_total_amount REAL,
      order_type TEXT NOT NULL DEFAULT 'MARKET' CHECK(order_type IN ('MARKET', 'LIMIT')),
      order_side TEXT NOT NULL DEFAULT 'BUY' CHECK(order_side IN ('BUY', 'SELL')),
      limit_price REAL,
      limit_currency TEXT CHECK(limit_currency IN ('CAD', 'USD')),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'READY', 'CANCELLED')),
      triggered_at TEXT,
      note TEXT,
      ocr_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (holding_id) REFERENCES holdings(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ibkr_reconciliations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imported_at TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      counts_json TEXT NOT NULL,
      backup_path TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ibkr_reconciliations_hash ON ibkr_reconciliations(file_hash);

    CREATE TABLE IF NOT EXISTS market_bars (
      instrument_key TEXT NOT NULL,
      provider TEXT NOT NULL,
      interval TEXT NOT NULL,
      bar_time INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL,
      fetched_at TEXT NOT NULL,
      split_adjustment TEXT NOT NULL DEFAULT 'provider-reported',
      PRIMARY KEY (instrument_key, provider, interval, bar_time)
    );
    CREATE INDEX IF NOT EXISTS idx_market_bars_lookup
      ON market_bars(instrument_key, provider, interval, bar_time);
  `);

  const pendingOrderColumns = db.prepare('PRAGMA table_info(pending_orders)').all().map((column) => column.name);
  if (!pendingOrderColumns.includes('shares_amount')) {
    db.prepare('ALTER TABLE pending_orders ADD COLUMN shares_amount REAL').run();
  }
  for (const [column, definition] of [
    ['order_type', "TEXT NOT NULL DEFAULT 'MARKET'"],
    ['order_side', "TEXT NOT NULL DEFAULT 'BUY'"],
    ['limit_price', 'REAL'],
    ['limit_currency', 'TEXT'],
    ['status', "TEXT NOT NULL DEFAULT 'PENDING'"],
    ['triggered_at', 'TEXT'],
    ['note', 'TEXT'],
  ]) {
    if (!pendingOrderColumns.includes(column)) db.prepare(`ALTER TABLE pending_orders ADD COLUMN ${column} ${definition}`).run();
  }

  const holdingColumns = db.prepare('PRAGMA table_info(holdings)').all().map((column) => column.name);
  if (!holdingColumns.includes('buy_size_override_shares')) {
    db.prepare('ALTER TABLE holdings ADD COLUMN buy_size_override_shares REAL').run();
  }
  if (!holdingColumns.includes('manual_previous_close_override')) {
    db.prepare('ALTER TABLE holdings ADD COLUMN manual_previous_close_override REAL').run();
  }
  for (const [column, type] of [
    ['ibkr_symbol', 'TEXT'],
    ['ibkr_sec_type', 'TEXT'],
    ['ibkr_exchange', 'TEXT'],
    ['ibkr_currency', 'TEXT'],
    ['ibkr_primary_exchange', 'TEXT'],
    ['ibkr_position_shares', 'REAL'],
    ['ibkr_avg_price', 'REAL'],
    ['ibkr_cost_basis', 'REAL'],
  ]) {
    if (!holdingColumns.includes(column)) {
      db.prepare(`ALTER TABLE holdings ADD COLUMN ${column} ${type}`).run();
    }
  }

  // USD costs entered manually are converted with the configured USD/CAD
  // rate; they are estimates unless an exact CAD amount came from IBKR.
  db.prepare(`
    UPDATE buy_log
    SET cad_cost_status = 'estimated'
    WHERE source IN ('manual', 'screenshot')
      AND price_currency = 'USD'
      AND cad_cost_status = 'exact'
  `).run();

  const buyLogColumns = db.prepare('PRAGMA table_info(buy_log)').all().map((column) => column.name);
  for (const [column, type] of [
    ['ibkr_trade_id', 'TEXT'],
    ['ibkr_bought_at_utc', 'TEXT'],
    ['shares_bought_text', 'TEXT'],
    ['buy_price_text', 'TEXT'],
    ['gross_usd', 'REAL'],
    ['gross_usd_text', 'TEXT'],
    ['commission_usd', 'REAL'],
    ['commission_usd_text', 'TEXT'],
    ['all_in_usd_cost', 'REAL'],
    ['all_in_usd_cost_text', 'TEXT'],
    ['cad_cost_status', "TEXT NOT NULL DEFAULT 'exact'"],
    ['source', "TEXT NOT NULL DEFAULT 'manual'"],
    ['cash_transaction_id', 'INTEGER'],
  ]) {
    if (!buyLogColumns.includes(column)) {
      db.prepare(`ALTER TABLE buy_log ADD COLUMN ${column} ${type}`).run();
    }
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_buy_log_ibkr_trade_id
    ON buy_log(ibkr_trade_id)
    WHERE ibkr_trade_id IS NOT NULL;
  `);
  const priceColumns = db.prepare('PRAGMA table_info(prices)').all().map((column) => column.name);
  for (const [column, type] of [
    ['source', 'TEXT'],
    ['source_time', 'TEXT'],
    ['is_delayed', 'INTEGER'],
    ['is_stale', 'INTEGER'],
    ['warning', 'TEXT'],
    ['normal_move_percent', 'REAL'],
    ['normal_move_date', 'TEXT'],
    ['historical_warning', 'TEXT'],
  ]) {
    if (!priceColumns.includes(column)) {
      db.prepare(`ALTER TABLE prices ADD COLUMN ${column} ${type}`).run();
    }
  }

  const settingCount = db.prepare('SELECT COUNT(*) AS count FROM settings').get().count;
  if (settingCount === 0) {
    const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insert.run(key, String(value));
    }
  }

  // Existing profiles used a single editable cash number. Preserve that balance
  // once as an opening entry, then calculate future cash from the ledger.
  const cashTransactionCount = db.prepare('SELECT COUNT(*) AS count FROM cash_transactions').get().count;
  if (cashTransactionCount === 0) {
    const legacyCash = toNumber(readSettings().dipCashAvailableCAD);
    if (legacyCash !== 0) {
      db.prepare(`
        INSERT INTO cash_transactions (type, amount_cad, occurred_at, note)
        VALUES ('opening-balance', ?, ?, ?)
      `).run(legacyCash, new Date().toISOString(), 'Opening cash balance migrated from an earlier DCA Helper version.');
    }
  }

  function findOrCreateHoldingForTicker(ticker) {
    const cleanTicker = cleanSymbol(ticker);
    let holding = db.prepare(`
      SELECT * FROM holdings
      WHERE UPPER(ticker) = ? OR UPPER(price_symbol) = ?
      ORDER BY enabled DESC, id ASC
      LIMIT 1
    `).get(cleanTicker, cleanTicker);
    if (holding) return holding;

    const result = db.prepare(`
      INSERT INTO holdings (ticker, name, price_symbol, currency, shares_owned, enabled)
      VALUES (?, ?, ?, 'USD', 0, 1)
    `).run(cleanTicker, cleanTicker, cleanTicker);
    return db.prepare('SELECT * FROM holdings WHERE id = ?').get(result.lastInsertRowid);
  }

  function readSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      if (row.value === 'true') settings[row.key] = true;
      else if (row.value === 'false') settings[row.key] = false;
      else settings[row.key] = Number.isFinite(Number(row.value)) ? Number(row.value) : row.value;
    }
    settings.strategyMode = 'dipRanking';
    return settings;
  }

  function cashBalance() {
    return Number(db.prepare('SELECT COALESCE(SUM(amount_cad), 0) AS balance FROM cash_transactions').get().balance);
  }

  function syncCashAvailableSetting() {
    const balance = cashBalance();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('dipCashAvailableCAD', String(balance));
    return balance;
  }

  function normalizeCashTransaction(row) {
    return {
      id: row.id,
      type: row.type,
      amountCAD: Number(row.amount_cad),
      occurredAt: row.occurred_at,
      note: row.note || '',
      buyLogId: row.buy_log_id || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function repairHoldingShareTotals() {
    const mismatches = db.prepare(`
      SELECT h.id, h.ticker, h.shares_owned AS stored_shares,
             (SELECT COALESCE(SUM(b.shares_bought), 0) FROM buy_log b WHERE b.holding_id = h.id) AS canonical_shares
      FROM holdings h
      WHERE EXISTS (SELECT 1 FROM buy_log b WHERE b.holding_id = h.id)
        AND ABS(h.shares_owned - (SELECT COALESCE(SUM(b.shares_bought), 0) FROM buy_log b WHERE b.holding_id = h.id)) > 0.000000001
    `).all();
    if (!mismatches.length) return { repaired: 0, backupPath: null };

    const fs = require('node:fs');
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const backupPath = path.join(backupDir, `dca-helper-before-share-repair-${stamp}.sqlite`);
    db.pragma('wal_checkpoint(FULL)');
    fs.copyFileSync(dbPath, backupPath);

    db.transaction(() => {
      for (const row of mismatches) {
        db.prepare('UPDATE holdings SET shares_owned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.canonical_shares, row.id);
      }
      const remaining = db.prepare(`
        SELECT h.ticker FROM holdings h
        WHERE EXISTS (SELECT 1 FROM buy_log b WHERE b.holding_id = h.id)
          AND ABS(h.shares_owned - (SELECT COALESCE(SUM(b.shares_bought), 0) FROM buy_log b WHERE b.holding_id = h.id)) > 0.000000001
      `).all();
      if (remaining.length) throw new Error(`Share repair verification failed for ${remaining.map((row) => row.ticker).join(', ')}.`);
    })();
    return { repaired: mismatches.length, backupPath };
  }

  repairHoldingShareTotals();
  syncCashAvailableSetting();

  return {
    listHoldings() {
      return db.prepare('SELECT * FROM holdings ORDER BY ticker COLLATE NOCASE').all().map(normalizeHolding);
    },

    saveHolding(holding) {
      const payload = {
        ticker: String(holding.ticker || '').trim().toUpperCase(),
        name: String(holding.name || '').trim() || String(holding.ticker || '').trim().toUpperCase(),
        priceSymbol: String(holding.priceSymbol || '').trim(),
        currency: holding.currency === 'USD' ? 'USD' : 'CAD',
        targetPercent: holding.targetPercent === '' || holding.targetPercent == null ? null : toNumber(holding.targetPercent),
        sharesOwned: toNumber(holding.sharesOwned),
        manualPriceOverride:
          holding.manualPriceOverride === '' || holding.manualPriceOverride == null ? null : toNumber(holding.manualPriceOverride),
        manualPreviousCloseOverride:
          holding.manualPreviousCloseOverride === '' || holding.manualPreviousCloseOverride == null
            ? null
            : toNumber(holding.manualPreviousCloseOverride),
        buySizeOverrideShares:
          holding.buySizeOverrideShares === '' || holding.buySizeOverrideShares == null ? null : toNumber(holding.buySizeOverrideShares),
        ibkrSymbol: String(holding.ibkrSymbol || '').trim().toUpperCase() || null,
        ibkrSecType: String(holding.ibkrSecType || 'STK').trim().toUpperCase() || 'STK',
        ibkrExchange: String(holding.ibkrExchange || 'SMART').trim().toUpperCase() || 'SMART',
        ibkrCurrency: holding.ibkrCurrency === 'CAD' ? 'CAD' : holding.ibkrCurrency === 'USD' ? 'USD' : holding.currency === 'USD' ? 'USD' : 'CAD',
        ibkrPrimaryExchange: String(holding.ibkrPrimaryExchange || '').trim().toUpperCase() || null,
        ibkrPositionShares:
          holding.ibkrPositionShares === '' || holding.ibkrPositionShares == null ? null : toNumber(holding.ibkrPositionShares),
        ibkrAvgPrice:
          holding.ibkrAvgPrice === '' || holding.ibkrAvgPrice == null ? null : toNumber(holding.ibkrAvgPrice),
        ibkrCostBasis:
          holding.ibkrCostBasis === '' || holding.ibkrCostBasis == null ? null : toNumber(holding.ibkrCostBasis),
        enabled: holding.enabled === false ? 0 : 1,
      };

      if (!payload.ticker || !payload.priceSymbol) {
        throw new Error('Ticker and price symbol are required.');
      }
      if (payload.targetPercent != null && (payload.targetPercent < 0 || payload.targetPercent > 100)) {
        throw new Error('Target percentage must be between 0 and 100.');
      }
      if (payload.sharesOwned < 0) {
        throw new Error('Current shares cannot be negative.');
      }
      if (payload.manualPriceOverride != null && payload.manualPriceOverride < 0) {
        throw new Error('Manual price override cannot be negative.');
      }
      if (payload.manualPreviousCloseOverride != null && payload.manualPreviousCloseOverride <= 0) {
        throw new Error('Manual previous close override must be greater than zero.');
      }
      if (payload.buySizeOverrideShares != null && payload.buySizeOverrideShares <= 0) {
        throw new Error('Buy size override must be greater than zero.');
      }
      if (payload.ibkrPositionShares != null && payload.ibkrPositionShares < 0) {
        throw new Error('IBKR position shares cannot be negative.');
      }
      if (payload.ibkrAvgPrice != null && payload.ibkrAvgPrice < 0) {
        throw new Error('IBKR average price cannot be negative.');
      }
      if (payload.ibkrCostBasis != null && payload.ibkrCostBasis < 0) {
        throw new Error('IBKR cost basis cannot be negative.');
      }

      if (holding.id) {
        db.prepare(`
          UPDATE holdings
          SET ticker = ?, name = ?, price_symbol = ?, currency = ?, target_percent = ?,
              shares_owned = ?, manual_price_override = ?, manual_previous_close_override = ?,
              buy_size_override_shares = ?, ibkr_symbol = ?, ibkr_sec_type = ?, ibkr_exchange = ?,
              ibkr_currency = ?, ibkr_primary_exchange = ?, ibkr_position_shares = ?, ibkr_avg_price = ?,
              ibkr_cost_basis = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          payload.ticker,
          payload.name,
          payload.priceSymbol,
          payload.currency,
          payload.targetPercent,
          payload.sharesOwned,
          payload.manualPriceOverride,
          payload.manualPreviousCloseOverride,
          payload.buySizeOverrideShares,
          payload.ibkrSymbol,
          payload.ibkrSecType,
          payload.ibkrExchange,
          payload.ibkrCurrency,
          payload.ibkrPrimaryExchange,
          payload.ibkrPositionShares,
          payload.ibkrAvgPrice,
          payload.ibkrCostBasis,
          payload.enabled,
          holding.id,
        );
        return this.listHoldings().find((row) => row.id === holding.id);
      }

      const result = db.prepare(`
        INSERT INTO holdings
          (ticker, name, price_symbol, currency, target_percent, shares_owned, manual_price_override,
           manual_previous_close_override, buy_size_override_shares, ibkr_symbol, ibkr_sec_type,
           ibkr_exchange, ibkr_currency, ibkr_primary_exchange, ibkr_position_shares, ibkr_avg_price,
           ibkr_cost_basis, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.ticker,
        payload.name,
        payload.priceSymbol,
        payload.currency,
        payload.targetPercent,
        payload.sharesOwned,
        payload.manualPriceOverride,
        payload.manualPreviousCloseOverride,
        payload.buySizeOverrideShares,
        payload.ibkrSymbol,
        payload.ibkrSecType,
        payload.ibkrExchange,
        payload.ibkrCurrency,
        payload.ibkrPrimaryExchange,
        payload.ibkrPositionShares,
        payload.ibkrAvgPrice,
        payload.ibkrCostBasis,
        payload.enabled,
      );
      return this.listHoldings().find((row) => row.id === result.lastInsertRowid);
    },

    deleteHolding(id) {
      db.prepare('DELETE FROM holdings WHERE id = ?').run(id);
      return true;
    },

    updateHoldingMarketData(holdingId, marketData) {
      const current = db.prepare('SELECT * FROM holdings WHERE id = ?').get(holdingId);
      if (!current) return null;

      const nextName =
        marketData.displayName &&
        (!current.name ||
          current.name === current.ticker ||
          current.name === 'Invesco QQQ Trust' ||
          (current.ticker === 'QQQM' && current.name.includes('QQQ Trust')) ||
          current.name.toUpperCase() === `${current.ticker} FUND`)
          ? marketData.displayName
          : current.name;
      const nextPriceSymbol = marketData.priceSymbol || current.price_symbol;

      db.prepare(`
        UPDATE holdings
        SET name = ?, price_symbol = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextName, nextPriceSymbol, holdingId);
      return this.listHoldings().find((row) => row.id === holdingId);
    },

    getSettings() {
      return readSettings();
    },

    saveSettings(settings) {
      const current = this.getSettings();
      const next = { ...current, ...settings };
      const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [key, value] of Object.entries(next)) {
        upsert.run(key, String(value));
      }
      return this.getSettings();
    },

    getCashSummary() {
      return { balanceCAD: cashBalance(), transactions: this.listCashTransactions() };
    },

    listCashTransactions() {
      return db.prepare('SELECT * FROM cash_transactions ORDER BY occurred_at DESC, id DESC').all().map(normalizeCashTransaction);
    },

    saveCashTransaction(payload = {}) {
      const type = String(payload.type || '').trim();
      const allowedTypes = new Set(['deposit', 'withdrawal', 'dividend', 'interest', 'fee', 'adjustment']);
      if (!allowedTypes.has(type)) throw new Error('Choose a valid cash activity type.');
      const rawAmount = toNumber(payload.amountCAD, NaN);
      if (!Number.isFinite(rawAmount) || rawAmount === 0) throw new Error('Cash amount must be a non-zero number.');
      const amountCAD = type === 'withdrawal' || type === 'fee' ? -Math.abs(rawAmount) : type === 'adjustment' ? rawAmount : Math.abs(rawAmount);
      const occurredAt = payload.occurredAt ? new Date(payload.occurredAt).toISOString() : new Date().toISOString();
      if (Number.isNaN(new Date(occurredAt).getTime())) throw new Error('Enter a valid cash activity date.');
      const note = String(payload.note || '').trim();
      db.transaction(() => {
        db.prepare('INSERT INTO cash_transactions (type, amount_cad, occurred_at, note) VALUES (?, ?, ?, ?)')
          .run(type, amountCAD, occurredAt, note || null);
        syncCashAvailableSetting();
      })();
      return this.getCashSummary();
    },

    deleteCashTransaction(id) {
      const existing = db.prepare('SELECT * FROM cash_transactions WHERE id = ?').get(Number(id));
      if (!existing) return this.getCashSummary();
      if (existing.type === 'opening-balance' || existing.buy_log_id != null) throw new Error('This cash entry is linked to portfolio history and cannot be deleted here.');
      db.transaction(() => {
        db.prepare('DELETE FROM cash_transactions WHERE id = ?').run(Number(id));
        syncCashAvailableSetting();
      })();
      return this.getCashSummary();
    },

    savePrice(price) {
      const existing = db.prepare('SELECT * FROM prices WHERE holding_id = ?').get(price.holdingId);
      if (shouldIgnoreIncomingPrice(existing, price)) {
        return { skipped: true, reason: 'Older price data ignored.' };
      }

      let warning = price.warning ?? null;
      if (
        existing &&
        existing.last_price != null &&
        price.lastPrice != null &&
        Number(existing.last_price) > 0 &&
        Math.abs((Number(price.lastPrice) - Number(existing.last_price)) / Number(existing.last_price)) >= 0.05
      ) {
        const pct = (((Number(price.lastPrice) - Number(existing.last_price)) / Number(existing.last_price)) * 100).toFixed(2);
        warning = [warning, `Price moved ${pct}% from previously stored price. Verify with IBKR.`].filter(Boolean).join(' ');
      }

      const hasNormalMovePercent = Object.prototype.hasOwnProperty.call(price, 'normalMovePercent');
      const hasHistoricalWarning = Object.prototype.hasOwnProperty.call(price, 'historicalWarning');
      const normalMoveDate =
        hasNormalMovePercent && Number(price.normalMovePercent) > 0
          ? price.normalMoveDate || new Date().toISOString().slice(0, 10)
          : hasNormalMovePercent
            ? null
            : existing?.normal_move_date ?? null;
      const normalMovePercent = hasNormalMovePercent
        ? Number(price.normalMovePercent) > 0
          ? Number(price.normalMovePercent)
          : null
        : existing?.normal_move_percent ?? null;
      const historicalWarning = hasHistoricalWarning ? price.historicalWarning ?? null : existing?.historical_warning ?? null;

      db.prepare(`
        INSERT INTO prices
          (holding_id, price_symbol, last_price, previous_close, currency, fetched_at, error, source, source_time, is_delayed, is_stale, warning,
           normal_move_percent, normal_move_date, historical_warning)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(holding_id) DO UPDATE SET
          price_symbol = excluded.price_symbol,
          last_price = excluded.last_price,
          previous_close = excluded.previous_close,
          currency = excluded.currency,
          fetched_at = excluded.fetched_at,
          error = excluded.error,
          source = excluded.source,
          source_time = excluded.source_time,
          is_delayed = excluded.is_delayed,
          is_stale = excluded.is_stale,
          warning = excluded.warning,
          normal_move_percent = excluded.normal_move_percent,
          normal_move_date = excluded.normal_move_date,
          historical_warning = excluded.historical_warning
      `).run(
        price.holdingId,
        price.priceSymbol,
        price.lastPrice ?? null,
        price.previousClose ?? null,
        price.currency,
        price.fetchedAt,
        price.error ?? null,
        price.source ?? 'Yahoo',
        price.sourceTime ?? null,
        price.isDelayed ? 1 : 0,
        price.isStale ? 1 : 0,
        warning,
        normalMovePercent,
        normalMoveDate,
        historicalWarning,
      );
      return { skipped: false };
    },

    listPrices() {
      return db.prepare(`
        SELECT holding_id AS holdingId, price_symbol AS priceSymbol, last_price AS lastPrice,
               previous_close AS previousClose, currency, fetched_at AS fetchedAt, error,
               source, source_time AS sourceTime, is_delayed AS isDelayed, is_stale AS isStale, warning,
               normal_move_percent AS normalMovePercent, normal_move_date AS normalMoveDate, historical_warning AS historicalWarning
        FROM prices
      `).all().map((row) => ({
        ...row,
        isDelayed: Boolean(row.isDelayed),
        isStale: Boolean(row.isStale),
      }));
    },

    saveHistory(plan) {
      const savedAt = new Date().toISOString();
      db.prepare('INSERT INTO history (saved_at, snapshot_json) VALUES (?, ?)').run(savedAt, JSON.stringify(plan));
      return { savedAt };
    },

    markBought(payload) {
      const holdingId = Number(payload.holdingId);
      const actualShares = toNumber(payload.actualShares, NaN);
      const actualCostCAD = toNumber(payload.actualCostCAD, NaN);
      const note = String(payload.note || '').trim();
      const planRow = payload.planRow || {};

      if (!Number.isFinite(holdingId)) throw new Error('Holding is required.');
      if (!Number.isFinite(actualShares) || actualShares <= 0) throw new Error('Actual shares bought must be greater than zero.');
      if (!Number.isFinite(actualCostCAD) || actualCostCAD <= 0) throw new Error('Actual CAD cost must be greater than zero.');

      const transaction = db.transaction(() => {
        const holding = db.prepare('SELECT * FROM holdings WHERE id = ?').get(holdingId);
        if (!holding) throw new Error('Holding not found.');

        const settings = this.getSettings();
        const cashUsed = toNumber(settings.cashPoolUsedCAD) + actualCostCAD;
        this.saveSettings({ cashPoolUsedCAD: cashUsed });

        db.prepare('UPDATE holdings SET shares_owned = shares_owned + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
          actualShares,
          holdingId,
        );

        const savedAt = new Date().toISOString();
        const snapshot = {
          type: 'buy',
          savedAt,
          note,
          cashPoolStartingCAD: toNumber(settings.cashPoolStartingCAD),
          cashPoolUsedCAD: cashUsed,
          cashPoolRemainingCAD: Math.max(toNumber(settings.cashPoolStartingCAD) - cashUsed, 0),
          rows: [
            {
              ...planRow,
              ticker: planRow.ticker || holding.ticker,
              holdingId,
              actualSharesBought: actualShares,
              actualCostCAD,
              note,
              action: 'BUY',
            },
          ],
        };

        db.prepare('INSERT INTO history (saved_at, snapshot_json) VALUES (?, ?)').run(savedAt, JSON.stringify(snapshot));
        return snapshot;
      });

      return transaction();
    },

    listBuyLog() {
      return db.prepare('SELECT * FROM buy_log ORDER BY bought_at DESC, id DESC').all().map(normalizeBuyLog);
    },

    listPendingOrders() {
      return db.prepare('SELECT * FROM pending_orders ORDER BY created_at DESC, id DESC').all().map(normalizePendingOrder);
    },

    savePendingOrder(payload = {}) {
      const holdingId = Number(payload.holdingId);
      const ticker = cleanSymbol(payload.ticker);
      const mode = payload.mode === 'shares' ? 'shares' : 'cash';
      const sharesAmount = payload.sharesBought === '' || payload.sharesBought == null ? null : toNumber(payload.sharesBought, NaN);
      const cashAmount = payload.cashPaidAmount === '' || payload.cashPaidAmount == null ? null : toNumber(payload.cashPaidAmount, NaN);
      const cashCurrency = payload.cashPaidCurrency === 'CAD' ? 'CAD' : 'USD';
      const feeAmount = payload.estimatedFeeAmount === '' || payload.estimatedFeeAmount == null ? null : toNumber(payload.estimatedFeeAmount, NaN);
      const feeCurrency = payload.feeCurrency === 'USD' ? 'USD' : 'CAD';
      const visibleTotal = payload.visibleTotalAmount === '' || payload.visibleTotalAmount == null ? null : toNumber(payload.visibleTotalAmount, NaN);
      const orderType = String(payload.orderType || 'MARKET').toUpperCase() === 'LIMIT' ? 'LIMIT' : 'MARKET';
      const orderSide = String(payload.orderSide || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      const limitPrice = payload.limitPrice === '' || payload.limitPrice == null ? null : toNumber(payload.limitPrice, NaN);
      const limitCurrency = payload.limitCurrency === 'CAD' ? 'CAD' : 'USD';
      if (!ticker) throw new Error('Pending order needs a ticker.');
      if (mode === 'cash' && (!Number.isFinite(cashAmount) || cashAmount <= 0)) throw new Error('Pending cash order needs a positive cash amount.');
      if (mode === 'shares' && (!Number.isFinite(sharesAmount) || sharesAmount <= 0)) throw new Error('Pending share order needs a positive share amount.');
      if (feeAmount != null && (!Number.isFinite(feeAmount) || feeAmount < 0)) throw new Error('Estimated fee cannot be negative.');
      if (orderType === 'LIMIT' && (!Number.isFinite(limitPrice) || limitPrice <= 0)) throw new Error('Limit orders need a positive limit price.');
      db.prepare(`
        INSERT INTO pending_orders
          (holding_id, ticker, order_mode, shares_amount, cash_amount, cash_currency, estimated_fee_amount, fee_currency, visible_total_amount, order_type, order_side, limit_price, limit_currency, status, note, ocr_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(Number.isFinite(holdingId) ? holdingId : null, ticker, mode, sharesAmount, cashAmount, cashCurrency, feeAmount, feeCurrency, Number.isFinite(visibleTotal) ? visibleTotal : null, orderType, orderSide, orderType === 'LIMIT' ? limitPrice : null, orderType === 'LIMIT' ? limitCurrency : null, String(payload.note || ''), String(payload.ocrText || ''));
      return this.listPendingOrders();
    },

    deletePendingOrder(id) {
      db.prepare('DELETE FROM pending_orders WHERE id = ?').run(Number(id));
      return this.listPendingOrders();
    },

    saveBuyLog(payload = {}) {
      const id = payload.id ? Number(payload.id) : null;
      const requestedTicker = cleanSymbol(payload.ticker || payload.priceSymbol);
      const rawHoldingId = Number(payload.holdingId);
      const sharesBought = toNumber(payload.sharesBought, NaN);
      const buyPrice = toNumber(payload.buyPrice, NaN);
      const priceCurrency = payload.priceCurrency === 'CAD' ? 'CAD' : 'USD';
      const cadAmount = toNumber(payload.cadAmount, NaN);
      const feeCAD = payload.feeCAD === '' || payload.feeCAD == null ? 0 : toNumber(payload.feeCAD, NaN);
      const boughtAt = payload.boughtAt ? new Date(payload.boughtAt).toISOString() : new Date().toISOString();
      const note = String(payload.note || '').trim();
      const brokerTradeId = String(payload.brokerTradeId || payload.ibkrTradeId || '').trim() || null;
      const source = String(payload.source || 'manual').trim() || 'manual';
      const cadCostStatus = priceCurrency === 'CAD' ? 'exact' : 'estimated';

      if (!Number.isFinite(sharesBought) || sharesBought <= 0) throw new Error('Shares bought must be greater than zero.');
      if (!Number.isFinite(buyPrice) || buyPrice <= 0) throw new Error('Buy price must be greater than zero.');
      if (!Number.isFinite(cadAmount) || cadAmount <= 0) throw new Error('Converted CAD cost must be greater than zero.');
      if (!Number.isFinite(feeCAD) || feeCAD < 0) throw new Error('Fee cannot be negative.');

      const transaction = db.transaction(() => {
        let holding = Number.isFinite(rawHoldingId)
          ? db.prepare('SELECT * FROM holdings WHERE id = ?').get(rawHoldingId)
          : null;
        if (!holding && requestedTicker) {
          holding = db.prepare(`
            SELECT * FROM holdings
            WHERE UPPER(ticker) = ? OR UPPER(price_symbol) = ?
            ORDER BY enabled DESC, id ASC
            LIMIT 1
          `).get(requestedTicker, requestedTicker);
        }
        if (!holding) {
          const label = requestedTicker || payload.ticker || payload.priceSymbol || 'selected ticker';
          console.warn('Buy log save could not resolve holding', {
            holdingId: payload.holdingId,
            ticker: payload.ticker,
            priceSymbol: payload.priceSymbol,
          });
          throw new Error(`Could not find holding for ${label}. Please refresh or re-add the ticker.`);
        }
        const holdingId = Number(holding.id);

        const old = id ? db.prepare('SELECT * FROM buy_log WHERE id = ?').get(id) : null;
        const duplicate = brokerTradeId
          ? db.prepare('SELECT * FROM buy_log WHERE ibkr_trade_id = ? AND (? IS NULL OR id <> ?) LIMIT 1').get(brokerTradeId, id, id)
          : db.prepare(`
              SELECT * FROM buy_log
              WHERE UPPER(ticker) = UPPER(?)
                AND bought_at = ?
                AND ABS(shares_bought - ?) < 0.000000001
                AND ABS(buy_price - ?) < 0.000000001
                AND (? IS NULL OR id <> ?)
              LIMIT 1
            `).get(holding.ticker, boughtAt, sharesBought, buyPrice, id, id);
        if (duplicate) {
          throw new Error('Duplicate buy detected. This trade is already in the Buy Log.');
        }
        const oldShares = old ? Number(old.shares_bought) : 0;
        const newTotal = cadAmount + feeCAD;
        let savedBuyId = id;

        if (id && old) {
          db.prepare(`
            UPDATE buy_log
            SET holding_id = ?, ticker = ?, shares_bought = ?, buy_price = ?, price_currency = ?,
                cad_amount = ?, fee_cad = ?, bought_at = ?, note = ?, ibkr_trade_id = ?, source = ?, cad_cost_status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(holdingId, holding.ticker, sharesBought, buyPrice, priceCurrency, cadAmount, feeCAD, boughtAt, note, brokerTradeId, source, cadCostStatus, id);
        } else {
          const inserted = db.prepare(`
            INSERT INTO buy_log
              (holding_id, ticker, shares_bought, buy_price, price_currency, cad_amount, fee_cad, bought_at, note, ibkr_trade_id, source, cad_cost_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(holdingId, holding.ticker, sharesBought, buyPrice, priceCurrency, cadAmount, feeCAD, boughtAt, note, brokerTradeId, source, cadCostStatus);
          savedBuyId = Number(inserted.lastInsertRowid);
        }

        db.prepare('UPDATE holdings SET shares_owned = shares_owned + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
          sharesBought - oldShares,
          holdingId,
        );

        if (old?.cash_transaction_id) {
          db.prepare(`
            UPDATE cash_transactions
            SET amount_cad = ?, occurred_at = ?, note = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(-newTotal, boughtAt, `Buy ${holding.ticker}`, Number(old.cash_transaction_id));
        } else if (!old) {
          const cashEntry = db.prepare(`
            INSERT INTO cash_transactions (type, amount_cad, occurred_at, note, buy_log_id)
            VALUES ('buy', ?, ?, ?, ?)
          `).run(-newTotal, boughtAt, `Buy ${holding.ticker}`, savedBuyId);
          db.prepare('UPDATE buy_log SET cash_transaction_id = ? WHERE id = ?').run(Number(cashEntry.lastInsertRowid), savedBuyId);
        }
        syncCashAvailableSetting();

        return this.listBuyLog();
      });

      return transaction();
    },

    deleteBuyLog(id) {
      const transaction = db.transaction(() => {
        const old = db.prepare('SELECT * FROM buy_log WHERE id = ?').get(Number(id));
        if (!old) return this.listBuyLog();
        db.prepare('UPDATE holdings SET shares_owned = MAX(shares_owned - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
          Number(old.shares_bought),
          Number(old.holding_id),
        );
        if (old.cash_transaction_id) db.prepare('DELETE FROM cash_transactions WHERE id = ?').run(Number(old.cash_transaction_id));
        db.prepare('DELETE FROM buy_log WHERE id = ?').run(Number(id));
        syncCashAvailableSetting();
        return this.listBuyLog();
      });

      return transaction();
    },

    listIbkrReconciliations() {
      return db.prepare('SELECT * FROM ibkr_reconciliations ORDER BY imported_at DESC').all().map((row) => ({
        id: row.id,
        importedAt: row.imported_at,
        // Do not surface a user's local filesystem filename in the app UI.
        fileName: 'IBKR Activity Statement',
        fileHash: row.file_hash,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        counts: JSON.parse(row.counts_json),
        backupPath: row.backup_path,
      }));
    },

    listMarketBars({ instrumentKey, provider, interval }) {
      const rows = db.prepare(`
        SELECT bar_time AS time, open, high, low, close, volume, fetched_at AS fetchedAt
        FROM market_bars
        WHERE instrument_key = ? AND provider = ? AND interval = ?
        ORDER BY bar_time ASC
      `).all(String(instrumentKey), String(provider), String(interval));
      return {
        bars: rows.map((row) => ({
          time: Number(row.time), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close),
          ...(Number.isFinite(Number(row.volume)) ? { volume: Number(row.volume) } : {}),
        })),
        fetchedAt: rows.at(-1)?.fetchedAt || null,
      };
    },

    upsertMarketBars({ instrumentKey, provider, interval, bars, fetchedAt, splitAdjustment = 'provider-reported' }) {
      const rows = Array.isArray(bars) ? bars : [];
      const statement = db.prepare(`
        INSERT INTO market_bars (instrument_key, provider, interval, bar_time, open, high, low, close, volume, fetched_at, split_adjustment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instrument_key, provider, interval, bar_time) DO UPDATE SET
          open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close,
          volume = excluded.volume, fetched_at = excluded.fetched_at, split_adjustment = excluded.split_adjustment
      `);
      const transaction = db.transaction(() => {
        for (const bar of rows) {
          if (!Number.isInteger(Number(bar.time)) || ![bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(Number(value)))) continue;
          statement.run(String(instrumentKey), String(provider), String(interval), Number(bar.time), Number(bar.open), Number(bar.high), Number(bar.low), Number(bar.close), Number.isFinite(Number(bar.volume)) ? Number(bar.volume) : null, fetchedAt || new Date().toISOString(), String(splitAdjustment));
        }
      });
      transaction();
      return this.listMarketBars({ instrumentKey, provider, interval });
    },

    close() {
      db.close();
    },

    applyIbkrReconciliation(preview, metadata) {
      if (db.prepare('SELECT 1 FROM ibkr_reconciliations WHERE file_hash = ?').get(metadata.fileHash)) {
        throw new Error('This exact statement has already been applied. No records were changed.');
      }
      const backupDir = path.join(path.dirname(dbPath), 'backups');
      require('fs').mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
      const backupPath = path.join(backupDir, `dca-helper-before-ibkr-${stamp}.sqlite`);
      db.pragma('wal_checkpoint(FULL)');
      require('fs').copyFileSync(dbPath, backupPath);

      const transaction = db.transaction(() => {
        const insert = db.prepare(`
          INSERT INTO buy_log
            (holding_id, ticker, shares_bought, buy_price, price_currency, cad_amount, fee_cad, bought_at, note,
             ibkr_trade_id, ibkr_bought_at_utc, shares_bought_text, buy_price_text, gross_usd, gross_usd_text,
             commission_usd, commission_usd_text, all_in_usd_cost, all_in_usd_cost_text, cad_cost_status, source)
          VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, 'IBKR Activity Statement', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'estimated', 'ibkr-activity')
        `);
        const update = db.prepare(`
          UPDATE buy_log SET holding_id = ?, ticker = ?, shares_bought = ?, buy_price = ?, price_currency = 'USD',
            cad_amount = ?, fee_cad = ?, bought_at = ?, note = 'IBKR Activity Statement', ibkr_trade_id = ?,
            ibkr_bought_at_utc = ?, shares_bought_text = ?, buy_price_text = ?, gross_usd = ?, gross_usd_text = ?,
            commission_usd = ?, commission_usd_text = ?, all_in_usd_cost = ?, all_in_usd_cost_text = ?,
            cad_cost_status = 'estimated', source = 'ibkr-activity', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
        for (const action of preview.actions.filter((item) => item.type !== 'unchanged')) {
          const holding = db.prepare('SELECT id, ticker FROM holdings WHERE UPPER(ticker) = ? OR UPPER(price_symbol) = ? ORDER BY enabled DESC, id LIMIT 1').get(action.ticker, action.ticker);
          if (!holding) throw new Error(`Statement contains ${action.ticker}, but that holding is not configured. Add it first.`);
          const values = [holding.id, holding.ticker, action.sharesBought, action.buyPrice, action.cadAmount, action.feeCAD,
            action.boughtAt, action.brokerTradeId, action.boughtAt, action.sharesText, action.buyPriceText,
            action.grossUsd, String(action.grossUsd), action.commissionUsd, String(action.commissionUsd),
            action.allInUsd, String(action.allInUsd)];
          let savedBuyId = action.localId;
          if (action.type === 'corrected') {
            update.run(...values, action.localId);
          } else {
            savedBuyId = Number(insert.run(...values).lastInsertRowid);
          }

          // Reconciliation must not silently change cash a second time for
          // historical rows that were migrated into the opening balance.
          // It does, however, keep any ledger entry already linked to a
          // corrected buy accurate and records a debit for a genuinely added
          // buy made after the cash ledger was introduced.
          const savedCash = db.prepare('SELECT cash_transaction_id FROM buy_log WHERE id = ?').get(savedBuyId)?.cash_transaction_id;
          const cashDebit = -(Number(action.cadAmount) + Number(action.feeCAD));
          if (savedCash) {
            db.prepare(`UPDATE cash_transactions
              SET amount_cad = ?, occurred_at = ?, note = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`).run(cashDebit, action.boughtAt, `Buy ${holding.ticker}`, Number(savedCash));
          } else if (action.type === 'added') {
            const cashEntry = db.prepare(`INSERT INTO cash_transactions
              (type, amount_cad, occurred_at, note, buy_log_id)
              VALUES ('buy', ?, ?, ?, ?)`).run(cashDebit, action.boughtAt, `Buy ${holding.ticker}`, savedBuyId);
            db.prepare('UPDATE buy_log SET cash_transaction_id = ? WHERE id = ?')
              .run(Number(cashEntry.lastInsertRowid), savedBuyId);
          }
        }
        db.prepare(`UPDATE holdings SET shares_owned = COALESCE((SELECT SUM(shares_bought) FROM buy_log WHERE holding_id = holdings.id), 0), updated_at = CURRENT_TIMESTAMP`).run();
        if (preview.statement.positionUpdateEligible) {
          for (const position of preview.statement.positions || []) {
            db.prepare(`UPDATE holdings SET ibkr_position_shares = ?, ibkr_cost_basis = ?, ibkr_avg_price = ?, updated_at = CURRENT_TIMESTAMP WHERE UPPER(ticker) = ? OR UPPER(price_symbol) = ?`)
              .run(position.shares, position.costBasis, position.avgPrice, position.ticker, position.ticker);
          }
        }

        // Post-write audit runs inside the same transaction. Any mismatch throws
        // and rolls the entire reconciliation back automatically.
        for (const action of preview.actions) {
          const saved = action.localId
            ? db.prepare('SELECT * FROM buy_log WHERE id = ?').get(action.localId)
            : db.prepare('SELECT * FROM buy_log WHERE ibkr_trade_id = ?').get(action.brokerTradeId);
          if (!saved) throw new Error(`Post-save audit failed: ${action.ticker} ${action.boughtAt} was not found.`);
          for (const [column, expected, tolerance] of [
            ['shares_bought', action.sharesBought, 0.000000001],
            ['buy_price', action.buyPrice, 0.000001],
            ['gross_usd', action.grossUsd, 0.000001],
            ['commission_usd', action.commissionUsd, 0.000001],
            ['all_in_usd_cost', action.allInUsd, 0.000001],
          ]) {
            if (!Number.isFinite(Number(saved[column])) || Math.abs(Number(saved[column]) - Number(expected)) > tolerance) {
              throw new Error(`Post-save audit failed: ${action.ticker} has an incorrect ${column}. All changes were rolled back.`);
            }
          }
        }
        const duplicateIds = db.prepare(`SELECT ibkr_trade_id FROM buy_log WHERE ibkr_trade_id IS NOT NULL AND ibkr_trade_id <> '' GROUP BY ibkr_trade_id HAVING COUNT(*) > 1`).all();
        if (duplicateIds.length) throw new Error('Post-save audit found duplicate IBKR identifiers. All changes were rolled back.');
        const shareMismatch = db.prepare(`
          SELECT h.ticker FROM holdings h
          WHERE ABS(h.shares_owned - COALESCE((SELECT SUM(b.shares_bought) FROM buy_log b WHERE b.holding_id = h.id), 0)) > 0.000000001
        `).all();
        if (shareMismatch.length) throw new Error(`Post-save audit found incorrect holding totals for ${shareMismatch.map((row) => row.ticker).join(', ')}. All changes were rolled back.`);
        db.prepare(`INSERT INTO ibkr_reconciliations (imported_at, file_name, file_hash, period_start, period_end, counts_json, backup_path) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(new Date().toISOString(), metadata.fileName, metadata.fileHash, preview.statement.periodStart, preview.statement.periodEnd, JSON.stringify(preview.counts), backupPath);
        syncCashAvailableSetting();
        return { passed: true, executionsChecked: preview.actions.length, duplicateIds: 0, holdingTotalsChecked: db.prepare('SELECT COUNT(*) AS count FROM holdings').get().count };
      });
      const verification = transaction();
      return { backupPath, verification, history: this.listIbkrReconciliations(), buyLog: this.listBuyLog() };
    },

    repairHoldingShareTotals,

    listHistory() {
      return db.prepare('SELECT saved_at AS savedAt, snapshot_json AS snapshotJson FROM history ORDER BY saved_at DESC')
        .all()
        .map((row) => ({ savedAt: row.savedAt, ...JSON.parse(row.snapshotJson) }));
    },
  };
}

module.exports = {
  createDb,
  shouldIgnoreIncomingPrice,
  DEFAULT_SETTINGS,
  decimalAdd,
  decimalMultiply,
};
