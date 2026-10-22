// Versements sortants : paiement des vendeurs, remboursements, restitution de caution.
// Avec PayDunya configuré : API de déboursement (Wave / Orange Money). Sinon : simulé et journalisé.
import { all, one, run } from "./db.js";
import { PAYDUNYA_ENABLED } from "./payments.js";

const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:4000";
const MODES = { wave: "wave-senegal", orange_money: "orange-money-senegal" };
const headers = () => ({
  "Content-Type": "application/json",
  "PAYDUNYA-MASTER-KEY": process.env.PAYDUNYA_MASTER_KEY,
  "PAYDUNYA-PRIVATE-KEY": process.env.PAYDUNYA_PRIVATE_KEY,
  "PAYDUNYA-TOKEN": process.env.PAYDUNYA_TOKEN,
});

let notifyFn = () => {};
export const setPayoutNotifier = (fn) => (notifyFn = fn);

async function disburse(p) {
  // Étape 1 : facture de déboursement, étape 2 : soumission
  const r1 = await fetch("https://app.paydunya.com/api/v2/disburse/get-invoice", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      account_alias: p.account,
      amount: p.amount,
      withdraw_mode: MODES[p.method],
      callback_url: `${PUBLIC_URL}/api/webhooks/paydunya-disburse`,
    }),
  });
  const j1 = await r1.json().catch(() => ({}));
  if (j1.response_code !== "00") throw new Error(j1.response_text || `PayDunya ${r1.status}`);
  const r2 = await fetch("https://app.paydunya.com/api/v2/disburse/submit-invoice", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ disburse_invoice: j1.disburse_token, disburse_id: `babylone-${p.id}` }),
  });
  const j2 = await r2.json().catch(() => ({}));
  if (j2.response_code !== "00") throw new Error(j2.response_text || `PayDunya ${r2.status}`);
  return j1.disburse_token;
}

export async function processPayout(id) {
  const p = one("SELECT * FROM payouts WHERE id = ?", id);
  if (!p || ["sent", "simulated"].includes(p.status)) return p;
  const u = one("SELECT payout_method, payout_account, phone FROM users WHERE id = ?", p.user_id);
  // Remboursement acheteur sans compte renseigné : on rembourse sur son numéro, par Wave
  const method = u.payout_method || (p.kind !== "seller_payout" ? "wave" : null);
  const account = u.payout_account || (p.kind !== "seller_payout" ? u.phone : null);
  const now = Date.now();
  if (!method || !account) {
    run("UPDATE payouts SET status = 'missing_account', updated_at = ? WHERE id = ?", now, id);
    notifyFn(p.user_id, "payout_account", "Indique où recevoir ton argent", "Ajoute ton numéro Wave ou Orange Money dans Réglages pour recevoir tes ventes.", "/vendeur?tab=settings");
    return one("SELECT * FROM payouts WHERE id = ?", id);
  }
  run("UPDATE payouts SET method = ?, account = ?, updated_at = ? WHERE id = ?", method, account, now, id);
  if (!PAYDUNYA_ENABLED) {
    run("UPDATE payouts SET status = 'simulated', ref = ?, updated_at = ? WHERE id = ?", `demo-payout-${id}`, now, id);
    return one("SELECT * FROM payouts WHERE id = ?", id);
  }
  try {
    const ref = await disburse({ ...p, method, account });
    run("UPDATE payouts SET status = 'sent', ref = ?, error = NULL, updated_at = ? WHERE id = ?", ref, Date.now(), id);
  } catch (e) {
    run("UPDATE payouts SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", String(e.message).slice(0, 300), Date.now(), id);
  }
  return one("SELECT * FROM payouts WHERE id = ?", id);
}

export function queuePayout(kind, userId, amount, orderId = null) {
  const now = Date.now();
  const r = run(
    "INSERT INTO payouts (order_id, user_id, kind, amount, status, created_at, updated_at) VALUES (?,?,?,?, 'pending', ?, ?)",
    orderId,
    userId,
    kind,
    amount,
    now,
    now,
  );
  processPayout(Number(r.lastInsertRowid)).catch((e) => console.error("[payout]", e));
  return Number(r.lastInsertRowid);
}

// Relance des versements bloqués (compte ajouté entre-temps, panne passagère)
export function retryPayouts() {
  for (const p of all("SELECT id FROM payouts WHERE status IN ('pending','missing_account','failed') AND updated_at < ?", Date.now() - 10 * 60_000))
    processPayout(p.id).catch(() => {});
}
