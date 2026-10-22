// Réinitialise la base avec des données de démonstration.
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Chemin calculé ici : importer db.js ouvrirait la base avant sa suppression
const DATA_DIR = process.env.BABYLONE_DATA || join(dirname(fileURLToPath(import.meta.url)), "..", "data");
for (const f of ["babylone.db", "babylone.db-wal", "babylone.db-shm"]) rmSync(join(DATA_DIR, f), { force: true });

const { run, one, all, tx } = await import("./db.js");
const { hashPassword } = await import("./auth.js");
const { CITIES, COMMISSION_RATE, increment } = await import("./rules.js");
const { SELLERS, BUYERS, ITEMS, REQUESTS } = await import("./catalog.js");

const PASSWORD = "babylone2027";
const now = Date.now();
const H = 3600 * 1000;
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function user(phone, name, role, city, shop = null, extra = {}, password = PASSWORD) {
  const { salt, hash } = hashPassword(password || PASSWORD);
  const r = run(
    "INSERT INTO users (phone, name, role, password_hash, salt, city, shop_name, verified, plan_until, phone_verified, referral_code, created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)",
    phone,
    name,
    role,
    hash,
    salt,
    city,
    shop,
    extra.verified ? 1 : 0,
    extra.pro ? now + 20 * 24 * H : null,
    `${name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 5).toUpperCase()}${100 + Math.floor(rnd() * 900)}`,
    now - (role === "seller" ? 40 + Math.floor(rnd() * 200) : Math.floor(rnd() * 60)) * 24 * H,
  );
  return Number(r.lastInsertRowid);
}

