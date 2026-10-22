import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { IBox, ICheck, IPin, IShield, ITruck, IWallet } from "../components/Icons";
import { Stars } from "../components/ui";
import { SupportWhatsApp } from "../components/Share";
import { api, post, type Order, type Relay } from "../lib/api";
import { ORDER_STATUS, ago, fcfa, resizeImage, shortLeft } from "../lib/format";
import { socket, useApp, useNow } from "../lib/store";
import { can3D } from "../three/capability";

const GiftScene = lazy(() => import("../three/Scenes").then((m) => ({ default: m.GiftScene })));

const STEPS: [string, string, any][] = [
  ["awaiting_payment", "Gagné", ICheck],
  ["paid", "Payé", IWallet],
  ["shipped", "Expédié", ITruck],
  ["delivered", "Livré", IBox],
  ["released", "Clôturé", IShield],
];
const ORDER = ["awaiting_payment", "paid", "shipped", "delivered", "released"];

type Msg = { id: number; role: string; body: string; images: string[]; name: string; mine: boolean; created_at: number };

function PhotoPicker({ files, setFiles }: { files: string[]; setFiles: (f: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>
        📷 Photo{files.length ? ` (${files.length})` : ""}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const list = await Promise.all([...(e.target.files || [])].slice(0, 4 - files.length).map((f) => resizeImage(f, 1200, 0.8)));
          setFiles([...files, ...list].slice(0, 4));
          e.target.value = "";
        }}
      />
    </>
  );
}

function OrderChat({ order }: { order: Order }) {
  const [items, setItems] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(() => api(`/orders/${order.id}/messages`).then((r) => setItems(r.items)), [order.id]);
  useEffect(() => {
    load();
    const on = (e: any) => e.order_id === order.id && load();
    socket.on("order:message", on);
    return () => {
      socket.off("order:message", on);
    };
  }, [load, order.id]);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [items.length]);
  async function send() {
    if (!body.trim() && !files.length) return;
    setBusy(true);
    try {
      await post(`/orders/${order.id}/messages`, { body: body.trim() || "📷", images: files });
      setBody("");
      setFiles([]);
      load();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card pad" style={{ marginTop: 18 }}>
      <h3>Messages</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Échanges entre l'acheteur et le vendeur{order.status === "disputed" ? ", avec l'équipe Babylone pendant le litige" : ""}. Gardés comme preuve.
      </p>
      <div className="chat">
        {items.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Aucun message.</p>}
        {items.map((m) => (
          <motion.div key={m.id} className={`bubble ${m.mine ? "mine" : ""} ${m.role === "admin" ? "admin" : ""}`} initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
            <b>{m.mine ? "Toi" : m.name}</b>
            <p>{m.body}</p>
            {m.images.length > 0 && (
              <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                {m.images.map((src) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer">
                    <img src={src} alt="" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10 }} />
                  </a>
                ))}
              </div>
            )}
            <span>{ago(m.created_at)}</span>
          </motion.div>
        ))}
        <div ref={end} />
      </div>
      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <input className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Écrire un message…" onKeyDown={(e) => e.key === "Enter" && send()} />
        <PhotoPicker files={files} setFiles={setFiles} />
        <button className="btn btn-red btn-sm" onClick={send} disabled={busy}>
          Envoyer
        </button>
      </div>
    </div>
  );
}

