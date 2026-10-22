import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuctionCard } from "../components/AuctionCard";
import { IBox, IChart, IGavel, IMegaphone, IPlus, IZap } from "../components/Icons";
import { CountUp, Empty, Reveal } from "../components/ui";
import { api, post, type Auction, type Order, type User } from "../lib/api";
import { ORDER_STATUS, fcfa, money, resizeImage } from "../lib/format";
import { useApp } from "../lib/store";

type Tab = "overview" | "auctions" | "new" | "orders" | "demands" | "pro";
type Dash = {
  user: User;
  kpis: { live: number; gmv: number; payout: number; pending_payout: number; views: number; bids: number; sell_through: number | null };
  series: { day: number; bids: number; sales: number }[];
  auctions: Auction[];
  orders: Order[];
  demands: { id: number; title: string; category: string; budget_max: number | null; city: string; votes: number; mine: boolean }[];
};

export default function Seller() {
  const [tab, setTab] = useState<Tab>("overview");
  const [d, setD] = useState<Dash | null>(null);
  const load = useCallback(() => api("/seller/dashboard").then(setD), []);
  useEffect(() => {
    load();
  }, [load]);

  const toShip = d?.orders.filter((o) => o.status === "paid").length || 0;
  const tabs: [Tab, string, any, number?][] = [
    ["overview", "Vue d'ensemble", IChart],
    ["auctions", "Mes ventes", IGavel],
    ["new", "Nouvelle vente", IPlus],
    ["orders", "Commandes", IBox, toShip],
    ["demands", "Demandes", IMegaphone],
    ["pro", "Offre Pro", IZap],
  ];

  return (
    <div className="page">
      <div className="container">
        <div className="row between wrap">
          <div>
            <div className="eyebrow">Espace vendeur</div>
            <h1 className="display page-title">{d?.user.shop_name || "Ma boutique"}</h1>
          </div>
          <div className="row">
            {d?.user.verified ? <span className="chip chip-ok">Vendeur vérifié</span> : <span className="chip chip-warn">Vérification en attente</span>}
            {d?.user.plan === "pro" && <span className="chip chip-red">Pro</span>}
          </div>
        </div>
        <div className="dash" style={{ marginTop: 26 }}>
          <div className="side card">
            {tabs.map(([t, label, Icon, badge]) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {tab === t && <motion.span layoutId="seller-side" className="side-pill" />}
                <Icon size={18} /> {label}
                {!!badge && <span className="chip chip-red" style={{ height: 22, marginLeft: "auto" }}>{badge}</span>}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, rotateY: 8, x: 20 }}
              animate={{ opacity: 1, rotateY: 0, x: 0 }}
              exit={{ opacity: 0, rotateY: -8, x: -20 }}
              transition={{ duration: 0.35 }}
              style={{ transformPerspective: 1400, minWidth: 0 }}
            >
              {!d ? (
                <div className="skeleton" style={{ height: 400 }} />
              ) : tab === "overview" ? (
                <Overview d={d} go={setTab} />
              ) : tab === "auctions" ? (
                <MyAuctions d={d} reload={load} />
              ) : tab === "new" ? (
                <NewAuction
                  onDone={() => {
                    load();
                    setTab("auctions");
                  }}
                />
              ) : tab === "orders" ? (
                <SellerOrders orders={d.orders} reload={load} />
              ) : tab === "demands" ? (
                <Demands d={d} />
              ) : (
                <Pro d={d} reload={load} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Chart({ series }: { series: Dash["series"] }) {
  const W = 700;
  const H = 200;
  const max = Math.max(1, ...series.map((s) => s.bids));
  const pts = series.map((s, i) => [(i / (series.length - 1)) * W, H - 16 - (s.bids / max) * (H - 40)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const area = `${line}L${W},${H}L0,${H}Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e3262f" stopOpacity=".45" />
          <stop offset="1" stopColor="#e3262f" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={area} fill="url(#g)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.8 }} />
      <motion.path d={line} fill="none" stroke="#ff4b4f" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: "easeInOut" }} />
      {pts.map((p, i) => (
        <motion.circle key={i} cx={p[0]} cy={p[1]} r="4" fill="#0a0a0b" stroke="#ff4b4f" strokeWidth="2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8 + i * 0.04 }} />
      ))}
    </svg>
  );
}

function Overview({ d, go }: { d: Dash; go: (t: Tab) => void }) {
  const k = d.kpis;
  const pro = d.user.plan === "pro";
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="kpis">
        {[
          ["Ventes en cours", k.live, ""],
          ["Volume vendu", k.gmv, " F"],
          ["Net reçu", k.payout - k.pending_payout, " F"],
          ["En attente de versement", k.pending_payout, " F"],
        ].map(([l, v, s], i) => (
          <Reveal key={l as string} i={i}>
            <div className="card kpi">
              <span>{l}</span>
              <b>
                <CountUp to={v as number} suffix={s as string} />
              </b>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="card pad" style={{ position: "relative", overflow: "hidden" }}>
        <div className="row between wrap">
          <div>
            <h3>Offres reçues · 14 jours</h3>
            <span className="muted" style={{ fontSize: 13 }}>
              {k.bids} offres · {k.views} vues {k.sell_through != null && `· ${k.sell_through} % de ventes conclues`}
            </span>
          </div>
          {!pro && (
            <button className="chip chip-red" onClick={() => go("pro")}>
              <IZap size={12} /> Statistiques détaillées en Pro
            </button>
          )}
        </div>
        <div style={{ filter: pro ? "none" : "blur(0px)", marginTop: 16 }}>
          <Chart series={d.series} />
        </div>
      </div>
      <div className="row wrap">
        <button className="btn btn-red" onClick={() => go("new")}>
          <IPlus size={18} /> Publier une vente
        </button>
        {d.orders.some((o) => o.status === "paid") && (
          <button className="btn btn-ghost" onClick={() => go("orders")}>
            <IBox size={18} /> Commandes à expédier
          </button>
        )}
      </div>
    </div>
  );
}

function MyAuctions({ d, reload }: { d: Dash; reload: () => void }) {
  const { toast } = useApp();
  if (!d.auctions.length) return <Empty title="Aucune vente publiée.">Publie ton premier article en 2 minutes.</Empty>;
  const pro = d.user.plan === "pro";
  return (
    <div className="card table-wrap" style={{ padding: "18px 6px" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Produit</th>
            <th>Prix</th>
            <th>Offres</th>
            <th>Statut</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {d.auctions.map((a) => (
            <tr key={a.id}>
              <td>
                <Link to={`/enchere/${a.id}`} className="prod-cell">
                  <img src={a.images[0]} alt="" />
                  <span>
                    <b style={{ fontSize: 14 }}>{a.title}</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {a.views} vues · {a.watchers} suivis{a.reserve_price ? ` · réserve ${money(a.reserve_price)} F` : ""}
                    </div>
                  </span>
                </Link>
              </td>
              <td className="num">
                <b>{money(a.current_price)} F</b>
              </td>
              <td className="num">{a.bids_count}</td>
              <td>
                {a.moderation === "pending" ? (
                  <span className="chip chip-warn">En attente de validation</span>
                ) : a.moderation === "rejected" ? (
                  <span className="chip">Refusée</span>
                ) : (
                  <span className={`chip ${a.status === "live" ? "chip-red" : a.status === "sold" ? "chip-ok" : ""}`}>
                    {a.status === "live" ? "En direct" : a.status === "sold" ? "Vendu" : a.status === "unsold" ? "Invendu" : "Annulé"}
                  </span>
                )}
                {a.mode === "multi" && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{a.quantity} pièces</div>}
              </td>
              <td>
                <div className="row" style={{ gap: 6, justifyContent: "end" }}>
                  {a.status === "live" && pro && (
                    <button
                      className={`chip ${a.boosted ? "chip-red" : ""}`}
                      onClick={async () => {
                        await post(`/auctions/${a.id}/boost`);
                        reload();
                      }}
                    >
                      <IZap size={12} /> {a.boosted ? "À la une" : "Mettre en avant"}
                    </button>
                  )}
                  {a.status === "live" && a.bids_count === 0 && (
                    <button
                      className="chip"
                      onClick={async () => {
                        if (!confirm("Annuler cette vente ?")) return;
                        try {
                          await post(`/auctions/${a.id}/cancel`);
                          reload();
                        } catch (e: any) {
                          toast(e.message);
                        }
                      }}
                    >
                      Annuler
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewAuction({ onDone }: { onDone: () => void }) {
  const { meta, user, toast } = useApp();
  const [f, setF] = useState({
    title: "",
    description: "",
    category: "",
    condition: "neuf",
    city: user?.city || "Thiès",
    quantity: "1",
    start_price: "",
    reserve_price: "",
    buy_now_price: "",
    mode: "lot" as "lot" | "multi",
    duration_hours: "48",
  });
  const [images, setImages] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const n = (s: string) => Number(s.replace(/\D/g, "")) || 0;

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const list = await Promise.all([...files].slice(0, 6 - images.length).map((file) => resizeImage(file)));
    setImages((x) => [...x, ...list].slice(0, 6));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await post("/auctions", {
        ...f,
        quantity: n(f.quantity),
        start_price: n(f.start_price),
        reserve_price: n(f.reserve_price),
        buy_now_price: f.mode === "lot" ? n(f.buy_now_price) : 0,
        duration_hours: Number(f.duration_hours),
        images,
      });
      if (r.pending) toast("Annonce envoyée", "Elle sera en ligne dès que ton compte vendeur est vérifié par l'équipe Babylone.", "ok");
      else toast("Vente publiée", r.notified ? `${r.notified} acheteur(s) qui attendaient ce produit ont été prévenus.` : "Elle est en ligne.", "ok");
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const preview: Auction = {
    id: 0,
    title: f.title || "Titre de ton article",
    description: f.description,
    category: f.category || "Catégorie",
    condition: f.condition,
    city: f.city,
    region: "",
    images: images.length ? images : ["/products/sac-dos.jpg"],
    mode: f.mode,
    quantity: n(f.quantity) || 1,
    buy_now_price: f.mode === "lot" ? n(f.buy_now_price) : 0,
    my_rank: null,
    my_auto_max: null,
    moderation: "approved",
    start_price: n(f.start_price),
    current_price: n(f.start_price) || 0,
    has_reserve: n(f.reserve_price) > 0,
    reserve_met: false,
    bids_count: 0,
    next_min: n(f.start_price),
    leader: null,
    is_leader: false,
    starts_at: Date.now(),
    ends_at: Date.now() + Number(f.duration_hours) * 3600 * 1000,
    status: "live",
    boosted: false,
    views: 0,
    watchers: 0,
    watching: false,
    seller: { id: 0, name: user?.shop_name || "Ma boutique", city: f.city, verified: !!user?.verified, pro: user?.plan === "pro", rating: null, reviews: 0 },
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(240px,1fr)", gap: 24, alignItems: "start" }} className="new-auction">
      <form className="card pad form-grid" onSubmit={submit}>
        <h2 className="display" style={{ fontSize: 32 }}>
          Nouvelle vente
        </h2>
        <div
          className={`drop-zone ${over ? "over" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <b>Ajoute des photos réelles</b>
          <div style={{ fontSize: 13 }}>Glisse-les ici ou touche pour choisir · 6 max · les acheteurs font confiance aux vraies photos</div>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        </div>
        {images.length > 0 && (
          <div className="previews">
            {images.map((src, i) => (
              <motion.div key={i} initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}>
                <img src={src} alt="" />
                <button type="button" onClick={() => setImages((x) => x.filter((_, j) => j !== i))} aria-label="Retirer">
                  ×
                </button>
              </motion.div>
            ))}
          </div>
        )}
        <div className="role-pick">
          {(
            [
              ["lot", "Lot unique", "1 gagnant remporte tout (ou un seul article)"],
              ["multi", "Vente multiple", "N pièces identiques, les N meilleures offres gagnent chacune 1 pièce"],
            ] as const
          ).map(([m, t, d]) => (
            <button type="button" key={m} className={f.mode === m ? "on" : ""} onClick={() => setF({ ...f, mode: m, quantity: m === "multi" && n(f.quantity) < 2 ? "10" : f.quantity })}>
              <b>{t}</b>
              <span>{d}</span>
            </button>
          ))}
        </div>
        <label className="field">
          <span>Titre</span>
          <input className="input" value={f.title} onChange={set("title")} placeholder="Ex. Baskets running, lot de 12 paires" required maxLength={90} />
        </label>
        <div className="form-2">
          <label className="field">
            <span>Catégorie</span>
            <select className="select" value={f.category} onChange={set("category")} required>
              <option value="">Choisir</option>
              {meta?.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>État</span>
            <select className="select" value={f.condition} onChange={set("condition")}>
              {meta?.conditions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Description</span>
          <textarea className="textarea" value={f.description} onChange={set("description")} placeholder="Provenance, tailles, défauts éventuels, garantie…" />
        </label>
        <div className="form-2">
          <label className="field">
            <span>{f.mode === "multi" ? "Prix de départ par pièce" : "Prix de départ (FCFA)"}</span>
            <input className="input num" inputMode="numeric" value={f.start_price} onChange={set("start_price")} placeholder="Ex. 5 000" required />
          </label>
          <label className="field">
            <span>Prix de réserve, caché (FCFA)</span>
            <input className="input num" inputMode="numeric" value={f.reserve_price} onChange={set("reserve_price")} placeholder="Optionnel" />
          </label>
        </div>
        <div className="form-2">
          <label className="field">
            <span>{f.mode === "multi" ? "Nombre de pièces (= gagnants)" : "Quantité dans le lot"}</span>
            <input className="input num" inputMode="numeric" value={f.quantity} onChange={set("quantity")} />
          </label>
          <label className="field">
            <span>Durée</span>
            <select className="select" value={f.duration_hours} onChange={set("duration_hours")}>
              {[
                ["6", "6 heures"],
                ["24", "1 jour"],
                ["48", "2 jours"],
                ["72", "3 jours"],
                ["120", "5 jours"],
                ["168", "7 jours"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        {f.mode === "lot" && (
          <label className="field">
            <span>Prix d'achat immédiat (optionnel)</span>
            <input className="input num" inputMode="numeric" value={f.buy_now_price} onChange={set("buy_now_price")} placeholder="Un acheteur peut tout prendre à ce prix et arrêter la vente" />
          </label>
        )}
        <label className="field">
          <span>Ville d'expédition</span>
          <select className="select" value={f.city} onChange={set("city")}>
            {meta?.cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ fontSize: 13 }}>
          Le palier entre deux offres est fixé automatiquement par Babylone selon le prix. Sans prix de réserve, la vente est conclue dès la première offre.
          Commission : {Math.round((meta?.commission_rate || 0.15) * 100)} % du prix final.
        </p>
        {err && <p className="err">{err}</p>}
        <button className="btn btn-red btn-lg" disabled={busy}>
          {busy ? "Publication…" : "Publier la vente"}
        </button>
      </form>
      <div style={{ position: "sticky", top: 100 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Aperçu en direct
        </div>
        <div style={{ pointerEvents: "none" }}>
          <AuctionCard a={preview} />
        </div>
      </div>
    </div>
  );
}

function SellerOrders({ orders, reload }: { orders: Order[]; reload: () => void }) {
  const { toast } = useApp();
  if (!orders.length) return <Empty title="Aucune commande pour l'instant." />;
  return (
    <div className="stack">
      {orders.map((o) => {
        const [label, kind] = ORDER_STATUS[o.status];
        return (
          <div key={o.id} className="card pad">
            <div className="row between wrap" style={{ gap: 14 }}>
              <span className="prod-cell">
                <img src={o.auction.image} alt="" />
                <span>
                  <b>{o.auction.title}</b>
                  <div className="muted" style={{ fontSize: 13 }}>
                    #{o.id} · {o.buyer.name} · {o.buyer.city}
                    {o.buyer.phone && <> · <span className="num">{o.buyer.phone}</span></>}
                  </div>
                </span>
              </span>
              <span className={`chip ${kind ? `chip-${kind}` : ""}`}>{label}</span>
            </div>
            <div className="row wrap between" style={{ marginTop: 14, gap: 12 }}>
              <span className="muted num" style={{ fontSize: 14 }}>
                Adjugé {fcfa(o.amount)} · commission {fcfa(o.commission)} · <b style={{ color: "var(--text)" }}>net {fcfa(o.payout)}</b>
              </span>
              {o.status === "paid" && (
                <button
                  className="btn btn-red btn-sm"
                  onClick={async () => {
                    await post(`/orders/${o.id}/ship`);
                    toast("Commande expédiée", "L'acheteur est prévenu.", "ok");
                    reload();
                  }}
                >
                  Marquer comme expédiée
                </button>
              )}
            </div>
            {o.address && o.status !== "awaiting_payment" && (
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                Livrer à : {o.address}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Demands({ d }: { d: Dash }) {
  return (
    <div className="stack">
      <p className="muted">Les demandes les plus soutenues par les acheteurs. Une vente dans la même catégorie prévient automatiquement ces personnes.</p>
      {d.demands.map((r, i) => (
        <Reveal key={r.id} i={i}>
          <div className="card pad row between wrap" style={{ gap: 12 }}>
            <span>
              <b>{r.title}</b>
              <div className="muted" style={{ fontSize: 13 }}>
                {r.category} · {r.city}
                {r.budget_max && ` · budget ${money(r.budget_max)} F`}
              </div>
            </span>
            <span className="row">
              {r.mine && <span className="chip chip-ok">Ta catégorie</span>}
              <span className="chip chip-red num">+{r.votes}</span>
            </span>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

function Pro({ d, reload }: { d: Dash; reload: () => void }) {
  const { setUser, toast, meta } = useApp();
  const pro = d.user.plan === "pro";
  return (
    <div className="card plan pro" style={{ maxWidth: 560 }}>
      <span className="chip chip-red">Offre Pro</span>
      <div className="big num">{money(meta?.pro_price || 5000)} F</div>
      <div className="muted">par mois</div>
      <ul>
        {["Ventes illimitées en même temps", "Mise en avant « À la une » en page d'accueil", "Statistiques détaillées", "Badge Pro"].map((x) => (
          <li key={x}>
            <IZap size={16} /> {x}
          </li>
        ))}
      </ul>
      {pro ? (
        <p className="chip chip-ok">Actif jusqu'au {new Date(d.user.plan_until!).toLocaleDateString("fr-FR")}</p>
      ) : (
        <button
          className="btn btn-red btn-block"
          onClick={async () => {
            try {
              const r = await post("/seller/pro");
              setUser(r.user);
              toast("Bienvenue en Pro", undefined, "ok");
              reload();
            } catch (e: any) {
              toast(e.message);
            }
          }}
        >
          Activer l'offre Pro{meta?.demo ? " (démo)" : ""}
        </button>
      )}
    </div>
  );
}
