// Admin v3 : statistiques d'audience, versements, journal d'audit, sauvegardes, simulateur du bot WhatsApp.
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, download, post } from "../lib/api";
import { ago, money } from "../lib/format";
import { useApp } from "../lib/store";

export function Analytics() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    api("/admin/analytics?days=14").then(setD);
  }, []);
  if (!d) return <div className="skeleton" style={{ height: 320 }} />;
  const f = d.funnel;
  const steps: [string, number][] = [
    ["Visites", f.visits],
    ["Pages produit vues", f.views],
    ["Offres", f.bids],
    ["Paiements", f.pays],
  ];
  const max = Math.max(1, ...steps.map((s) => s[1]));
  const maxDay = Math.max(1, ...d.series.map((x: any) => x.visits + x.bids));
  return (
    <div className="stack">
      <div className="card pad">
        <h3>Tunnel de conversion · 14 jours</h3>
        <div className="funnel">
          {steps.map(([l, v], i) => (
            <div key={l} className="funnel-row">
              <span>{l}</span>
              <motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(2, (v / max) * 100)}%` }} transition={{ delay: i * 0.12, duration: 0.8 }} />
              <b className="num">{money(v)}</b>
              <em className="muted num">{i > 0 && steps[i - 1][1] ? `${Math.round((100 * v) / steps[i - 1][1])} %` : ""}</em>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          {f.signups} inscription{f.signups > 1 ? "s" : ""} sur la période.
        </p>
      </div>
      <div className="card pad">
        <h3>Activité quotidienne</h3>
        <div className="days">
          {d.series.map((x: any) => (
            <div key={x.day} title={new Date(x.day).toLocaleDateString("fr-FR")}>
              <motion.i className="v" initial={{ height: 0 }} animate={{ height: `${(x.visits / maxDay) * 100}%` }} />
              <motion.i className="b" initial={{ height: 0 }} animate={{ height: `${(x.bids / maxDay) * 100}%` }} />
              <span>{new Date(x.day).getDate()}</span>
            </div>
          ))}
        </div>
        <div className="row muted" style={{ fontSize: 12, gap: 14 }}>
          <span>■ visites</span>
          <span className="red">■ offres</span>
        </div>
      </div>
      <div className="card pad">
        <h3 style={{ marginBottom: 10 }}>Ventes les plus vues</h3>
        {d.top.map((t: any) => (
          <div key={t.path} className="row between" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
            <Link to={t.path} className="red" style={{ fontSize: 14 }}>
              {t.title}
            </Link>
            <span className="num muted">{t.views} vues</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const PST: Record<string, [string, string]> = {
  sent: ["Envoyé", "chip-ok"],
  simulated: ["Simulé", "chip-ok"],
  pending: ["En cours", "chip-warn"],
  failed: ["Échec", "chip-red"],
  missing_account: ["Numéro manquant", "chip-warn"],
};

export function Payouts() {
  const [items, setItems] = useState<any[]>([]);
  const { toast } = useApp();
  const load = () => api("/admin/payouts").then((r) => setItems(r.items));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="card table-wrap" style={{ padding: "18px 6px" }}>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Bénéficiaire</th>
            <th>Type</th>
            <th>Montant</th>
            <th>Vers</th>
            <th>Statut</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td className="num">{p.id}</td>
              <td>{p.name}</td>
              <td>{({ seller_payout: "Paiement vendeur", refund: "Remboursement", deposit_refund: "Caution rendue" } as any)[p.kind]}</td>
              <td className="num">{money(p.amount)} F</td>
              <td className="num" style={{ fontSize: 13 }}>{p.account ? `${p.method === "wave" ? "Wave" : "OM"} ${p.account}` : "—"}</td>
              <td>
                <span className={`chip ${PST[p.status]?.[1] || ""}`} title={p.error || ""}>
                  {PST[p.status]?.[0] || p.status}
                </span>
              </td>
              <td>
                {["failed", "missing_account", "pending"].includes(p.status) && (
                  <button className="chip" onClick={() => post(`/admin/payouts/${p.id}/retry`).then(load).catch((e) => toast(e.message))}>
                    Relancer
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Audit() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api("/admin/audit").then((r) => setItems(r.items));
  }, []);
  return (
    <div className="card" style={{ padding: 8 }}>
      {items.length === 0 && <div className="empty">Aucune action enregistrée.</div>}
      {items.map((l) => (
        <div key={l.id} className="notif">
          <span>
            <b className="num" style={{ fontSize: 13 }}>
              {l.action} {l.target}
            </b>
            <p>
              {l.name} · {ago(l.created_at)} {l.detail && l.detail !== "{}" ? `· ${l.detail}` : ""}
            </p>
          </span>
        </div>
      ))}
    </div>
  );
}

export function Backups() {
  const [items, setItems] = useState<string[]>([]);
  const { toast } = useApp();
  const load = () => api("/admin/backups").then((r) => setItems(r.items));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="stack">
      <div className="card pad row between wrap">
        <span>
          <h3>Sauvegardes de la base</h3>
          <p className="muted" style={{ fontSize: 13.5 }}>Automatique chaque nuit (7 gardées). Télécharge-les régulièrement hors du serveur.</p>
        </span>
        <button className="btn btn-red btn-sm" onClick={() => post("/admin/backups").then(load).then(() => toast("Sauvegarde créée", undefined, "ok"))}>
          Sauvegarder maintenant
        </button>
      </div>
      {items.map((n) => (
        <div key={n} className="card pad row between">
          <span className="num">{n}</span>
          <button className="chip" onClick={() => download(`/admin/backups/${n}`, n).catch((e) => toast(e.message))}>
            Télécharger
          </button>
        </div>
      ))}
    </div>
  );
}

export function BotSim() {
  const { user } = useApp();
  const [phone, setPhone] = useState(user?.phone || "");
  const [text, setText] = useState("");
  const [log, setLog] = useState<{ me: boolean; t: string }[]>([]);
  async function send(t = text) {
    if (!t.trim()) return;
    setLog((l) => [...l, { me: true, t }]);
    setText("");
    const r = await post("/admin/bot", { phone, text: t });
    setLog((l) => [...l, { me: false, t: r.reply }]);
  }
  return (
    <div className="card pad">
      <h3>Simulateur du bot WhatsApp</h3>
      <p className="muted" style={{ fontSize: 13.5, margin: "4px 0 12px" }}>
        Teste les réponses comme si tu écrivais au numéro WhatsApp de Babylone. En production, branche le webhook <span className="num">/api/webhooks/whatsapp</span> dans Meta.
      </p>
      <input className="input num" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Numéro de l'expéditeur" style={{ maxWidth: 240, marginBottom: 10 }} />
      <div className="wa">
        {log.map((m, i) => (
          <div key={i} className={`wa-msg ${m.me ? "me" : ""}`}>
            {m.t}
          </div>
        ))}
      </div>
      <div className="row wrap" style={{ gap: 6, margin: "10px 0" }}>
        {["Bonjour", "VENTES", "MES ENCHERES", "OUI"].map((q) => (
          <button key={q} className="chip" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ex. 23, ou E 23 15000" />
        <button className="btn btn-red btn-sm" onClick={() => send()}>
          Envoyer
        </button>
      </div>
    </div>
  );
}
