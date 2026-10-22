import express from "express";
import { createServer } from "node:http";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { UPLOAD_DIR, all, one, run, tx } from "./db.js";
import { attachUser, checkPassword, hashPassword, issueToken, publicUser, readToken, requireRole, requireUser } from "./auth.js";
import { BidError, auctionView, buyNow, fcfa, maskName, notify, placeBid, releaseFunds, setIO, tick } from "./engine.js";
import { CATEGORIES, CITIES, COMMISSION_RATE, CONDITIONS, PRO_PRICE, deliveryFee, increment } from "./rules.js";
import { PAYDUNYA_ENABLED, REAL_PAYMENTS, WAVE_ENABLED, confirmPaydunya, createCheckout, verifyPaydunyaHash, verifyWaveSignature } from "./payments.js";
import { SMS_ENABLED, WA_ENABLED, sendSMS, sendWhatsApp } from "./messaging.js";
import { startDemo } from "./demo.js";
import { buyerReliability, deviceFlags, notifyMatches, onPaid, registerV3, trackEvent } from "./v3.js";
import { queuePayout } from "./payouts.js";
import { searchText } from "./text.js";
import { AI_ENABLED, aiStatus, chat, draftListing, reviewInBackground } from "./ai.js";
import { RELAY_FEE, SIZES, DEPOSIT_AMOUNT, DEPOSIT_THRESHOLD } from "./rules.js";

const PROD = process.env.NODE_ENV === "production";
const DEMO = process.env.DEMO_MODE ? process.env.DEMO_MODE === "1" : !REAL_PAYMENTS;
const PORT = Number(process.env.PORT || 4000);
const here = dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: PROD ? false : "*" } });
setIO(io);

app.disable("x-powered-by");
// En-têtes de sécurité
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' ws: wss:",
      "frame-src https://www.youtube.com https://www.facebook.com",
      "worker-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  if (PROD) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.set("trust proxy", 1); // derrière Nginx/Caddy : req.ip = vraie IP du client
app.post("/api/webhooks/paydunya", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const data = req.body?.data || {};
    if (!verifyPaydunyaHash(data.hash)) return res.status(401).end();
    const token = data.invoice?.token;
    const check = token ? await confirmPaydunya(token) : { completed: false };
    if (check.completed && check.paymentId) {
      const p = one("SELECT amount FROM payments WHERE id = ?", check.paymentId);
      if (p && check.amount >= p.amount) paymentHandler(check.paymentId, token);
    }
    const o = one("SELECT * FROM orders WHERE id = ?", check.orderId);
    if (check.completed && o && check.amount >= o.amount + o.delivery_fee) markPaid(o.id, "paydunya", token);
    res.json({ ok: true });
  } catch (e) {
    console.error("[paydunya]", e);
    res.status(500).end();
  }
});
app.post("/api/webhooks/wave", express.raw({ type: "*/*" }), (req, res) => {
  const raw = req.body.toString("utf8");
  if (!verifyWaveSignature(raw, req.headers["wave-signature"])) return res.status(401).end();
  const evt = JSON.parse(raw);
  if (evt.type === "checkout.session.completed" && evt.data?.payment_status === "succeeded") {
    const id = Number(String(evt.data.client_reference || "").replace("order-", ""));
    markPaid(id, "wave", evt.data.id);
  }
  res.json({ ok: true });
});
// Limiteur simple par IP et par minute (protège la démo publique)
const hits = new Map();
function limit(key, max) {
  return (req, res, next) => {
    const k = `${key}:${req.ip}`;
    const now = Date.now();
    const h = hits.get(k) || { n: 0, t: now };
    if (now - h.t > 60_000) Object.assign(h, { n: 0, t: now });
    h.n++;
    hits.set(k, h);
    if (h.n > max) return res.status(429).json({ error: "Trop de requêtes. Patiente une minute." });
    next();
  };
}
setInterval(() => {
  const old = Date.now() - 120_000;
  for (const [k, h] of hits) if (h.t < old) hits.delete(k);
}, 60_000);
app.use("/api", limit("api", 400));
app.use("/api/auctions/:id/bid", limit("bid", 40));
app.use("/api/auth", limit("auth", 20));
app.use("/api/ai", limit("ai", 12));
app.use(express.json({ limit: "25mb", verify: (req, _res, buf) => (req.rawBody = buf) }));
app.use(attachUser);
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d", immutable: true }));

const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    if (out instanceof Promise) out.catch((e) => fail(res, e));
  } catch (e) {
    fail(res, e);
  }
};
function fail(res, e) {
  if (e instanceof BidError || e.status) return res.status(e.status || 400).json({ error: e.message });
  console.error(e);
  res.status(500).json({ error: "Erreur serveur. Réessaie." });
}
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// ---------- Auth ----------
const loginAttempts = new Map();
const normPhone = (p) => String(p || "").replace(/[^\d+]/g, "").replace(/^\+?221/, "");

let paymentHandler = () => false;
registerV3(app, {
  wrap,
  bad,
  requireUser,
  requireRole,
  io,
  getOrderFor,
  saveImage,
  DEMO,
  announce,
  setPaymentHandler: (fn) => (paymentHandler = fn),
});

// ---------- Codes SMS (OTP) ----------
const otpHash = (phone, purpose, code) => createHash("sha256").update(`${phone}:${purpose}:${code}`).digest("hex");

app.post(
  "/api/auth/otp",
  wrap(async (req, res) => {
    const phone = normPhone(req.body.phone);
    const purpose = req.body.purpose === "reset" ? "reset" : "register";
    if (!/^7[05678]\d{7}$/.test(phone)) throw bad("Numéro sénégalais invalide (ex. 77 123 45 67).");
    const exists = one("SELECT 1 FROM users WHERE phone = ?", phone);
    if (purpose === "register" && exists) throw bad("Ce numéro a déjà un compte. Connecte-toi.");
    if (purpose === "reset" && !exists) throw bad("Aucun compte avec ce numéro.");
    const prev = one("SELECT created_at FROM otp_codes WHERE phone = ? AND purpose = ?", phone, purpose);
    if (prev && Date.now() - prev.created_at < 60_000) throw bad("Patiente une minute avant de redemander un code.", 429);
    const code = String(randomInt(100000, 1000000));
    run(
      "INSERT OR REPLACE INTO otp_codes (phone, purpose, code_hash, expires_at, tries, created_at) VALUES (?,?,?,?,0,?)",
      phone,
      purpose,
      otpHash(phone, purpose, code),
      Date.now() + 10 * 60_000,
      Date.now(),
    );
    await sendSMS(phone, `Babylone : ton code est ${code}. Il expire dans 10 minutes. Ne le partage avec personne.`);
    res.json({ sent: true, ...(DEMO && !SMS_ENABLED ? { dev_code: code } : {}) });
  }),
);

