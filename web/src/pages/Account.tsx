import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuctionCard } from "../components/AuctionCard";
import { IBell, ICheck, IGavel, IHeart, IUser, IZap } from "../components/Icons";
import { ShareWhatsApp } from "../components/Share";
import { Empty, Reveal } from "../components/ui";
import { api, post, type Auction, type Order } from "../lib/api";
import { liteMode, setLiteMode } from "../lib/perf";
import { ORDER_STATUS, ago, money } from "../lib/format";
import { useApp } from "../lib/store";

type Tab = "bids" | "watch" | "orders" | "notifs" | "referral" | "settings";
const TABS: [Tab, string, any, string][] = [
  ["bids", "Mes enchères", IGavel, "/compte"],
  ["watch", "Suivies", IHeart, "/compte/suivies"],
  ["orders", "Commandes", ICheck, "/compte/commandes"],
  ["notifs", "Notifications", IBell, "/compte/notifications"],
  ["referral", "Parrainage", IZap, "/compte/parrainage"],
  ["settings", "Réglages", IUser, "/compte/reglages"],
];

export default function Account() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, notifs, markRead } = useApp();
  const tab: Tab = TABS.find(([, , , p]) => p !== "/compte" && loc.pathname.startsWith(p))?.[0] || "bids";
  const [bids, setBids] = useState<Auction[] | null>(null);
  const [watch, setWatch] = useState<Auction[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (tab === "bids") api("/me/bids").then((r) => setBids(r.items));
    if (tab === "watch") api("/me/watch").then((r) => setWatch(r.items));
    if (tab === "orders") api("/me/orders").then((r) => setOrders(r.orders));
    if (tab === "notifs") setTimeout(markRead, 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const path = (t: Tab) => TABS.find(([k]) => k === t)![3];

  return (
    <div className="page">
      <div className="container">
        <div className="eyebrow">Mon espace</div>
        <h1 className="display page-title">Bonjour {user?.name.split(" ")[0]}</h1>
        {user && user.strikes > 0 && (
          <p className="chip chip-warn" style={{ marginBottom: 10 }}>
            {user.strikes} vente(s) gagnée(s) non payée(s). Au bout de 2, le compte ne peut plus enchérir.
          </p>
        )}
        <div className="dash" style={{ marginTop: 26 }}>
          <div className="side card">
            {TABS.map(([t, label, Icon]) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => nav(path(t))}>
                {tab === t && <motion.span layoutId="acc-side" className="side-pill" />}
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>
          <div>
            {tab === "bids" && <BidList items={bids} />}
            {tab === "watch" &&
              (watch?.length === 0 ? (
                <Empty title="Aucune vente suivie.">
                  <p>Clique sur « Suivre » sur une vente pour la retrouver ici.</p>
                </Empty>
              ) : (
                <div className="grid-cards">{watch?.map((a, i) => <Reveal key={a.id} i={i % 3}><AuctionCard a={a} /></Reveal>)}</div>
              ))}
            {tab === "orders" && <OrderList orders={orders} />}
            {tab === "referral" && <Referral />}
            {tab === "settings" && <Settings />}
            {tab === "notifs" && (
              <div className="card" style={{ padding: 8 }}>
                {notifs.length === 0 && <div className="empty">Aucune notification.</div>}
                {notifs.map((n) => (
                  <Link key={n.id} to={n.link || "#"} className={`notif ${n.read ? "" : "unread"}`}>
                    <span className="ndot" />
                    <span>
                      <b>{n.title}</b>
                      <p>{n.body}</p>
                      <p style={{ fontSize: 12, color: "var(--dim)" }}>{ago(n.created_at)}</p>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BidList({ items }: { items: Auction[] | null }) {
  if (!items) return <div className="skeleton" style={{ height: 300 }} />;
  if (!items.length)
    return (
      <Empty title="Tu n'as pas encore enchéri.">
        <Link to="/encheres" className="btn btn-red" style={{ marginTop: 16 }}>
          Découvrir les ventes
        </Link>
      </Empty>
    );
  return (
    <div className="card table-wrap" style={{ padding: "18px 6px" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Produit</th>
            <th>Mon offre max</th>
            <th>Prix actuel</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => {
            const live = a.status === "live";
            const state = live ? (a.is_leader ? ["En tête", "chip-ok"] : ["Dépassé", "chip-red"]) : a.is_leader && a.status === "sold" ? ["Gagné", "chip-ok"] : ["Perdu", ""];
            return (
              <tr key={a.id}>
                <td>
                  <Link to={`/enchere/${a.id}`} className="prod-cell">
                    <img src={a.images[0]} alt="" />
                    <span>
                      <b style={{ fontSize: 14 }}>{a.title}</b>
                      <div className="muted" style={{ fontSize: 12.5 }}>{a.city}</div>
                    </span>
                  </Link>
                </td>
                <td className="num">{money(a.my_max || 0)} F</td>
                <td className="num">
                  <b>{money(a.current_price)} F</b>
                </td>
                <td>
                  <span className={`chip ${state[1]}`}>{state[0]}</span>
                  {live && !a.is_leader && (
                    <Link to={`/enchere/${a.id}`} className="red" style={{ fontSize: 13, marginLeft: 8, fontWeight: 600 }}>
                      Relancer
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrderList({ orders }: { orders: Order[] | null }) {
  if (!orders) return <div className="skeleton" style={{ height: 300 }} />;
  if (!orders.length) return <Empty title="Aucune commande.">Les ventes que tu remportes apparaîtront ici.</Empty>;
  return (
    <div className="stack">
      {orders.map((o, i) => {
        const [label, kind] = ORDER_STATUS[o.status];
        return (
          <Reveal key={o.id} i={i}>
            <Link to={`/compte/commandes/${o.id}`} className="card pad row between wrap" style={{ gap: 16 }}>
              <span className="prod-cell">
                <img src={o.auction.image} alt="" />
                <span>
                  <b>{o.auction.title}</b>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Commande #{o.id} · {o.seller.name}
                  </div>
                </span>
              </span>
              <span className="row">
                <b className="num">{money(o.total)} F</b>
                <span className={`chip ${kind ? `chip-${kind}` : ""}`}>{label}</span>
              </span>
            </Link>
          </Reveal>
        );
      })}
    </div>
  );
}

function Referral() {
  const [d, setD] = useState<{ code: string; referrals: { name: string; role: string; created_at: number }[] } | null>(null);
  useEffect(() => {
    api("/me/referrals").then(setD);
  }, []);
  if (!d) return <div className="skeleton" style={{ height: 240 }} />;
  const link = `/inscription?ref=${d.code}`;
  return (
    <div className="stack">
      <div className="card plan pro">
        <span className="chip chip-red">Parrainage</span>
        <div className="big" style={{ fontSize: 48 }}>{d.code}</div>
        <p className="muted" style={{ maxWidth: 460 }}>
          Invite tes proches et les importateurs que tu connais. Chaque inscription avec ton code apparaît ici.
        </p>
        <div className="row wrap" style={{ marginTop: 20 }}>
          <ShareWhatsApp text="Rejoins-moi sur Babylone : des produits importés aux enchères, à partir de prix très bas." path={link} label="Inviter sur WhatsApp" />
          <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(`${location.origin}${link}`)}>
            Copier le lien
          </button>
        </div>
      </div>
      <div className="card pad">
        <h3 style={{ marginBottom: 10 }}>Mes filleuls · {d.referrals.length}</h3>
        {d.referrals.length === 0 && <p className="muted">Personne pour l'instant.</p>}
        {d.referrals.map((r, i) => (
          <div key={i} className="row between" style={{ padding: "8px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
            <span>{r.name}</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {r.role === "seller" ? "Vendeur" : "Acheteur"} · {ago(r.created_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Settings() {
  const { user, setUser, toast } = useApp();
  if (!user) return null;
  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button className={`switch ${on ? "on" : ""}`} onClick={onClick} aria-pressed={on}>
      <i />
    </button>
  );
  return (
    <div className="card" style={{ padding: 8 }}>
      <div className="row between notif" style={{ alignItems: "center" }}>
        <span>
          <b>Alertes WhatsApp</b>
          <p>Offre dépassée, vente gagnée, rappel de paiement, colis expédié. Envoyées au {user.phone}.</p>
        </span>
        <Toggle
          on={user.whatsapp}
          onClick={async () => {
            const r = await post("/me/settings", { whatsapp: !user.whatsapp });
            setUser(r.user);
            toast(r.user.whatsapp ? "Alertes WhatsApp activées" : "Alertes WhatsApp coupées", undefined, "ok");
          }}
        />
      </div>
      <div className="row between notif" style={{ alignItems: "center" }}>
        <span>
          <b>Mode allégé</b>
          <p>Coupe les animations 3D. Utile sur les petits téléphones ou avec peu de connexion.</p>
        </span>
        <Toggle on={liteMode()} onClick={() => setLiteMode(!liteMode())} />
      </div>
      <div className="row between notif">
        <span>
          <b>Téléphone</b>
          <p>{user.phone} · {user.phone_verified ? "vérifié par SMS" : "non vérifié"}</p>
        </span>
      </div>
    </div>
  );
}
