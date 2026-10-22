// Moteur d'enchères : offres, enchère automatique, ventes multiples, achat immédiat,
// anti-snipe, clôture, délais et rappels de paiement, libération des fonds, signaux de fraude.
import { all, one, run, tx } from "./db.js";
import { sendWhatsApp } from "./messaging.js";
import { ANTI_SNIPE_MS, AUTO_RELEASE_MS, COMMISSION_RATE, MAX_STRIKES, PAY_DELAY_MS, deliveryFee, increment } from "./rules.js";

let io = null;
export const setIO = (s) => (io = s);

export const fcfa = (n) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} FCFA`;
export const maskName = (name) => {
  const [first, last] = name.split(" ");
  return last ? `${first} ${last[0]}.` : first;
};

// Notifications doublées sur WhatsApp pour les événements qui demandent une action
const WA_TYPES = new Set(["won", "outbid", "auto_outbid", "pay_reminder", "shipped", "match", "expired", "to_ship", "payout", "dispute"]);

export function notify(userId, type, title, body = "", link = null) {
  const now = Date.now();
  const r = run(
    "INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?,?,?,?,?,?)",
    userId,
    type,
    title,
    body,
    link,
    now,
  );
  io?.to(`user:${userId}`).emit("notify", { id: Number(r.lastInsertRowid), type, title, body, link, read: 0, created_at: now });
  if (WA_TYPES.has(type)) {
    const u = one("SELECT id, phone, whatsapp FROM users WHERE id = ?", userId);
    sendWhatsApp(u, title, body, link).catch(() => {});
  }
}

// Classement : meilleure offre de chaque enchérisseur, à égalité le plus ancien d'abord
export function ranking(auctionId) {
  return all(
    `SELECT user_id, amount, created_at FROM (
       SELECT user_id, amount, created_at, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC, created_at ASC) rn
       FROM bids WHERE auction_id = ?)
     WHERE rn = 1 ORDER BY amount DESC, created_at ASC`,
    auctionId,
  );
}

export function nextMin(a, rank = null) {
  if (a.mode === "multi") {
    rank ??= ranking(a.id);
    if (rank.length < a.quantity) return a.start_price;
    const floor = rank[a.quantity - 1].amount;
    return floor + increment(floor);
  }
  return a.bids_count === 0 ? a.start_price : a.current_price + increment(a.current_price);
}

export function auctionView(a, viewerId = null) {
  const seller = one("SELECT id, name, shop_name, city, verified, plan_until FROM users WHERE id = ?", a.seller_id);
  const rating = one("SELECT ROUND(AVG(rating),1) avg, COUNT(*) n FROM reviews WHERE seller_id = ?", a.seller_id);
  const leader = a.leader_id ? one("SELECT name FROM users WHERE id = ?", a.leader_id) : null;
  const watchers = one("SELECT COUNT(*) n FROM watches WHERE auction_id = ?", a.id).n;
  const rank = a.mode === "multi" ? ranking(a.id) : null;
  const myRank = rank && viewerId ? rank.findIndex((r) => r.user_id === viewerId) + 1 : 0;
  const auto = viewerId ? one("SELECT max_amount FROM auto_bids WHERE auction_id = ? AND user_id = ?", a.id, viewerId) : null;
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    category: a.category,
    condition: a.condition,
    city: a.city,
    region: a.region,
    images: JSON.parse(a.images),
    mode: a.mode,
    quantity: a.quantity,
    start_price: a.start_price,
    current_price: a.current_price,
    buy_now_price: a.status === "live" && a.mode === "lot" && a.buy_now_price > a.current_price ? a.buy_now_price : 0,
    has_reserve: a.reserve_price > 0,
    reserve_met: a.reserve_price === 0 || a.current_price >= a.reserve_price,
    reserve_price: viewerId === a.seller_id ? a.reserve_price : undefined,
    bids_count: a.bids_count,
    next_min: nextMin(a, rank),
    leader: leader ? maskName(leader.name) : null,
    is_leader: a.mode === "multi" ? myRank > 0 && myRank <= a.quantity : viewerId != null && viewerId === a.leader_id,
    my_rank: myRank || null,
    my_auto_max: auto?.max_amount || null,
    winners: rank ? Math.min(rank.length, a.quantity) : undefined,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    status: a.status,
    moderation: a.moderation,
    boosted: !!a.boosted,
    views: a.views,
    watchers,
    watching: viewerId ? !!one("SELECT 1 FROM watches WHERE user_id = ? AND auction_id = ?", viewerId, a.id) : false,
    seller: seller && {
      id: seller.id,
      name: seller.shop_name || seller.name,
      city: seller.city,
      verified: !!seller.verified,
      pro: !!(seller.plan_until && seller.plan_until > Date.now()),
      rating: rating.avg,
      reviews: rating.n,
    },
  };
}

export class BidError extends Error {}

function insertBid(auctionId, userId, amount, now, auto = 0, ip = null) {
  run("INSERT INTO bids (auction_id, user_id, amount, created_at, auto, ip) VALUES (?,?,?,?,?,?)", auctionId, userId, amount, now, auto, ip);
  return { user_id: userId, amount, auto: !!auto, created_at: now };
}

// Enchères automatiques : chaque robot surenchérit d'un palier jusqu'à son plafond, à la manière d'eBay
function resolveProxies(auctionId, now) {
  const added = [];
  for (let guard = 0; guard < 200; guard++) {
    const a = one("SELECT * FROM auctions WHERE id = ?", auctionId);
    const leaderAuto = a.leader_id ? one("SELECT max_amount FROM auto_bids WHERE auction_id = ? AND user_id = ?", a.id, a.leader_id) : null;
    const leaderMax = Math.max(leaderAuto?.max_amount || 0, a.current_price);
    const c = one(
      `SELECT user_id, max_amount FROM auto_bids WHERE auction_id = ? AND user_id != ? AND max_amount >= ?
       ORDER BY max_amount DESC, created_at ASC LIMIT 1`,
      a.id,
      a.leader_id ?? -1,
      nextMin(a),
    );
    if (!c) break;
    if (c.max_amount > leaderMax) {
      if (leaderMax > a.current_price) added.push(insertBid(a.id, a.leader_id, leaderMax, now, 1));
      const price = Math.min(c.max_amount, leaderMax + increment(leaderMax));
      added.push(insertBid(a.id, c.user_id, price, now, 1));
      run("UPDATE auctions SET current_price = ?, leader_id = ?, bids_count = ? WHERE id = ?", price, c.user_id, a.bids_count + added.length, a.id);
    } else {
      added.push(insertBid(a.id, c.user_id, c.max_amount, now, 1));
      const price = c.max_amount === leaderMax ? leaderMax : Math.min(leaderMax, c.max_amount + increment(c.max_amount));
      added.push(insertBid(a.id, a.leader_id, price, now, 1));
      run("UPDATE auctions SET current_price = ?, bids_count = ? WHERE id = ?", price, a.bids_count + added.length, a.id);
    }
  }
  return added;
}

function flagFraud(a, user, ip, now) {
  if (!ip) return;
  const seller = one("SELECT last_ip FROM users WHERE id = ?", a.seller_id);
  if (seller?.last_ip && seller.last_ip === ip)
    run(
      "INSERT INTO fraud_flags (auction_id, user_id, kind, detail, created_at) VALUES (?,?,?,?,?)",
      a.id,
      user.id,
      "shill_ip",
      "L'enchérisseur utilise la même adresse IP que le vendeur.",
      now,
    );
  const twin = one("SELECT DISTINCT user_id FROM bids WHERE auction_id = ? AND ip = ? AND user_id != ? LIMIT 1", a.id, ip, user.id);
  if (twin)
    run(
      "INSERT INTO fraud_flags (auction_id, user_id, kind, detail, created_at) VALUES (?,?,?,?,?)",
      a.id,
      user.id,
      "same_ip",
      `Deux comptes enchérissent depuis la même IP (utilisateurs ${twin.user_id} et ${user.id}).`,
      now,
    );
}

export function placeBid(user, auctionId, amount, maxAuto = 0, ip = null) {
  amount = Math.floor(Number(amount) || 0);
  maxAuto = Math.floor(Number(maxAuto) || 0);
  const now = Date.now();
  const res = tx(() => {
    const a = one("SELECT * FROM auctions WHERE id = ?", auctionId);
    if (!a || a.moderation !== "approved") throw new BidError("Vente introuvable.");
    if (a.status !== "live" || a.ends_at <= now) throw new BidError("Cette vente est terminée.");
    if (a.starts_at > now) throw new BidError("Cette vente n'a pas encore commencé.");
    if (a.seller_id === user.id) throw new BidError("Tu ne peux pas enchérir sur ta propre vente.");
    if (user.blocked) throw new BidError("Compte suspendu. Contacte le support.");
    if (user.strikes >= MAX_STRIKES) throw new BidError("Compte suspendu : plusieurs ventes gagnées non payées.");

    // ---- Vente multiple : les N meilleures offres gagnent une pièce chacune ----
    if (a.mode === "multi") {
      if (maxAuto) throw new BidError("L'enchère automatique n'est pas disponible sur les ventes multiples.");
      const before = ranking(a.id);
      const myIdx = before.findIndex((r) => r.user_id === user.id);
      if (myIdx >= 0 && myIdx < a.quantity && before.length >= a.quantity) throw new BidError("Tu fais déjà partie des gagnants.");
      const min = Math.max(nextMin(a, before), myIdx >= 0 ? before[myIdx].amount + increment(before[myIdx].amount) : 0);
      if (amount < min) throw new BidError(`Offre minimum : ${fcfa(min)}.`);
      if (amount > Math.max(min * 5, min + 500_000)) throw new BidError("Montant trop élevé d'un coup. Vérifie ton offre.");
      const added = [insertBid(a.id, user.id, amount, now, 0, ip)];
      const after = ranking(a.id);
      const floor = after.length >= a.quantity ? after[a.quantity - 1].amount : a.start_price;
      const winnersBefore = new Set(before.slice(0, a.quantity).map((r) => r.user_id));
      const winnersAfter = new Set(after.slice(0, a.quantity).map((r) => r.user_id));
      const pushed = [...winnersBefore].filter((u) => !winnersAfter.has(u));
      const extended = a.ends_at - now < ANTI_SNIPE_MS;
      const endsAt = extended ? now + ANTI_SNIPE_MS : a.ends_at;
      run("UPDATE auctions SET current_price = ?, bids_count = bids_count + 1, ends_at = ? WHERE id = ?", floor, endsAt, a.id);
      run("INSERT OR IGNORE INTO watches (user_id, auction_id) VALUES (?,?)", user.id, a.id);
      flagFraud(a, user, ip, now);
      return { a, added, endsAt, extended, losers: pushed, leaderBefore: null, firstBid: a.bids_count === 0 };
    }

    // ---- Lot unique ----
    if (a.leader_id === user.id) {
      if (maxAuto > a.current_price) {
        run(
          "INSERT INTO auto_bids (auction_id, user_id, max_amount, created_at) VALUES (?,?,?,?) ON CONFLICT(auction_id, user_id) DO UPDATE SET max_amount = excluded.max_amount",
          a.id,
          user.id,
          maxAuto,
          now,
        );
        return { a, raisedOnly: true };
      }
      throw new BidError("Tu es déjà en tête.");
    }
    const min = nextMin(a);
    if (!amount) amount = min;
    if (amount < min) throw new BidError(`Offre minimum : ${fcfa(min)}.`);
    const cap = Math.max(min * 5, min + 500_000);
    if (amount > cap || maxAuto > cap * 4) throw new BidError("Montant trop élevé d'un coup. Vérifie ton offre.");
    if (maxAuto && maxAuto < amount) throw new BidError("Le plafond automatique doit être au moins égal à ton offre.");

    const added = [insertBid(a.id, user.id, amount, now, 0, ip)];
    run("UPDATE auctions SET current_price = ?, bids_count = bids_count + 1, leader_id = ? WHERE id = ?", amount, user.id, a.id);
    if (maxAuto)
      run(
        "INSERT INTO auto_bids (auction_id, user_id, max_amount, created_at) VALUES (?,?,?,?) ON CONFLICT(auction_id, user_id) DO UPDATE SET max_amount = excluded.max_amount",
        a.id,
        user.id,
        maxAuto,
        now,
      );
    added.push(...resolveProxies(a.id, now));
    const extended = a.ends_at - now < ANTI_SNIPE_MS;
    const endsAt = extended ? now + ANTI_SNIPE_MS : a.ends_at;
    run("UPDATE auctions SET ends_at = ? WHERE id = ?", endsAt, a.id);
    run("INSERT OR IGNORE INTO watches (user_id, auction_id) VALUES (?,?)", user.id, a.id);
    flagFraud(a, user, ip, now);
    const fresh = one("SELECT leader_id FROM auctions WHERE id = ?", a.id);
    // Tous ceux qui ont été en tête pendant cet échange et ne le sont plus
    const losers = [...new Set([a.leader_id, ...added.map((b) => b.user_id)])].filter((u) => u && u !== fresh.leader_id);
    return { a, added, endsAt, extended, losers, leaderBefore: a.leader_id, firstBid: a.bids_count === 0 };
  });

  if (res.raisedOnly) return { raised: true, my_auto_max: maxAuto };

  const fresh = one("SELECT * FROM auctions WHERE id = ?", auctionId);
  const names = new Map(all(`SELECT id, name FROM users WHERE id IN (${res.added.map(() => "?").join(",")})`, ...res.added.map((b) => b.user_id)).map((u) => [u.id, u.name]));
  const top = res.added[res.added.length - 1];
  const leaderId = fresh.mode === "multi" ? user.id : fresh.leader_id;
  const leaderName = one("SELECT name FROM users WHERE id = ?", leaderId)?.name || user.name;
  const event = {
    auction_id: fresh.id,
    mode: fresh.mode,
    amount: fresh.mode === "multi" ? top.amount : fresh.current_price,
    price: fresh.current_price,
    bidder: maskName(leaderName),
    bidder_id: leaderId,
    added: res.added.map((b) => ({ amount: b.amount, created_at: b.created_at, bidder: maskName(names.get(b.user_id) || ""), bidder_id: b.user_id, auto: b.auto })),
    bids_count: fresh.bids_count,
    next_min: nextMin(fresh),
    ends_at: res.endsAt,
    extended: res.extended,
    reserve_met: fresh.reserve_price === 0 || fresh.current_price >= fresh.reserve_price,
    created_at: now,
    title: fresh.title,
    region: fresh.region,
    city: fresh.city,
    image: JSON.parse(fresh.images)[0],
  };
  io?.to(`auction:${fresh.id}`).emit("bid", event);
  io?.emit("feed", event);

  for (const uid of res.losers) {
    const hadAuto = one("SELECT max_amount FROM auto_bids WHERE auction_id = ? AND user_id = ?", fresh.id, uid);
    if (uid === user.id) continue; // l'auteur voit directement la réponse
    if (hadAuto && hadAuto.max_amount < event.next_min)
      notify(uid, "auto_outbid", "Ton enchère automatique est dépassée", `${fresh.title} : ton plafond de ${fcfa(hadAuto.max_amount)} est battu. Relance avant la fin.`, `/enchere/${fresh.id}`);
    else
      notify(
        uid,
        "outbid",
        fresh.mode === "multi" ? "Tu sors des gagnants" : "Tu as été dépassé",
        `${fresh.title} : nouvelle offre à ${fcfa(event.amount)}. Relance avant la fin.`,
        `/enchere/${fresh.id}`,
      );
  }
  if (res.firstBid) notify(fresh.seller_id, "first_bid", "Première offre reçue", `${fresh.title} : ${fcfa(res.added[0].amount)}.`, "/vendeur");
  return { ...event, you_lead: fresh.mode === "multi" ? !res.losers.includes(user.id) : fresh.leader_id === user.id };
}

export function buyNow(user, auctionId, ip = null) {
  const now = Date.now();
  const r = tx(() => {
    const a = one("SELECT * FROM auctions WHERE id = ?", auctionId);
    if (!a || a.status !== "live" || a.ends_at <= now || a.moderation !== "approved") throw new BidError("Cette vente n'est plus disponible.");
    if (a.mode !== "lot" || !a.buy_now_price || a.current_price >= a.buy_now_price) throw new BidError("Achat immédiat indisponible sur cette vente.");
    if (a.seller_id === user.id) throw new BidError("Tu ne peux pas acheter ta propre vente.");
    if (user.blocked || user.strikes >= MAX_STRIKES) throw new BidError("Compte suspendu.");
    insertBid(a.id, user.id, a.buy_now_price, now, 0, ip);
    run(
      "UPDATE auctions SET current_price = ?, leader_id = ?, bids_count = bids_count + 1, status = 'sold', ends_at = ? WHERE id = ?",
      a.buy_now_price,
      user.id,
      now,
      a.id,
    );
    const orderId = openOrder(a, user.id, a.buy_now_price);
    return { a, orderId };
  });
  const { a, orderId } = r;
  notify(a.seller_id, "sold", "Achat immédiat", `${a.title} : vendu ${fcfa(a.buy_now_price)}. En attente du paiement.`, "/vendeur");
  for (const w of all("SELECT DISTINCT user_id FROM bids WHERE auction_id = ? AND user_id != ?", a.id, user.id))
    notify(w.user_id, "lost", "Vente terminée", `${a.title} a été acheté immédiatement.`, `/enchere/${a.id}`);
  io?.to(`auction:${a.id}`).emit("ended", { auction_id: a.id, status: "sold", price: a.buy_now_price });
  io?.emit("feed:ended", { auction_id: a.id });
  return orderId;
}

function openOrder(a, buyerId, amount) {
  const buyer = one("SELECT city FROM users WHERE id = ?", buyerId);
  const seller = one("SELECT created_at FROM users WHERE id = ?", a.seller_id);
  const now = Date.now();
  // Offre de bienvenue : 0 % de commission pendant le premier mois du vendeur
  const rate = now - seller.created_at < 30 * 24 * 3600 * 1000 ? 0 : COMMISSION_RATE;
  const r = run(
    `INSERT INTO orders (auction_id, buyer_id, seller_id, amount, commission, delivery_fee, status, pay_deadline, created_at, updated_at)
     VALUES (?,?,?,?,?,?, 'awaiting_payment', ?, ?, ?)`,
    a.id,
    buyerId,
    a.seller_id,
    amount,
    Math.round(amount * rate),
    deliveryFee(a.city, buyer?.city || a.city),
    now + PAY_DELAY_MS,
    now,
    now,
  );
  notify(
    buyerId,
    "won",
    "Bravo, tu as gagné !",
    `${a.title} pour ${fcfa(amount)}. Paie sous 24 h pour confirmer.`,
    `/compte/commandes/${r.lastInsertRowid}`,
  );
  return Number(r.lastInsertRowid);
}

export function closeExpired() {
  const now = Date.now();
  const due = all("SELECT * FROM auctions WHERE status = 'live' AND ends_at <= ?", now);
  for (const a of due) {
    const winners =
      a.mode === "multi"
        ? ranking(a.id)
            .slice(0, a.quantity)
            .filter((r) => r.amount >= a.reserve_price)
        : a.bids_count > 0 && a.current_price >= a.reserve_price
          ? [{ user_id: a.leader_id, amount: a.current_price }]
          : [];
    const sold = winners.length > 0;
    tx(() => {
      run("UPDATE auctions SET status = ? WHERE id = ?", sold ? "sold" : "unsold", a.id);
      for (const w of winners) openOrder(a, w.user_id, w.amount);
    });
    if (sold) {
      const total = winners.reduce((s, w) => s + w.amount, 0);
      notify(
        a.seller_id,
        "sold",
        "Vente conclue",
        a.mode === "multi" ? `${a.title} : ${winners.length} pièce(s) vendue(s), ${fcfa(total)} au total.` : `${a.title} : ${fcfa(total)}. En attente du paiement.`,
        "/vendeur",
      );
      const ids = winners.map((w) => w.user_id);
      for (const w of all(`SELECT DISTINCT user_id FROM bids WHERE auction_id = ? AND user_id NOT IN (${ids.map(() => "?").join(",")})`, a.id, ...ids)) {
        notify(w.user_id, "lost", "Vente terminée", `${a.title} est parti à ${fcfa(a.current_price)}.`, `/enchere/${a.id}`);
      }
    } else {
      notify(
        a.seller_id,
        "unsold",
        "Vente terminée sans acheteur",
        a.bids_count ? `${a.title} : prix de réserve non atteint (${fcfa(a.current_price)}).` : `${a.title} : aucune offre.`,
        "/vendeur",
      );
    }
    io?.to(`auction:${a.id}`).emit("ended", { auction_id: a.id, status: sold ? "sold" : "unsold", price: a.current_price });
    io?.emit("feed:ended", { auction_id: a.id });
  }
}

// Gagnant qui ne paie pas : on passe au meilleur offrant suivant
export function expirePayments() {
  const now = Date.now();
  for (const o of all("SELECT * FROM orders WHERE status = 'awaiting_payment' AND pay_deadline <= ?", now)) {
    const a = one("SELECT * FROM auctions WHERE id = ?", o.auction_id);
    tx(() => {
      run("UPDATE orders SET status = 'expired', updated_at = ? WHERE id = ?", now, o.id);
      run("UPDATE users SET strikes = strikes + 1 WHERE id = ?", o.buyer_id);
    });
    notify(o.buyer_id, "expired", "Délai de paiement dépassé", `${a.title} est proposé à l'offrant suivant.`, `/enchere/${a.id}`);
    const tried = all("SELECT buyer_id FROM orders WHERE auction_id = ?", a.id).map((r) => r.buyer_id);
    const next = ranking(a.id).find((r) => !tried.includes(r.user_id));
    if (next && next.amount >= a.reserve_price) {
      tx(() => {
        if (a.mode !== "multi") run("UPDATE auctions SET current_price = ?, leader_id = ? WHERE id = ?", next.amount, next.user_id, a.id);
        openOrder(a, next.user_id, next.amount);
      });
      notify(a.seller_id, "second_chance", "Nouvel acheteur", `${a.title} : proposé à l'offrant suivant à ${fcfa(next.amount)}.`, "/vendeur");
    } else {
      const active = one("SELECT COUNT(*) n FROM orders WHERE auction_id = ? AND status NOT IN ('expired','refunded')", a.id).n;
      if (!active) run("UPDATE auctions SET status = 'unsold' WHERE id = ?", a.id);
      notify(a.seller_id, "unsold", "Acheteur défaillant", `${a.title} : un gagnant n'a pas payé et aucun offrant ne prend le relais.`, "/vendeur");
    }
  }
}