function checkOtp(phone, purpose, code) {
  const row = one("SELECT * FROM otp_codes WHERE phone = ? AND purpose = ?", phone, purpose);
  if (!row || row.expires_at < Date.now()) throw bad("Code expiré. Demande un nouveau code.");
  if (row.tries >= 5) throw bad("Trop d'essais. Demande un nouveau code.", 429);
  if (row.code_hash !== otpHash(phone, purpose, String(code || "").trim())) {
    run("UPDATE otp_codes SET tries = tries + 1 WHERE phone = ? AND purpose = ?", phone, purpose);
    throw bad("Code incorrect.");
  }
  run("DELETE FROM otp_codes WHERE phone = ? AND purpose = ?", phone, purpose);
}

const newReferral = (name) =>
  `${String(name).normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 5).toUpperCase() || "BABY"}${randomInt(100, 1000)}`;

app.post(
  "/api/auth/reset",
  wrap((req, res) => {
    const phone = normPhone(req.body.phone);
    if (!req.body.password || String(req.body.password).length < 6) throw bad("Mot de passe : 6 caractères minimum.");
    checkOtp(phone, "reset", req.body.code);
    const { salt, hash } = hashPassword(String(req.body.password));
    run("UPDATE users SET password_hash = ?, salt = ?, phone_verified = 1 WHERE phone = ?", hash, salt, phone);
    const user = one("SELECT * FROM users WHERE phone = ?", phone);
    res.json({ token: issueToken(user.id), user: publicUser(user) });
  }),
);

app.post(
  "/api/auth/register",
  wrap((req, res) => {
    const { name, password, role = "buyer", city = "Thiès", shop_name } = req.body;
    const phone = normPhone(req.body.phone);
    if (!/^7[05678]\d{7}$/.test(phone)) throw bad("Numéro sénégalais invalide (ex. 77 123 45 67).");
    if (!name || String(name).trim().length < 2) throw bad("Indique ton nom.");
    if (!password || String(password).length < 6) throw bad("Mot de passe : 6 caractères minimum.");
    if (!["buyer", "seller"].includes(role)) throw bad("Rôle invalide.");
    if (!CITIES[city]) throw bad("Ville inconnue.");
    if (req.body.accept_terms !== true) throw bad("Accepte les conditions générales et la politique de confidentialité pour créer ton compte.");
    if (one("SELECT 1 FROM users WHERE phone = ?", phone)) throw bad("Ce numéro a déjà un compte. Connecte-toi.");
    checkOtp(phone, "register", req.body.code);
    const referrer = req.body.ref ? one("SELECT id FROM users WHERE referral_code = ?", String(req.body.ref).toUpperCase()) : null;
    const { salt, hash } = hashPassword(String(password));
    const r = run(
      `INSERT INTO users (phone, name, role, password_hash, salt, city, shop_name, phone_verified, referral_code, referred_by, last_ip, created_at, terms_accepted_at)
       VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?)`,
      phone,
      String(name).trim().slice(0, 60),
      role,
      hash,
      salt,
      city,
      role === "seller" ? String(shop_name || name).trim().slice(0, 60) : null,
      newReferral(name),
      referrer?.id ?? null,
      req.ip,
      Date.now(),
      Date.now(),
    );
    trackEvent("signup", { userId: Number(r.lastInsertRowid) });
    if (referrer) notify(referrer.id, "referral", "Nouveau filleul", `${String(name).trim().split(" ")[0]} s'est inscrit avec ton code.`, "/compte/parrainage");
    const user = one("SELECT * FROM users WHERE id = ?", r.lastInsertRowid);
    notify(
      user.id,
      "welcome",
      "Bienvenue sur Babylone",
      role === "seller" ? "Publie ta première vente : 0 % de commission ce mois-ci." : "Suis une vente et place ta première offre.",
      role === "seller" ? "/vendeur" : "/encheres",
    );
    res.json({ token: issueToken(user.id), user: publicUser(user) });
  }),
);

app.post(
  "/api/auth/login",
  wrap((req, res) => {
    const phone = normPhone(req.body.phone);
    const tries = loginAttempts.get(phone) || { n: 0, at: 0 };
    if (tries.n >= 5 && Date.now() - tries.at < 10 * 60 * 1000) throw bad("Trop d'essais. Réessaie dans 10 minutes.", 429);
    const user = one("SELECT * FROM users WHERE phone = ?", phone);
    if (!user || !checkPassword(String(req.body.password || ""), user)) {
      loginAttempts.set(phone, { n: tries.n + 1, at: Date.now() });
      throw bad("Numéro ou mot de passe incorrect.", 401);
    }
    loginAttempts.delete(phone);
    if (user.blocked) throw bad("Compte suspendu. Contacte le support.", 403);
    run("UPDATE users SET last_ip = ? WHERE id = ?", req.ip, user.id);
    res.json({ token: issueToken(user.id), user: publicUser(user) });
  }),
);

