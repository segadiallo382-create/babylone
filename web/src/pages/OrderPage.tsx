import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { IBox, ICheck, IShield, ITruck, IWallet } from "../components/Icons";
import { Stars } from "../components/ui";
import { api, post, type Order } from "../lib/api";
import { ORDER_STATUS, fcfa, shortLeft } from "../lib/format";
import { socket, useApp, useNow } from "../lib/store";

const STEPS: [string, string, any][] = [
  ["awaiting_payment", "Gagné", ICheck],
  ["paid", "Payé", IWallet],
  ["shipped", "Expédié", ITruck],
  ["delivered", "Livré", IBox],
  ["released", "Clôturé", IShield],
];
const ORDER = ["awaiting_payment", "paid", "shipped", "delivered", "released"];

export default function OrderPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user, toast } = useApp();
  const now = useNow();
  const [o, setO] = useState<Order | null>(null);
  const [provider, setProvider] = useState<"wave" | "orange_money">("wave");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const load = useCallback(() => api(`/orders/${id}`).then((r) => setO(r.order)), [id]);
  useEffect(() => {
    load();
    const on = (e: any) => String(e.id) === String(id) && load();
    socket.on("order", on);
    return () => {
      socket.off("order", on);
    };
  }, [id, load]);
  useEffect(() => {
    if (sp.get("paiement") === "ok") toast("Paiement confirmé", "Ton argent est sécurisé jusqu'à la livraison.", "ok");
  }, [sp, toast]);

  if (!o) return <div className="page container"><div className="skeleton" style={{ height: 400 }} /></div>;
  const isBuyer = o.me === "buyer";
  const idx = ORDER.indexOf(o.status);
  const [label, kind] = ORDER_STATUS[o.status];

  const act = async (path: string, body: any = {}, msg?: string) => {
    setBusy(true);
    setErr("");
    try {
      const r = await post(`/orders/${o.id}/${path}`, body);
      if (r.redirect) {
        if (r.demo) nav(r.redirect);
        else window.location.href = r.redirect;
        return;
      }
      if (msg) toast(msg, undefined, "ok");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 900 }}>
        <Link to="/compte/commandes" className="muted" style={{ fontSize: 14 }}>
          ← Mes commandes
        </Link>
        <div className="row between wrap" style={{ margin: "14px 0 6px" }}>
          <h1 className="display" style={{ fontSize: "clamp(32px,5vw,52px)" }}>
            Commande #{o.id}
          </h1>
          <span className={`chip ${kind ? `chip-${kind}` : ""}`}>{label}</span>
        </div>

        {idx >= 0 && (
          <div className="timeline">
            {STEPS.map(([s, l, Icon], i) => (
              <motion.div
                key={s}
                className={`tl-step ${i <= idx ? "done" : ""}`}
                initial={{ opacity: 0, y: 10, rotateX: -60 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ delay: i * 0.1 }}
                style={{ transformPerspective: 500 }}
              >
                <div className="dot">
                  <Icon size={16} />
                </div>
                <span>{l}</span>
              </motion.div>
            ))}
          </div>
        )}

        <div className="card pad row wrap" style={{ gap: 20 }}>
          <img src={o.auction.image} alt="" style={{ width: 110, height: 110, borderRadius: 18, objectFit: "cover" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <Link to={`/enchere/${o.auction.id}`}>
              <b style={{ fontSize: 18 }}>{o.auction.title}</b>
            </Link>
            <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
              Vendu par {o.seller.name} · {o.seller.city}
              {o.auction.quantity > 1 && ` · lot de ${o.auction.quantity}`}
            </div>
            <div className="stack" style={{ gap: 6, marginTop: 14, fontSize: 14.5 }}>
              <div className="row between"><span className="muted">Prix adjugé</span><span className="num">{fcfa(o.amount)}</span></div>
              <div className="row between"><span className="muted">Livraison</span><span className="num">{fcfa(o.delivery_fee)}</span></div>
              <div className="row between" style={{ fontSize: 17 }}><b>Total</b><b className="num">{fcfa(o.total)}</b></div>
            </div>
          </div>
        </div>

        {o.status === "awaiting_payment" && isBuyer && (
          <motion.div className="card pad" style={{ marginTop: 18 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="row between wrap">
              <h3>Payer pour confirmer</h3>
              <span className="chip chip-warn num">Reste {shortLeft(o.pay_deadline - now)}</span>
            </div>
            <p className="muted" style={{ fontSize: 14, margin: "6px 0 18px" }}>
              Ton argent est bloqué chez Babylone et versé au vendeur seulement après ta confirmation de réception.
            </p>
            <div className="role-pick" style={{ marginBottom: 14 }}>
              {(
                [
                  ["wave", "Wave", "Paiement instantané"],
                  ["orange_money", "Orange Money", "Code de confirmation"],
                ] as const
              ).map(([p, t, d]) => (
                <button key={p} className={provider === p ? "on" : ""} onClick={() => setProvider(p)}>
                  <b>{t}</b>
                  <span>{d}</span>
                </button>
              ))}
            </div>
            <label className="field">
              <span>Adresse de livraison</span>
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Quartier, rue, point de repère" />
            </label>
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
            <button className="btn btn-red btn-lg btn-block" style={{ marginTop: 16 }} disabled={busy} onClick={() => act("pay", { provider, address })}>
              Payer {fcfa(o.total)}
            </button>
          </motion.div>
        )}

        {o.status === "shipped" && isBuyer && (
          <div className="card pad" style={{ marginTop: 18 }}>
            <h3>Tu as reçu ton colis ?</h3>
            <p className="muted" style={{ fontSize: 14, margin: "6px 0 16px" }}>
              Confirme seulement si l'article est conforme. Le vendeur sera alors payé. Sans réponse, les fonds sont libérés 72 h après la livraison.
            </p>
            <div className="row wrap">
              <button className="btn btn-red" disabled={busy} onClick={() => act("deliver", {}, "Réception confirmée")}>
                Oui, tout est conforme
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  const reason = prompt("Décris le problème (article non conforme, abîmé, manquant…)");
                  if (reason) act("dispute", { reason }, "Litige ouvert");
                }}
              >
                Signaler un problème
              </button>
            </div>
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
          </div>
        )}

        {o.status === "paid" && isBuyer && (
          <div className="card pad" style={{ marginTop: 18 }}>
            <b>Paiement reçu. Le vendeur prépare ton colis.</b>
            <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
              Contact vendeur : <span className="num">{o.seller.phone}</span>
            </p>
          </div>
        )}

        {["delivered", "released"].includes(o.status) && isBuyer && (
          <div className="card pad" style={{ marginTop: 18 }}>
            {o.review ? (
              <>
                <b>Ton avis</b>
                <div style={{ marginTop: 8 }}>
                  <Stars value={o.review.rating} />
                </div>
                <p className="muted">{o.review.comment}</p>
              </>
            ) : (
              <>
                <h3>Note le vendeur</h3>
                <div className="row" style={{ margin: "12px 0", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <motion.button key={i} whileHover={{ scale: 1.2, rotate: -10 }} onClick={() => setRating(i)} style={{ color: i <= rating ? "var(--warn)" : "var(--dim)" }}>
                      <svg width="30" height="30" viewBox="0 0 24 24" fill={i <= rating ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
                        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z" />
                      </svg>
                    </motion.button>
                  ))}
                </div>
                <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Qualité, conformité, livraison…" />
                <button className="btn btn-red" style={{ marginTop: 12 }} onClick={() => act("review", { rating, comment }, "Merci pour ton avis")}>
                  Publier mon avis
                </button>
              </>
            )}
          </div>
        )}

        {o.status === "expired" && (
          <div className="card pad" style={{ marginTop: 18 }}>
            <b>Le délai de paiement est dépassé.</b>
            <p className="muted" style={{ marginTop: 6 }}>La vente a été proposée à l'offrant suivant.</p>
          </div>
        )}
      </div>
    </div>
  );
}
