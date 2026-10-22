// Test de bout en bout du parcours d'une vente (serveur lancé sur :4000, base de démo).
import { DatabaseSync } from "node:sqlite";
const B = process.env.API || "http://localhost:4000/api";
const db = new DatabaseSync(new URL("../data/babylone.db", import.meta.url).pathname);
let fails = 0;
const ok = (cond, msg) => { console.log(cond ? "  ✓" : "  ✗", msg); if (!cond) fails++; };
async function call(path, token, body) {
  const r = await fetch(B + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
}
const login = async (phone) => (await call("/auth/login", null, { phone, password: "babylone2027" })).token;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const seller = await login("771000001");
const buyer = await login("781234567");
const buyer2 = await login("781000001");

console.log("Espace demande");
const rq = await call("/requests", buyer, { title: "Ventilateur sur pied silencieux", category: "Électroménager", budget_max: 25000 });
ok(rq.id > 0, "demande publiée");

console.log("Publication");
const bad = await call("/auctions", seller, { title: "Test", category: "Électroménager", condition: "neuf", start_price: 5000, images: [] });
ok(bad.status === 400, `refus sans photo : ${bad.error}`);
const pub = await call("/auctions", seller, { title: "Ventilateur sur pied 16 pouces", category: "Électroménager", condition: "neuf", start_price: 10000, reserve_price: 12000, duration_hours: 1, images: [PNG] });
ok(pub.auction?.id, `vente créée #${pub.auction?.id}, ${pub.notified} acheteur(s) prévenu(s)`);
const id = pub.auction.id;

console.log("Offres");
ok((await call(`/auctions/${id}/bid`, seller, { amount: 10000 })).status === 400, "vendeur ne peut pas enchérir sur sa vente");
ok((await call(`/auctions/${id}/bid`, buyer, { amount: 9000 })).status === 400, "offre sous le départ refusée");
ok((await call(`/auctions/${id}/bid`, buyer, { amount: 10000 })).ok, "1re offre 10 000");
ok((await call(`/auctions/${id}/bid`, buyer, { amount: 10500 })).status === 400, "déjà en tête refusé");
const low = await call(`/auctions/${id}/bid`, buyer2, { amount: 10100 });
ok(low.status === 400, `palier respecté : ${low.error}`);
ok((await call(`/auctions/${id}/bid`, buyer2, { amount: 10500 })).ok, "2e acheteur 10 500");
let a = (await call(`/auctions/${id}`, buyer)).auction;
ok(!a.reserve_met, "réserve non atteinte à 10 500");
// Anti-snipe : on rapproche la fin à 30 s puis on enchérit
db.prepare("UPDATE auctions SET ends_at = ? WHERE id = ?").run(Date.now() + 30000, id);
const snipe = await call(`/auctions/${id}/bid`, buyer, { amount: 12500 });
ok(snipe.bid?.extended, "offre de dernière minute : vente prolongée");
a = (await call(`/auctions/${id}`, buyer)).auction;
ok(a.reserve_met && a.ends_at - Date.now() > 100000, "réserve atteinte, fin repoussée à +2 min");
const notes = (await call("/notifications", buyer2)).items;
ok(notes.some((n) => n.type === "outbid"), "acheteur 2 notifié qu'il est dépassé");

console.log("Clôture");
db.prepare("UPDATE auctions SET ends_at = ? WHERE id = ?").run(Date.now() - 1000, id);
await sleep(2200);
a = (await call(`/auctions/${id}`, buyer)).auction;
ok(a.status === "sold", "vente conclue");
let order = (await call("/me/orders", buyer)).orders.find((o) => o.auction_id === id);
ok(order?.status === "awaiting_payment", `commande #${order?.id} à payer, total ${order?.total}`);

console.log("Paiement (démo)");
ok((await call(`/orders/${order.id}/pay`, buyer, { provider: "wave", address: "x" })).status === 400, "adresse obligatoire");
const pay = await call(`/orders/${order.id}/pay`, buyer, { provider: "wave", address: "Cité Malick Sy, Thiès" });
ok(pay.demo && pay.redirect.startsWith("/paiement/"), "redirection vers paiement simulé");
await call(`/orders/${order.id}/demo-confirm`, buyer, {});
order = (await call(`/orders/${order.id}`, buyer)).order;
ok(order.status === "paid" && order.seller.phone, "payé, contacts échangés");

console.log("Livraison");
ok((await call(`/orders/${order.id}/ship`, buyer, {})).status === 403, "l'acheteur ne peut pas marquer expédié");
ok((await call(`/orders/${order.id}/ship`, seller, {})).ok, "vendeur expédie");
ok((await call(`/orders/${order.id}/deliver`, buyer, {})).ok, "acheteur confirme réception");
order = (await call(`/orders/${order.id}`, buyer)).order;
ok(order.status === "released", `fonds libérés au vendeur : ${order.payout} F net`);
ok((await call(`/orders/${order.id}/review`, buyer, { rating: 5, comment: "Parfait" })).ok, "avis publié");

console.log("Gagnant qui ne paie pas");
const p2 = await call("/auctions", seller, { title: "Lot de casquettes x10", category: "Accessoires", condition: "neuf", start_price: 3000, duration_hours: 1, images: [PNG] });
const id2 = p2.auction.id;
await call(`/auctions/${id2}/bid`, buyer2, { amount: 3000 });
await call(`/auctions/${id2}/bid`, buyer, { amount: 3250 });
db.prepare("UPDATE auctions SET ends_at = ? WHERE id = ?").run(Date.now() - 1000, id2);
await sleep(2000);
db.prepare("UPDATE orders SET pay_deadline = ? WHERE auction_id = ? AND status = 'awaiting_payment'").run(Date.now() - 1000, id2);
await sleep(2000);
const second = (await call("/me/orders", buyer2)).orders.find((o) => o.auction_id === id2);
ok(second?.status === "awaiting_payment" && second.amount === 3000, "vente proposée au 2e offrant à son prix");
db.prepare("UPDATE users SET strikes = 0 WHERE phone = '781234567'").run();

console.log("Inscription par code SMS + parrainage");
const newPhone = "76" + String(Date.now()).slice(-7);
const ref = (await call("/me/referrals", buyer)).code;
ok((await call("/auth/register", null, { name: "Test Filleul", phone: newPhone, password: "secret1", code: "000000" })).status === 400, "inscription refusée sans code valide");
const otp = await call("/auth/otp", null, { phone: newPhone, purpose: "register" });
ok(otp.sent && otp.dev_code, "code SMS envoyé (simulé en démo)");
ok((await call("/auth/otp", null, { phone: newPhone, purpose: "register" })).status === 429, "renvoi limité à 1 par minute");
const reg = await call("/auth/register", null, { name: "Test Filleul", phone: newPhone, password: "secret1", code: otp.dev_code, ref });
ok(reg.token && reg.user.phone_verified, "compte créé, téléphone vérifié");
ok((await call("/me/referrals", buyer)).referrals.length >= 1, "filleul rattaché au parrain");
const otp2 = await call("/auth/otp", null, { phone: newPhone, purpose: "reset" });
const reset = await call("/auth/reset", null, { phone: newPhone, code: otp2.dev_code, password: "nouveau1" });
ok(reset.token && (await call("/auth/login", null, { phone: newPhone, password: "nouveau1" })).token, "mot de passe réinitialisé par SMS");

console.log("Enchère automatique");
const p3 = await call("/auctions", seller, { title: "Montre automatique acier", category: "Accessoires", condition: "neuf", start_price: 20000, duration_hours: 2, images: [PNG] });
const id3 = p3.auction.id;
await call(`/auctions/${id3}/bid`, buyer, { amount: 20000, max_auto: 30000 });
const r3 = await call(`/auctions/${id3}/bid`, buyer2, { amount: 21000 });
ok(r3.bid && !r3.bid.you_lead && r3.bid.price === 22000, `le robot de l'acheteur 1 répond : prix ${r3.bid?.price}`);
const r4 = await call(`/auctions/${id3}/bid`, buyer2, { amount: 23000, max_auto: 40000 });
ok(r4.bid.you_lead && r4.bid.price === 31000, `plafond 30 000 battu par plafond 40 000 : prix ${r4.bid.price}`);
const n1 = (await call("/notifications", buyer)).items[0];
ok(n1.type === "auto_outbid", "acheteur 1 prévenu que son plafond est battu");
ok((await call(`/auctions/${id3}/bid`, buyer2, { max_auto: 50000 })).bid.raised, "le meneur relève son plafond sans surenchérir");

console.log("Vente multiple");
const p4 = await call("/auctions", seller, { title: "Lot de 2 sacs", category: "Accessoires", condition: "neuf", mode: "multi", quantity: 2, start_price: 5000, duration_hours: 2, images: [PNG] });
const id4 = p4.auction.id;
const buyer3 = await login("781000002");
await call(`/auctions/${id4}/bid`, buyer, { amount: 5000 });
await call(`/auctions/${id4}/bid`, buyer2, { amount: 6000 });
ok((await call(`/auctions/${id4}/bid`, buyer, { amount: 5500 })).status === 400, "déjà parmi les gagnants : refus");
const m3 = await call(`/auctions/${id4}/bid`, buyer3, { amount: 5000 });
ok(m3.status === 400, `il faut battre la plus petite offre gagnante : ${m3.error}`);
await call(`/auctions/${id4}/bid`, buyer3, { amount: 5500 });
ok((await call("/notifications", buyer)).items[0].title === "Tu sors des gagnants", "acheteur 1 éjecté du top 2, prévenu");
db.prepare("UPDATE auctions SET ends_at = ? WHERE id = ?").run(Date.now() - 1000, id4);
await sleep(2000);
const won4 = db.prepare("SELECT buyer_id, amount FROM orders WHERE auction_id = ? ORDER BY amount DESC").all(id4);
ok(won4.length === 2 && won4[0].amount === 6000 && won4[1].amount === 5500, "2 commandes, chacun paie son offre");

console.log("Achat immédiat");
const p5 = await call("/auctions", seller, { title: "Enceinte Bluetooth", category: "Électronique", condition: "neuf", start_price: 8000, buy_now_price: 15000, duration_hours: 2, images: [PNG] });
ok((await call("/auctions", seller, { title: "Bad", category: "Électronique", condition: "neuf", start_price: 8000, buy_now_price: 7000, images: [PNG] })).status === 400, "achat immédiat sous le départ refusé");
const bn = await call(`/auctions/${p5.auction.id}/buy`, buyer, {});
ok(bn.order_id > 0, "achat immédiat : commande créée");
ok((await call(`/auctions/${p5.auction.id}`, buyer)).auction.status === "sold", "vente close aussitôt");

console.log("Modération");
const unverified = await login("771000006");
const pend = await call("/auctions", unverified, { title: "Glacière 40 L", category: "Maison", condition: "neuf", start_price: 9000, duration_hours: 24, images: [PNG] });
ok(pend.pending, "vendeur non vérifié : annonce en attente");
ok((await call(`/auctions/${pend.auction.id}`, buyer)).status === 404, "invisible pour le public");
const admin = await login("770000000");
await call(`/admin/auctions/${pend.auction.id}/approve`, admin, {});
ok((await call(`/auctions/${pend.auction.id}`, buyer)).auction?.moderation === "approved", "validée par l'admin, en ligne");
const ov = await call("/admin/overview", admin);
ok(ov.outbox.some((m) => m.channel === "whatsapp"), `messages WhatsApp journalisés (${ov.outbox.length})`);

console.log(fails ? `\n${fails} échec(s)` : "\nTout est vert.");
process.exit(fails ? 1 : 0);
