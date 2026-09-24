const { app } = require('electron');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { parseActivityStatement, buildPreview } = require('../electron/ibkr-activity.cjs');

app.whenReady().then(() => {
  const statementPath = process.env.IBKR_STATEMENT_PATH;
  if (!statementPath) throw new Error('IBKR_STATEMENT_PATH is required.');
  const dbPath = process.env.DCA_DB_PATH || path.join(app.getPath('appData'), 'dca-helper', 'dca-helper.sqlite');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const rows = db.prepare(`SELECT id, ticker, bought_at AS boughtAt, shares_bought AS sharesBought, buy_price AS buyPrice,
    gross_usd AS grossUsd, commission_usd AS commissionUsd, ibkr_trade_id AS ibkrTradeId, source FROM buy_log`).all();
  const rate = Number(db.prepare("SELECT value FROM settings WHERE key = 'usdCadRate'").get()?.value || 1);
  const statement = parseActivityStatement(fs.readFileSync(statementPath, 'utf8'));
  const preview = buildPreview(statement, rows, rate);
  console.log(JSON.stringify({ databaseTrades: rows.length, statementTrades: statement.trades.length, account: statement.account, currency: statement.currency, counts: preview.counts, review: preview.review.map((item) => ({ ...item, local: rows.find((row) => row.id === item.localId) })), added: preview.actions.filter((item) => item.type === 'added') }, null, 2));
  db.close(); app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
