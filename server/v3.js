// v3 : recherche intelligente, boutiques, alertes, profil, litiges avec preuves, points relais, codes de livraison,
// caution, fidélité, push, statistiques, audit, versements, sauvegardes, ventes en live, bot WhatsApp,
// précommandes d'arrivage, SEO.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, all, db, one, run, tx } from "./db.js";
import { checkPassword, hashPassword, publicUser } from "./auth.js";
import { BidError, auctionView, fcfa, maskName, nextMin, notify, onTick, placeBid, ranking, releaseFunds } from "./engine.js";
import { createPaymentCheckout } from "./payments.js";
import { queuePayout, processPayout } from "./payouts.js";
import { VAPID_PUBLIC, removeSubscription, saveSubscription } from "./push.js";
import { sendWhatsAppText } from "./messaging.js";
import { categoryOfWord, normalize, parseQuery, searchText, suggestCategory } from "./text.js";
import {
  CATEGORIES,
  CITIES,
  COMMISSION_RATE,
  CONDITIONS,
  DEPOSIT_AMOUNT,
  DEPOSIT_THRESHOLD,
  LEVELS,
  POINTS_PER_FCFA,
  REFERRAL_POINTS,
  SIZES,
} from "./rules.js";

const PUBLIC_URL = () => process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:4000";
const PHONE_RE = /^7[05678]\d{7}$/;
const H = 3600_000;

// Remplit l'index de recherche des ventes créées avant la v3
for (const a of all("SELECT * FROM auctions WHERE search_text IS NULL")) run("UPDATE auctions SET search_text = ? WHERE id = ?", searchText(a), a.id);

// Points relais de démonstration (adresses à remplacer par les vrais partenaires)
if (!one("SELECT 1 FROM relay_points LIMIT 1")) {
  const R = [
    ["Point relais Marché Central", "Thiès", "Marché Central, près de la grande porte [à confirmer]", "Lun-Sam 9h-19h"],
    ["Point relais Escale", "Thiès", "Quartier Escale, avenue Léopold Sédar Senghor [à confirmer]", "Lun-Sam 9h-20h"],
    ["Point relais Plateau", "Dakar", "Plateau, rue Mohamed V [à confirmer]", "Lun-Sam 9h-19h"],
    ["Point relais Parcelles", "Dakar", "Parcelles Assainies, Unité 15 [à confirmer]", "Lun-Dim 10h-21h"],
    ["Point relais Liberté 6", "Dakar", "Liberté 6, rond-point [à confirmer]", "Lun-Sam 9h-20h"],
    ["Point relais Mbour Centre", "Mbour", "Centre-ville, près du marché [à confirmer]", "Lun-Sam 9h-19h"],
    ["Point relais Touba Ocass", "Touba", "Marché Ocass [à confirmer]", "Sam-Jeu 8h-19h"],
    ["Point relais Saint-Louis Sor", "Saint-Louis", "Sor, avenue Général de Gaulle [à confirmer]", "Lun-Sam 9h-19h"],
    ["Point relais Kaolack", "Kaolack", "Marché central [à confirmer]", "Lun-Sam 9h-19h"],
    ["Point relais Ziguinchor", "Ziguinchor", "Boucotte, rue principale [à confirmer]", "Lun-Sam 9h-19h"],
  ];
  for (const r of R) run("INSERT INTO relay_points (name, city, address, hours) VALUES (?,?,?,?)", ...r);
}

export function trackEvent(kind, { path = null, userId = null, session = null } = {}) {
  run("INSERT INTO events (kind, path, user_id, session, created_at) VALUES (?,?,?,?,?)", kind, path, userId, session, Date.now());
}

export const levelOf = (points) => {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (points >= l[0]) cur = l;
  const next = LEVELS.find((l) => l[0] > points) || null;
  return { level: cur[1], next: next ? { name: next[1], at: next[0] } : null };
};

// Appelé quand une commande est payée : code de livraison, points de fidélité, récompense de parrainage
export function onPaid(o) {
  const code = String(randomInt(1000, 10000));
  run("UPDATE orders SET delivery_code = ? WHERE id = ?", code, o.id);
  const pts = Math.floor((o.amount + o.delivery_fee) * POINTS_PER_FCFA);
  run("UPDATE users SET points = points + ? WHERE id = ?", pts, o.buyer_id);
  const buyer = one("SELECT referred_by FROM users WHERE id = ?", o.buyer_id);
  const firstPaid = one("SELECT COUNT(*) n FROM orders WHERE buyer_id = ? AND status NOT IN ('awaiting_payment','expired')", o.buyer_id).n === 1;
  if (buyer?.referred_by && firstPaid) {
    run("UPDATE users SET points = points + ? WHERE id = ?", REFERRAL_POINTS, buyer.referred_by);
    notify(buyer.referred_by, "referral", "Parrainage récompensé", `Ton filleul a fait son premier achat : +${REFERRAL_POINTS} points.`, "/compte/parrainage");
  }
  trackEvent("pay", { userId: o.buyer_id });
}

export function buyerReliability(buyerId) {
  const r = one(
    `SELECT SUM(status IN ('paid','shipped','delivered','released','disputed','refunded')) paid, SUM(status = 'expired') unpaid FROM orders WHERE buyer_id = ?`,
    buyerId,
  );
  const paid = r.paid || 0;
  const unpaid = r.unpaid || 0;
  const rating = one("SELECT ROUND(AVG(rating),1) avg, COUNT(*) n FROM buyer_reviews WHERE buyer_id = ?", buyerId);
  return { paid, unpaid, score: paid + unpaid ? Math.round((100 * paid) / (paid + unpaid)) : null, rating: rating.avg, reviews: rating.n };
}

// Nouvelle vente publiée : abonnés de la boutique et recherches sauvegardées
export function notifyMatches(a) {
  const done = new Set([a.seller_id]);
  const shop = one("SELECT shop_name, name FROM users WHERE id = ?", a.seller_id);
  for (const f of all("SELECT user_id FROM follows WHERE seller_id = ?", a.seller_id)) {
    if (done.has(f.user_id)) continue;
    done.add(f.user_id);
    notify(f.user_id, "follow_new", `Nouveau chez ${shop.shop_name || shop.name}`, `${a.title} · départ ${fcfa(a.start_price)}`, `/enchere/${a.id}`);
  }
  const text = a.search_text || searchText(a);
  for (const s of all("SELECT * FROM saved_searches")) {
    if (done.has(s.user_id)) continue;
    if (s.category && s.category !== a.category) continue;
    if (s.size && (a.size || "").toUpperCase() !== s.size.toUpperCase()) continue;
    if (s.city && s.city !== a.city) continue;
    if (s.max_price && a.start_price > s.max_price) continue;
    const terms = normalize(s.q).split(" ").filter((w) => w.length > 1);
    if (!terms.every((t) => text.includes(t))) continue;
    done.add(s.user_id);
    notify(s.user_id, "search_match", "Nouvel arrivage pour ta recherche", `${a.title} · départ ${fcfa(a.start_price)}`, `/enchere/${a.id}`);
  }
}

// Fraude : même appareil que le vendeur ou qu'un autre enchérisseur
export function deviceFlags(user, auctionId) {
  const a = one("SELECT seller_id FROM auctions WHERE id = ?", auctionId);
  if (!a) return;
  const mine = all("SELECT device FROM devices WHERE user_id = ?", user.id).map((d) => d.device);
  if (!mine.length) return;
  const qs = mine.map(() => "?").join(",");
  const flag = (kind, detail) => {
    if (!one("SELECT 1 FROM fraud_flags WHERE auction_id = ? AND user_id = ? AND kind = ?", auctionId, user.id, kind))
      run("INSERT INTO fraud_flags (auction_id, user_id, kind, detail, created_at) VALUES (?,?,?,?,?)", auctionId, user.id, kind, detail, Date.now());
  };
  if (one(`SELECT 1 FROM devices WHERE user_id = ? AND device IN (${qs})`, a.seller_id, ...mine))
    flag("same_device_seller", "L'enchérisseur utilise le même téléphone que le vendeur.");
  const twin = one(
    `SELECT d.user_id FROM devices d JOIN bids b ON b.user_id = d.user_id AND b.auction_id = ? WHERE d.user_id != ? AND d.device IN (${qs}) LIMIT 1`,
    auctionId,
    user.id,
    ...mine,
  );
  if (twin) flag("same_device", `Deux comptes enchérissent depuis le même téléphone (utilisateurs ${twin.user_id} et ${user.id}).`);
}

function csv(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => (v == null ? "" : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\n");
}

// Bot WhatsApp : enchérir sans ouvrir le site
const pending = new Map(); // téléphone -> { auctionId, amount, at }
const lastList = new Map();
const shortLeft = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 1440 ? `${Math.floor(m / 1440)} j` : m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
};

