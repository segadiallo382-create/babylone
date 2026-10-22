import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Auction } from "../lib/api";
import { money } from "../lib/format";
import { useFeed } from "../lib/store";
import { REGION_LABEL } from "../data/geo";

const MapScene = lazy(() => import("../three/MapScene").then((m) => ({ default: m.MapScene })));

export function MapSection({ tall = false }: { tall?: boolean }) {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [tip, setTip] = useState<{ name: string; x: number; y: number } | null>(null);
  const feed = useFeed();
  const nav = useNavigate();

  useEffect(() => {
    const load = () => api("/auctions?limit=100").then((r) => setAuctions(r.auctions)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const { byRegion, byCity } = useMemo(() => {
    const r: Record<string, number> = {};
    const c: Record<string, number> = {};
    for (const a of auctions) {
      r[a.region] = (r[a.region] || 0) + 1;
      c[a.city] = (c[a.city] || 0) + 1;
    }
    return { byRegion: r, byCity: c };
  }, [auctions]);

  const tipItems = tip ? auctions.filter((a) => a.region === tip.name) : [];

  return (
    <div className="map-wrap" style={tall ? { height: "min(760px, 82vh)" } : undefined}>
      <Suspense fallback={<div className="skeleton" style={{ position: "absolute", inset: 0 }} />}>
        <MapScene byRegion={byRegion} byCity={byCity} onHover={setTip} onPick={(r) => nav(`/encheres?region=${encodeURIComponent(r)}`)} />
      </Suspense>
      <AnimatePresence>
        {tip && (
          <motion.div
            className="map-tip glass"
            style={{ left: tip.x, top: tip.y }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <b>{REGION_LABEL[tip.name] || tip.name}</b>
            <div className="muted">
              {tipItems.length ? `${tipItems.length} vente${tipItems.length > 1 ? "s" : ""} en direct · cliquer pour voir` : "Aucune vente pour l'instant"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="map-hint chip">
        <span className="live-dot" /> {auctions.length} ventes en direct
      </div>
      <div className="map-legend glass">
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Dernière offre
        </div>
        <AnimatePresence mode="popLayout">
          {feed[0] ? (
            <motion.div
              key={feed[0].created_at}
              initial={{ opacity: 0, y: 14, rotateX: -50 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, y: -14 }}
              style={{ transformPerspective: 600 }}
            >
              <b className="red num" style={{ fontSize: 22, fontFamily: "var(--display)" }}>
                {money(feed[0].amount)} F
              </b>
              <div style={{ fontSize: 13 }}>
                {feed[0].bidder} · {feed[0].city}
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {feed[0].title}
              </div>
            </motion.div>
          ) : (
            <span className="muted">En attente d'offres…</span>
          )}
        </AnimatePresence>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Hauteur des régions = nombre de ventes. Glisse pour tourner la carte.
        </p>
      </div>
      {tall && (
        <div className="map-list glass">
          {auctions.slice(0, 12).map((a) => (
            <Link key={a.id} to={`/enchere/${a.id}`}>
              <img src={a.images[0]} alt="" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 13, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</b>
                <span className="muted" style={{ fontSize: 12 }}>
                  {a.city} · <span className="num">{money(a.current_price)} F</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