// Rappel 4 h avant la fin du délai de paiement
export function remindPayments() {
  const now = Date.now();
  for (const o of all("SELECT * FROM orders WHERE status = 'awaiting_payment' AND reminded = 0 AND pay_deadline - ? < ?", now, 4 * 3600 * 1000)) {
    run("UPDATE orders SET reminded = 1 WHERE id = ?", o.id);
    const a = one("SELECT title FROM auctions WHERE id = ?", o.auction_id);
    const h = Math.max(1, Math.round((o.pay_deadline - now) / 3600000));
    notify(o.buyer_id, "pay_reminder", "Pense à payer", `${a.title} : il te reste environ ${h} h, sinon la vente passe à l'offrant suivant.`, `/compte/commandes/${o.id}`);
  }
}

export function releaseFunds(orderId) {
  const o = one("SELECT * FROM orders WHERE id = ?", orderId);
  if (!o || o.status !== "delivered") return false;
  run("UPDATE orders SET status = 'released', updated_at = ? WHERE id = ?", Date.now(), o.id);
  const a = one("SELECT title FROM auctions WHERE id = ?", o.auction_id);
  notify(o.seller_id, "payout", "Paiement libéré", `${a.title} : ${fcfa(o.amount - o.commission)} versés sur ton compte.`, "/vendeur");
  return true;
}

export function autoRelease() {
  const limit = Date.now() - AUTO_RELEASE_MS;
  for (const o of all("SELECT id FROM orders WHERE status = 'delivered' AND updated_at <= ?", limit)) releaseFunds(o.id);
}

export function tick() {
  try {
    closeExpired();
    expirePayments();
    remindPayments();
    autoRelease();
  } catch (e) {
    console.error("[tick]", e);
  }
}
