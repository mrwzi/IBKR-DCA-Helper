const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('node:path');

app.whenReady().then(() => {
  const dbPath = process.env.DCA_DB_PATH || path.join(app.getPath('appData'), 'dca-helper', 'dca-helper.sqlite');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  console.log(JSON.stringify({ dbPath, trades: count('buy_log'), holdings: count('holdings'), settings: count('settings') }));
  db.close();
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