export function handleBot(phoneRaw, textRaw) {
  const phone = String(phoneRaw).replace(/\D/g, "").replace(/^221/, "");
  const text = normalize(textRaw).toUpperCase();
  const user = one("SELECT * FROM users WHERE phone = ? AND deleted = 0", phone);
  const site = PUBLIC_URL();
  const menu =
    "Babylone 🔨\n" +
    "• VENTES : ventes qui se terminent bientôt\n" +
    "• 23 : détails de la vente n° 23\n" +
    "• E 23 15000 : enchérir 15 000 F sur la vente 23\n" +
    "• OUI : confirmer / relancer au prix minimum\n" +
    "• MES ENCHERES : où tu en es\n" +
    "• STOP / START : couper ou réactiver les alertes";
  const needAccount = `Crée d'abord ton compte (1 minute) : ${site}/inscription`;
  const bid = (id, amount) => {
    if (!user) return needAccount;
    try {
      const r = placeBid(user, id, amount);
      if (r.raised) return "Plafond mis à jour.";
      const a = one("SELECT title, ends_at FROM auctions WHERE id = ?", id);
      return r.you_lead
        ? `✅ Offre placée : ${fcfa(r.mode === "multi" ? amount : r.price)} sur « ${a.title} ». Fin dans ${shortLeft(a.ends_at - Date.now())}. On te prévient si quelqu'un te dépasse.`
        : `Une enchère automatique était plus haute. Prix actuel : ${fcfa(r.price)}. Réponds OUI pour relancer.`;
    } catch (e) {
      return e instanceof BidError ? `❌ ${e.message}` : "Erreur, réessaie dans un instant.";
    }
  };

  if (!text || ["AIDE", "MENU", "HELP", "BONJOUR", "SALUT", "SALAM", "SALAMALEKUM", "HI"].includes(text)) return menu;
  if (text === "STOP") {
    if (user) run("UPDATE users SET whatsapp = 0 WHERE id = ?", user.id);
    return "Alertes WhatsApp coupées. Envoie START pour les réactiver.";
  }
  if (text === "START") {
    if (user) run("UPDATE users SET whatsapp = 1 WHERE id = ?", user.id);
    return user ? "Alertes WhatsApp réactivées." : needAccount;
  }
  if (text === "VENTES" || text === "LISTE") {
    const list = all("SELECT * FROM auctions WHERE status = 'live' AND moderation = 'approved' ORDER BY ends_at LIMIT 6");
    lastList.set(phone, list.map((a) => a.id));
    return (
      "Ça se termine bientôt :\n" +
      list.map((a) => `#${a.id} ${a.title.slice(0, 38)} · ${fcfa(a.current_price)} · fin ${shortLeft(a.ends_at - Date.now())}`).join("\n") +
      "\n\nEnvoie le numéro (ex. 23) pour voir une vente."
    );
  }
  if (text === "MES ENCHERES") {
    if (!user) return needAccount;
    const rows = all(
      `SELECT a.*, MAX(b.amount) mine FROM bids b JOIN auctions a ON a.id = b.auction_id WHERE b.user_id = ? AND a.status = 'live' GROUP BY a.id ORDER BY a.ends_at LIMIT 8`,
      user.id,
    );
    if (!rows.length) return "Aucune enchère en cours. Envoie VENTES pour en trouver.";
    return rows
      .map((a) => {
        const lead = a.mode === "multi" ? ranking(a.id).slice(0, a.quantity).some((r) => r.user_id === user.id) : a.leader_id === user.id;
        return `#${a.id} ${a.title.slice(0, 32)} · ${fcfa(a.current_price)} · ${lead ? "✅ en tête" : "⚠️ dépassé"}`;
      })
      .join("\n");
  }
  let m = /^(?:E|ENCHERE|ENCHERIR|OFFRE)\s+#?(\d+)\s+(\d{3,8})$/.exec(text);
  if (m) return bid(Number(m[1]), Number(m[2]));
  // « 1 » confirme s'il y a une proposition en attente, sinon c'est le numéro de vente 1
  const hasPending = pending.has(phone) && Date.now() - pending.get(phone).at < 10 * 60_000;
  m = /^#?(\d{1,6})$/.exec(text);
  if (m && !(text === "1" && hasPending)) {
    const a = one("SELECT * FROM auctions WHERE id = ? AND moderation = 'approved'", Number(m[1]));
    if (!a) return "Vente introuvable. Envoie VENTES pour la liste.";
    if (a.status !== "live") return `« ${a.title} » est terminée.`;
    const min = nextMin(a);
    pending.set(phone, { auctionId: a.id, amount: min, at: Date.now() });
    return `#${a.id} ${a.title}\nPrix : ${fcfa(a.current_price)} · ${a.bids_count} offres · fin dans ${shortLeft(a.ends_at - Date.now())}\n${site}/enchere/${a.id}\n\nRéponds OUI pour enchérir ${fcfa(min)}, ou E ${a.id} <montant>.`;
  }
  if (text === "OUI" || text === "1" || text === "WAAW") {
    let p = pending.get(phone);
    if (!p || Date.now() - p.at > 10 * 60_000) {
      // Relance après une alerte « dépassé »
      const n = user && one("SELECT link FROM notifications WHERE user_id = ? AND type IN ('outbid','auto_outbid') ORDER BY id DESC LIMIT 1", user.id);
      const id = n && Number(/\/enchere\/(\d+)/.exec(n.link || "")?.[1]);
      const a = id && one("SELECT * FROM auctions WHERE id = ?", id);
      if (!a || a.status !== "live") return "Rien à confirmer. Envoie VENTES pour voir les ventes.";
      p = { auctionId: a.id, amount: nextMin(a), at: Date.now() };
    }
    pending.delete(phone);
    const a = one("SELECT * FROM auctions WHERE id = ?", p.auctionId);
    return bid(p.auctionId, Math.max(p.amount, a ? nextMin(a) : p.amount));
  }
  return "Je n'ai pas compris. " + menu;
}

