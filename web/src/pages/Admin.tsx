import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CountUp, Reveal, Segmented } from "../components/ui";
import { api, download, post, type Auction, type Order } from "../lib/api";
import { Analytics, Audit, Backups, BotSim, Payouts } from "./AdminPlus";
import { ORDER_STATUS, ago, fcfa, money } from "../lib/format";
import { useApp } from "../lib/store";

type Data = {
  kpis: { users: number; sellers: number; live: number; gmv: number; commissions: number; pros: number; escrow: number; disputes: number };
  orders: Order[];
  sellers: { id: number; name: string; shop_name: string; phone: string; city: string; verified: number; blocked: number; plan_until: number | null }[];
  pending: (Auction & { ai_review: { verdict: string; summary: string; reasons: string[] } | null })[];
  flags: { id: number; kind: string; detail: string; name: string; title: string; auction_id: number; user_id: number; created_at: number }[];
  outbox: { id: number; channel: string; recipient: string; body: string; status: string; error: string | null; created_at: number }[];
  integrations: { paydunya: "live" | "test" | null; wave: boolean; sms: boolean; whatsapp: boolean; demo: boolean; bots: boolean; public_url: string | null; ai: { enabled: boolean; model: string | null; moderation: string; calls_today: number; daily_limit: number } };
};
type Tab = "orders" | "moderation" | "sellers" | "fraud" | "outbox" | "integrations" | "analytics" | "payouts" | "audit" | "backups";