app.get("/api/me", requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

app.post(
  "/api/me/settings",
  requireUser,
  wrap((req, res) => {
    if (typeof req.body.whatsapp === "boolean") run("UPDATE users SET whatsapp = ? WHERE id = ?", req.body.whatsapp ? 1 : 0, req.user.id);
    res.json({ user: publicUser(one("SELECT * FROM users WHERE id = ?", req.user.id)) });
  }),
);

app.get(
  "/api/me/referrals",
  requireUser,
  wrap((req, res) => {
    let code = req.user.referral_code;
    if (!code) {
      code = newReferral(req.user.name);
      run("UPDATE users SET referral_code = ? WHERE id = ?", code, req.user.id);
    }
    const list = all("SELECT name, role, created_at FROM users WHERE referred_by = ? ORDER BY id DESC", req.user.id);
    res.json({ code, referrals: list.map((u) => ({ name: maskName(u.name), role: u.role, created_at: u.created_at })) });
  }),
);

app.get("/api/meta", (_req, res) =>
  res.json({
    categories: CATEGORIES,
    cities: Object.keys(CITIES),
    conditions: CONDITIONS,
    commission_rate: COMMISSION_RATE,
    pro_price: PRO_PRICE,
    demo: DEMO,
    wave: WAVE_ENABLED,
    paydunya: PAYDUNYA_ENABLED,
    sizes: SIZES,
    relay_fee: RELAY_FEE,
    deposit_amount: DEPOSIT_AMOUNT,
    deposit_threshold: DEPOSIT_THRESHOLD,
    sms: SMS_ENABLED,
    whatsapp: WA_ENABLED,
    ai: AI_ENABLED,
    support_whatsapp: String(process.env.SUPPORT_WHATSAPP || "").replace(/\D/g, "") || null,
  }),
);

// ---------- Assistant IA ----------
app.post(
  "/api/ai/chat",
  wrap(async (req, res) => res.json(await chat(req.body.messages, req.user))),
);
app.post(
  "/api/ai/listing",
  requireRole("seller", "admin"),
  wrap(async (req, res) => res.json({ draft: await draftListing({ images: req.body.images, notes: req.body.notes }) })),
);

// ---------- Ventes ----------
app.get(
  "/api/auctions/:id",
  wrap((req, res) => {
    const a = one("SELECT * FROM auctions WHERE id = ?", Number(req.params.id));
    if (!a) throw bad("Vente introuvable.", 404);
    if (a.moderation !== "approved" && req.user?.id !== a.seller_id && req.user?.role !== "admin") throw bad("Vente introuvable.", 404);
    run("UPDATE auctions SET views = views + 1 WHERE id = ?", a.id);
    const bids = all(
      `SELECT b.id, b.amount, b.created_at, b.user_id, b.auto, u.name FROM bids b JOIN users u ON u.id = b.user_id
       WHERE auction_id = ? ORDER BY amount DESC, b.id ASC LIMIT 40`,
      a.id,
    ).map((b) => ({
      id: b.id,
      amount: b.amount,
      created_at: b.created_at,
      mine: b.user_id === req.user?.id,
      auto: !!b.auto,
      bidder: b.name.split(" ")[0] + (b.name.split(" ")[1] ? ` ${b.name.split(" ")[1][0]}.` : ""),
    }));
    const order = req.user
      ? one("SELECT id, status FROM orders WHERE auction_id = ? AND buyer_id = ? ORDER BY id DESC", a.id, req.user.id)
      : null;
    res.json({ auction: auctionView(a, req.user?.id), bids, increment: increment(a.current_price), my_order: order || null });
  }),
);

app.post(
  "/api/auctions/:id/bid",
  requireUser,
  wrap((req, res) => {
    const bid = placeBid(req.user, Number(req.params.id), req.body.amount, req.body.max_auto, req.ip);
    deviceFlags(req.user, Number(req.params.id));
    trackEvent("bid", { userId: req.user.id });
    res.json({ ok: true, bid });
  }),
);

app.post(
  "/api/auctions/:id/buy",
  requireUser,
  wrap((req, res) => res.json({ ok: true, order_id: buyNow(req.user, Number(req.params.id), req.ip) })),
);

app.post(
  "/api/auctions/:id/watch",
  requireUser,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const exists = one("SELECT 1 FROM watches WHERE user_id = ? AND auction_id = ?", req.user.id, id);
    if (exists) run("DELETE FROM watches WHERE user_id = ? AND auction_id = ?", req.user.id, id);
    else run("INSERT INTO watches (user_id, auction_id) VALUES (?,?)", req.user.id, id);
    res.json({ watching: !exists });
  }),
);

const MAX_UPLOADS_BYTES = Number(process.env.MAX_UPLOADS_MB || 800) * 1024 * 1024;
function uploadsSize() {
  let total = 0;
  for (const f of readdirSync(UPLOAD_DIR)) total += statSync(join(UPLOAD_DIR, f)).size;
  return total;
}

