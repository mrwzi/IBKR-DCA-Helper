const Database = require('better-sqlite3');

const db = new Database(':memory:');
db.exec('CREATE TABLE native_check (id INTEGER PRIMARY KEY)');
db.close();
console.log(`better-sqlite3 is compatible with Electron ${process.versions.electron} (modules ${process.versions.modules}).`);
process.exit(0);