export default function Admin() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("orders");
  const { toast } = useApp();
  const load = useCallback(() => api("/admin/overview").then(setD), []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (path: string, msg: string) => {
    try {
      await post(path);
      toast(msg, undefined, "ok");
      load();
    } catch (e: any) {
      toast(e.message);
    }
  };

  if (!d) return <div className="page container"><div className="skeleton" style={{ height: 400 }} /></div>;
  const k = d.kpis;
  return (
    <div className="page">
      <div className="container">
        <div className="eyebrow">Administration</div>
        <h1 className="display page-title">Pilotage Babylone</h1>
        <div className="kpis" style={{ marginTop: 26 }}>
          {[
            ["Volume vendu (GMV)", k.gmv, " F"],
            ["Commissions", k.commissions, " F"],
            ["Fonds bloqués", k.escrow, " F"],
            ["Ventes en direct", k.live, ""],
            ["Utilisateurs", k.users, ""],
            ["Vendeurs", k.sellers, ""],
            ["Abonnés Pro", k.pros, ""],
            ["Litiges ouverts", k.disputes, ""],
          ].map(([l, v, s], i) => (
            <Reveal key={l as string} i={i % 4}>
              <div className="card kpi" style={l === "Litiges ouverts" && v ? { borderColor: "rgba(227,38,47,.5)" } : undefined}>
                <span>{l}</span>
                <b>
                  <CountUp to={v as number} suffix={s as string} />
                </b>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "end", marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => download("/admin/export.csv", "babylone-commandes.csv").catch((e) => toast(e.message))}>
            Export comptable (CSV)
          </button>
        </div>
        <div style={{ margin: "14px 0 18px" }}>
          <Segmented
            id="admin"
            value={tab}
            onChange={setTab}
            options={[
              ["analytics", "Audience"],
              ["orders", "Commandes"],
              ["payouts", "Versements"],
              ["moderation", `Modération · ${d.pending.length}`],
              ["sellers", "Vendeurs"],
              ["fraud", `Fraude · ${d.flags.length}`],
              ["outbox", "Messages"],
              ["integrations", "Intégrations"],
              ["audit", "Audit"],
              ["backups", "Sauvegardes"],
            ]}
          />
        </div>
        {tab === "analytics" ? (
          <Analytics />
        ) : tab === "payouts" ? (
          <Payouts />
        ) : tab === "audit" ? (
          <Audit />
        ) : tab === "backups" ? (
          <Backups />
        ) : tab === "integrations" ? (
          <div className="stack">
            <Integrations i={d.integrations} reload={load} />
            <BotSim />
          </div>
        ) : tab === "moderation" ? (
          <div className="stack">
            {d.pending.length === 0 && <div className="empty card">Aucune annonce en attente.</div>}
            {d.pending.map((a) => (
              <div key={a.id} className="card pad row between wrap" style={{ gap: 14 }}>
                <span className="prod-cell">
                  <img src={a.images[0]} alt="" />
                  <span>
                    <b>{a.title}</b>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {a.seller.name} · {a.city} · départ {money(a.start_price)} F · {a.category}
                    </div>
                    <div className="muted" style={{ fontSize: 13, maxWidth: 520 }}>{a.description}</div>
                    {a.ai_review && (
                      <div style={{ fontSize: 13, marginTop: 6, maxWidth: 520 }}>
                        <span className={`chip ${a.ai_review.verdict === "ok" ? "chip-ok" : "chip-red"}`}>
                          IA : {a.ai_review.verdict === "ok" ? "rien à signaler" : a.ai_review.verdict === "forbidden" ? "interdit ?" : "à vérifier"}
                        </span>{" "}
                        {a.ai_review.verdict !== "ok" && a.ai_review.summary}
                      </div>
                    )}
                  </span>
                </span>
                <span className="row">
                  <button className="btn btn-ghost btn-sm" onClick={() => act(`/admin/inspect/${a.id}`, "Badge « Inspecté » modifié")}>
                    {a.inspected ? "Retirer « Inspecté »" : "Marquer inspecté"}
                  </button>
                  <button className="btn btn-red btn-sm" onClick={() => act(`/admin/auctions/${a.id}/approve`, "Annonce publiée")}>
                    Valider
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const reason = prompt("Motif du refus (photos non réelles, produit interdit…)");
                      if (reason !== null) post(`/admin/auctions/${a.id}/reject`, { reason }).then(load);
                    }}
                  >
                    Refuser
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : tab === "fraud" ? (
          <div className="stack">
            {d.flags.length === 0 && <div className="empty card">Aucun signal.</div>}
            {d.flags.map((f) => (
              <div key={f.id} className="card pad row between wrap" style={{ gap: 12 }}>
                <span>
                  <span className="chip chip-red">{f.kind === "shill_ip" ? "Même IP que le vendeur" : f.kind === "ai_forbidden" ? "IA : produit interdit ?" : f.kind === "ai_to_check" ? "IA : annonce à vérifier" : "Comptes jumeaux"}</span>
                  <p style={{ marginTop: 8 }}>{f.detail}</p>
                  <p className="muted" style={{ fontSize: 13 }}>
                    {f.name} · <Link to={`/enchere/${f.auction_id}`} className="red">{f.title}</Link> · {ago(f.created_at)}
                  </p>
                </span>
                <span className="row">
                  <button className="chip" onClick={() => act(`/admin/users/${f.user_id}/block`, "Statut du compte modifié")}>
                    Bloquer / débloquer
                  </button>
                  <button className="chip chip-ok" onClick={() => act(`/admin/flags/${f.id}/resolve`, "Signal classé")}>
                    Classer
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : tab === "outbox" ? (
          <div className="card table-wrap" style={{ padding: "18px 6px" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Destinataire</th>
                  <th>Message</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {d.outbox.map((m) => (
                  <tr key={m.id}>
                    <td>{m.channel === "whatsapp" ? "WhatsApp" : "SMS"}</td>
                    <td className="num">+{m.recipient}</td>
                    <td style={{ fontSize: 13, maxWidth: 480 }}>{m.body}</td>
                    <td>
                      <span className={`chip ${m.status === "sent" ? "chip-ok" : m.status === "failed" ? "chip-red" : ""}`} title={m.error || ""}>
                        {m.status === "sent" ? "Envoyé" : m.status === "failed" ? "Échec" : "Simulé"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === "orders" ? (
          <div className="card table-wrap" style={{ padding: "18px 6px" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Produit</th>
                  <th>Acheteur → Vendeur</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.orders.map((o) => {
                  const [label, kind] = ORDER_STATUS[o.status];
                  return (
                    <tr key={o.id}>
                      <td className="num">
                        <Link to={`/compte/commandes/${o.id}`} className="red">
                          {o.id}
                        </Link>
                      </td>
                      <td>
                        <Link to={`/enchere/${o.auction.id}`} className="prod-cell">
                          <img src={o.auction.image} alt="" />
                          <b style={{ fontSize: 14 }}>{o.auction.title}</b>
                        </Link>
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {o.buyer.name} → {o.seller.name}
                      </td>
                      <td className="num">
                        {fcfa(o.amount)}
                        <div className="muted" style={{ fontSize: 12 }}>com. {money(o.commission)} F</div>
                      </td>
                      <td>
                        <span className={`chip ${kind ? `chip-${kind}` : ""}`}>{label}</span>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          {["shipped", "delivered", "disputed"].includes(o.status) && (
                            <button className="chip chip-ok" onClick={() => act(`/admin/orders/${o.id}/release`, "Fonds versés au vendeur")}>
                              Libérer
                            </button>
                          )}
                          {["paid", "shipped", "disputed"].includes(o.status) && (
                            <button className="chip" onClick={() => confirm("Rembourser l'acheteur ?") && act(`/admin/orders/${o.id}/refund`, "Remboursement enregistré")}>
                              Rembourser
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card table-wrap" style={{ padding: "18px 6px" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Boutique</th>
                  <th>Contact</th>
                  <th>Ville</th>
                  <th>Offre</th>
                  <th>Vérification</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.sellers.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.shop_name}</b>
                      <div className="muted" style={{ fontSize: 12.5 }}>{s.name}</div>
                    </td>
                    <td className="num">{s.phone}</td>
                    <td>{s.city}</td>
                    <td>{s.plan_until && s.plan_until > Date.now() ? <span className="chip chip-red">Pro</span> : <span className="chip">Standard</span>}</td>
                    <td>
                      <button className={`chip ${s.verified ? "chip-ok" : "chip-warn"}`} onClick={() => act(`/admin/users/${s.id}/verify`, s.verified ? "Vérification retirée" : "Vendeur vérifié")}>
                        {s.verified ? "Vérifié ✓" : "À vérifier"}
                      </button>
                    </td>
                    <td>
                      <button className={`chip ${s.blocked ? "chip-red" : ""}`} onClick={() => act(`/admin/users/${s.id}/block`, s.blocked ? "Compte débloqué" : "Compte bloqué")}>
                        {s.blocked ? "Bloqué" : "Bloquer"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Integrations({ i, reload }: { i: Data["integrations"]; reload: () => void }) {
  const { toast, user } = useApp();
  const [phone, setPhone] = useState(user?.phone || "");
  const [busy, setBusy] = useState("");
  const test = async (channel: string) => {
    setBusy(channel);
    try {
      const r = await post(`/admin/test/${channel}`, { phone });
      if (r.redirect) window.open(r.redirect, "_blank");
      toast(r.status === "simulated" || r.demo ? "Simulé : clé absente" : "Test envoyé", channel === "payment" ? "Page de paiement ouverte dans un nouvel onglet." : `Vérifie le téléphone ${phone}.`, "ok");
    } catch (e: any) {
      toast("Échec du test", e.message);
    } finally {
      setBusy("");
      reload();
    }
  };
  const rows: [string, string, boolean, string, string | null][] = [
    ["Paiements PayDunya", "PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN", !!i.paydunya, i.paydunya ? `Mode ${i.paydunya === "live" ? "réel" : "test (sandbox)"}` : "Non configuré", "payment"],
    ["SMS Orange", "ORANGE_CLIENT_ID, ORANGE_CLIENT_SECRET, ORANGE_SMS_SENDER", i.sms, i.sms ? "Branché" : "Simulé (code affiché à l'écran)", "sms"],
    ["WhatsApp Cloud", "WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE", i.whatsapp, i.whatsapp ? "Branché" : "Simulé (journal Messages)", "whatsapp"],
    [
      "Assistant IA (Claude)",
      "ANTHROPIC_API_KEY, AI_MODEL, AI_MODERATION, AI_DAILY_LIMIT",
      i.ai.enabled,
      i.ai.enabled ? `${i.ai.model} · ${i.ai.calls_today}/${i.ai.daily_limit} appels aujourd'hui` : "Non configuré",
      null,
    ],
    ["Mode démo", "DEMO_MODE, DEMO_BOTS", !i.demo, i.demo ? `Actif${i.bots ? ", acheteurs fictifs en marche" : ""}` : "Coupé", null],
    ["Adresse publique", "PUBLIC_URL", !!i.public_url, i.public_url || "Non définie", null],
  ];
  return (
    <div className="stack">
      <div className="card pad row wrap" style={{ gap: 12 }}>
        <label className="field" style={{ flex: 1, minWidth: 220 }}>
          <span>Numéro qui reçoit les tests</span>
          <input className="input num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77 123 45 67" />
        </label>
      </div>
      {rows.map(([name, vars, ok, state, channel]) => (
        <div key={name} className="card pad row between wrap" style={{ gap: 12 }}>
          <span>
            <b>{name}</b>
            <div className="muted num" style={{ fontSize: 12.5 }}>{vars}</div>
          </span>
          <span className="row">
            <span className={`chip ${ok ? "chip-ok" : "chip-warn"}`}>{state}</span>
            {channel && (
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => test(channel)}>
                {busy === channel ? "Test…" : "Tester"}
              </button>
            )}
          </span>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 13 }}>
        Les clés se règlent dans Render → Environment. Chaque enregistrement relance le serveur, environ une minute.
      </p>
    </div>
  );
}