function saveImage(dataUrl) {
  if (uploadsSize() > MAX_UPLOADS_BYTES) throw bad("Stockage des photos plein. Réessaie plus tard.", 507);
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUrl));
  if (!m) throw bad("Image invalide (JPEG, PNG ou WebP).");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 4 * 1024 * 1024) throw bad("Image trop lourde (4 Mo max).");
  const sig = buf.subarray(0, 12).toString("hex");
  const ok = sig.startsWith("ffd8ff") || sig.startsWith("89504e47") || buf.subarray(8, 12).toString() === "WEBP";
  if (!ok) throw bad("Fichier image non reconnu.");
  const name = `${randomBytes(10).toString("hex")}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  writeFileSync(join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

app.post(
  "/api/auctions",
  requireRole("seller", "admin"),
  wrap((req, res) => {
    const b = req.body;
    const title = String(b.title || "").trim();
    if (title.length < 4) throw bad("Titre trop court.");
    if (!CATEGORIES.includes(b.category)) throw bad("Choisis une catégorie.");
    if (!CONDITIONS.includes(b.condition)) throw bad("Choisis l'état du produit.");
    const city = CITIES[b.city] ? b.city : req.user.city;
    const start = Math.round(Number(b.start_price));
    const reserve = Math.round(Number(b.reserve_price || 0));
    const quantity = Math.max(1, Math.min(1000, Math.round(Number(b.quantity) || 1)));
    const mode = b.mode === "multi" ? "multi" : "lot";
    const proSeller = req.user.plan_until && req.user.plan_until > Date.now();
    const flash = b.flash && (proSeller || req.user.role === "admin") ? 1 : 0;
    const size = SIZES.includes(String(b.size || "").toUpperCase()) ? String(b.size).toUpperCase() : null;
    if (mode === "multi" && quantity < 2) throw bad("Une vente multiple demande au moins 2 pièces.");
    const buyNowPrice = mode === "lot" ? Math.round(Number(b.buy_now_price || 0)) : 0;
    const hours = Math.max(1, Math.min(168, Number(b.duration_hours) || 24));
    if (!(start >= (flash ? 100 : 500))) throw bad(`Prix de départ : ${flash ? 100 : 500} FCFA minimum.`);
    if (flash && hours > 6) throw bad("Une vente flash dure 6 heures maximum.");
    if (reserve && reserve < start) throw bad("Le prix de réserve doit être au-dessus du prix de départ.");
    if (buyNowPrice && buyNowPrice <= Math.max(start, reserve)) throw bad("Le prix d'achat immédiat doit dépasser le départ et la réserve.");
    const images = (Array.isArray(b.images) ? b.images : []).slice(0, 6);
    if (!images.length) throw bad("Ajoute au moins une photo réelle du produit.");
    const urls = images.map((img) => (String(img).startsWith("/uploads/") ? img : saveImage(img)));
    const thumbs = Array.isArray(b.thumbs) && b.thumbs.length === images.length ? b.thumbs.map((img) => (String(img).startsWith("/uploads/") ? img : saveImage(img))) : null;
    const live = one("SELECT COUNT(*) n FROM auctions WHERE seller_id = ? AND status = 'live'", req.user.id).n;
    const pro = req.user.plan_until && req.user.plan_until > Date.now();
    if (!pro && live >= 10) throw bad("Offre Standard : 10 ventes en cours maximum. Passe en Pro pour un catalogue illimité.");
    const now = Date.now();
    // Vendeur pas encore vérifié : l'annonce attend la validation d'un admin
    const moderation = req.user.verified || req.user.role === "admin" ? "approved" : "pending";
    const r = run(
      `INSERT INTO auctions (seller_id, title, description, category, condition, city, region, images, quantity, start_price, reserve_price,
        current_price, starts_at, ends_at, created_at, mode, buy_now_price, moderation, size, flash, thumbs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      req.user.id,
      title.slice(0, 90),
      String(b.description || "").slice(0, 2000),
      b.category,
      b.condition,
      city,
      CITIES[city],
      JSON.stringify(urls),
      quantity,
      start,
      reserve,
      start,
      now,
      now + hours * 3600 * 1000,
      now,
      mode,
      buyNowPrice,
      moderation,
      size,
      flash,
      thumbs ? JSON.stringify(thumbs) : null,
    );
    run("UPDATE auctions SET search_text = ? WHERE id = ?", searchText(one("SELECT * FROM auctions WHERE id = ?", r.lastInsertRowid)), r.lastInsertRowid);
    const a = one("SELECT * FROM auctions WHERE id = ?", r.lastInsertRowid);
    reviewInBackground(a.id);
    if (moderation === "pending") {
      for (const ad of all("SELECT id FROM users WHERE role = 'admin'")) notify(ad.id, "moderation", "Annonce à valider", a.title, "/admin");
      return res.json({ auction: auctionView(a, req.user.id), notified: 0, pending: true });
    }
    const notified = announce(a, req.user.id);
    res.json({ auction: auctionView(a, req.user.id), notified });
  }),
);

// Publication effective : prévient l'espace demande et le fil en direct
function announce(a, sellerId) {
  const reqs = all("SELECT id, user_id, title FROM requests WHERE status = 'open' AND category = ?", a.category);
  const notified = new Set();
  for (const rq of reqs) {
    const voters = all("SELECT user_id FROM request_votes WHERE request_id = ?", rq.id).map((v) => v.user_id);
    for (const uid of new Set([rq.user_id, ...voters])) {
      if (notified.has(uid) || uid === sellerId) continue;
      notified.add(uid);
      notify(uid, "match", "Ta demande est disponible", `« ${rq.title} » : ${a.title} vient d'être mis en vente.`, `/enchere/${a.id}`);
    }
  }
  notifyMatches(a);
  io.emit("feed:new", auctionView(a));
  return notified.size;
}

app.post(
  "/api/auctions/:id/cancel",
  requireRole("seller", "admin"),
  wrap((req, res) => {
    const a = one("SELECT * FROM auctions WHERE id = ?", Number(req.params.id));
    if (!a || (a.seller_id !== req.user.id && req.user.role !== "admin")) throw bad("Vente introuvable.", 404);
    if (a.status !== "live") throw bad("Vente déjà terminée.");
    if (a.bids_count > 0) throw bad("Impossible d'annuler : des offres ont déjà été faites.");
    run("UPDATE auctions SET status = 'cancelled' WHERE id = ?", a.id);
    io.emit("feed:ended", { auction_id: a.id });
    res.json({ ok: true });
  }),
);

app.post(
  "/api/auctions/:id/boost",
  requireRole("seller"),
  wrap((req, res) => {
    if (!(req.user.plan_until > Date.now())) throw bad("La mise en avant est réservée à l'offre Pro.");
    const a = one("SELECT * FROM auctions WHERE id = ? AND seller_id = ?", Number(req.params.id), req.user.id);
    if (!a) throw bad("Vente introuvable.", 404);
    run("UPDATE auctions SET boosted = 1 - boosted WHERE id = ?", a.id);
    res.json({ boosted: !a.boosted });
  }),
);

// ---------- Statistiques publiques & fil en direct ----------
app.get("/api/stats", (_req, res) => {
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  res.json({
    live: one("SELECT COUNT(*) n FROM auctions WHERE status = 'live' AND moderation = 'approved'").n,
    bids_24h: one("SELECT COUNT(*) n FROM bids WHERE created_at > ?", dayAgo).n,
    sold_total: one("SELECT COUNT(*) n FROM orders WHERE status IN ('paid','shipped','delivered','released')").n,
    lives: one("SELECT COUNT(*) n FROM lives WHERE status = 'live'").n,
    sellers: one("SELECT COUNT(*) n FROM users WHERE role = 'seller'").n,
    buyers: one("SELECT COUNT(*) n FROM users WHERE role = 'buyer'").n,
    by_region: all("SELECT region, COUNT(*) n, SUM(bids_count) bids FROM auctions WHERE status = 'live' AND moderation = 'approved' GROUP BY region"),
    by_category: all("SELECT category, COUNT(*) n FROM auctions WHERE status = 'live' AND moderation = 'approved' GROUP BY category"),
  });
});

app.get("/api/feed", (_req, res) => {
  const rows = all(
    `SELECT b.amount, b.created_at, u.name, a.id auction_id, a.title, a.region, a.city, a.images FROM bids b
     JOIN users u ON u.id = b.user_id JOIN auctions a ON a.id = b.auction_id ORDER BY b.id DESC LIMIT 20`,
  );
  res.json({
    feed: rows.map((r) => ({
      auction_id: r.auction_id,
      amount: r.amount,
      created_at: r.created_at,
      bidder: r.name.split(" ")[0],
      title: r.title,
      region: r.region,
      city: r.city,
      image: JSON.parse(r.images)[0],
    })),
  });
});

