import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuctionCard } from "../components/AuctionCard";
import { IBox, ICheck, IEye, IHeart, IPin, IShield, IStore, ITruck, IZap } from "../components/Icons";
import { ShareWhatsApp } from "../components/Share";
import { MarketPrice, Poster } from "../components/AuctionExtras";
import { can3D } from "../three/capability";
import { serverNow, track } from "../lib/store";
import { useT } from "../lib/i18n";

const ProductViewer = lazy(() => import("../three/Scenes").then((m) => ({ default: m.ProductViewer })));
import { Burst, Odometer, Reveal, RingTimer, Stars, Tilt } from "../components/ui";
import { api, post, type Auction } from "../lib/api";
import { ago, fcfa, money } from "../lib/format";
import { socket, useApp } from "../lib/store";

type Bid = { id: number; amount: number; created_at: number; bidder: string; mine: boolean; auto?: boolean };

// Vente multiple : meilleure offre de chaque acheteur, triée
function rankBids(bids: Bid[]) {
  const best = new Map<string, Bid>();
  for (const b of bids) {
    const k = b.mine ? "__me" : b.bidder;
    const cur = best.get(k);
    if (!cur || b.amount > cur.amount) best.set(k, b);
  }
  return [...best.values()].sort((x, y) => y.amount - x.amount || x.created_at - y.created_at).slice(0, 12);
}

