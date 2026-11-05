const Database = require('better-sqlite3');
const db = new Database('review.db');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  stock_status TEXT DEFAULT 'open',
  allowed_countries TEXT DEFAULT 'ALL',
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  paypal TEXT NOT NULL,
  amazon_profile TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
if (count === 0) {
  const insert = db.prepare('INSERT INTO products (name, stock_status, allowed_countries, is_active) VALUES (?, ?, ?, ?)');
  insert.run('Laser Hair Removal Device', 'open', 'ALL', 1);
  insert.run('Facial Beauty Device', 'coming_soon', 'ALL', 1);
  insert.run('Fat Burning Massager', 'out_of_stock', 'US', 1);
}

module.exports = db;