// ---------- Espace acheteur ----------
app.get(
  "/api/me/bids",
  requireUser,
  wrap((req, res) => {
    const rows = all(
      `SELECT a.*, MAX(b.amount) my_max FROM bids b JOIN auctions a ON a.id = b.auction_id
       WHERE b.user_id = ? GROUP BY a.id ORDER BY a.status = 'live' DESC, a.ends_at ASC`,
      req.user.id,
    );
    res.json({ items: rows.map((a) => ({ ...auctionView(a, req.user.id), my_max: a.my_max })) });
  }),
);

app.get(
  "/api/me/watch",
  requireUser,
  wrap((req, res) => {
    const rows = all(
      "SELECT a.* FROM watches w JOIN auctions a ON a.id = w.auction_id WHERE w.user_id = ? ORDER BY a.status = 'live' DESC, a.ends_at",
      req.user.id,
    );
    res.json({ items: rows.map((a) => auctionView(a, req.user.id)) });
  }),
);

function orderView(o, viewer) {
  const a = one("SELECT * FROM auctions WHERE id = ?", o.auction_id);
  const buyer = one("SELECT name, phone, city FROM users WHERE id = ?", o.buyer_id);
  const seller = one("SELECT name, shop_name, phone, city FROM users WHERE id = ?", o.seller_id);
  const review = one("SELECT rating, comment FROM reviews WHERE order_id = ?", o.id);
  const isParty = viewer && (viewer.id === o.buyer_id || viewer.id === o.seller_id || viewer.role === "admin");
  const showContacts = isParty && ["paid", "shipped", "delivered", "released"].includes(o.status);
  return {
    ...o,
    me: viewer?.id === o.buyer_id ? "buyer" : viewer?.id === o.seller_id ? "seller" : "admin",
    total: o.amount + o.delivery_fee,
    payout: o.amount - o.commission,
    auction: { id: a.id, title: a.title, image: JSON.parse(a.images)[0], quantity: a.quantity, city: a.city },
    buyer: { name: buyer.name, city: buyer.city, phone: showContacts ? buyer.phone : undefined },
    seller: { name: seller.shop_name || seller.name, city: seller.city, phone: showContacts ? seller.phone : undefined },
    review: review || null,
    delivery_code: viewer?.id === o.buyer_id || viewer?.role === "admin" ? o.delivery_code : undefined,
    relay: o.relay_id ? one("SELECT * FROM relay_points WHERE id = ?", o.relay_id) : null,
    buyer_reliability: viewer?.id === o.seller_id || viewer?.role === "admin" ? buyerReliability(o.buyer_id) : undefined,
    buyer_review: one("SELECT rating, comment FROM buyer_reviews WHERE order_id = ?", o.id) || null,
    payout_status:
      viewer?.id === o.seller_id || viewer?.role === "admin"
        ? one("SELECT status, method, account FROM payouts WHERE order_id = ? AND kind = 'seller_payout' ORDER BY id DESC", o.id) || null
        : undefined,
    messages: one("SELECT COUNT(*) n FROM order_messages WHERE order_id = ?", o.id).n,
  };
}

app.get(
  "/api/me/orders",
  requireUser,
  wrap((req, res) => {
    const rows = all("SELECT * FROM orders WHERE buyer_id = ? ORDER BY id DESC", req.user.id);
    res.json({ orders: rows.map((o) => orderView(o, req.user)) });
  }),
);

function getOrderFor(req) {
  const o = one("SELECT * FROM orders WHERE id = ?", Number(req.params.id));
  if (!o) throw bad("Commande introuvable.", 404);
  if (![o.buyer_id, o.seller_id].includes(req.user.id) && req.user.role !== "admin") throw bad("Commande introuvable.", 404);
  return o;
}

app.get(
  "/api/orders/:id",
  requireUser,
  wrap((req, res) => res.json({ order: orderView(getOrderFor(req), req.user) })),
);

function markPaid(orderId, provider, ref) {
  const o = one("SELECT * FROM orders WHERE id = ?", orderId);
  if (!o || o.status !== "awaiting_payment") return false;
  run("UPDATE orders SET status = 'paid', provider = ?, payment_ref = ?, updated_at = ? WHERE id = ?", provider, ref, Date.now(), o.id);
  onPaid(o);
  const a = one("SELECT title FROM auctions WHERE id = ?", o.auction_id);
  notify(o.buyer_id, "paid", "Paiement reçu", `${a.title} : ton argent est sécurisé jusqu'à la livraison.`, `/compte/commandes/${o.id}`);
  notify(o.seller_id, "to_ship", "À expédier", `${a.title} est payé. Prépare la livraison.`, `/vendeur`);
  io.to(`user:${o.buyer_id}`).to(`user:${o.seller_id}`).emit("order", { id: o.id, status: "paid" });
  return true;
}

app.post(
  "/api/orders/:id/pay",
  requireUser,
  wrap(async (req, res) => {
    const o = getOrderFor(req);
    if (o.buyer_id !== req.user.id) throw bad("Seul l'acheteur peut payer.", 403);
    if (o.status !== "awaiting_payment") throw bad("Cette commande n'attend pas de paiement.");
    const provider = ["wave", "orange_money"].includes(req.body.provider) ? req.body.provider : "wave";
    const relay = req.body.delivery_mode === "relay" ? one("SELECT * FROM relay_points WHERE id = ?", Number(req.body.relay_id)) : null;
    if (req.body.delivery_mode === "relay" && !relay) throw bad("Choisis un point relais.");
    const address = relay ? `${relay.name}, ${relay.address}` : String(req.body.address || "").trim();
    if (address.length < 5) throw bad("Indique ton adresse de livraison.");
    const a0 = one("SELECT city FROM auctions WHERE id = ?", o.auction_id);
    const buyerCity = one("SELECT city FROM users WHERE id = ?", o.buyer_id)?.city;
    const fee = relay ? RELAY_FEE : deliveryFee(a0.city, buyerCity || a0.city);
    run(
      "UPDATE orders SET address = ?, provider = ?, delivery_mode = ?, relay_id = ?, delivery_fee = ?, updated_at = ? WHERE id = ?",
      address.slice(0, 200),
      provider,
      relay ? "relay" : "home",
      relay?.id ?? null,
      fee,
      Date.now(),
      o.id,
    );
    const fresh = one("SELECT * FROM orders WHERE id = ?", o.id);
    const checkout = await createCheckout(fresh, provider, one("SELECT title FROM auctions WHERE id = ?", o.auction_id)?.title);
    run("UPDATE orders SET payment_ref = ? WHERE id = ?", checkout.ref, o.id);
    res.json(checkout);
  }),
);

