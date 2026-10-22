import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Empty, Reveal, SplitTitle, Tilt } from "../components/ui";
import { api, type Auction } from "../lib/api";
import { money } from "../lib/format";
import { useApp } from "../lib/store";

export type Live = {
  id: number;
  title: string;
  stream_url: string | null;
  starts_at: number;
  status: "scheduled" | "live" | "ended";
  current_auction: number | null;
  seller: { id: number; name: string; verified: boolean };
  lots: Auction[];
  current: Auction | null;
};

export default function Lives() {
  const [items, setItems] = useState<Live[] | null>(null);
  const { user } = useApp();
  useEffect(() => {
    api("/lives").then((r) => setItems(r.items));
  }, []);
  const live = items?.filter((l) => l.status === "live") || [];
  const next = items?.filter((l) => l.status === "scheduled") || [];
  return (
    <div className="page">
      <div className="container">
        <div className="eyebrow">
          <span className="live-dot" style={{ display: "inline-block", marginRight: 8 }} />
          Salle des ventes
        </div>
        <h1 className="display page-title">
          <SplitTitle text="Enchères en live" />
        </h1>
        <p className="muted" style={{ maxWidth: 560 }}>
          L'importateur montre ses produits en direct, le prix monte à l'écran, tu enchéris d'un tap. Comme un live TikTok, mais avec le paiement protégé.
        </p>
        {user?.role === "seller" && (
          <Link to="/vendeur?tab=lives" className="btn btn-red" style={{ marginTop: 20 }}>
            Lancer mon live
          </Link>
        )}

        <h2 className="display" style={{ fontSize: 32, margin: "44px 0 18px" }}>
          En direct maintenant
        </h2>
        {items && !live.length && <Empty title="Aucun live en ce moment.">Reviens bientôt, ou suis tes boutiques préférées pour être prévenu.</Empty>}
        <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {live.map((l, i) => (
            <Reveal key={l.id} i={i}>
              <Tilt max={7}>
                <Link to={`/live/${l.id}`} className="a-card live-card">
                  <div className="media" style={{ aspectRatio: "16/10" }}>
                    {l.current && <img src={l.current.images[0]} alt="" />}
                    <div className="tags">
                      <span className="chip chip-red">
                        <span className="live-dot" style={{ background: "#fff" }} /> EN DIRECT
                      </span>
                      <span className="chip">{l.lots.length} lots</span>
                    </div>
                    <motion.div className="live-ping" animate={{ scale: [1, 1.6], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />
                  </div>
                  <div className="body">
                    <h3>{l.title}</h3>
                    <div className="meta">{l.seller.name}</div>
                    {l.current && (
                      <div className="price-row">
                        <span className="muted" style={{ fontSize: 13 }}>{l.current.title.slice(0, 34)}</span>
                        <span className="price">
                          {money(l.current.current_price)} <small>F</small>
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              </Tilt>
            </Reveal>
          ))}
        </div>

        {next.length > 0 && (
          <>
            <h2 className="display" style={{ fontSize: 32, margin: "54px 0 18px" }}>
              Programmés
            </h2>
            <div className="stack">
              {next.map((l) => (
                <Link key={l.id} to={`/live/${l.id}`} className="card pad row between wrap" style={{ gap: 12 }}>
                  <span>
                    <b>{l.title}</b>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {l.seller.name} · {l.lots.length} lots
                    </div>
                  </span>
                  <span className="chip num">
                    {new Date(l.starts_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })} à{" "}
                    {new Date(l.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
