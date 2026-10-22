// Notifications push du navigateur (Web Push). Les clés VAPID sont créées au premier démarrage.
import webpush from "web-push";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, all, run } from "./db.js";

const file = join(DATA_DIR, "vapid.json");
const keys =
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : (() => {
          const k = webpush.generateVAPIDKeys();
          writeFileSync(file, JSON.stringify(k), { mode: 0o600 });
          return k;
        })();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contact@babylone.sn", keys.publicKey, keys.privateKey);

export const VAPID_PUBLIC = keys.publicKey;

export function saveSubscription(userId, sub) {
  if (!sub?.endpoint) return;
  run("INSERT OR REPLACE INTO push_subs (endpoint, user_id, data, created_at) VALUES (?,?,?,?)", sub.endpoint, userId, JSON.stringify(sub), Date.now());
}

export function removeSubscription(endpoint) {
  run("DELETE FROM push_subs WHERE endpoint = ?", endpoint);
}

export async function pushTo(userId, payload) {
  for (const s of all("SELECT endpoint, data FROM push_subs WHERE user_id = ?", userId)) {
    try {
      await webpush.sendNotification(JSON.parse(s.data), JSON.stringify(payload), { TTL: 3600 });
    } catch (e) {
      // Abonnement expiré ou révoqué
      if (e.statusCode === 404 || e.statusCode === 410) removeSubscription(s.endpoint);
    }
  }
}