app.post(
  "/api/orders/:id/demo-confirm",
  requireUser,
  wrap((req, res) => {
    if (!DEMO) throw bad("Mode démo désactivé.", 403);
    const o = getOrderFor(req);
    if (o.buyer_id !== req.user.id) throw bad("Seul l'acheteur peut payer.", 403);
    markPaid(o.id, o.provider || "wave", o.payment_ref || `demo-${o.id}`);
    res.json({ ok: true });
  }),
);

function setStatus(o, from, to, who) {
  if (o.status !== from) throw bad("Action impossible à cette étape.");
  run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", to, Date.now(), o.id);
  io.to(`user:${o.buyer_id}`).to(`user:${o.seller_id}`).emit("order", { id: o.id, status: to, by: who });
}

app.post(
  "/api/orders/:id/ship",
  requireUser,
  wrap((req, res) => {
    const o = getOrderFor(req);
    if (o.seller_id !== req.user.id) throw bad("Réservé au vendeur.", 403);
    setStatus(o, "paid", "shipped", "seller");
    const a = one("SELECT title FROM auctions WHERE id = ?", o.auction_id);
    notify(o.buyer_id, "shipped", "Colis en route", `${a.title} est en cours de livraison.`, `/compte/commandes/${o.id}`);
    res.json({ ok: true });
  }),
);

app.post(
  "/api/orders/:id/deliver",
  requireUser,
  wrap((req, res) => {
    const o = getOrderFor(req);
    if (o.buyer_id !== req.user.id) throw bad("Réservé à l'acheteur.", 403);
    setStatus(o, "shipped", "delivered", "buyer");
    releaseFunds(o.id);
    res.json({ ok: true });
  }),
);

app.post(
  "/api/orders/:id/review",
  requireUser,
  wrap((req, res) => {
    const o = getOrderFor(req);
    if (o.buyer_id !== req.user.id) throw bad("Réservé à l'acheteur.", 403);
    if (!["delivered", "released"].includes(o.status)) throw bad("Tu pourras noter après la livraison.");
    const rating = Math.max(1, Math.min(5, Math.round(Number(req.body.rating) || 5)));
    run(
      "INSERT OR REPLACE INTO reviews (order_id, seller_id, buyer_id, rating, comment, created_at) VALUES (?,?,?,?,?,?)",
      o.id,
      o.seller_id,
      o.buyer_id,
      rating,
      String(req.body.comment || "").slice(0, 500),
      Date.now(),
    );
    res.json({ ok: true });
  }),
);

// ---------- Notifications ----------
app.get("/api/notifications", requireUser, (req, res) =>
  res.json({ items: all("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40", req.user.id) }),
);
app.post("/api/notifications/read", requireUser, (req, res) => {
  run("UPDATE notifications SET read = 1 WHERE user_id = ?", req.user.id);
  res.json({ ok: true });
});

// ---------- Espace demande ----------
app.get(
  "/api/requests",
  wrap((req, res) => {
    const rows = all(
      `SELECT r.*, u.name FROM requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'open' ORDER BY r.votes DESC, r.id DESC LIMIT 60`,
    );
    const voted = req.user ? new Set(all("SELECT request_id FROM request_votes WHERE user_id = ?", req.user.id).map((v) => v.request_id)) : new Set();
    res.json({ items: rows.map((r) => ({ ...r, name: r.name.split(" ")[0], voted: voted.has(r.id), user_id: undefined })) });
  }),
);

app.post(
  "/api/requests",
  requireUser,
  wrap((req, res) => {
    const { title, category, budget_max, details } = req.body;
    if (!title || String(title).trim().length < 3) throw bad("Décris ce que tu cherches.");
    if (!CATEGORIES.includes(category)) throw bad("Choisis une catégorie.");
    const r = run(
      "INSERT INTO requests (user_id, title, category, budget_max, city, details, created_at) VALUES (?,?,?,?,?,?,?)",
      req.user.id,
      String(title).trim().slice(0, 90),
      category,
      budget_max ? Math.round(Number(budget_max)) : null,
      req.user.city,
      String(details || "").slice(0, 600),
      Date.now(),
    );
    run("INSERT INTO request_votes (user_id, request_id) VALUES (?,?)", req.user.id, r.lastInsertRowid);
    for (const s of all("SELECT id FROM users WHERE role = 'seller'")) {
      notify(s.id, "demand", "Nouvelle demande acheteur", `${category} : « ${String(title).trim().slice(0, 60)} »`, "/demandes");
    }
    res.json({ id: Number(r.lastInsertRowid) });
  }),
);

app.post(
  "/api/requests/:id/vote",
  requireUser,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const r = run("INSERT OR IGNORE INTO request_votes (user_id, request_id) VALUES (?,?)", req.user.id, id);
    if (r.changes) run("UPDATE requests SET votes = votes + 1 WHERE id = ?", id);
    res.json({ ok: true, votes: one("SELECT votes FROM requests WHERE id = ?", id)?.votes });
  }),
);