export default function OrderPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { toast, meta } = useApp();
  const now = useNow();
  const [o, setO] = useState<Order | null>(null);
  const [provider, setProvider] = useState<"wave" | "orange_money">("wave");
  const [mode, setMode] = useState<"home" | "relay">("home");
  const [relays, setRelays] = useState<Relay[]>([]);
  const [relayId, setRelayId] = useState<number>(0);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [code, setCode] = useState("");
  const [dispute, setDispute] = useState(false);
  const [reason, setReason] = useState("");
  const [proofs, setProofs] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const load = useCallback(() => api(`/orders/${id}`).then((r) => setO(r.order)), [id]);
  useEffect(() => {
    load();
    api("/relays").then((r) => setRelays(r.items));
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
  const me = o.me;
  const idx = ORDER.indexOf(o.status);
  const [label, kind] = ORDER_STATUS[o.status];
  const relayList = [...relays].sort((a, b) => (a.city === o.buyer.city ? -1 : 0) - (b.city === o.buyer.city ? -1 : 0));
  const fee = mode === "relay" ? meta?.relay_fee || 1000 : o.delivery_fee;

  const act = async (path: string, body: any = {}, msg?: string) => {
    setBusy(true);
    setErr("");
    try {
      const r = await post(path.startsWith("/") ? path : `/orders/${o.id}/${path}`, body);
      if (r.redirect) {
        if (r.demo) nav(r.redirect);
        else window.location.href = r.redirect;
        return;
      }
      if (msg) toast(msg, undefined, "ok");
      load();
      return true;
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 920 }}>
        <Link to={me === "seller" ? "/vendeur" : me === "admin" ? "/admin" : "/compte/commandes"} className="muted" style={{ fontSize: 14 }}>
          ← Retour
        </Link>
        <div className="row between wrap" style={{ margin: "14px 0 6px" }}>
          <h1 className="display" style={{ fontSize: "clamp(32px,5vw,52px)" }}>
            Commande #{o.id}
          </h1>
          <span className="row">
            {["paid", "shipped", "delivered", "released", "refunded", "disputed"].includes(o.status) && (
              <Link to={`/facture/${o.id}`} className="chip">
                Facture
              </Link>
            )}
            <span className={`chip ${kind ? `chip-${kind}` : ""}`}>{label}</span>
          </span>
        </div>

        {me === "buyer" && o.status === "awaiting_payment" && can3D() && (
          <Suspense fallback={null}>
            <div className="gift-wrap">
              <GiftScene style={{ position: "absolute", inset: 0 }} />
              <div className="gift-text">
                <div className="display" style={{ fontSize: 34 }}>
                  C'est gagné !
                </div>
                <p className="muted">Paie avant la fin du délai pour confirmer.</p>
              </div>
            </div>
          </Suspense>
        )}

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
              {me === "seller" ? `Acheteur : ${o.buyer.name} · ${o.buyer.city}` : `Vendu par ${o.seller.name} · ${o.seller.city}`}
              {o.auction.quantity > 1 && ` · lot de ${o.auction.quantity}`}
            </div>
            <div className="stack" style={{ gap: 6, marginTop: 14, fontSize: 14.5 }}>
              <div className="row between">
                <span className="muted">Prix adjugé</span>
                <span className="num">{fcfa(o.amount)}</span>
              </div>
              <div className="row between">
                <span className="muted">{o.status === "awaiting_payment" ? (mode === "relay" ? "Retrait en point relais" : "Livraison à domicile") : o.delivery_mode === "relay" ? "Point relais" : "Livraison"}</span>
                <span className="num">{fcfa(o.status === "awaiting_payment" ? fee : o.delivery_fee)}</span>
              </div>
              {me === "seller" && (
                <div className="row between">
                  <span className="muted">Commission Babylone</span>
                  <span className="num">− {fcfa(o.commission)}</span>
                </div>
              )}
              <div className="row between" style={{ fontSize: 17 }}>
                <b>{me === "seller" ? "Tu reçois" : "Total"}</b>
                <b className="num">{fcfa(me === "seller" ? o.payout : o.amount + (o.status === "awaiting_payment" ? fee : o.delivery_fee))}</b>
              </div>
            </div>
          </div>
        </div>

        {o.decision && (
          <div className="card pad" style={{ marginTop: 18, borderColor: "rgba(255,176,32,.4)" }}>
            <b>Décision de l'équipe Babylone</b>
            <p className="muted">{o.decision}</p>
          </div>
        )}

        {/* ---------- Acheteur : paiement ---------- */}
        {o.status === "awaiting_payment" && me === "buyer" && (
          <motion.div className="card pad" style={{ marginTop: 18 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="row between wrap">
              <h3>Payer pour confirmer</h3>
              <span className="chip chip-warn num">Reste {shortLeft(o.pay_deadline - now)}</span>
            </div>
            <p className="muted" style={{ fontSize: 14, margin: "6px 0 18px" }}>
              Ton argent est bloqué chez Babylone et versé au vendeur seulement après la remise du colis.
            </p>
            <div className="role-pick" style={{ marginBottom: 14 }}>
              {(
                [
                  ["home", "Livraison à domicile", `${fcfa(o.delivery_fee)} · 24 à 72 h`],
                  ["relay", "Point relais", `${fcfa(meta?.relay_fee || 1000)} · retrait quand tu veux`],
                ] as const
              ).map(([m, t, d]) => (
                <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
                  <b>{t}</b>
                  <span>{d}</span>
                </button>
              ))}
            </div>
            {mode === "relay" ? (
              <div className="relay-list">
                {relayList.map((r) => (
                  <button key={r.id} className={`relay ${relayId === r.id ? "on" : ""}`} onClick={() => setRelayId(r.id)}>
                    <IPin size={16} />
                    <span>
                      <b>{r.name}</b>
                      <span className="muted" style={{ display: "block", fontSize: 12.5 }}>
                        {r.city} · {r.address} · {r.hours}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <label className="field">
                <span>Adresse de livraison</span>
                <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Quartier, rue, point de repère" />
              </label>
            )}
            <div className="role-pick" style={{ margin: "14px 0" }}>
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
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
            <button
              className="btn btn-red btn-lg btn-block"
              disabled={busy || (mode === "relay" && !relayId)}
              onClick={() => act("pay", { provider, address, delivery_mode: mode, relay_id: relayId })}
            >
              Payer {fcfa(o.amount + fee)}
            </button>
          </motion.div>
        )}

        {/* ---------- Acheteur : code de retrait ---------- */}
        {me === "buyer" && o.delivery_code && ["paid", "shipped"].includes(o.status) && (
          <motion.div className="card pad code-card" style={{ marginTop: 18 }} initial={{ rotateX: -30, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }}>
            <div className="eyebrow">Ton code de {o.delivery_mode === "relay" ? "retrait" : "livraison"}</div>
            <div className="code-digits">
              {o.delivery_code.split("").map((d, i) => (
                <motion.span key={i} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ delay: 0.2 + i * 0.12 }}>
                  {d}
                </motion.span>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 14 }}>
              Donne ce code {o.delivery_mode === "relay" ? "au point relais" : "au livreur"} seulement quand tu as le colis en main et qu'il est conforme. C'est ce qui débloque le paiement du
              vendeur.
            </p>
            {o.relay && (
              <p style={{ marginTop: 10, fontSize: 14 }}>
                <IPin size={14} /> <b>{o.relay.name}</b> · {o.relay.address} · {o.relay.hours}
              </p>
            )}
            {o.seller.phone && (
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Contact vendeur : <span className="num">{o.seller.phone}</span>
              </p>
            )}
          </motion.div>
        )}

        {/* ---------- Acheteur : réception / litige ---------- */}
        {me === "buyer" && ["paid", "shipped"].includes(o.status) && (
          <div className="card pad" style={{ marginTop: 18 }}>
            <h3>{o.status === "shipped" ? "Tu as reçu ton colis ?" : "Un problème ?"}</h3>
            <p className="muted" style={{ fontSize: 14, margin: "6px 0 16px" }}>
              {o.status === "shipped"
                ? "Confirme seulement si l'article est conforme. Sans réponse, les fonds sont libérés 72 h après la livraison."
                : "Si quelque chose ne va pas, ouvre un litige avec des photos : les fonds restent bloqués."}
            </p>
            <div className="row wrap">
              {o.status === "shipped" && (
                <button className="btn btn-red" disabled={busy} onClick={() => act("deliver", {}, "Réception confirmée")}>
                  Oui, tout est conforme
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setDispute(true)}>
                Signaler un problème
              </button>
              <SupportWhatsApp text={`Bonjour Babylone, j'ai besoin d'aide pour la commande n° ${o.id}.`} label="Aide sur WhatsApp" className="btn btn-ghost" />
            </div>
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
          </div>
        )}

        {me === "buyer" && ["delivered", "released"].includes(o.status) && (
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
                <StarPicker value={rating} onChange={setRating} />
                <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Qualité, conformité, livraison…" />
                <button className="btn btn-red" style={{ marginTop: 12 }} onClick={() => act("review", { rating, comment }, "Merci pour ton avis")}>
                  Publier mon avis
                </button>
              </>
            )}
          </div>
        )}

        {/* ---------- Vendeur ---------- */}
        {me === "seller" && (
          <div className="card pad" style={{ marginTop: 18 }}>
            <div className="row between wrap">
              <h3>Acheteur</h3>
              {o.buyer_reliability && (
                <span className={`chip ${o.buyer_reliability.score == null ? "" : o.buyer_reliability.score >= 90 ? "chip-ok" : "chip-warn"}`}>
                  Fiabilité {o.buyer_reliability.score == null ? "nouveau" : `${o.buyer_reliability.score} %`} · {o.buyer_reliability.paid} payée(s)
                </span>
              )}
            </div>
            <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
              {o.buyer.name} · {o.buyer.city}
              {o.buyer.phone && <> · <span className="num">{o.buyer.phone}</span></>}
              {o.address && o.status !== "awaiting_payment" && <> · {o.delivery_mode === "relay" ? "Point relais" : "Adresse"} : {o.address}</>}
            </p>
            {o.status === "paid" && (
              <button className="btn btn-red btn-sm" style={{ marginTop: 12 }} disabled={busy} onClick={() => act("ship", {}, "Commande expédiée")}>
                Marquer comme expédiée
              </button>
            )}
            {["paid", "shipped"].includes(o.status) && (
              <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
                <input className="input num" style={{ maxWidth: 180 }} inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="Code à 4 chiffres" />
                <button className="btn btn-ghost btn-sm" disabled={code.length !== 4 || busy} onClick={() => act("confirm-code", { code }, "Remise confirmée, paiement envoyé")}>
                  Confirmer la remise
                </button>
              </div>
            )}
            {o.payout_status && (
              <p className="muted" style={{ fontSize: 13.5, marginTop: 12 }}>
                Versement : <b>{({ sent: "envoyé", simulated: "envoyé (démo)", pending: "en cours", failed: "échec, nouvelle tentative auto", missing_account: "ajoute ton numéro de versement" } as any)[o.payout_status.status] || o.payout_status.status}</b>
                {o.payout_status.account && ` sur ${o.payout_status.method === "wave" ? "Wave" : "Orange Money"} ${o.payout_status.account}`}
              </p>
            )}
            {["paid", "shipped", "delivered", "released"].includes(o.status) && !o.buyer_review && (
              <div style={{ marginTop: 14 }}>
                <b style={{ fontSize: 14 }}>Noter l'acheteur</b>
                <StarPicker value={rating} onChange={setRating} />
                <button className="btn btn-ghost btn-sm" onClick={() => act("rate-buyer", { rating }, "Note enregistrée")}>
                  Enregistrer
                </button>
              </div>
            )}
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
          </div>
        )}

        {/* ---------- Admin : arbitrage ---------- */}
        {me === "admin" && ["shipped", "delivered", "disputed", "paid"].includes(o.status) && (
          <div className="card pad" style={{ marginTop: 18, borderColor: "rgba(227,38,47,.4)" }}>
            <h3>Arbitrage</h3>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motif de la décision (visible par les deux parties)" style={{ marginTop: 10 }} />
            <div className="row wrap" style={{ marginTop: 10 }}>
              {o.status !== "paid" && (
                <button className="btn btn-red btn-sm" onClick={() => act(`/admin/orders/${o.id}/release`, { note }, "Fonds libérés au vendeur")}>
                  Libérer au vendeur
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => confirm("Rembourser l'acheteur ?") && act(`/admin/orders/${o.id}/refund`, { note }, "Acheteur remboursé")}>
                Rembourser l'acheteur
              </button>
            </div>
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
          </div>
        )}

        {o.status === "expired" && (
          <div className="card pad" style={{ marginTop: 18 }}>
            <b>Le délai de paiement est dépassé.</b>
            <p className="muted" style={{ marginTop: 6 }}>La vente a été proposée à l'offrant suivant.</p>
          </div>
        )}

        {o.status !== "awaiting_payment" && o.status !== "expired" && <OrderChat order={o} />}
      </div>

      <AnimatePresence>
        {dispute && (
          <motion.div className="modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDispute(false)}>
            <motion.div
              className="card modal glass"
              onClick={(e) => e.stopPropagation()}
              initial={{ rotateX: 30, y: 40, opacity: 0 }}
              animate={{ rotateX: 0, y: 0, opacity: 1 }}
              exit={{ rotateX: 20, y: 30, opacity: 0 }}
            >
              <h2 className="display" style={{ fontSize: 30, marginBottom: 8 }}>
                Signaler un problème
              </h2>
              <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
                Les fonds restent bloqués. L'équipe Babylone examine le dossier avec le vendeur, en général sous 48 h.
              </p>
              <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ce qui ne va pas : article différent, abîmé, manquant…" />
              <div className="row wrap" style={{ marginTop: 10 }}>
                <PhotoPicker files={proofs} setFiles={setProofs} />
                {proofs.map((p, i) => (
                  <img key={i} src={p} alt="" style={{ width: 54, height: 54, borderRadius: 10, objectFit: "cover" }} />
                ))}
              </div>
              {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
              <div className="row" style={{ justifyContent: "end", marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={() => setDispute(false)}>
                  Annuler
                </button>
                <button
                  className="btn btn-red"
                  disabled={busy}
                  onClick={async () => {
                    if (await act("dispute", { reason, images: proofs }, "Litige ouvert")) setDispute(false);
                  }}
                >
                  Ouvrir le litige
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="row" style={{ margin: "10px 0", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.button key={i} whileHover={{ scale: 1.2, rotate: -10 }} onClick={() => onChange(i)} style={{ color: i <= value ? "var(--warn)" : "var(--dim)" }} aria-label={`${i} étoile${i > 1 ? "s" : ""}`}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill={i <= value ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
            <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z" />
          </svg>
        </motion.button>
      ))}
    </div>
  );
}