tx(() => {
  user("770000000", "Admin Babylone", "admin", "Thiès", null, {}, process.env.ADMIN_PASSWORD);
  const sellerIds = SELLERS.map((s, i) => user(s.phone, s.name, "seller", s.city, s.shop, { verified: i !== 5, pro: i % 3 === 0 }));
  // Comptes de versement (sauf la boutique non vérifiée, pour montrer le rappel)
  sellerIds.forEach((id, i) => i !== 5 && run("UPDATE users SET payout_method = ?, payout_account = ? WHERE id = ?", i % 2 ? "orange_money" : "wave", SELLERS[i].phone, id));
  const buyerIds = BUYERS.map(([name, city], i) => user(`78100${String(i).padStart(4, "0")}`, name, "buyer", city));
  for (const id of buyerIds) run("UPDATE users SET deposit = 5000, points = ? WHERE id = ?", Math.floor(rnd() * 900), id);
  const demoBuyer = user("781234567", "Mouhamed Dial", "buyer", "Thiès");

  // Durées variées : certaines ventes se terminent dans quelques minutes
  const ends = [0.12, 0.3, 0.6, 1.5, 2, 3, 5, 8, 12, 20, 26, 30, 36, 44, 50, 60, 70, 4, 9, 16, 22, 40, 0.9];
  // Ventes multiples (1 pièce par gagnant) et achats immédiats de démonstration
  const SIZE = {
    "sneaker-noir": "42",
    "sneaker-bordeaux": "41",
    "running-rouge": "43",
    escarpins: "39",
    "sneaker-montante": "42",
    "derby-vert": "41",
    "sneaker-pastel": "38",
    "training-vert": "44",
    "veste-cuir": "M",
    bomber: "L",
    "tshirt-noir": "L",
  };
  const EXTRA = {
    "tshirt-noir": { mode: "multi", qty: 10, title: "T-shirts coton noir · 10 pièces, 10 gagnants", start: 2500, reserve: 0 },
    "casque-gris": { mode: "multi", qty: 6, title: "Casque filaire studio · 6 pièces, 6 gagnants", start: 2000, reserve: 0 },
    smartphone: { buy: 70000 },
    polaroid: { buy: 32000 },
    "veste-cuir": { buy: 15000 },
  };
  ITEMS.forEach(([img, title0, cat, cond, s, start0, reserve0, qty0, desc], i) => {
    const x = EXTRA[img] || {};
    const title = x.title || title0;
    const start = x.start ?? start0;
    const reserve = x.reserve ?? reserve0;
    const qty = x.qty ?? qty0;
    const seller = SELLERS[s];
    const endsAt = now + ends[i % ends.length] * H;
    const startsAt = endsAt - (24 + Math.floor(rnd() * 72)) * H;
    const r = run(
      `INSERT INTO auctions (seller_id, title, description, category, condition, city, region, images, quantity, start_price, reserve_price,
        current_price, starts_at, ends_at, boosted, views, created_at, mode, buy_now_price) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      sellerIds[s],
      title,
      desc,
      cat,
      cond,
      seller.city,
      CITIES[seller.city],
      JSON.stringify([`/products/${img}.jpg`]),
      qty,
      start,
      reserve,
      start,
      Math.min(startsAt, now - H),
      endsAt,
      i === 3 || i === 20 ? 1 : 0,
      20 + Math.floor(rnd() * 400),
      Math.min(startsAt, now - H),
      x.mode || "lot",
      x.buy || 0,
    );
    const aid = Number(r.lastInsertRowid);
    run("UPDATE auctions SET size = ?, inspected = ?, flash = ? WHERE id = ?", SIZE[img] || null, img === "laptop" || img === "smartphone" ? 1 : 0, img === "lunettes-rondes" ? 1 : 0, aid);
    if (x.mode === "multi") {
      // Chaque acheteur propose une fois ; le prix affiché est l'offre la plus basse parmi les gagnants
      const n = 4 + Math.floor(rnd() * 8);
      let t = now - 30 * H;
      for (let b = 0; b < n; b++) {
        t += Math.floor(rnd() * 3 * H);
        run("INSERT INTO bids (auction_id, user_id, amount, created_at) VALUES (?,?,?,?)", aid, buyerIds[b % buyerIds.length], start + increment(start) * Math.floor(rnd() * 6), Math.min(t, now - 60000));
      }
      const amounts = all("SELECT MAX(amount) m FROM bids WHERE auction_id = ? GROUP BY user_id ORDER BY m DESC", aid).map((r) => r.m);
      run("UPDATE auctions SET current_price = ?, bids_count = ? WHERE id = ?", amounts.length >= qty ? amounts[qty - 1] : start, n, aid);
      return;
    }
    const nBids = Math.floor(rnd() * 9);
    let price = start;
    let leader = null;
    let t = Math.min(startsAt, now - H);
    for (let b = 0; b < nBids; b++) {
      let bidder;
      do bidder = buyerIds[Math.floor(rnd() * buyerIds.length)];
      while (bidder === leader);
      price = b === 0 ? start : price + increment(price) * (1 + Math.floor(rnd() * 3));
      t += Math.floor(rnd() * ((now - t) / (nBids - b + 1)));
      run("INSERT INTO bids (auction_id, user_id, amount, created_at) VALUES (?,?,?,?)", aid, bidder, price, t);
      run("INSERT OR IGNORE INTO watches (user_id, auction_id) VALUES (?,?)", bidder, aid);
      leader = bidder;
    }
    if (nBids) run("UPDATE auctions SET current_price = ?, bids_count = ?, leader_id = ? WHERE id = ?", price, nBids, leader, aid);
    // Certains meneurs ont posé une enchère automatique
    if (nBids && rnd() < 0.35)
      run("INSERT INTO auto_bids (auction_id, user_id, max_amount, created_at) VALUES (?,?,?,?)", aid, leader, price + increment(price) * (2 + Math.floor(rnd() * 4)), now - 2 * H);
  });

  // Annonce d'un vendeur non vérifié, en attente de validation par l'admin
  run(
    `INSERT INTO auctions (seller_id, title, description, category, condition, city, region, images, quantity, start_price, reserve_price,
      current_price, starts_at, ends_at, created_at, moderation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')`,
    sellerIds[5],
    "Ventilateur sur pied 16 pouces",
    "Neuf, carton d'origine. 3 vitesses, oscillation.",
    "Électroménager",
    "neuf",
    "Ziguinchor",
    "Ziguinchor",
    JSON.stringify(["/products/casque-gris.jpg"]),
    1,
    12000,
    0,
    12000,
    now,
    now + 48 * H,
    now,
  );
  run(
    "INSERT INTO fraud_flags (auction_id, user_id, kind, detail, created_at) VALUES (?,?,?,?,?)",
    5,
    buyerIds[4],
    "same_ip",
    "Deux comptes enchérissent depuis la même IP sur cette vente (exemple de démo).",
    now - 3 * H,
  );

  // Compte acheteur de démo : en tête sur 2 ventes, dépassé sur une
  for (const [aid, lead] of [[9, true], [14, true], [2, false]]) {
    const a = one("SELECT * FROM auctions WHERE id = ?", aid);
    const amt = a.bids_count ? a.current_price + increment(a.current_price) : a.start_price;
    run("INSERT INTO bids (auction_id, user_id, amount, created_at) VALUES (?,?,?,?)", aid, demoBuyer, amt, now - 20 * 60 * 1000);
    run("INSERT OR IGNORE INTO watches (user_id, auction_id) VALUES (?,?)", demoBuyer, aid);
    let price = amt;
    let leader = demoBuyer;
    let n = a.bids_count + 1;
    if (!lead) {
      price = amt + increment(amt);
      leader = buyerIds[3];
      n++;
      run("INSERT INTO bids (auction_id, user_id, amount, created_at) VALUES (?,?,?,?)", aid, leader, price, now - 5 * 60 * 1000);
    }
    run("UPDATE auctions SET current_price = ?, bids_count = ?, leader_id = ? WHERE id = ?", price, n, leader, aid);
  }

  // Historique : quelques ventes passées avec commandes et avis
  const past = [
    ["sneaker-pastel", "Sneakers pastel, lot de 6", "Chaussures", 6, 21000, "released", 5, "Conforme aux photos, livraison rapide."],
    ["parfum", "Parfum homme 100 ml", "Beauté", 1, 14500, "released", 4, "Bon produit, emballage correct."],
    ["sac-dos", "Sac à dos noir", "Accessoires", 1, 9000, "shipped", null, null],
    ["smartwatch", "Montre connectée sport", "Électronique", 4, 19500, "paid", null, null],
    ["veste-cuir", "Veste en jean friperie", "Friperie", 3, 6500, "released", 5, "Très bonne qualité pour le prix."],
    ["lunettes-noires", "Lunettes de soleil polarisées", "Accessoires", 0, 4500, "awaiting_payment", null, null],
  ];
  past.forEach(([img, title, cat, s, price, status, rating, comment], i) => {
    const seller = SELLERS[s];
    const t = status === "awaiting_payment" ? now - 4 * H : now - (3 + i * 2) * 24 * H;
    const buyer = status === "awaiting_payment" ? demoBuyer : buyerIds[(i * 5) % buyerIds.length];
    const r = run(
      `INSERT INTO auctions (seller_id, title, description, category, condition, city, region, images, quantity, start_price, reserve_price,
        current_price, bids_count, leader_id, starts_at, ends_at, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      sellerIds[s],
      title,
      "",
      cat,
      "neuf",
      seller.city,
      CITIES[seller.city],
      JSON.stringify([`/products/${img}.jpg`]),
      1,
      Math.round(price / 2),
      0,
      price,
      6,
      buyer,
      t - 48 * H,
      t,
      "sold",
      t - 48 * H,
    );
    const o = run(
      `INSERT INTO orders (auction_id, buyer_id, seller_id, amount, commission, delivery_fee, status, pay_deadline, provider, payment_ref, address, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      r.lastInsertRowid,
      buyer,
      sellerIds[s],
      price,
      Math.round(price * COMMISSION_RATE),
      2000,
      status,
      status === "awaiting_payment" ? now + 20 * H : t + 24 * H,
      status === "awaiting_payment" ? null : "wave",
      status === "awaiting_payment" ? null : `demo-${i}`,
      status === "awaiting_payment" ? null : "Quartier Escale",
      t,
      t + 24 * H,
    );
    if (rating)
      run(
        "INSERT INTO reviews (order_id, seller_id, buyer_id, rating, comment, created_at) VALUES (?,?,?,?,?,?)",
        o.lastInsertRowid,
        sellerIds[s],
        buyer,
        rating,
        comment,
        t + 30 * H,
      );
  });

  REQUESTS.forEach(([title, cat, budget, details], i) => {
    const uid = buyerIds[i];
    const r = run(
      "INSERT INTO requests (user_id, title, category, budget_max, city, details, votes, created_at) VALUES (?,?,?,?,?,?,?,?)",
      uid,
      title,
      cat,
      budget,
      BUYERS[i][1],
      details,
      1,
      now - i * 5 * H,
    );
    const voters = buyerIds.filter(() => rnd() < 0.4);
    for (const v of new Set([uid, ...voters])) run("INSERT OR IGNORE INTO request_votes (user_id, request_id) VALUES (?,?)", v, r.lastInsertRowid);
    run("UPDATE requests SET votes = (SELECT COUNT(*) FROM request_votes WHERE request_id = ?) WHERE id = ?", r.lastInsertRowid, r.lastInsertRowid);
  });
});

// Arrivages en précommande et live de démonstration
tx(() => {
  const ndiaye = one("SELECT id FROM users WHERE phone = '771000001'").id;
  const gueye = one("SELECT id FROM users WHERE phone = '771000007'").id;
  const buyers = [1, 2, 3, 4, 5, 6].map((i) => one("SELECT id FROM users WHERE phone = ?", `78100${String(i).padStart(4, "0")}`).id);
  const D = 24 * H;
  const pre = [
    [ndiaye, "Conteneur Chine : baskets running, 300 paires", "Chaussures", "/products/sneaker-noir.jpg", "Thiès", 7500, 20, 300, 120, 3 * D, 12 * D, "Arrivage prévu au port de Dakar. Pointures 39 à 45. Prix public habituel : 15 000 F."],
    [gueye, "Ballots de friperie premier choix (Europe), 80 ballots", "Friperie", "/products/veste-cuir.jpg", "Mbour", 65000, 30, 80, 30, 5 * D, 20 * D, "Ballots de 45 kg, vestes et pulls. Idéal revendeurs."],
    [ndiaye, "Smartphones Android 64 Go, 150 pièces", "Électronique", "/products/smartphone.jpg", "Thiès", 42000, 15, 150, 60, 6 * D, 18 * D, "Neufs, sous blister, garantie importateur 6 mois."],
  ];
  pre.forEach(([seller, title, cat, img, city, unit, pct, total, min, deadline, eta, desc], i) => {
    const r = run(
      `INSERT INTO preorders (seller_id, title, description, category, images, city, unit_price, deposit_pct, total_units, min_units, eta, deadline, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      seller, title, desc, cat, JSON.stringify([img]), city, unit, pct, total, min, now + eta, now + deadline, now - D,
    );
    buyers.slice(0, 3 + i).forEach((b, k) => {
      const qty = [10, 4, 25, 2, 8, 6, 3][k % 7];
      run("INSERT INTO reservations (preorder_id, user_id, qty, deposit, status, created_at) VALUES (?,?,?,?, 'reserved', ?)", r.lastInsertRowid, b, qty, Math.ceil((unit * qty * pct) / 100), now - k * H);
    });
  });
  // Live de Gueye Sneakers avec ses ventes de chaussures
  const lots = all("SELECT id FROM auctions WHERE seller_id = ? AND status = 'live' AND moderation = 'approved' ORDER BY ends_at DESC", gueye).map((a) => a.id);
  if (lots.length) {
    const lv = run(
      "INSERT INTO lives (seller_id, title, stream_url, starts_at, status, current_auction, created_at) VALUES (?,?,?,?, 'live', ?, ?)",
      gueye, "Vendredi sneakers : arrivage frais, départs à petit prix", null, now - 10 * 60 * 1000, lots[0], now,
    );
    for (const id of lots) run("UPDATE auctions SET live_id = ? WHERE id = ?", lv.lastInsertRowid, id);
  }
  run("INSERT INTO lives (seller_id, title, stream_url, starts_at, status, created_at) VALUES (?,?,?,?, 'scheduled', ?)", ndiaye, "Déballage du conteneur : électronique et accessoires", null, now + 2 * D, now);
  run(
    "INSERT INTO follows (user_id, seller_id, created_at) VALUES (?,?,?)",
    one("SELECT id FROM users WHERE phone = '781234567'").id, gueye, now,
  );
});

console.log("Base de démo prête.", one("SELECT COUNT(*) n FROM auctions WHERE status='live'").n, "ventes en direct.");
console.log(`Comptes (mot de passe ${PASSWORD}) : vendeur 771000001 · acheteur 781234567 · admin 770000000${process.env.ADMIN_PASSWORD ? " (mot de passe ADMIN_PASSWORD)" : ""}`);