// ---------- Espace vendeur ----------
app.get(
  "/api/seller/dashboard",
  requireRole("seller", "admin"),
  wrap((req, res) => {
    const uid = req.user.id;
    const auctions = all("SELECT * FROM auctions WHERE seller_id = ? ORDER BY status = 'live' DESC, created_at DESC", uid);
    const orders = all("SELECT * FROM orders WHERE seller_id = ? ORDER BY id DESC", uid);
    const okOrders = orders.filter((o) => ["paid", "shipped", "delivered", "released"].includes(o.status));
    const since = Date.now() - 14 * 24 * 3600 * 1000;
    const series = [];
    for (let d = 13; d >= 0; d--) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - d);
      const end = start.getTime() + 24 * 3600 * 1000;
      series.push({
        day: start.getTime(),
        bids: one(
          "SELECT COUNT(*) n FROM bids b JOIN auctions a ON a.id = b.auction_id WHERE a.seller_id = ? AND b.created_at >= ? AND b.created_at < ?",
          uid,
          start.getTime(),
          end,
        ).n,
        sales: okOrders.filter((o) => o.created_at >= start.getTime() && o.created_at < end).reduce((s, o) => s + o.amount, 0),
      });
    }
    const myCats = [...new Set(auctions.map((a) => a.category))];
    const demands = all(`SELECT id, title, category, budget_max, city, votes FROM requests WHERE status = 'open' ORDER BY votes DESC LIMIT 8`);
    res.json({
      user: publicUser(req.user),
      kpis: {
        live: auctions.filter((a) => a.status === "live").length,
        gmv: okOrders.reduce((s, o) => s + o.amount, 0),
        payout: okOrders.reduce((s, o) => s + o.amount - o.commission, 0),
        pending_payout: okOrders.filter((o) => o.status !== "released").reduce((s, o) => s + o.amount - o.commission, 0),
        views: auctions.reduce((s, a) => s + a.views, 0),
        bids: auctions.reduce((s, a) => s + a.bids_count, 0),
        sell_through: auctions.filter((a) => a.status !== "live").length
          ? Math.round((100 * auctions.filter((a) => a.status === "sold").length) / auctions.filter((a) => a.status !== "live").length)
          : null,
      },
      series,
      auctions: auctions.map((a) => auctionView(a, uid)),
      orders: orders.map((o) => orderView(o, req.user)),
      demands: demands.map((d) => ({ ...d, mine: myCats.includes(d.category) })),
      // Heures où les acheteurs enchérissent le plus (30 derniers jours) : meilleur moment pour clôturer
      hours: (() => {
        const h = Array(24).fill(0);
        for (const b of all(
          "SELECT b.created_at FROM bids b JOIN auctions a ON a.id = b.auction_id WHERE a.seller_id = ? AND b.created_at > ?",
          uid,
          Date.now() - 30 * 24 * 3600 * 1000,
        ))
          h[new Date(b.created_at).getHours()]++;
        return h;
      })(),
      payouts: all("SELECT id, order_id, kind, amount, method, account, status, created_at FROM payouts WHERE user_id = ? ORDER BY id DESC LIMIT 20", uid),
    });
  }),
);

app.post(
  "/api/seller/pro",
  requireRole("seller"),
  wrap((req, res) => {
    if (!DEMO) throw bad("Paiement de l'abonnement : bientôt disponible.", 501);
    const base = Math.max(Date.now(), req.user.plan_until || 0);
    run("UPDATE users SET plan = 'pro', plan_until = ? WHERE id = ?", base + 30 * 24 * 3600 * 1000, req.user.id);
    notify(req.user.id, "pro", "Offre Pro activée", "Statistiques, mise en avant et catalogue illimité pendant 30 jours.", "/vendeur");
    res.json({ user: publicUser(one("SELECT * FROM users WHERE id = ?", req.user.id)) });
  }),
);

// ---------- Admin ----------
app.get(
  "/api/admin/overview",
  requireRole("admin"),
  wrap((_req, res) => {
    const orders = all("SELECT * FROM orders ORDER BY id DESC LIMIT 100");
    const ok = all("SELECT amount, commission FROM orders WHERE status IN ('paid','shipped','delivered','released')");
    res.json({
      kpis: {
        users: one("SELECT COUNT(*) n FROM users").n,
        sellers: one("SELECT COUNT(*) n FROM users WHERE role = 'seller'").n,
        live: one("SELECT COUNT(*) n FROM auctions WHERE status = 'live'").n,
        gmv: ok.reduce((s, o) => s + o.amount, 0),
        commissions: ok.reduce((s, o) => s + o.commission, 0),
        pros: one("SELECT COUNT(*) n FROM users WHERE plan_until > ?", Date.now()).n,
        escrow: all("SELECT amount FROM orders WHERE status IN ('paid','shipped','delivered','disputed')").reduce((s, o) => s + o.amount, 0),
        disputes: one("SELECT COUNT(*) n FROM orders WHERE status = 'disputed'").n,
      },
      orders: orders.map((o) => orderView(o, { role: "admin" })),
      sellers: all("SELECT id, name, shop_name, phone, city, verified, blocked, plan_until, created_at FROM users WHERE role = 'seller' ORDER BY verified, id DESC"),
      pending: all("SELECT * FROM auctions WHERE moderation = 'pending' ORDER BY id").map((a) => ({ ...auctionView(a), ai_review: a.ai_review ? JSON.parse(a.ai_review) : null })),
      flags: all(
        `SELECT f.*, u.name, a.title FROM fraud_flags f LEFT JOIN users u ON u.id = f.user_id LEFT JOIN auctions a ON a.id = f.auction_id
         WHERE f.resolved = 0 ORDER BY f.id DESC LIMIT 50`,
      ),
      outbox: all("SELECT * FROM outbox ORDER BY id DESC LIMIT 40"),
      integrations: {
        paydunya: PAYDUNYA_ENABLED ? (process.env.PAYDUNYA_MODE === "live" ? "live" : "test") : null,
        wave: WAVE_ENABLED,
        sms: SMS_ENABLED,
        whatsapp: WA_ENABLED,
        demo: DEMO,
        bots: DEMO && process.env.DEMO_BOTS !== "0",
        public_url: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || null,
        ai: aiStatus(),
      },
    });
  }),
);

app.post(
  "/api/admin/users/:id/verify",
  requireRole("admin"),
  wrap((req, res) => {
    run("UPDATE users SET verified = 1 - verified WHERE id = ?", Number(req.params.id));
    const u = one("SELECT id, verified FROM users WHERE id = ?", Number(req.params.id));
    if (u?.verified) notify(u.id, "verified", "Compte vendeur vérifié", "Le badge « Vérifié » apparaît sur tes ventes.", "/vendeur");
    res.json({ verified: !!u?.verified });
  }),
);

app.post(
  "/api/admin/auctions/:id/:action",
  requireRole("admin"),
  wrap((req, res) => {
    const a = one("SELECT * FROM auctions WHERE id = ?", Number(req.params.id));
    if (!a) throw bad("Vente introuvable.", 404);
    if (req.params.action === "approve") {
      // La durée démarre à la validation
      const dur = a.ends_at - a.starts_at;
      const now = Date.now();
      run("UPDATE auctions SET moderation = 'approved', starts_at = ?, ends_at = ? WHERE id = ?", now, now + dur, a.id);
      notify(a.seller_id, "approved", "Annonce validée", `${a.title} est en ligne.`, `/enchere/${a.id}`);
      announce(one("SELECT * FROM auctions WHERE id = ?", a.id), a.seller_id);
    } else if (req.params.action === "reject") {
      run("UPDATE auctions SET moderation = 'rejected', status = 'cancelled' WHERE id = ?", a.id);
      notify(a.seller_id, "rejected", "Annonce refusée", `${a.title} : ${String(req.body.reason || "non conforme aux règles").slice(0, 200)}.`, "/vendeur");
    } else throw bad("Action inconnue.");
    res.json({ ok: true });
  }),
);

