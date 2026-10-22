import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.BABYLONE_DATA || join(here, "..", "data");
export const UPLOAD_DIR = join(DATA_DIR, "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, "babylone.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer',          -- buyer | seller | admin
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Thiès',
  shop_name TEXT,
  verified INTEGER NOT NULL DEFAULT 0,          -- vendeur vérifié (pièce d'identité contrôlée)
  plan TEXT NOT NULL DEFAULT 'standard',        -- standard | pro
  plan_until INTEGER,
  strikes INTEGER NOT NULL DEFAULT 0,           -- ventes gagnées non payées
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auctions (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT 'neuf',
  city TEXT NOT NULL,
  region TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  quantity INTEGER NOT NULL DEFAULT 1,
  start_price INTEGER NOT NULL,
  reserve_price INTEGER NOT NULL DEFAULT 0,
  current_price INTEGER NOT NULL,
  bids_count INTEGER NOT NULL DEFAULT 0,
  leader_id INTEGER REFERENCES users(id),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'live',          -- live | sold | unsold | cancelled
  boosted INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status, ends_at);
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY,
  auction_id INTEGER NOT NULL REFERENCES auctions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bids_auction ON bids(auction_id, amount DESC);
CREATE TABLE IF NOT EXISTS watches (
  user_id INTEGER NOT NULL REFERENCES users(id),
  auction_id INTEGER NOT NULL REFERENCES auctions(id),
  PRIMARY KEY (user_id, auction_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  auction_id INTEGER NOT NULL REFERENCES auctions(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  commission INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL,
  status TEXT NOT NULL,                         -- awaiting_payment | paid | shipped | delivered | released | expired | disputed | refunded
  pay_deadline INTEGER NOT NULL,
  provider TEXT,
  payment_ref TEXT,
  address TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  budget_max INTEGER,
  city TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  votes INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS request_votes (
  user_id INTEGER NOT NULL,
  request_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id),
  seller_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);

// ---------- Migrations (colonnes ajoutées après la v1) ----------
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn("auctions", "mode", "TEXT NOT NULL DEFAULT 'lot'"); // lot (1 gagnant) | multi (1 pièce par gagnant)
addColumn("auctions", "buy_now_price", "INTEGER NOT NULL DEFAULT 0");
addColumn("auctions", "moderation", "TEXT NOT NULL DEFAULT 'approved'"); // pending | approved | rejected
addColumn("users", "phone_verified", "INTEGER NOT NULL DEFAULT 0");
addColumn("users", "whatsapp", "INTEGER NOT NULL DEFAULT 1"); // accepte les messages WhatsApp
addColumn("users", "referral_code", "TEXT");
addColumn("users", "referred_by", "INTEGER");
addColumn("users", "last_ip", "TEXT");
addColumn("users", "blocked", "INTEGER NOT NULL DEFAULT 0");
addColumn("bids", "ip", "TEXT");
addColumn("bids", "auto", "INTEGER NOT NULL DEFAULT 0");
addColumn("orders", "reminded", "INTEGER NOT NULL DEFAULT 0");

db.exec(`
CREATE TABLE IF NOT EXISTS auto_bids (
  auction_id INTEGER NOT NULL REFERENCES auctions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  max_amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (auction_id, user_id)
);
CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (phone, purpose)
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  channel TEXT NOT NULL,      -- whatsapp | sms
  recipient TEXT NOT NULL,
  template TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL,       -- sent | simulated | failed
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fraud_flags (
  id INTEGER PRIMARY KEY,
  auction_id INTEGER,
  user_id INTEGER,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

// ---------- v3 ----------
addColumn("auctions", "size", "TEXT");
addColumn("auctions", "search_text", "TEXT");
addColumn("auctions", "inspected", "INTEGER NOT NULL DEFAULT 0");
addColumn("auctions", "flash", "INTEGER NOT NULL DEFAULT 0");
addColumn("auctions", "thumbs", "TEXT");
addColumn("auctions", "live_id", "INTEGER");
addColumn("auctions", "ai_review", "TEXT"); // avis de la modération IA (JSON)
addColumn("users", "points", "INTEGER NOT NULL DEFAULT 0");
addColumn("users", "payout_method", "TEXT"); // wave | orange_money
addColumn("users", "payout_account", "TEXT");
addColumn("users", "deposit", "INTEGER NOT NULL DEFAULT 0"); // caution versée (FCFA)
addColumn("users", "lang", "TEXT NOT NULL DEFAULT 'fr'");
addColumn("users", "deleted", "INTEGER NOT NULL DEFAULT 0");
addColumn("users", "bio", "TEXT");
addColumn("orders", "delivery_mode", "TEXT NOT NULL DEFAULT 'home'"); // home | relay
addColumn("orders", "relay_id", "INTEGER");
addColumn("orders", "delivery_code", "TEXT");
addColumn("orders", "decision", "TEXT");

db.exec(`
CREATE TABLE IF NOT EXISTS order_messages (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,          -- buyer | seller | admin
  body TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS buyer_reviews (
  order_id INTEGER PRIMARY KEY,
  buyer_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS follows (
  user_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, seller_id)
);
CREATE TABLE IF NOT EXISTS saved_searches (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  q TEXT NOT NULL DEFAULT '',
  category TEXT,
  size TEXT,
  city TEXT,
  max_price INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS relay_points (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  hours TEXT NOT NULL,
  phone TEXT
);
CREATE TABLE IF NOT EXISTS reminders (
  auction_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (auction_id, user_id, kind)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,          -- visit | view | bid | pay | signup
  path TEXT,
  user_id INTEGER,
  session TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events ON events(kind, created_at);
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY,
  order_id INTEGER,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,          -- seller_payout | refund | deposit_refund
  amount INTEGER NOT NULL,
  method TEXT,
  account TEXT,
  status TEXT NOT NULL,        -- pending | sent | simulated | failed | missing_account
  ref TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,          -- deposit | preorder | preorder_balance | pro
  ref_id INTEGER,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,        -- pending | paid | refunded
  provider_ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  user_id INTEGER NOT NULL,
  device TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (user_id, device)
);
CREATE TABLE IF NOT EXISTS lives (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  stream_url TEXT,
  starts_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | live | ended
  current_auction INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS live_chat (
  id INTEGER PRIMARY KEY,
  live_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS preorders (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  city TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  deposit_pct INTEGER NOT NULL DEFAULT 20,
  total_units INTEGER NOT NULL,
  min_units INTEGER NOT NULL,
  eta INTEGER NOT NULL,        -- arrivée prévue
  deadline INTEGER NOT NULL,   -- fin des réservations
  status TEXT NOT NULL DEFAULT 'open', -- open | confirmed | arrived | cancelled | closed
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY,
  preorder_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  deposit INTEGER NOT NULL,
  status TEXT NOT NULL,        -- pending | reserved | balance_due | completed | refunded
  created_at INTEGER NOT NULL
);
`);

export function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
