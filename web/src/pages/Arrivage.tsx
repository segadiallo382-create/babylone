import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { IBox, IClock, IPin, IShield } from "../components/Icons";
import { Empty, Tilt } from "../components/ui";
import { api, post } from "../lib/api";
import { fcfa, money, shortLeft } from "../lib/format";
import { completePayment } from "../lib/pay";
import { useApp, useNow } from "../lib/store";
import { PRE_STATUS, Progress, type Preorder } from "./Arrivages";

export default function Arrivage() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const nav = useNavigate();
  const now = useNow();
  const [p, setP] = useState<Preorder | null>(null);
  const [missing, setMissing] = useState(false);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(
    () =>
      api(`/preorders/${id}`)
        .then((r) => setP(r.preorder))
        .catch(() => setMissing(true)),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);
  if (missing) return <div className="page container"><Empty title="Arrivage introuvable." /></div>;
  if (!p) return <div className="page container"><div className="skeleton" style={{ height: 420 }} /></div>;
  const mine = user?.id === p.seller.id || user?.role === "admin";

  const run = async (fn: () => Promise<any>, msg: string) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fn();
      if (r?.payment_id) {
        if (!(await completePayment(r))) return;
      }
      toast(msg, undefined, "ok");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <Link to="/arrivages" className="muted" style={{ fontSize: 14 }}>
          ← Arrivages
        </Link>
        <div className="detail" style={{ marginTop: 16 }}>
          <Tilt max={6}>
            <div className="gallery-main">
              <img src={p.images[0]} alt={p.title} />
            </div>
          </Tilt>
          <div className="card bid-panel">
            <span className={`chip ${PRE_STATUS[p.status][1]}`}>{PRE_STATUS[p.status][0]}</span>
            <h1 className="display">{p.title}</h1>
            <p className="muted">
              <Link to={`/boutique/${p.seller.id}`} className="red">
                {p.seller.name}
              </Link>{" "}
              · {p.city}
            </p>
            <div className="divider" />
            <div className="row between wrap" style={{ alignItems: "end" }}>
              <div>
                <div className="eyebrow">Prix à la pièce</div>
                <div className="price-big">
                  {money(p.unit_price)} <small>FCFA</small>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="eyebrow">Acompte</div>
                <b className="display" style={{ fontSize: 30 }}>{p.deposit_pct} %</b>
              </div>
            </div>
            <div style={{ margin: "22px 0" }}>
              <Progress p={p} />
            </div>
            <div className="info-list">
              <div className="info-row">
                <span className="ico">
                  <IClock size={19} />
                </span>
                <div>
                  <b>{p.status === "open" ? `Réservations jusqu'au ${new Date(p.deadline).toLocaleDateString("fr-FR")}` : "Réservations closes"}</b>
                  <span>{p.status === "open" ? `Encore ${shortLeft(p.deadline - now)}` : ""}</span>
                </div>
              </div>
              <div className="info-row">
                <span className="ico">
                  <IBox size={19} />
                </span>
                <div>
                  <b>Arrivée prévue vers le {new Date(p.eta).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</b>
                  <span>Tu paies le solde quand l'importateur confirme l'arrivée.</span>
                </div>
              </div>
              <div className="info-row">
                <span className="ico">
                  <IShield size={19} />
                </span>
                <div>
                  <b>Acompte protégé</b>
                  <span>Remboursé intégralement si l'objectif de {p.min_units} pièces n'est pas atteint ou si l'arrivage est annulé.</span>
                </div>
              </div>
            </div>

            {p.status === "open" && !mine && (
              <>
                <div className="divider" />
                <div className="row between">
                  <span className="eyebrow">Quantité</span>
                  <span className="muted" style={{ fontSize: 13 }}>{p.remaining} disponibles</span>
                </div>
                <div className="bid-box">
                  <button className="icon-btn" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Moins">
                    −
                  </button>
                  <input className="input num" value={qty} inputMode="numeric" onChange={(e) => setQty(Math.max(1, Math.min(p.remaining, Number(e.target.value.replace(/\D/g, "")) || 1)))} />
                  <button className="icon-btn" onClick={() => setQty(Math.min(p.remaining, qty + 1))} aria-label="Plus">
                    +
                  </button>
                </div>
                <p className="muted" style={{ fontSize: 13.5, margin: "10px 0" }}>
                  Total {fcfa(p.unit_price * qty)} · acompte aujourd'hui <b style={{ color: "var(--text)" }}>{fcfa(Math.ceil((p.unit_price * qty * p.deposit_pct) / 100))}</b>
                </p>
                <button
                  className="btn btn-red btn-lg btn-block"
                  disabled={busy}
                  onClick={() => (user ? run(() => post(`/preorders/${p.id}/reserve`, { qty }), "Réservation confirmée") : nav(`/connexion?suite=/arrivage/${p.id}`))}
                >
                  Réserver {qty} pièce{qty > 1 ? "s" : ""}
                </button>
              </>
            )}

            {p.mine.length > 0 && (
              <>
                <div className="divider" />
                <h3>Mes réservations</h3>
                {p.mine.map((r) => (
                  <div key={r.id} className="history-row" style={{ marginTop: 8 }}>
                    <span className="who">
                      {r.qty} pièce{r.qty > 1 ? "s" : ""} · acompte {fcfa(r.deposit)}
                    </span>
                    {r.status === "balance_due" ? (
                      <button className="btn btn-red btn-sm" disabled={busy} onClick={() => run(() => post(`/reservations/${r.id}/pay`), "Solde payé")}>
                        Payer le solde {fcfa(p.unit_price * r.qty - r.deposit)}
                      </button>
                    ) : (
                      <span className={`chip ${r.status === "completed" ? "chip-ok" : r.status === "refunded" ? "" : "chip-red"}`}>
                        {({ reserved: "Réservé", completed: "Payé", refunded: "Remboursé" } as any)[r.status] || r.status}
                      </span>
                    )}
                  </div>
                ))}
              </>
            )}

            {mine && (
              <>
                <div className="divider" />
                <h3>Gestion de l'arrivage</h3>
                <div className="row wrap" style={{ marginTop: 10 }}>
                  {["open", "confirmed"].includes(p.status) && (
                    <button className="btn btn-red btn-sm" disabled={busy} onClick={() => confirm("Confirmer l'arrivée ? Les acheteurs seront invités à payer le solde.") && run(() => post(`/preorders/${p.id}/arrived`), "Acheteurs prévenus")}>
                      Le conteneur est arrivé
                    </button>
                  )}
                  {!["cancelled", "closed"].includes(p.status) && (
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm("Annuler et rembourser tous les acomptes ?") && run(() => post(`/preorders/${p.id}/cancel`), "Arrivage annulé")}>
                      Annuler
                    </button>
                  )}
                </div>
                {p.reservations && (
                  <div className="history" style={{ marginTop: 12 }}>
                    {p.reservations.map((r) => (
                      <div key={r.id} className="history-row">
                        <span className="who">
                          {r.name} · <span className="num">{r.phone}</span>
                        </span>
                        <span className="num">×{r.qty}</span>
                        <span className="chip" style={{ height: 22, fontSize: 11 }}>{r.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
          </div>
          <div className="detail-extra">
            <motion.div className="card pad" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <h3 style={{ marginBottom: 8 }}>Description</h3>
              <p className="muted" style={{ whiteSpace: "pre-line" }}>{p.description || "—"}</p>
              <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
                <span className="chip">{p.category}</span>
                <span className="chip">
                  <IPin size={13} /> {p.city}
                </span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