// Tests des clés depuis l'admin : un vrai envoi, résultat affiché tel quel
app.post(
  "/api/admin/test/:channel",
  requireRole("admin"),
  wrap(async (req, res) => {
    const phone = normPhone(req.body.phone || req.user.phone);
    if (req.params.channel === "sms") {
      await sendSMS(phone, "Babylone : test d'envoi SMS réussi.", req.user.id);
    } else if (req.params.channel === "whatsapp") {
      await sendWhatsApp({ id: req.user.id, phone, whatsapp: 1 }, "Test Babylone", "Les alertes WhatsApp fonctionnent.", "/");
    } else if (req.params.channel === "payment") {
      const c = await createCheckout({ id: 0, amount: 200, delivery_fee: 0 }, "wave", "Test de paiement Babylone");
      return res.json({ ok: true, redirect: c.redirect, demo: c.demo });
    } else throw bad("Canal inconnu.");
    const last = one("SELECT status, error FROM outbox WHERE user_id = ? ORDER BY id DESC LIMIT 1", req.user.id);
    if (last?.status === "failed") throw bad(`Échec : ${last.error}`, 502);
    res.json({ ok: true, status: last?.status });
  }),
);

app.post(
  "/api/admin/flags/:id/resolve",
  requireRole("admin"),
  wrap((req, res) => {
    run("UPDATE fraud_flags SET resolved = 1 WHERE id = ?", Number(req.params.id));
    res.json({ ok: true });
  }),
);

app.post(
  "/api/admin/users/:id/block",
  requireRole("admin"),
  wrap((req, res) => {
    run("UPDATE users SET blocked = 1 - blocked WHERE id = ? AND role != 'admin'", Number(req.params.id));
    res.json({ blocked: !!one("SELECT blocked FROM users WHERE id = ?", Number(req.params.id))?.blocked });
  }),
);

app.post(
  "/api/admin/orders/:id/:action",
  requireRole("admin"),
  wrap((req, res) => {
    const o = one("SELECT * FROM orders WHERE id = ?", Number(req.params.id));
    if (!o) throw bad("Commande introuvable.", 404);
    const a = one("SELECT title FROM auctions WHERE id = ?", o.auction_id);
    if (req.params.action === "release") {
      if (!["delivered", "disputed", "shipped"].includes(o.status)) throw bad("Fonds non libérables à cette étape.");
      run("UPDATE orders SET status = 'delivered', decision = ? WHERE id = ?", String(req.body.note || "Fonds libérés au vendeur").slice(0, 300), o.id);
      releaseFunds(o.id);
    } else if (req.params.action === "refund") {
      if (!["paid", "shipped", "disputed"].includes(o.status)) throw bad("Remboursement impossible à cette étape.");
      run("UPDATE orders SET status = 'refunded', decision = ?, updated_at = ? WHERE id = ?", String(req.body.note || "Acheteur remboursé").slice(0, 300), Date.now(), o.id);
      queuePayout("refund", o.buyer_id, o.amount + o.delivery_fee, o.id);
      notify(o.buyer_id, "refund", "Remboursement validé", `${a.title} : ${fcfa(o.amount + o.delivery_fee)} te sont reversés.`, `/compte/commandes/${o.id}`);
    } else throw bad("Action inconnue.");
    res.json({ ok: true });
  }),
);

// ---------- Front en production ----------
const dist = join(here, "..", "web", "dist");
if (existsSync(dist)) {
  // Relu si le build change (sinon un ancien index pointerait vers des fichiers supprimés)
  let cache = { mtime: 0, html: "" };
  const readIndex = () => {
    const m = statSync(join(dist, "index.html")).mtimeMs;
    if (m !== cache.mtime) cache = { mtime: m, html: readFileSync(join(dist, "index.html"), "utf8") };
    return cache.html;
  };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  app.use(
    express.static(dist, {
      maxAge: "1h",
      index: false,
      // Le service worker doit toujours être revérifié, sinon les mises à jour du site tardent
      setHeaders: (res, path) => path.endsWith("sw.js") && res.setHeader("Cache-Control", "no-cache"),
    }),
  );
  // Aperçu riche (WhatsApp, Facebook) quand on partage le lien d'une vente
  app.get(/^(?!\/(api|uploads|socket\.io)).*/, (req, res) => {
    const m = /^\/enchere\/(\d+)/.exec(req.path);
    const a = m ? one("SELECT * FROM auctions WHERE id = ? AND moderation = 'approved'", Number(m[1])) : null;
    const indexHtml = readIndex();
    if (!a) return res.type("html").send(indexHtml);
    const base = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`;
    const img = JSON.parse(a.images)[0];
    const title = `${a.title} · ${fcfa(a.current_price)}`;
    const desc = a.status === "live" ? `Enchère en direct à ${a.city}. Fais ton offre sur Babylone avant la fin !` : `Vente terminée à ${a.city}.`;
    const meta = [
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(desc)}" />`,
      `<meta property="og:image" content="${esc(base + img)}" />`,
      `<meta property="og:url" content="${esc(base + req.path)}" />`,
      `<meta property="og:type" content="product" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    ].join("\n    ");
    res.type("html").send(indexHtml.replace("</head>", `    ${meta}\n  </head>`).replace(/<title>.*<\/title>/, `<title>${esc(title)} · Babylone</title>`));
  });
}

// ---------- Temps réel ----------
io.on("connection", (socket) => {
  const user = readToken(socket.handshake.auth?.token);
  if (user) socket.join(`user:${user.id}`);
  socket.on("watch", (id) => socket.join(`auction:${Number(id)}`));
  socket.on("unwatch", (id) => socket.leave(`auction:${Number(id)}`));
});

setInterval(tick, 1000);
if (DEMO && process.env.DEMO_BOTS !== "0") startDemo();

server.listen(PORT, () => {
  console.log(`Babylone API sur http://localhost:${PORT} ${DEMO ? "(mode démo)" : ""}`);
});
