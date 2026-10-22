import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, one } from "./db.js";

const secretFile = join(DATA_DIR, "secret");
const SECRET =
  process.env.BABYLONE_SECRET ||
  (existsSync(secretFile)
    ? readFileSync(secretFile, "utf8")
    : (() => {
        const s = randomBytes(32).toString("hex");
        writeFileSync(secretFile, s, { mode: 0o600 });
        return s;
      })());

const TOKEN_TTL = 30 * 24 * 3600 * 1000;

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

export function checkPassword(password, user) {
  const a = Buffer.from(hashPassword(password, user.salt).hash, "hex");
  const b = Buffer.from(user.password_hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const sign = (data) => createHmac("sha256", SECRET).update(data).digest("base64url");

export function issueToken(userId) {
  const body = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readToken(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (exp < Date.now()) return null;
    return one("SELECT * FROM users WHERE id = ?", uid) || null;
  } catch {
    return null;
  }
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    city: u.city,
    shop_name: u.shop_name,
    verified: !!u.verified,
    plan: u.plan_until && u.plan_until > Date.now() ? "pro" : "standard",
    plan_until: u.plan_until,
    strikes: u.strikes,
    whatsapp: !!u.whatsapp,
    phone_verified: !!u.phone_verified,
    referral_code: u.referral_code,
    points: u.points || 0,
    deposit: u.deposit || 0,
    lang: u.lang || "fr",
    bio: u.bio || "",
    payout_method: u.payout_method || null,
    payout_account: u.payout_account || null,
  };
}

// Middlewares Express
export function attachUser(req, _res, next) {
  const h = req.headers.authorization || "";
  req.user = readToken(h.startsWith("Bearer ") ? h.slice(7) : null);
  next();
}

export const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Connecte-toi pour continuer." }));

export const requireRole =
  (...roles) =>
  (req, res, next) =>
    !req.user
      ? res.status(401).json({ error: "Connecte-toi pour continuer." })
      : roles.includes(req.user.role)
        ? next()
        : res.status(403).json({ error: "Accès réservé." });
