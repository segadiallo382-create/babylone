// SMS (Orange SMS API) et WhatsApp (Cloud API de Meta).
// Sans clés : mode simulé, les messages sont seulement enregistrés dans la table outbox (visible dans l'admin).
import { run } from "./db.js";

const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:4000";
export const SMS_ENABLED = !!(process.env.ORANGE_CLIENT_ID && process.env.ORANGE_CLIENT_SECRET && process.env.ORANGE_SMS_SENDER);
export const WA_ENABLED = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
// Modèle WhatsApp « utilitaire » à faire approuver par Meta : {{1}} titre, {{2}} message, {{3}} lien
const WA_TEMPLATE = process.env.WHATSAPP_TEMPLATE || "babylone_notification";
// Version de l'API Graph de Meta (les anciennes versions sont retirées au bout de 2 ans environ)
const WA_API = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v23.0"}`;

const intl = (phone) => `221${String(phone).replace(/\D/g, "").replace(/^221/, "")}`;

function log(userId, channel, recipient, template, body, status, error = null) {
  run(
    "INSERT INTO outbox (user_id, channel, recipient, template, body, status, error, created_at) VALUES (?,?,?,?,?,?,?,?)",
    userId,
    channel,
    recipient,
    template,
    body,
    status,
    error,
    Date.now(),
  );
}

let orangeToken = { value: null, exp: 0 };
async function orangeAuth() {
  if (orangeToken.value && orangeToken.exp > Date.now() + 60_000) return orangeToken.value;
  const basic = Buffer.from(`${process.env.ORANGE_CLIENT_ID}:${process.env.ORANGE_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://api.orange.com/oauth/v3/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Orange auth ${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  orangeToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return orangeToken.value;
}

export async function sendSMS(phone, text, userId = null) {
  const to = intl(phone);
  if (!SMS_ENABLED) {
    log(userId, "sms", to, null, text, "simulated");
    console.log(`[SMS simulé] +${to} : ${text}`);
    return { simulated: true };
  }
  try {
    const sender = `tel:+${process.env.ORANGE_SMS_SENDER}`;
    const res = await fetch(`https://api.orange.com/smsmessaging/v1/outbound/${encodeURIComponent(sender)}/requests`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await orangeAuth()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: `tel:+${to}`,
          senderAddress: sender,
          senderName: process.env.ORANGE_SMS_NAME || "Babylone",
          outboundSMSTextMessage: { message: text },
        },
      }),
    });
    if (!res.ok) throw new Error(`Orange SMS ${res.status} ${(await res.text()).slice(0, 300)}`);
    log(userId, "sms", to, null, text, "sent");
    return { sent: true };
  } catch (e) {
    log(userId, "sms", to, null, text, "failed", e.message);
    throw e;
  }
}

// Réponse libre du bot (autorisée par Meta dans les 24 h qui suivent un message de l'utilisateur)
export async function sendWhatsAppText(phone, text, userId = null) {
  const to = intl(phone);
  if (!WA_ENABLED) return log(userId, "whatsapp", to, null, text, "simulated");
  try {
    const res = await fetch(`${WA_API}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000) } }),
    });
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
    log(userId, "whatsapp", to, null, text, "sent");
  } catch (e) {
    log(userId, "whatsapp", to, null, text, "failed", e.message);
  }
}

export async function sendWhatsApp(user, title, body, link) {
  if (!user?.whatsapp) return;
  const to = intl(user.phone);
  const url = link ? `${PUBLIC_URL}${link}` : PUBLIC_URL;
  const text = `${title} — ${body} ${url}`;
  if (!WA_ENABLED) return log(user.id, "whatsapp", to, WA_TEMPLATE, text, "simulated");
  try {
    const res = await fetch(`${WA_API}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: WA_TEMPLATE,
          language: { code: "fr" },
          components: [{ type: "body", parameters: [title, body, url].map((t) => ({ type: "text", text: String(t).slice(0, 900) })) }],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
    log(user.id, "whatsapp", to, WA_TEMPLATE, text, "sent");
  } catch (e) {
    log(user.id, "whatsapp", to, WA_TEMPLATE, text, "failed", e.message);
  }
}
