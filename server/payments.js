// Paiements. Ordre de priorité :
//   1. PayDunya (Wave, Orange Money, Free Money, carte) si PAYDUNYA_MASTER_KEY est défini ;
//   2. Wave Checkout direct si WAVE_API_KEY est défini ;
//   3. sinon mode démo (page de paiement simulée, aucun débit).
// Les fonds encaissés restent bloqués jusqu'à confirmation de la livraison (statut "paid" -> "released").
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PAYDUNYA_ENABLED = !!(process.env.PAYDUNYA_MASTER_KEY && process.env.PAYDUNYA_PRIVATE_KEY && process.env.PAYDUNYA_TOKEN);
export const WAVE_ENABLED = !!process.env.WAVE_API_KEY;
export const REAL_PAYMENTS = PAYDUNYA_ENABLED || WAVE_ENABLED;
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:4000";
const PAYDUNYA_BASE = process.env.PAYDUNYA_MODE === "live" ? "https://app.paydunya.com/api/v1" : "https://app.paydunya.com/sandbox-api/v1";

const paydunyaHeaders = () => ({
  "Content-Type": "application/json",
  "PAYDUNYA-MASTER-KEY": process.env.PAYDUNYA_MASTER_KEY,
  "PAYDUNYA-PRIVATE-KEY": process.env.PAYDUNYA_PRIVATE_KEY,
  "PAYDUNYA-TOKEN": process.env.PAYDUNYA_TOKEN,
});

export async function createCheckout(order, provider, title = "Commande Babylone") {
  const total = order.amount + order.delivery_fee;
  const back = `${PUBLIC_URL}/compte/commandes/${order.id}`;

  if (PAYDUNYA_ENABLED) {
    const res = await fetch(`${PAYDUNYA_BASE}/checkout-invoice/create`, {
      method: "POST",
      headers: paydunyaHeaders(),
      body: JSON.stringify({
        invoice: { total_amount: total, description: `${title} (commande #${order.id})` },
        store: { name: "Babylone", website_url: PUBLIC_URL },
        actions: { cancel_url: `${back}?paiement=annule`, return_url: `${back}?paiement=ok`, callback_url: `${PUBLIC_URL}/api/webhooks/paydunya` },
        custom_data: { order_id: order.id },
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.response_code !== "00") throw new Error(`PayDunya a refusé la demande (${j.response_text || res.status}).`);
    return { redirect: j.response_text, ref: j.token, demo: false };
  }

  if (provider === "wave" && WAVE_ENABLED) {
    const res = await fetch("https://api.wave.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WAVE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: String(total),
        currency: "XOF",
        client_reference: `order-${order.id}`,
        success_url: `${back}?paiement=ok`,
        error_url: `${back}?paiement=erreur`,
      }),
    });
    if (!res.ok) throw new Error(`Wave a refusé la demande (${res.status}).`);
    const s = await res.json();
    return { redirect: s.wave_launch_url, ref: s.id, demo: false };
  }

  return { redirect: `/paiement/${order.id}?via=${provider}`, ref: `demo-${order.id}-${Date.now()}`, demo: true };
}

// PayDunya : l'IPN contient data.hash = SHA-512 de la clé principale ; on reconfirme ensuite la facture par l'API
export function verifyPaydunyaHash(hash) {
  if (!PAYDUNYA_ENABLED || !hash) return false;
  const expected = createHash("sha512").update(process.env.PAYDUNYA_MASTER_KEY).digest("hex");
  return expected.length === String(hash).length && timingSafeEqual(Buffer.from(expected), Buffer.from(String(hash)));
}

export async function confirmPaydunya(token) {
  const res = await fetch(`${PAYDUNYA_BASE}/checkout-invoice/confirm/${encodeURIComponent(token)}`, { headers: paydunyaHeaders() });
  const j = await res.json().catch(() => ({}));
  return {
    completed: j.status === "completed",
    amount: Number(j.invoice?.total_amount || 0),
    orderId: Number(j.custom_data?.order_id || 0),
    paymentId: Number(j.custom_data?.payment_id || 0),
  };
}

// Wave : en-tête "Wave-Signature: t=<timestamp>,v1=<hmac>" sur timestamp + corps brut
export function verifyWaveSignature(rawBody, header) {
  const secret = process.env.WAVE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(parts.t + rawBody).digest("hex");
  return expected.length === parts.v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

// Paiements hors commande : caution, acompte d'arrivage, solde d'arrivage
export async function createPaymentCheckout(payment, title, backPath) {
  const back = `${PUBLIC_URL}${backPath}`;
  if (PAYDUNYA_ENABLED) {
    const res = await fetch(`${PAYDUNYA_BASE}/checkout-invoice/create`, {
      method: "POST",
      headers: paydunyaHeaders(),
      body: JSON.stringify({
        invoice: { total_amount: payment.amount, description: title },
        store: { name: "Babylone", website_url: PUBLIC_URL },
        actions: { cancel_url: `${back}?paiement=annule`, return_url: `${back}?paiement=ok`, callback_url: `${PUBLIC_URL}/api/webhooks/paydunya` },
        custom_data: { payment_id: payment.id },
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.response_code !== "00") throw new Error(`PayDunya a refusé la demande (${j.response_text || res.status}).`);
    return { redirect: j.response_text, ref: j.token, demo: false };
  }
  return { redirect: null, ref: `demo-pay-${payment.id}`, demo: true };
}