export default function AuctionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, toast } = useApp();
  const [a, setA] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [step, setStep] = useState(0);
  const [myOrder, setMyOrder] = useState<{ id: number; status: string } | null>(null);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [img, setImg] = useState(0);
  const [burst, setBurst] = useState(0);
  const [similar, setSimilar] = useState<Auction[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const [view3d, setView3d] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const t = useT();
  const [autoMax, setAutoMax] = useState(0);

  const load = useCallback(() => {
    api(`/auctions/${id}`)
      .then((r) => {
        setA(r.auction);
        setBids(r.bids);
        setStep(r.increment);
        setMyOrder(r.my_order);
        setAmount((v) => Math.max(v, r.auction.next_min));
        api(`/sellers/${r.auction.seller.id}`)
          .then((x) => setFollowing(x.seller.following))
          .catch(() => {});
        api(`/auctions?category=${encodeURIComponent(r.auction.category)}&limit=5`).then((s) =>
          setSimilar(s.auctions.filter((x: Auction) => x.id !== r.auction.id).slice(0, 4)),
        );
      })
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    setA(null);
    setAmount(0);
    setImg(0);
    setView3d(false);
    load();
    track("view");
  }, [load]);

  useEffect(() => {
    socket.emit("watch", id);
    const onBid = (e: any) => {
      if (String(e.auction_id) !== String(id)) return;
      if (e.mode === "multi") return load(); // classement recalculé côté serveur
      setA((p) =>
        p && {
          ...p,
          current_price: e.price ?? e.amount,
          bids_count: e.bids_count,
          next_min: e.next_min,
          ends_at: e.ends_at,
          reserve_met: e.reserve_met,
          leader: e.bidder,
          is_leader: e.bidder_id === user?.id,
        },
      );
      const added: Bid[] = (e.added || [e]).map((b: any, i: number) => ({
        id: b.created_at * 100 + i,
        amount: b.amount,
        created_at: b.created_at,
        bidder: b.bidder,
        mine: b.bidder_id === user?.id,
        auto: b.auto,
      }));
      setBids((b) => [...added.reverse(), ...b].slice(0, 40));
      setStep(e.next_min - (e.price ?? e.amount));
      setAmount((v) => Math.max(v, e.next_min));
      if (e.extended) toast("Vente prolongée", "Une offre de dernière minute ajoute 2 minutes.");
    };
    const onEnded = (e: any) => String(e.auction_id) === String(id) && setTimeout(load, 600);
    socket.on("bid", onBid);
    socket.on("ended", onEnded);
    return () => {
      socket.emit("unwatch", id);
      socket.off("bid", onBid);
      socket.off("ended", onEnded);
    };
  }, [id, user?.id, load, toast]);

  if (notFound)
    return (
      <div className="page container">
        <div className="empty card">
          <b>Vente introuvable.</b>
          <Link to="/encheres" className="btn btn-red" style={{ marginTop: 16 }}>
            Voir les enchères
          </Link>
        </div>
      </div>
    );
  if (!a)
    return (
      <div className="page container detail">
        <div className="skeleton" style={{ aspectRatio: "1" }} />
        <div className="skeleton" style={{ height: 520 }} />
      </div>
    );

  const live = a.status === "live" && a.ends_at > serverNow();
  const mine = user?.id === a.seller.id;
  const multi = a.mode === "multi";

  async function bid(value = amount, max = autoOn ? autoMax : 0) {
    if (!user) return nav(`/connexion?suite=/enchere/${id}`);
    setBusy(true);
    setErr("");
    try {
      const r = await post(`/auctions/${id}/bid`, { amount: value, max_auto: max || undefined });
      if (r.bid.raised) {
        toast("Plafond mis à jour", `Babylone enchérira pour toi jusqu'à ${fcfa(r.bid.my_auto_max)}.`, "ok");
        setA((p) => p && { ...p, my_auto_max: r.bid.my_auto_max });
      } else if (r.bid.you_lead) {
        setBurst(Date.now());
        toast("Offre placée", multi ? "Tu fais partie des gagnants." : max ? `En tête, enchère automatique jusqu'à ${fcfa(max)}.` : `Tu es en tête à ${fcfa(value)}.`, "ok");
        if (max) setA((p) => p && { ...p, my_auto_max: max });
        if (navigator.vibrate) navigator.vibrate(30);
      } else {
        toast("Déjà dépassé", "Un autre acheteur avait une enchère automatique plus haute. Relance !");
      }
      if (multi) load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function payDeposit() {
    try {
      const r = await post("/me/deposit");
      if (r.redirect) return void (window.location.href = r.redirect);
      await post(`/payments/${r.payment_id}/demo-confirm`);
      toast("Caution versée", "Tu peux enchérir sur les gros lots. Elle t'est rendue sur demande.", "ok");
      setErr("");
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function follow() {
    if (!user) return nav(`/connexion?suite=/enchere/${id}`);
    const r = await post(`/sellers/${a!.seller.id}/follow`);
    setFollowing(r.following);
    toast(r.following ? `Tu suis ${a!.seller.name}` : "Boutique retirée de tes abonnements", r.following ? "Tu seras prévenu de ses nouveaux arrivages." : undefined, "ok");
  }

  async function buy() {
    if (!user) return nav(`/connexion?suite=/enchere/${id}`);
    if (!confirm(`Acheter tout de suite pour ${fcfa(a!.buy_now_price)} ? La vente s'arrête et tu as 24 h pour payer.`)) return;
    try {
      const r = await post(`/auctions/${id}/buy`);
      toast("C'est à toi !", "Paie sous 24 h pour confirmer.", "ok");
      nav(`/compte/commandes/${r.order_id}`);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function watch() {
    if (!user) return nav(`/connexion?suite=/enchere/${id}`);
    const r = await post(`/auctions/${id}/watch`);
    setA((p) => p && { ...p, watching: r.watching, watchers: p.watchers + (r.watching ? 1 : -1) });
  }

  const delivery = user?.city === a.city ? "1 500 F (même ville)" : "2 000 à 3 500 F selon ta ville";

  return (
    <div className="page">
      <div className="container">
        <div className="row muted" style={{ fontSize: 13, marginBottom: 20 }}>
          <Link to="/encheres">Enchères</Link> / <Link to={`/encheres?category=${encodeURIComponent(a.category)}`}>{a.category}</Link>
        </div>
        <div className="detail">
          <div>
            <Tilt max={view3d ? 0 : 6}>
              <div className="gallery-main">
                {view3d && (
                  <Suspense fallback={null}>
                    <div style={{ position: "absolute", inset: 0, zIndex: 2, background: "radial-gradient(70% 70% at 50% 40%, #1d1013, #0d0d10)" }}>
                      <ProductViewer src={a.images[img]} />
                    </div>
                  </Suspense>
                )}
                <AnimatePresence mode="wait">
                  <motion.img
                    key={img}
                    src={a.images[img]}
                    alt={a.title}
                    initial={{ opacity: 0, rotateY: 35, scale: 0.94 }}
                    animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                    exit={{ opacity: 0, rotateY: -35, scale: 0.94 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  />
                </AnimatePresence>
                {can3D() && (
                  <button className="chip glass view3d-btn" onClick={() => setView3d(!view3d)}>
                    {view3d ? "Photo" : "◆ Vue 3D"}
                  </button>
                )}
                <div className="tags" style={{ position: "absolute", top: 16, left: 16, display: "flex", gap: 6, zIndex: 3 }}>
                  {live && (
                    <span className="chip glass">
                      <span className="live-dot" /> En direct
                    </span>
                  )}
                  {a.inspected && <span className="chip chip-ok glass">✓ Inspecté par Babylone</span>}
                  {a.mode === "multi" ? (
                    <span className="chip glass">
                      {a.quantity} pièces · {a.quantity} gagnants
                    </span>
                  ) : (
                    a.quantity > 1 && <span className="chip glass">Lot de {a.quantity} pièces</span>
                  )}
                </div>
              </div>
            </Tilt>
            {a.images.length > 1 && (
              <div className="thumbs">
                {a.images.map((src, i) => (
                  <button key={src} className={i === img ? "on" : ""} onClick={() => setImg(i)}>
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            )}

          </div>

          <div className="card bid-panel">
            <Burst fire={burst} />
            <div className="row between wrap">
              <span className="chip">{a.category}</span>
              <button className={`chip ${a.watching ? "chip-red" : ""}`} onClick={watch}>
                <IHeart size={13} fill={a.watching ? "currentColor" : "none"} /> {a.watching ? "Suivie" : "Suivre"} · {a.watchers}
              </button>
            </div>
            <h1 className="display">{a.title}</h1>
            <div className="divider" />
            <div className="row between wrap" style={{ gap: 18, alignItems: "end" }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  {multi ? (live ? "Prix d'entrée parmi les gagnants" : "Plus petite offre gagnante") : a.bids_count ? (live ? "Offre actuelle" : "Prix final") : "Prix de départ"}
                </div>
                <motion.div className="price-big" key={a.current_price} initial={{ rotateX: -60, opacity: 0.4 }} animate={{ rotateX: 0, opacity: 1 }} style={{ transformPerspective: 600 }}>
                  <Odometer value={a.current_price} />
                  <small>FCFA</small>
                </motion.div>
                <div className="muted" style={{ fontSize: 13.5, marginTop: 8 }}>
                  {a.bids_count} offre{a.bids_count > 1 ? "s" : ""} · départ {money(a.start_price)} F
                  {multi
                    ? ` · ${a.quantity} pièces, ${a.quantity} gagnants, chacun paie son offre`
                    : a.quantity > 1 && ` · soit ${money(Math.round(a.current_price / a.quantity))} F la pièce`}
                </div>
              </div>
              <RingTimer endsAt={a.ends_at} startsAt={a.starts_at} />
            </div>

            {a.has_reserve && (
              <div style={{ marginTop: 16 }}>
                <span className={`chip ${a.reserve_met ? "chip-ok" : "chip-warn"}`}>
                  {a.reserve_met ? "Prix de réserve atteint : la vente sera conclue" : "Prix de réserve non atteint"}
                </span>
                {mine && a.reserve_price ? <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>Ta réserve : {fcfa(a.reserve_price)}</span> : null}
              </div>
            )}

            <AnimatePresence>
              {a.is_leader && live && (
                <motion.div className="leader-banner" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <ICheck size={18} />
                  {multi
                    ? `Tu es ${a.my_rank === 1 ? "1er" : `${a.my_rank}e`} sur ${a.quantity} gagnants. On te prévient si tu sors du classement.`
                    : a.my_auto_max
                      ? `Tu es en tête. Babylone enchérit pour toi jusqu'à ${money(a.my_auto_max)} F.`
                      : "Tu es le meilleur offrant. On te prévient si quelqu'un te dépasse."}
                </motion.div>
              )}
            </AnimatePresence>

            {live && !mine && (
              <>
                <div className="divider" />
                <div className="row between">
                  <span className="eyebrow">Ton offre</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    Palier : +{money(step)} F
                  </span>
                </div>
                <div className="bid-box">
                  <button className="icon-btn" onClick={() => setAmount((v) => Math.max(a.next_min, v - step))} aria-label="Diminuer">
                    −
                  </button>
                  <input
                    className="input num"
                    inputMode="numeric"
                    value={money(amount)}
                    onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
                    aria-label="Montant de l'offre en FCFA"
                  />
                  <button className="icon-btn" onClick={() => setAmount((v) => v + step)} aria-label="Augmenter">
                    +
                  </button>
                </div>
                <div className="quick">
                  {[0, 2, 5].map((k) => {
                    const v = a.next_min + k * step;
                    return (
                      <button key={k} onClick={() => bid(v)} disabled={busy}>
                        {money(v)} F
                      </button>
                    );
                  })}
                </div>
                {!multi && (
                  <div className="auto-box">
                    <label className="row" style={{ cursor: "pointer", gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={autoOn}
                        onChange={(e) => {
                          setAutoOn(e.target.checked);
                          if (!autoMax) setAutoMax(Math.max(amount, a.next_min) + step * 4);
                        }}
                      />
                      <span>
                        <b style={{ fontSize: 14 }}>Enchère automatique</b>
                        <span className="muted" style={{ display: "block", fontSize: 12.5 }}>
                          Babylone surenchérit pour toi, palier par palier, jusqu'à ton plafond. Personne ne voit ton plafond.
                        </span>
                      </span>
                    </label>
                    <AnimatePresence>
                      {autoOn && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                          <label className="field" style={{ marginTop: 10 }}>
                            <span>Mon plafond (FCFA)</span>
                            <input className="input num" inputMode="numeric" value={money(autoMax)} onChange={(e) => setAutoMax(Number(e.target.value.replace(/\D/g, "")) || 0)} />
                          </label>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                {a.is_leader && !multi ? (
                  <motion.button className="btn btn-ghost btn-lg btn-block" onClick={() => bid(0, autoMax)} disabled={busy || !autoOn || autoMax <= a.current_price} whileTap={{ scale: 0.96 }}>
                    {a.my_auto_max ? "Relever mon plafond" : "Activer l'enchère automatique"}
                  </motion.button>
                ) : (
                  <motion.button
                    className="btn btn-red btn-lg btn-block"
                    onClick={() => bid()}
                    disabled={busy || amount < a.next_min || (autoOn && autoMax < amount)}
                    whileTap={{ scale: 0.96 }}
                  >
                    {busy ? "Envoi…" : autoOn ? `${t("Enchérir")} ${money(amount)} F · auto jusqu'à ${money(autoMax)} F` : `${t("Enchérir")} ${money(amount)} F`}
                  </motion.button>
                )}
                {a.buy_now_price > 0 && (
                  <button className="btn btn-light btn-block" style={{ marginTop: 10 }} onClick={buy}>
                    <IZap size={16} /> Acheter maintenant · {money(a.buy_now_price)} F
                  </button>
                )}
                {err && (
                  <motion.p className="err" initial={{ x: -8 }} animate={{ x: [8, -6, 4, 0] }} style={{ marginTop: 10 }}>
                    {err}
                  </motion.p>
                )}
                {/Caution/.test(err) && (
                  <button className="btn btn-light btn-sm" style={{ marginTop: 8 }} onClick={payDeposit}>
                    Verser la caution
                  </button>
                )}
                <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
                  Une offre engage à payer si tu gagnes. Une offre dans les 2 dernières minutes prolonge la vente de 2 minutes.
                </p>
              </>
            )}

            {!live && (
              <div className="card pad" style={{ marginTop: 18, background: "rgba(255,255,255,.03)" }}>
                {myOrder ? (
                  <>
                    <b style={{ fontSize: 18 }}>Tu as remporté cette vente 🎉</b>
                    <p className="muted" style={{ margin: "6px 0 14px" }}>Paie sous 24 h pour confirmer, sinon elle passe à l'offrant suivant.</p>
                    <Link to={`/compte/commandes/${myOrder.id}`} className="btn btn-red btn-block">
                      {myOrder.status === "awaiting_payment" ? "Payer maintenant" : "Suivre ma commande"}
                    </Link>
                  </>
                ) : a.status === "sold" ? (
                  <b>Adjugé à {a.leader} pour {fcfa(a.current_price)}.</b>
                ) : (
                  <b>Vente terminée sans acheteur.</b>
                )}
              </div>
            )}

            <div className="divider" />
            <div className="info-list">
              <div className="info-row">
                <span className="ico">
                  <IShield size={19} />
                </span>
                <div>
                  <b>Paiement protégé</b>
                  <span>Wave ou Orange Money. Le vendeur est payé après ta confirmation de réception.</span>
                </div>
              </div>
              <div className="info-row">
                <span className="ico">
                  <ITruck size={19} />
                </span>
                <div>
                  <b>Livraison à domicile</b>
                  <span>Depuis {a.city} · {delivery}</span>
                </div>
              </div>
              <div className="info-row">
                <span className="ico">
                  <IBox size={19} />
                </span>
                <div>
                  <b>{a.mode === "multi" ? `Vente multiple : 1 pièce par gagnant` : a.quantity > 1 ? `Lot de ${a.quantity} pièces` : "Article à l'unité"}</b>
                  <span>Photos réelles fournies par l'importateur. Litige possible si non conforme.</span>
                </div>
              </div>
            </div>

            {a.live_id && live && (
              <Link to={`/live/${a.live_id}`} className="btn btn-red btn-block" style={{ marginTop: 14 }}>
                <span className="live-dot" style={{ background: "#fff" }} /> Présenté en live : rejoindre la salle
              </Link>
            )}
            <div className="row wrap" style={{ marginTop: 18 }}>
              <Poster a={a} />
              <ShareWhatsApp text={`${a.title} à ${money(a.current_price)} F en ce moment sur Babylone. Fais ton offre :`} path={`/enchere/${a.id}`} />
            </div>
            <div className="divider" />
            <div className="row between">
              <h3>{multi ? "Classement" : "Historique des offres"}</h3>
              <span className="muted" style={{ fontSize: 13 }}>{a.bids_count}</span>
            </div>
            <div className="history">
              {bids.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Aucune offre. Sois le premier !</p>}
              <AnimatePresence initial={false}>
                {(multi ? rankBids(bids) : bids.slice(0, 8)).map((b, i) => (
                  <motion.div
                    key={b.id}
                    layout
                    className={`history-row ${(multi ? i < a.quantity : i === 0) ? "top" : ""}`}
                    initial={{ opacity: 0, rotateX: -90, y: -10 }}
                    animate={{ opacity: 1, rotateX: 0, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{ transformPerspective: 600, transformOrigin: "top" }}
                  >
                    {multi ? <span className="num muted" style={{ width: 22 }}>{i + 1}</span> : i === 0 && <IZap size={15} className="red" />}
                    <span className="who">
                      {b.mine ? "Toi" : b.bidder}
                      {b.auto && <span className="chip" style={{ height: 20, fontSize: 10.5, marginLeft: 6 }}>auto</span>}
                      <span className="muted" style={{ fontSize: 12 }}> · {ago(b.created_at)}</span>
                    </span>
                    <b className="num">{money(b.amount)} F</b>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          <div className="detail-extra">
            <Reveal>
              <div className="card pad" style={{ marginTop: 24 }}>
                <h3 style={{ marginBottom: 10 }}>Description</h3>
                <p className="muted" style={{ whiteSpace: "pre-line" }}>
                  {a.description || "Le vendeur n'a pas ajouté de description."}
                </p>
                <div className="row wrap" style={{ marginTop: 16, gap: 8 }}>
                  <span className="chip">État : {a.condition}</span>
                  {a.size && <span className="chip">Taille {a.size}</span>}
                  <span className="chip">{a.category}</span>
                  <span className="chip">
                    <IPin size={13} /> {a.city}
                  </span>
                  <span className="chip">
                    <IEye size={13} /> {a.views} vues
                  </span>
                </div>
              </div>
            </Reveal>

            <MarketPrice id={a.id} current={a.current_price} />
            <Reveal>
              <div className="card pad" style={{ marginTop: 16 }}>
                <div className="row between">
                  <div className="row">
                    <span className="avatar" style={{ borderRadius: 14 }}>
                      <IStore size={18} />
                    </span>
                    <Link to={`/boutique/${a.seller.id}`}>
                      <b>{a.seller.name}</b>
                      <div className="muted" style={{ fontSize: 13 }}>
                        Importateur · {a.seller.city} · <span className="red">voir la boutique</span>
                      </div>
                    </Link>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {a.seller.verified && (
                      <span className="chip chip-ok">
                        <ICheck size={13} /> Vérifié
                      </span>
                    )}
                    {a.seller.pro && <span className="chip chip-red">Pro</span>}
                  </div>
                </div>
                {user?.id !== a.seller.id && (
                  <button className={`btn btn-sm ${following ? "btn-ghost" : "btn-red"}`} style={{ marginTop: 12 }} onClick={follow}>
                    {following ? "Abonné ✓" : `+ ${t("Suivre")} la boutique`}
                  </button>
                )}
                {a.seller.rating ? (
                  <div className="row" style={{ marginTop: 12, fontSize: 14 }}>
                    <Stars value={a.seller.rating} /> <b>{a.seller.rating}</b>
                    <span className="muted">({a.seller.reviews} avis)</span>
                  </div>
                ) : (
                  <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
                    Pas encore d'avis.
                  </p>
                )}
              </div>
            </Reveal>
          </div>
        </div>

        {similar.length > 0 && (
          <section style={{ marginTop: 80 }}>
            <h2 className="display" style={{ fontSize: 40, marginBottom: 24 }}>
              Dans la même catégorie
            </h2>
            <div className="grid-cards">
              {similar.map((s, i) => (
                <Reveal key={s.id} i={i}>
                  <AuctionCard a={s} />
                </Reveal>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