export function registerV3(app, h) {
  const { wrap, bad, requireUser, requireRole, io, getOrderFor, saveImage, DEMO } = h;
  const admins = () => all("SELECT id FROM users WHERE role = 'admin'");

  // ---------- Heure du serveur (comptes à rebours fiables) ----------
  app.get("/api/time", (_req, res) => res.json({ now: Date.now() }));

  // ---------- Appareils (lutte contre les comptes multiples) ----------
  app.use("/api", (req, _res, next) => {
    const d = req.headers["x-device"];
    if (req.user && typeof d === "string" && /^[a-z0-9-]{8,64}$/i.test(d))
      run("INSERT INTO devices (user_id, device, last_seen) VALUES (?,?,?) ON CONFLICT(user_id, device) DO UPDATE SET last_seen = excluded.last_seen", req.user.id, d, Date.now());
    next();
  });

  // ---------- Journal d'audit des actions admin ----------
  app.use("/api/admin", (req, res, next) => {
    if (req.method !== "GET")
      res.on("finish", () => {
        if (res.statusCode < 400 && req.user?.role === "admin") {
          const body = { ...req.body };
          delete body.password;
          run(
            "INSERT INTO audit_log (admin_id, action, target, detail, created_at) VALUES (?,?,?,?,?)",
            req.user.id,
            req.method,
            req.originalUrl,
            JSON.stringify(body).slice(0, 500),
            Date.now(),
          );
        }
      });
    next();
  });

  // ---------- Recherche ----------
  const SORTS = { ending: "ends_at ASC", new: "created_at DESC", price_asc: "current_price ASC", price_desc: "current_price DESC", popular: "bids_count DESC" };
  app.get(
    "/api/auctions",
    wrap((req, res) => {
      const qy = req.query;
      const where = ["moderation = 'approved'"];
      const params = [];
      const add = (sql, ...p) => {
        where.push(sql);
        params.push(...p);
      };
      const parsed = qy.q ? parseQuery(String(qy.q)) : null;
      if ((qy.status || "live") === "live") add("status = 'live'");
      else if (qy.status === "ended") add("status IN ('sold','unsold')");
      if (qy.category) add("category = ?", qy.category);
      const city = qy.city || parsed?.city;
      if (city) add("city = ?", city);
      if (qy.region) add("region = ?", qy.region);
      if (qy.seller) add("seller_id = ?", Number(qy.seller));
      const size = qy.size || parsed?.size;
      if (size) add("UPPER(size) = ?", String(size).toUpperCase());
      const maxPrice = Number(qy.max_price) || parsed?.maxPrice;
      if (maxPrice) add("current_price <= ?", maxPrice);
      if (Number(qy.min_price)) add("current_price >= ?", Number(qy.min_price));
      if (qy.flash === "1") add("flash = 1");
      if (qy.inspected === "1") add("inspected = 1");
      if (qy.mode === "multi") add("mode = 'multi'");
      if (qy.buy_now === "1") add("buy_now_price > current_price");
      for (const t of parsed?.terms || []) {
        const cat = categoryOfWord(t);
        if (cat) add("(search_text LIKE ? OR category = ?)", `%${t}%`, cat);
        else add("search_text LIKE ?", `%${t}%`);
      }
      // Pertinence : les ventes qui contiennent vraiment les mots cherchés passent devant
      const terms = parsed?.terms || [];
      const relevance = terms.length ? `(${terms.map(() => "(search_text LIKE ?)").join(" + ")}) DESC, ` : "";
      const order = `${relevance}boosted DESC, ${SORTS[qy.sort] || SORTS.ending}`;
      const limit = Math.min(Number(qy.limit) || 24, 100);
      const offset = Math.max(0, Number(qy.offset) || 0);
      const w = where.join(" AND ");
      const total = one(`SELECT COUNT(*) n FROM auctions WHERE ${w}`, ...params).n;
      const rows = all(`SELECT * FROM auctions WHERE ${w} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, ...params, ...terms.map((t) => `%${t}%`));
      res.json({
        auctions: rows.map((a) => auctionView(a, req.user?.id)),
        total,
        offset,
        parsed: parsed && { size: parsed.size, maxPrice: parsed.maxPrice, city: parsed.city, category: parsed.category, terms: parsed.terms },
      });
    }),
  );

  function priceStats(category, title, excludeId = 0) {
    const tokens = normalize(title)
      .split(" ")
      .filter((w) => w.length > 3);
    const since = Date.now() - 120 * 24 * H;
    let rows = all(
      "SELECT id, title, current_price price, ends_at FROM auctions WHERE status = 'sold' AND mode = 'lot' AND category = ? AND id != ? AND ends_at > ? ORDER BY ends_at DESC LIMIT 200",
      category,
      excludeId,
      since,
    );
    const close = rows.filter((r) => tokens.some((t) => normalize(r.title).includes(t)));
    if (close.length >= 2) rows = close;
    const prices = rows.map((r) => r.price).sort((a, b) => a - b);
    if (!prices.length) return null;
    const q = (k) => prices[Math.min(prices.length - 1, Math.floor(k * prices.length))];
    return { count: prices.length, low: q(0.15), high: q(0.85), median: q(0.5), similar: close.length >= 2, recent: rows.slice(0, 5) };
  }

  app.get(
    "/api/auctions/:id/comparables",
    wrap((req, res) => {
      const a = one("SELECT * FROM auctions WHERE id = ?", Number(req.params.id));
      if (!a) throw bad("Vente introuvable.", 404);
      res.json({ stats: priceStats(a.category, a.title, a.id) });
    }),
  );

  app.post(
    "/api/suggest",
    requireUser,
    wrap((req, res) => {
      const title = String(req.body.title || "");
      const category = CATEGORIES.includes(req.body.category) ? req.body.category : suggestCategory(title);
      const stats = category ? priceStats(category, title) : null;
      const round = (n) => Math.max(500, Math.round(n / 500) * 500);
      res.json({
        category,
        stats,
        start_hint: stats ? round(stats.low * 0.6) : null,
        reserve_hint: stats ? round(stats.low * 0.9) : null,
      });
    }),
  );

  // ---------- Modifier, dupliquer, remettre en vente ----------
  app.post(
    "/api/auctions/:id/edit",
    requireRole("seller", "admin"),
    wrap((req, res) => {
      const a = one("SELECT * FROM auctions WHERE id = ?", Number(req.params.id));
      if (!a || (a.seller_id !== req.user.id && req.user.role !== "admin")) throw bad("Vente introuvable.", 404);
      if (a.status !== "live") throw bad("Vente terminée : utilise « Remettre en vente ».");
      const b = req.body;
      const set = {};
      if (b.description != null) set.description = String(b.description).slice(0, 2000);
      if (Array.isArray(b.images) && b.images.length) {
        set.images = JSON.stringify(b.images.slice(0, 6).map((i) => (String(i).startsWith("/") ? i : saveImage(i))));
        set.thumbs = Array.isArray(b.thumbs) ? JSON.stringify(b.thumbs.slice(0, 6).map((i) => (String(i).startsWith("/") ? i : saveImage(i)))) : null;
      }
      if (a.bids_count === 0) {
        if (b.title && String(b.title).trim().length >= 4) set.title = String(b.title).trim().slice(0, 90);
        if (CATEGORIES.includes(b.category)) set.category = b.category;
        if (CONDITIONS.includes(b.condition)) set.condition = b.condition;
        if (b.size !== undefined) set.size = SIZES.includes(String(b.size).toUpperCase()) ? String(b.size).toUpperCase() : null;
        if (Number(b.start_price) >= 500) set.start_price = set.current_price = Math.round(Number(b.start_price));
        if (b.reserve_price !== undefined) set.reserve_price = Math.max(0, Math.round(Number(b.reserve_price) || 0));
        if (b.buy_now_price !== undefined && a.mode === "lot") set.buy_now_price = Math.max(0, Math.round(Number(b.buy_now_price) || 0));
        const start = set.start_price ?? a.start_price;
        if ((set.reserve_price ?? a.reserve_price) && (set.reserve_price ?? a.reserve_price) < start) throw bad("La réserve doit dépasser le prix de départ.");
        if ((set.buy_now_price ?? a.buy_now_price) && (set.buy_now_price ?? a.buy_now_price) <= Math.max(start, set.reserve_price ?? a.reserve_price))
          throw bad("L'achat immédiat doit dépasser le départ et la réserve.");
      } else if (b.title || b.start_price || b.reserve_price) {
        throw bad("Des offres existent déjà : seuls la description et les photos sont modifiables.");
      }
      const merged = { ...a, ...set };
      set.search_text = searchText(merged);
      const keys = Object.keys(set);
      run(`UPDATE auctions SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => set[k]), a.id);
      res.json({ auction: auctionView(one("SELECT * FROM auctions WHERE id = ?", a.id), req.user.id) });
    }),
  );

  app.post(
    "/api/auctions/:id/relist",
    requireRole("seller", "admin"),
    wrap((req, res) => {
      const a = one("SELECT * FROM auctions WHERE id = ?", Number(req.params.id));
      if (!a || (a.seller_id !== req.user.id && req.user.role !== "admin")) throw bad("Vente introuvable.", 404);
      const hours = Math.max(1, Math.min(168, Number(req.body.duration_hours) || 48));
      const now = Date.now();
      const seller = one("SELECT verified FROM users WHERE id = ?", a.seller_id);
      const moderation = seller.verified ? "approved" : "pending";
      const r = run(
        `INSERT INTO auctions (seller_id, title, description, category, condition, city, region, images, thumbs, quantity, start_price, reserve_price,
          current_price, starts_at, ends_at, created_at, mode, buy_now_price, moderation, size, search_text, flash)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
        a.seller_id,
        a.title,
        a.description,
        a.category,
        a.condition,
        a.city,
        a.region,
        a.images,
        a.thumbs,
        a.quantity,
        a.start_price,
        a.reserve_price,
        a.start_price,
        now,
        now + hours * H,
        now,
        a.mode,
        a.buy_now_price,
        moderation,
        a.size,
        a.search_text || searchText(a),
      );
      const fresh = one("SELECT * FROM auctions WHERE id = ?", r.lastInsertRowid);
      if (moderation === "approved") h.announce(fresh, a.seller_id);
      res.json({ auction: auctionView(fresh, req.user.id), pending: moderation === "pending" });
    }),
  );

  // ---------- Boutiques ----------
  app.get(
    "/api/sellers/:id",
    wrap((req, res) => {
      const s = one("SELECT * FROM users WHERE id = ? AND role = 'seller' AND deleted = 0", Number(req.params.id));
      if (!s) throw bad("Boutique introuvable.", 404);
      const rating = one("SELECT ROUND(AVG(rating),1) avg, COUNT(*) n FROM reviews WHERE seller_id = ?", s.id);
      const live = all("SELECT * FROM auctions WHERE seller_id = ? AND status = 'live' AND moderation = 'approved' ORDER BY ends_at", s.id);
      const sold = all("SELECT * FROM auctions WHERE seller_id = ? AND status = 'sold' ORDER BY ends_at DESC LIMIT 8", s.id);
      const reviews = all(
        `SELECT r.rating, r.comment, r.created_at, u.name FROM reviews r JOIN users u ON u.id = r.buyer_id WHERE r.seller_id = ? ORDER BY r.id DESC LIMIT 12`,
        s.id,
      );
      res.json({
        seller: {
          id: s.id,
          name: s.shop_name || s.name,
          city: s.city,
          bio: s.bio,
          verified: !!s.verified,
          pro: !!(s.plan_until && s.plan_until > Date.now()),
          since: s.created_at,
          rating: rating.avg,
          reviews: rating.n,
          sold: one("SELECT COUNT(*) n FROM auctions WHERE seller_id = ? AND status = 'sold'", s.id).n,
          followers: one("SELECT COUNT(*) n FROM follows WHERE seller_id = ?", s.id).n,
          following: req.user ? !!one("SELECT 1 FROM follows WHERE user_id = ? AND seller_id = ?", req.user.id, s.id) : false,
        },
        live: live.map((a) => auctionView(a, req.user?.id)),
        sold: sold.map((a) => auctionView(a, req.user?.id)),
        reviews: reviews.map((r) => ({ rating: r.rating, comment: r.comment, created_at: r.created_at, name: maskName(r.name) })),
      });
    }),
  );

  app.post(
    "/api/sellers/:id/follow",
    requireUser,
    wrap((req, res) => {
      const id = Number(req.params.id);
      if (id === req.user.id) throw bad("C'est ta propre boutique.");
      if (!one("SELECT 1 FROM users WHERE id = ? AND role = 'seller'", id)) throw bad("Boutique introuvable.", 404);
      const on = one("SELECT 1 FROM follows WHERE user_id = ? AND seller_id = ?", req.user.id, id);
      if (on) run("DELETE FROM follows WHERE user_id = ? AND seller_id = ?", req.user.id, id);
      else run("INSERT INTO follows (user_id, seller_id, created_at) VALUES (?,?,?)", req.user.id, id, Date.now());
      res.json({ following: !on, followers: one("SELECT COUNT(*) n FROM follows WHERE seller_id = ?", id).n });
    }),
  );

  app.get(
    "/api/me/following",
    requireUser,
    wrap((req, res) =>
      res.json({
        items: all(
          "SELECT u.id, COALESCE(u.shop_name, u.name) name, u.city, u.verified FROM follows f JOIN users u ON u.id = f.seller_id WHERE f.user_id = ? ORDER BY f.created_at DESC",
          req.user.id,
        ),
      }),
    ),
  );

  // ---------- Recherches sauvegardées (alertes) ----------
  app.get("/api/me/searches", requireUser, (req, res) => res.json({ items: all("SELECT * FROM saved_searches WHERE user_id = ? ORDER BY id DESC", req.user.id) }));
  app.post(
    "/api/me/searches",
    requireUser,
    wrap((req, res) => {
      const b = req.body;
      if (one("SELECT COUNT(*) n FROM saved_searches WHERE user_id = ?", req.user.id).n >= 20) throw bad("20 alertes maximum.");
      const parsed = b.q ? parseQuery(String(b.q)) : {};
      const r = run(
        "INSERT INTO saved_searches (user_id, q, category, size, city, max_price, created_at) VALUES (?,?,?,?,?,?,?)",
        req.user.id,
        (parsed.terms || []).join(" "),
        CATEGORIES.includes(b.category) ? b.category : null,
        b.size || parsed.size || null,
        CITIES[b.city] ? b.city : parsed.city || null,
        Number(b.max_price) || parsed.maxPrice || null,
        Date.now(),
      );
      res.json({ id: Number(r.lastInsertRowid) });
    }),
  );
  app.delete("/api/me/searches/:id", requireUser, (req, res) => {
    run("DELETE FROM saved_searches WHERE id = ? AND user_id = ?", Number(req.params.id), req.user.id);
    res.json({ ok: true });
  });

  // ---------- Profil, mot de passe, export, suppression ----------
  app.post(
    "/api/me/profile",
    requireUser,
    wrap((req, res) => {
      const b = req.body;
      const set = {};
      if (b.name != null) {
        if (String(b.name).trim().length < 2) throw bad("Nom trop court.");
        set.name = String(b.name).trim().slice(0, 60);
      }
      if (b.city != null) {
        if (!CITIES[b.city]) throw bad("Ville inconnue.");
        set.city = b.city;
      }
      if (b.shop_name != null && req.user.role === "seller") set.shop_name = String(b.shop_name).trim().slice(0, 60) || req.user.shop_name;
      if (b.bio != null) set.bio = String(b.bio).slice(0, 400);
      if (b.lang != null) set.lang = b.lang === "wo" ? "wo" : "fr";
      if (b.payout_method !== undefined) {
        if (b.payout_method && !["wave", "orange_money"].includes(b.payout_method)) throw bad("Moyen de versement inconnu.");
        set.payout_method = b.payout_method || null;
      }
      if (b.payout_account !== undefined) {
        const acc = String(b.payout_account || "").replace(/\D/g, "").replace(/^221/, "");
        if (acc && !PHONE_RE.test(acc)) throw bad("Numéro de versement invalide.");
        set.payout_account = acc || null;
      }
      const keys = Object.keys(set);
      if (keys.length) run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => set[k]), req.user.id);
      res.json({ user: publicUser(one("SELECT * FROM users WHERE id = ?", req.user.id)) });
    }),
  );

  app.post(
    "/api/me/password",
    requireUser,
    wrap((req, res) => {
      if (!checkPassword(String(req.body.old || ""), req.user)) throw bad("Mot de passe actuel incorrect.");
      if (String(req.body.password || "").length < 6) throw bad("Nouveau mot de passe : 6 caractères minimum.");
      const { salt, hash } = hashPassword(String(req.body.password));
      run("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", hash, salt, req.user.id);
      res.json({ ok: true });
    }),
  );

  app.get(
    "/api/me/export",
    requireUser,
    wrap((req, res) => {
      const uid = req.user.id;
      const data = {
        exported_at: new Date().toISOString(),
        user: publicUser(req.user),
        bids: all("SELECT auction_id, amount, created_at FROM bids WHERE user_id = ?", uid),
        orders: all("SELECT * FROM orders WHERE buyer_id = ? OR seller_id = ?", uid, uid),
        auctions: all("SELECT id, title, status, current_price, created_at FROM auctions WHERE seller_id = ?", uid),
        requests: all("SELECT * FROM requests WHERE user_id = ?", uid),
        notifications: all("SELECT type, title, body, created_at FROM notifications WHERE user_id = ?", uid),
        reviews_written: all("SELECT * FROM reviews WHERE buyer_id = ?", uid),
      };
      res.setHeader("Content-Disposition", `attachment; filename="babylone-mes-donnees.json"`);
      res.json(data);
    }),
  );

  app.post(
    "/api/me/delete",
    requireUser,
    wrap((req, res) => {
      const u = req.user;
      if (!checkPassword(String(req.body.password || ""), u)) throw bad("Mot de passe incorrect.");
      const active = one(
        "SELECT COUNT(*) n FROM orders WHERE (buyer_id = ? OR seller_id = ?) AND status IN ('awaiting_payment','paid','shipped','delivered','disputed')",
        u.id,
        u.id,
      ).n;
      if (active) throw bad("Des commandes sont en cours. Termine-les avant de supprimer ton compte.");
      if (one("SELECT 1 FROM auctions WHERE leader_id = ? AND status = 'live'", u.id)) throw bad("Tu es en tête d'une vente en cours.");
      if (u.deposit) queuePayout("deposit_refund", u.id, u.deposit);
      tx(() => {
        run("UPDATE auctions SET status = 'cancelled' WHERE seller_id = ? AND status = 'live' AND bids_count = 0", u.id);
        for (const t of ["watches", "auto_bids", "saved_searches", "push_subs", "devices"]) run(`DELETE FROM ${t} WHERE user_id = ?`, u.id);
        run("DELETE FROM follows WHERE user_id = ? OR seller_id = ?", u.id, u.id);
        const { salt, hash } = hashPassword(randomBytes(16).toString("hex"));
        run(
          `UPDATE users SET name = 'Compte supprimé', phone = ?, password_hash = ?, salt = ?, shop_name = NULL, bio = NULL, payout_account = NULL,
           whatsapp = 0, deleted = 1, blocked = 1, deposit = 0, last_ip = NULL WHERE id = ?`,
          `supprime-${u.id}`,
          hash,
          salt,
          u.id,
        );
      });
      res.json({ ok: true });
    }),
  );

  // ---------- Fidélité ----------
  app.get(
    "/api/me/loyalty",
    requireUser,
    wrap((req, res) => {
      const pts = req.user.points || 0;
      res.json({ points: pts, ...levelOf(pts), levels: LEVELS.map(([at, name]) => ({ at, name })), reliability: buyerReliability(req.user.id) });
    }),
  );

  // ---------- Notifications push ----------
  app.get("/api/push/key", (_req, res) => res.json({ key: VAPID_PUBLIC }));
  app.post("/api/push/subscribe", requireUser, (req, res) => {
    saveSubscription(req.user.id, req.body.subscription);
    res.json({ ok: true });
  });
  app.post("/api/push/unsubscribe", requireUser, (req, res) => {
    removeSubscription(String(req.body.endpoint || ""));
    res.json({ ok: true });
  });

  // ---------- Statistiques d'audience ----------
  app.post("/api/track", (req, res) => {
    const kind = ["visit", "view"].includes(req.body?.kind) ? req.body.kind : null;
    if (kind) trackEvent(kind, { path: String(req.body.path || "").slice(0, 120), userId: req.user?.id ?? null, session: String(req.body.session || "").slice(0, 40) });
    res.json({ ok: true });
  });

  app.get(
    "/api/admin/analytics",
    requireRole("admin"),
    wrap((req, res) => {
      const days = Math.min(60, Number(req.query.days) || 14);
      const since = Date.now() - days * 24 * H;
      const series = [];
      for (let d = days - 1; d >= 0; d--) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - d);
        const s = start.getTime();
        const e = s + 24 * H;
        const c = (kind, distinct = false) =>
          one(`SELECT COUNT(${distinct ? "DISTINCT session" : "*"}) n FROM events WHERE kind = ? AND created_at >= ? AND created_at < ?`, kind, s, e).n;
        series.push({ day: s, visits: c("visit", true), views: c("view"), bids: c("bid"), pays: c("pay"), signups: c("signup") });
      }
      const sum = (k) => series.reduce((t, x) => t + x[k], 0);
      const top = all(
        `SELECT path, COUNT(*) n FROM events WHERE kind = 'view' AND created_at > ? GROUP BY path ORDER BY n DESC LIMIT 8`,
        since,
      ).map((r) => {
        const id = Number(/\/enchere\/(\d+)/.exec(r.path || "")?.[1]);
        return { path: r.path, views: r.n, title: id ? one("SELECT title FROM auctions WHERE id = ?", id)?.title : r.path };
      });
      res.json({ series, funnel: { visits: sum("visits"), views: sum("views"), bids: sum("bids"), pays: sum("pays"), signups: sum("signups") }, top });
    }),
  );

  // ---------- Commandes : points relais, messages, preuves, code de livraison, note de l'acheteur, facture ----------
  app.get("/api/relays", (req, res) =>
    res.json({ items: req.query.city ? all("SELECT * FROM relay_points WHERE city = ?", req.query.city) : all("SELECT * FROM relay_points ORDER BY city") }),
  );

  const role = (o, u) => (u.id === o.buyer_id ? "buyer" : u.id === o.seller_id ? "seller" : "admin");

  app.get(
    "/api/orders/:id/messages",
    requireUser,
    wrap((req, res) => {
      const o = getOrderFor(req);
      const rows = all(
        "SELECT m.*, u.name FROM order_messages m JOIN users u ON u.id = m.user_id WHERE order_id = ? ORDER BY m.id",
        o.id,
      );
      res.json({ items: rows.map((m) => ({ ...m, images: JSON.parse(m.images), name: m.role === "admin" ? "Équipe Babylone" : maskName(m.name), mine: m.user_id === req.user.id })) });
    }),
  );

  function postMessage(o, user, body, images = []) {
    const urls = (Array.isArray(images) ? images : []).slice(0, 4).map((i) => saveImage(i));
    const r = role(o, user);
    const now = Date.now();
    run("INSERT INTO order_messages (order_id, user_id, role, body, images, created_at) VALUES (?,?,?,?,?,?)", o.id, user.id, r, body, JSON.stringify(urls), now);
    const title = one("SELECT title FROM auctions WHERE id = ?", o.auction_id)?.title || "";
    const targets = new Set([o.buyer_id, o.seller_id]);
    targets.delete(user.id);
    if (o.status === "disputed") for (const a of admins()) targets.add(a.id);
    targets.delete(user.id);
    for (const t of targets)
      notify(t, "message", r === "admin" ? "Message de l'équipe Babylone" : "Nouveau message", `Commande #${o.id} · ${title} : ${body.slice(0, 80)}`, t === o.buyer_id ? `/compte/commandes/${o.id}` : t === o.seller_id ? `/vendeur?commande=${o.id}` : "/admin");
    io.to(`user:${o.buyer_id}`).to(`user:${o.seller_id}`).emit("order:message", { order_id: o.id });
  }

  app.post(
    "/api/orders/:id/messages",
    requireUser,
    wrap((req, res) => {
      const o = getOrderFor(req);
      const body = String(req.body.body || "").trim();
      if (!body && !(req.body.images || []).length) throw bad("Message vide.");
      postMessage(o, req.user, body.slice(0, 1000), req.body.images);
      res.json({ ok: true });
    }),
  );

  // Litige avec preuves (remplace la version sans photos)
  app.post(
    "/api/orders/:id/dispute",
    requireUser,
    wrap((req, res) => {
      const o = getOrderFor(req);
      if (o.buyer_id !== req.user.id) throw bad("Réservé à l'acheteur.", 403);
      if (!["paid", "shipped", "delivered"].includes(o.status)) throw bad("Litige impossible à cette étape.");
      const reason = String(req.body.reason || "").trim();
      if (reason.length < 10) throw bad("Explique le problème en quelques mots (10 caractères minimum).");
      run("UPDATE orders SET status = 'disputed', updated_at = ? WHERE id = ?", Date.now(), o.id);
      const fresh = one("SELECT * FROM orders WHERE id = ?", o.id);
      postMessage(fresh, req.user, `Litige ouvert : ${reason.slice(0, 1000)}`, req.body.images);
      io.to(`user:${o.buyer_id}`).to(`user:${o.seller_id}`).emit("order", { id: o.id, status: "disputed" });
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/orders/:id/confirm-code",
    requireUser,
    wrap((req, res) => {
      const o = getOrderFor(req);
      if (o.seller_id !== req.user.id && req.user.role !== "admin") throw bad("Réservé au vendeur.", 403);
      if (!["paid", "shipped"].includes(o.status)) throw bad("Commande pas encore payée ou déjà livrée.");
      if (String(req.body.code || "").trim() !== o.delivery_code) throw bad("Code de livraison incorrect. Demande-le à l'acheteur.");
      run("UPDATE orders SET status = 'delivered', updated_at = ? WHERE id = ?", Date.now(), o.id);
      releaseFunds(o.id);
      const title = one("SELECT title FROM auctions WHERE id = ?", o.auction_id)?.title;
      notify(o.buyer_id, "delivered", "Livraison confirmée", `${title} : remise confirmée par code. Laisse un avis au vendeur !`, `/compte/commandes/${o.id}`);
      io.to(`user:${o.buyer_id}`).to(`user:${o.seller_id}`).emit("order", { id: o.id, status: "released" });
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/orders/:id/rate-buyer",
    requireUser,
    wrap((req, res) => {
      const o = getOrderFor(req);
      if (o.seller_id !== req.user.id) throw bad("Réservé au vendeur.", 403);
      if (!["paid", "shipped", "delivered", "released"].includes(o.status)) throw bad("Tu pourras noter l'acheteur après son paiement.");
      const rating = Math.max(1, Math.min(5, Math.round(Number(req.body.rating) || 5)));
      run(
        "INSERT OR REPLACE INTO buyer_reviews (order_id, buyer_id, seller_id, rating, comment, created_at) VALUES (?,?,?,?,?,?)",
        o.id,
        o.buyer_id,
        o.seller_id,
        rating,
        String(req.body.comment || "").slice(0, 300),
        Date.now(),
      );
      res.json({ ok: true });
    }),
  );

  app.get(
    "/api/orders/:id/invoice",
    requireUser,
    wrap((req, res) => {
      const o = getOrderFor(req);
      if (!["paid", "shipped", "delivered", "released", "refunded", "disputed"].includes(o.status)) throw bad("Facture disponible après paiement.");
      const a = one("SELECT title, quantity, city FROM auctions WHERE id = ?", o.auction_id);
      const b = one("SELECT name, phone, city FROM users WHERE id = ?", o.buyer_id);
      const s = one("SELECT name, shop_name, phone, city FROM users WHERE id = ?", o.seller_id);
      const relay = o.relay_id ? one("SELECT * FROM relay_points WHERE id = ?", o.relay_id) : null;
      res.json({
        number: `BAB-${new Date(o.created_at).getFullYear()}-${String(o.id).padStart(6, "0")}`,
        date: o.updated_at,
        order: { id: o.id, amount: o.amount, delivery_fee: o.delivery_fee, commission: o.commission, total: o.amount + o.delivery_fee, provider: o.provider, status: o.status, address: o.address, delivery_mode: o.delivery_mode },
        item: a,
        buyer: b,
        seller: { name: s.shop_name || s.name, phone: s.phone, city: s.city },
        relay,
        platform: "BABYLONE E-COMMERCE SUARL · Thiès, Sénégal · RCCM [À COMPLÉTER] · NINEA [À COMPLÉTER]",
      });
    }),
  );

  // ---------- Exports CSV ----------
  app.get(
    "/api/seller/export.csv",
    requireRole("seller", "admin"),
    wrap((req, res) => {
      const rows = all(
        `SELECT o.id commande, datetime(o.created_at/1000,'unixepoch') date, a.title produit, u.name acheteur, o.amount prix, o.commission commission,
          o.amount - o.commission net, o.delivery_fee livraison, o.status statut FROM orders o JOIN auctions a ON a.id = o.auction_id
          JOIN users u ON u.id = o.buyer_id WHERE o.seller_id = ? ORDER BY o.id`,
        req.user.id,
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="babylone-ventes.csv"');
      res.send(csv(rows));
    }),
  );

  app.get(
    "/api/admin/export.csv",
    requireRole("admin"),
    wrap((_req, res) => {
      const rows = all(
        `SELECT o.id commande, datetime(o.created_at/1000,'unixepoch') date, a.title produit, b.name acheteur, COALESCE(s.shop_name, s.name) vendeur,
          o.amount prix, o.commission commission, o.delivery_fee livraison, o.status statut, o.provider moyen FROM orders o
          JOIN auctions a ON a.id = o.auction_id JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id ORDER BY o.id`,
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="babylone-commandes.csv"');
      res.send(csv(rows));
    }),
  );

  // ---------- Admin : inspection, audit, versements, sauvegardes, bot ----------
  app.post(
    "/api/admin/inspect/:id",
    requireRole("admin"),
    wrap((req, res) => {
      run("UPDATE auctions SET inspected = 1 - inspected WHERE id = ?", Number(req.params.id));
      res.json({ inspected: !!one("SELECT inspected FROM auctions WHERE id = ?", Number(req.params.id))?.inspected });
    }),
  );
  app.get("/api/admin/audit", requireRole("admin"), (_req, res) =>
    res.json({ items: all("SELECT l.*, u.name FROM audit_log l JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 100") }),
  );
  app.get("/api/admin/payouts", requireRole("admin"), (_req, res) =>
    res.json({ items: all("SELECT p.*, u.name, u.phone FROM payouts p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 100") }),
  );
  app.post(
    "/api/admin/payouts/:id/retry",
    requireRole("admin"),
    wrap(async (req, res) => res.json({ payout: await processPayout(Number(req.params.id)) })),
  );

  const BACKUP_DIR = join(DATA_DIR, "backups");
  function backup() {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const name = `babylone-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.db`;
    rmSync(join(BACKUP_DIR, name), { force: true }); // VACUUM INTO refuse d'écraser un fichier
    db.exec(`VACUUM INTO '${join(BACKUP_DIR, name).replace(/'/g, "''")}'`);
    const files = readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db")).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 7))) rmSync(join(BACKUP_DIR, f));
    return name;
  }
  let lastBackupDay = "";
  onTick(() => {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== lastBackupDay && new Date().getHours() >= 3) {
      lastBackupDay = day;
      try {
        backup();
      } catch (e) {
        console.error("[backup]", e);
      }
    }
  });
  app.get("/api/admin/backups", requireRole("admin"), (_req, res) =>
    res.json({ items: existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db")).sort().reverse() : [] }),
  );
  app.post("/api/admin/backups", requireRole("admin"), wrap((_req, res) => res.json({ name: backup() })));
  app.get(
    "/api/admin/backups/:name",
    requireRole("admin"),
    wrap((req, res) => {
      const name = String(req.params.name);
      if (!/^babylone-[\d-]+\.db$/.test(name) || !existsSync(join(BACKUP_DIR, name))) throw bad("Sauvegarde introuvable.", 404);
      res.download(join(BACKUP_DIR, name));
    }),
  );
  app.post(
    "/api/admin/bot",
    requireRole("admin"),
    wrap((req, res) => res.json({ reply: handleBot(String(req.body.phone || req.user.phone), String(req.body.text || "")) })),
  );

  // ---------- Webhook WhatsApp (messages entrants du bot) ----------
  app.get("/api/webhooks/whatsapp", (req, res) => {
    if (req.query["hub.mode"] === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN && req.query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN)
      return res.send(String(req.query["hub.challenge"]));
    res.status(403).end();
  });
  app.post("/api/webhooks/whatsapp", (req, res) => {
    // Signature Meta (X-Hub-Signature-256) vérifiée si WHATSAPP_APP_SECRET est défini
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (secret) {
      const sig = String(req.headers["x-hub-signature-256"] || "");
      const expected = "sha256=" + createHmac("sha256", secret).update(req.rawBody || "").digest("hex");
      if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return res.status(401).end();
    }
    res.sendStatus(200);
    for (const entry of req.body?.entry || [])
      for (const ch of entry.changes || [])
        for (const m of ch.value?.messages || []) {
          const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || "";
          const reply = handleBot(m.from, text);
          const u = one("SELECT id FROM users WHERE phone = ?", String(m.from).replace(/^221/, ""));
          sendWhatsAppText(m.from, reply, u?.id ?? null).catch(() => {});
        }
  });

  // ---------- Caution ----------
  app.get("/api/me/deposit", requireUser, (req, res) =>
    res.json({ deposit: req.user.deposit || 0, amount: DEPOSIT_AMOUNT, threshold: DEPOSIT_THRESHOLD }),
  );

  async function startPayment(user, kind, refId, amount, title, backPath) {
    const r = run("INSERT INTO payments (user_id, kind, ref_id, amount, status, created_at) VALUES (?,?,?,?, 'pending', ?)", user.id, kind, refId, amount, Date.now());
    const p = one("SELECT * FROM payments WHERE id = ?", r.lastInsertRowid);
    const c = await createPaymentCheckout(p, title, backPath);
    run("UPDATE payments SET provider_ref = ? WHERE id = ?", c.ref, p.id);
    return { payment_id: p.id, redirect: c.redirect, demo: c.demo, amount };
  }

  app.post(
    "/api/me/deposit",
    requireUser,
    wrap(async (req, res) => {
      if ((req.user.deposit || 0) >= DEPOSIT_AMOUNT) throw bad("Ta caution est déjà versée.");
      res.json(await startPayment(req.user, "deposit", null, DEPOSIT_AMOUNT, "Caution Babylone (remboursable)", "/compte/reglages"));
    }),
  );

  app.post(
    "/api/me/deposit/refund",
    requireUser,
    wrap((req, res) => {
      const u = req.user;
      if (!u.deposit) throw bad("Aucune caution à rembourser.");
      if (one("SELECT 1 FROM auctions WHERE leader_id = ? AND status = 'live'", u.id)) throw bad("Tu es en tête d'une vente en cours.");
      if (one("SELECT 1 FROM orders WHERE buyer_id = ? AND status = 'awaiting_payment'", u.id)) throw bad("Une commande attend ton paiement.");
      run("UPDATE users SET deposit = 0 WHERE id = ?", u.id);
      queuePayout("deposit_refund", u.id, u.deposit);
      res.json({ ok: true });
    }),
  );

  // Paiement confirmé (webhook PayDunya ou confirmation de démo)
  function markPaymentPaid(paymentId, ref) {
    const p = one("SELECT * FROM payments WHERE id = ?", paymentId);
    if (!p || p.status !== "pending") return false;
    run("UPDATE payments SET status = 'paid', provider_ref = COALESCE(?, provider_ref) WHERE id = ?", ref, p.id);
    if (p.kind === "deposit") {
      run("UPDATE users SET deposit = deposit + ? WHERE id = ?", p.amount, p.user_id);
      notify(p.user_id, "deposit", "Caution versée", `Tu peux enchérir à partir de ${fcfa(DEPOSIT_THRESHOLD)}. Elle t'est rendue sur demande.`, "/compte/reglages");
    } else if (p.kind === "preorder") {
      run("UPDATE reservations SET status = 'reserved' WHERE id = ?", p.ref_id);
      const r = one("SELECT * FROM reservations WHERE id = ?", p.ref_id);
      const po = one("SELECT * FROM preorders WHERE id = ?", r.preorder_id);
      notify(p.user_id, "preorder", "Réservation confirmée", `${po.title} : ${r.qty} pièce(s) réservée(s). Acompte de ${fcfa(r.deposit)} reçu.`, `/arrivage/${po.id}`);
      notify(po.seller_id, "preorder", "Nouvelle réservation", `${po.title} : +${r.qty} pièce(s).`, `/arrivage/${po.id}`);
      io.emit("preorder", { id: po.id });
    } else if (p.kind === "preorder_balance") {
      run("UPDATE reservations SET status = 'completed' WHERE id = ?", p.ref_id);
      const r = one("SELECT * FROM reservations WHERE id = ?", p.ref_id);
      const po = one("SELECT * FROM preorders WHERE id = ?", r.preorder_id);
      const total = po.unit_price * r.qty;
      queuePayout("seller_payout", po.seller_id, Math.round(total * (1 - COMMISSION_RATE)));
      notify(p.user_id, "preorder", "Solde payé", `${po.title} : le vendeur va te remettre tes ${r.qty} pièce(s).`, `/arrivage/${po.id}`);
      notify(po.seller_id, "to_ship", "Arrivage à remettre", `${po.title} : ${r.qty} pièce(s) payées, à remettre à l'acheteur.`, `/arrivage/${po.id}`);
    }
    return true;
  }
  h.setPaymentHandler(markPaymentPaid);

  app.post(
    "/api/payments/:id/demo-confirm",
    requireUser,
    wrap((req, res) => {
      if (!DEMO) throw bad("Mode démo désactivé.", 403);
      const p = one("SELECT * FROM payments WHERE id = ? AND user_id = ?", Number(req.params.id), req.user.id);
      if (!p) throw bad("Paiement introuvable.", 404);
      markPaymentPaid(p.id, `demo-${p.id}`);
      res.json({ ok: true });
    }),
  );

  // ---------- Précommandes d'arrivage (conteneurs) ----------
  const preorderView = (po, viewerId = null) => {
    const reserved = one("SELECT COALESCE(SUM(qty),0) n FROM reservations WHERE preorder_id = ? AND status IN ('reserved','balance_due','completed')", po.id).n;
    const buyers = one("SELECT COUNT(DISTINCT user_id) n FROM reservations WHERE preorder_id = ? AND status IN ('reserved','balance_due','completed')", po.id).n;
    const s = one("SELECT id, shop_name, name, verified, city FROM users WHERE id = ?", po.seller_id);
    return {
      ...po,
      images: JSON.parse(po.images),
      reserved,
      buyers,
      remaining: po.total_units - reserved,
      deposit_unit: Math.ceil((po.unit_price * po.deposit_pct) / 100),
      seller: { id: s.id, name: s.shop_name || s.name, verified: !!s.verified, city: s.city },
      mine: viewerId
        ? all("SELECT id, qty, deposit, status FROM reservations WHERE preorder_id = ? AND user_id = ? AND status != 'pending' ORDER BY id", po.id, viewerId)
        : [],
    };
  };

  app.get("/api/preorders", (req, res) =>
    res.json({
      items: all("SELECT * FROM preorders WHERE status IN ('open','confirmed','arrived') ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, deadline").map((p) =>
        preorderView(p, req.user?.id),
      ),
    }),
  );
  app.get(
    "/api/preorders/:id",
    wrap((req, res) => {
      const po = one("SELECT * FROM preorders WHERE id = ?", Number(req.params.id));
      if (!po) throw bad("Arrivage introuvable.", 404);
      const view = preorderView(po, req.user?.id);
      if (req.user?.id === po.seller_id || req.user?.role === "admin")
        view.reservations = all(
          "SELECT r.id, r.qty, r.deposit, r.status, u.name, u.phone FROM reservations r JOIN users u ON u.id = r.user_id WHERE r.preorder_id = ? AND r.status != 'pending'",
          po.id,
        );
      res.json({ preorder: view });
    }),
  );

  app.post(
    "/api/preorders",
    requireRole("seller", "admin"),
    wrap((req, res) => {
      const b = req.body;
      if (!req.user.verified && req.user.role !== "admin") throw bad("Les arrivages sont réservés aux vendeurs vérifiés.", 403);
      const title = String(b.title || "").trim();
      if (title.length < 4) throw bad("Titre trop court.");
      if (!CATEGORIES.includes(b.category)) throw bad("Choisis une catégorie.");
      const unit = Math.round(Number(b.unit_price));
      const total = Math.round(Number(b.total_units));
      const min = Math.round(Number(b.min_units)) || Math.ceil(total / 2);
      const pct = Math.max(10, Math.min(50, Math.round(Number(b.deposit_pct) || 20)));
      const eta = Number(new Date(b.eta).getTime());
      const deadline = Number(new Date(b.deadline).getTime());
      if (!(unit >= 500)) throw bad("Prix unitaire : 500 F minimum.");
      if (!(total >= 2 && total <= 100000)) throw bad("Quantité totale invalide.");
      if (!(min >= 1 && min <= total)) throw bad("Le minimum doit être entre 1 et la quantité totale.");
      if (!(deadline > Date.now() + H)) throw bad("La fin des réservations doit être dans le futur.");
      if (!(eta >= deadline)) throw bad("L'arrivée prévue doit être après la fin des réservations.");
      const images = (Array.isArray(b.images) ? b.images : []).slice(0, 6).map((i) => (String(i).startsWith("/") ? i : saveImage(i)));
      if (!images.length) throw bad("Ajoute au moins une photo (échantillon, catalogue du fournisseur…).");
      const r = run(
        `INSERT INTO preorders (seller_id, title, description, category, images, city, unit_price, deposit_pct, total_units, min_units, eta, deadline, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        req.user.id,
        title.slice(0, 90),
        String(b.description || "").slice(0, 2000),
        b.category,
        JSON.stringify(images),
        CITIES[b.city] ? b.city : req.user.city,
        unit,
        pct,
        total,
        min,
        eta,
        deadline,
        Date.now(),
      );
      for (const f of all("SELECT user_id FROM follows WHERE seller_id = ?", req.user.id))
        notify(f.user_id, "follow_new", "Nouvel arrivage en précommande", `${title} · ${fcfa(unit)} la pièce`, `/arrivage/${r.lastInsertRowid}`);
      res.json({ preorder: preorderView(one("SELECT * FROM preorders WHERE id = ?", r.lastInsertRowid), req.user.id) });
    }),
  );

  app.post(
    "/api/preorders/:id/reserve",
    requireUser,
    wrap(async (req, res) => {
      const po = one("SELECT * FROM preorders WHERE id = ?", Number(req.params.id));
      if (!po || po.status !== "open" || po.deadline < Date.now()) throw bad("Les réservations sont fermées.");
      if (po.seller_id === req.user.id) throw bad("C'est ton propre arrivage.");
      const qty = Math.max(1, Math.round(Number(req.body.qty) || 1));
      const v = preorderView(po);
      if (qty > v.remaining) throw bad(`Il reste ${v.remaining} pièce(s).`);
      const deposit = Math.ceil((po.unit_price * qty * po.deposit_pct) / 100);
      const r = run("INSERT INTO reservations (preorder_id, user_id, qty, deposit, status, created_at) VALUES (?,?,?,?, 'pending', ?)", po.id, req.user.id, qty, deposit, Date.now());
      res.json(await startPayment(req.user, "preorder", Number(r.lastInsertRowid), deposit, `Acompte · ${po.title} × ${qty}`, `/arrivage/${po.id}`));
    }),
  );

  app.post(
    "/api/preorders/:id/:action",
    requireRole("seller", "admin"),
    wrap((req, res) => {
      const po = one("SELECT * FROM preorders WHERE id = ?", Number(req.params.id));
      if (!po || (po.seller_id !== req.user.id && req.user.role !== "admin")) throw bad("Arrivage introuvable.", 404);
      const resv = all("SELECT * FROM reservations WHERE preorder_id = ? AND status IN ('reserved','balance_due')", po.id);
      if (req.params.action === "arrived") {
        if (!["open", "confirmed"].includes(po.status)) throw bad("Statut incompatible.");
        run("UPDATE preorders SET status = 'arrived' WHERE id = ?", po.id);
        for (const r of resv) {
          run("UPDATE reservations SET status = 'balance_due' WHERE id = ?", r.id);
          notify(r.user_id, "preorder", "Ton arrivage est là !", `${po.title} : paie le solde de ${fcfa(po.unit_price * r.qty - r.deposit)} pour récupérer tes pièces.`, `/arrivage/${po.id}`);
        }
      } else if (req.params.action === "cancel") {
        if (["cancelled", "closed"].includes(po.status)) throw bad("Déjà terminé.");
        cancelPreorder(po, "annulé par le vendeur");
      } else throw bad("Action inconnue.");
      io.emit("preorder", { id: po.id });
      res.json({ preorder: preorderView(one("SELECT * FROM preorders WHERE id = ?", po.id), req.user.id) });
    }),
  );

  function cancelPreorder(po, why) {
    run("UPDATE preorders SET status = 'cancelled' WHERE id = ?", po.id);
    for (const r of all("SELECT * FROM reservations WHERE preorder_id = ? AND status IN ('reserved','balance_due')", po.id)) {
      run("UPDATE reservations SET status = 'refunded' WHERE id = ?", r.id);
      queuePayout("refund", r.user_id, r.deposit);
      notify(r.user_id, "refund", "Arrivage annulé", `${po.title} (${why}) : ton acompte de ${fcfa(r.deposit)} t'est remboursé.`, `/arrivage/${po.id}`);
    }
  }

  app.post(
    "/api/reservations/:id/pay",
    requireUser,
    wrap(async (req, res) => {
      const r = one("SELECT * FROM reservations WHERE id = ? AND user_id = ?", Number(req.params.id), req.user.id);
      if (!r || r.status !== "balance_due") throw bad("Rien à payer pour cette réservation.");
      const po = one("SELECT * FROM preorders WHERE id = ?", r.preorder_id);
      res.json(await startPayment(req.user, "preorder_balance", r.id, po.unit_price * r.qty - r.deposit, `Solde · ${po.title} × ${r.qty}`, `/arrivage/${po.id}`));
    }),
  );

  onTick(() => {
    const now = Date.now();
    for (const po of all("SELECT * FROM preorders WHERE status = 'open' AND deadline < ?", now)) {
      const v = preorderView(po);
      if (v.reserved >= po.min_units) {
        run("UPDATE preorders SET status = 'confirmed' WHERE id = ?", po.id);
        notify(po.seller_id, "preorder", "Arrivage confirmé", `${po.title} : ${v.reserved} pièce(s) réservée(s), objectif atteint.`, `/arrivage/${po.id}`);
        for (const r of all("SELECT DISTINCT user_id FROM reservations WHERE preorder_id = ? AND status = 'reserved'", po.id))
          notify(r.user_id, "preorder", "Arrivage confirmé", `${po.title} arrive vers le ${new Date(po.eta).toLocaleDateString("fr-FR")}.`, `/arrivage/${po.id}`);
      } else cancelPreorder(po, "objectif de réservations non atteint");
    }
  });

  // ---------- Ventes en direct (live) ----------
  const liveView = (l, viewerId = null) => {
    const s = one("SELECT id, shop_name, name, verified FROM users WHERE id = ?", l.seller_id);
    const lots = all("SELECT * FROM auctions WHERE live_id = ? AND moderation = 'approved' ORDER BY id", l.id);
    const cur = l.current_auction ? one("SELECT * FROM auctions WHERE id = ?", l.current_auction) : null;
    return {
      ...l,
      seller: { id: s.id, name: s.shop_name || s.name, verified: !!s.verified },
      lots: lots.map((a) => auctionView(a, viewerId)),
      current: cur ? auctionView(cur, viewerId) : null,
    };
  };
  const emitLive = (id) => io.to(`live:${id}`).emit("live:update", { id });
  io.on("connection", (socket) => {
    socket.on("live:join", (id) => socket.join(`live:${Number(id)}`));
    socket.on("live:leave", (id) => socket.leave(`live:${Number(id)}`));
  });

  app.get("/api/lives", (req, res) =>
    res.json({
      items: all(
        "SELECT * FROM lives WHERE status != 'ended' OR starts_at > ? ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, starts_at LIMIT 30",
        Date.now() - 24 * H,
      ).map((l) => liveView(l, req.user?.id)),
    }),
  );
  app.get(
    "/api/lives/:id",
    wrap((req, res) => {
      const l = one("SELECT * FROM lives WHERE id = ?", Number(req.params.id));
      if (!l) throw bad("Live introuvable.", 404);
      const chat = all("SELECT c.id, c.body, c.created_at, u.name FROM live_chat c JOIN users u ON u.id = c.user_id WHERE live_id = ? ORDER BY c.id DESC LIMIT 60", l.id)
        .reverse()
        .map((c) => ({ id: c.id, body: c.body, created_at: c.created_at, name: maskName(c.name) }));
      res.json({ live: liveView(l, req.user?.id), chat });
    }),
  );
  const STREAM_RE = /^https:\/\/(www\.)?(youtube\.com|youtu\.be|facebook\.com|fb\.watch|tiktok\.com|vm\.tiktok\.com|instagram\.com)\//i;
  app.post(
    "/api/lives",
    requireRole("seller", "admin"),
    wrap((req, res) => {
      const b = req.body;
      const title = String(b.title || "").trim();
      if (title.length < 4) throw bad("Donne un titre à ton live.");
      const url = String(b.stream_url || "").trim();
      if (url && !STREAM_RE.test(url)) throw bad("Lien de diffusion : YouTube, Facebook, TikTok ou Instagram.");
      const ids = (Array.isArray(b.auction_ids) ? b.auction_ids : []).map(Number);
      if (!ids.length) throw bad("Choisis au moins une vente à présenter.");
      const own = all(`SELECT id FROM auctions WHERE seller_id = ? AND status = 'live' AND id IN (${ids.map(() => "?").join(",")})`, req.user.id, ...ids);
      if (own.length !== ids.length) throw bad("Certaines ventes ne t'appartiennent pas ou sont terminées.");
      const starts = Number(new Date(b.starts_at || Date.now()).getTime()) || Date.now();
      const r = run("INSERT INTO lives (seller_id, title, stream_url, starts_at, created_at) VALUES (?,?,?,?,?)", req.user.id, title.slice(0, 90), url || null, starts, Date.now());
      for (const a of own) run("UPDATE auctions SET live_id = ? WHERE id = ?", r.lastInsertRowid, a.id);
      res.json({ live: liveView(one("SELECT * FROM lives WHERE id = ?", r.lastInsertRowid), req.user.id) });
    }),
  );
  app.post(
    "/api/lives/:id/chat",
    requireUser,
    wrap((req, res) => {
      const l = one("SELECT * FROM lives WHERE id = ?", Number(req.params.id));
      if (!l || l.status === "ended") throw bad("Live terminé.");
      const body = String(req.body.body || "").trim().slice(0, 200);
      if (!body) throw bad("Message vide.");
      const recent = one("SELECT created_at FROM live_chat WHERE user_id = ? ORDER BY id DESC LIMIT 1", req.user.id);
      if (recent && Date.now() - recent.created_at < 1500) throw bad("Doucement 🙂", 429);
      const r = run("INSERT INTO live_chat (live_id, user_id, body, created_at) VALUES (?,?,?,?)", l.id, req.user.id, body, Date.now());
      io.to(`live:${l.id}`).emit("live:chat", { id: Number(r.lastInsertRowid), body, name: maskName(req.user.name), created_at: Date.now(), seller: req.user.id === l.seller_id });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/lives/:id/:action",
    requireRole("seller", "admin"),
    wrap((req, res) => {
      const l = one("SELECT * FROM lives WHERE id = ?", Number(req.params.id));
      if (!l || (l.seller_id !== req.user.id && req.user.role !== "admin")) throw bad("Live introuvable.", 404);
      const lots = all("SELECT id, status FROM auctions WHERE live_id = ? ORDER BY id", l.id);
      const liveLots = lots.filter((a) => a.status === "live");
      const now = Date.now();
      switch (req.params.action) {
        case "start": {
          run("UPDATE lives SET status = 'live', starts_at = ?, current_auction = ? WHERE id = ?", now, liveLots[0]?.id ?? null, l.id);
          const shop = one("SELECT shop_name, name FROM users WHERE id = ?", l.seller_id);
          for (const f of all("SELECT user_id FROM follows WHERE seller_id = ?", l.seller_id))
            notify(f.user_id, "live", `${shop.shop_name || shop.name} est en direct`, l.title, `/live/${l.id}`);
          break;
        }
        case "next": {
          const idx = liveLots.findIndex((a) => a.id === l.current_auction);
          const next = liveLots[idx + 1] || liveLots.find((a) => a.id !== l.current_auction) || null;
          run("UPDATE lives SET current_auction = ? WHERE id = ?", next?.id ?? null, l.id);
          break;
        }
        case "hammer": {
          // « Une fois, deux fois… » : le lot en cours se termine dans 20 secondes (prolongé si une offre arrive)
          const a = l.current_auction && one("SELECT * FROM auctions WHERE id = ? AND status = 'live'", l.current_auction);
          if (!a) throw bad("Aucun lot en cours.");
          run("UPDATE auctions SET ends_at = MIN(ends_at, ?) WHERE id = ?", now + 20_000, a.id);
          io.to(`live:${l.id}`).emit("live:hammer", { auction_id: a.id, ends_at: Math.min(a.ends_at, now + 20_000) });
          io.to(`auction:${a.id}`).emit("bid", { auction_id: a.id, amount: a.current_price, price: a.current_price, bids_count: a.bids_count, next_min: nextMin(a), ends_at: Math.min(a.ends_at, now + 20_000), extended: false, added: [], mode: a.mode, bidder: null, bidder_id: a.leader_id });
          break;
        }
        case "end":
          run("UPDATE lives SET status = 'ended' WHERE id = ?", l.id);
          break;
        default:
          throw bad("Action inconnue.");
      }
      emitLive(l.id);
      res.json({ live: liveView(one("SELECT * FROM lives WHERE id = ?", l.id), req.user.id) });
    }),
  );

  // ---------- SEO ----------
  app.get("/robots.txt", (_req, res) => res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /compte\nSitemap: ${PUBLIC_URL()}/sitemap.xml\n`));
  app.get("/sitemap.xml", (_req, res) => {
    const base = PUBLIC_URL();
    const urls = [
      "/",
      "/encheres",
      "/carte",
      "/arrivages",
      "/live",
      "/demandes",
      "/vendre",
      "/regles",
      ...CATEGORIES.map((c) => `/encheres?category=${encodeURIComponent(c)}`),
      ...all("SELECT id FROM auctions WHERE moderation = 'approved' AND status = 'live' ORDER BY id DESC LIMIT 2000").map((a) => `/enchere/${a.id}`),
      ...all("SELECT id FROM users WHERE role = 'seller' AND deleted = 0").map((u) => `/boutique/${u.id}`),
    ];
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}${u.replace(/&/g, "&amp;")}</loc></url>`).join("\n")}\n</urlset>`,
    );
  });
}
