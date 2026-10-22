// Mode démo uniquement : des acheteurs fictifs enchérissent et les ventes terminées sont remises en ligne,
// pour que la plateforme reste animée pendant une présentation. Désactivé en production (DEMO_BOTS=0 ou paiement réel).
import { all, one, run } from "./db.js";
import { nextMin, placeBid } from "./engine.js";
import { increment } from "./rules.js";

const H = 3600 * 1000;

function botBid() {
  const live = all("SELECT * FROM auctions WHERE status = 'live' AND moderation = 'approved' AND ends_at > ? ORDER BY ends_at ASC LIMIT 12", Date.now() + 5000);
  if (!live.length) return;
  const a = live[Math.floor(Math.random() * live.length)];
  const bot = one(
    "SELECT * FROM users WHERE role = 'buyer' AND phone LIKE '78100%' AND id != ? AND strikes < 2 ORDER BY RANDOM() LIMIT 1",
    a.leader_id ?? -1,
  );
  if (!bot) return;
  const amount = nextMin(a) + (Math.random() < 0.3 ? increment(a.current_price) : 0);
  // De temps en temps, un acheteur fictif pose une enchère automatique
  const auto = a.mode === "lot" && Math.random() < 0.15 ? amount + increment(amount) * (2 + Math.floor(Math.random() * 4)) : 0;
  try {
    placeBid(bot, a.id, amount, auto);
  } catch {
    /* vente fermée entre-temps */
  }
}

function relist() {
  const live = one("SELECT COUNT(*) n FROM auctions WHERE status = 'live'").n;
  if (live >= 16) return;
  const old = one("SELECT * FROM auctions WHERE status IN ('unsold','sold') AND images LIKE '%/products/%' ORDER BY RANDOM() LIMIT 1");
  if (!old) return;
  const now = Date.now();
  run(
    `INSERT INTO auctions (seller_id, title, description, category, condition, city, region, images, quantity, start_price, reserve_price,
      current_price, starts_at, ends_at, created_at, mode, buy_now_price, size, search_text, thumbs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    old.seller_id,
    old.title,
    old.description,
    old.category,
    old.condition,
    old.city,
    old.region,
    old.images,
    old.quantity,
    old.start_price,
    old.reserve_price,
    old.start_price,
    now,
    now + (2 + Math.random() * 46) * H,
    now,
    old.mode,
    old.buy_now_price,
    old.size,
    old.search_text,
    old.thumbs,
  );
}

export function startDemo() {
  const loop = () => {
    botBid();
    setTimeout(loop, 6000 + Math.random() * 12000);
  };
  setTimeout(loop, 4000);
  setInterval(relist, 60 * 1000);
  console.log("Mode démo : acheteurs fictifs actifs (DEMO_BOTS=0 pour couper).");
}
