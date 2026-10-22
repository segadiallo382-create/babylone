import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AuctionCard, CardSkeleton } from "../components/AuctionCard";
import { Empty, Segmented, SplitTitle } from "../components/ui";
import { REGION_LABEL } from "../data/geo";
import { api, type Auction } from "../lib/api";
import { useApp } from "../lib/store";

type Sort = "ending" | "new" | "popular" | "price_asc" | "price_desc";

export default function Auctions() {
  const [sp, setSp] = useSearchParams();
  const { meta } = useApp();
  const [items, setItems] = useState<Auction[] | null>(null);
  const [q, setQ] = useState(sp.get("q") || "");
  const category = sp.get("category") || "";
  const city = sp.get("city") || "";
  const region = sp.get("region") || "";
  const sort = (sp.get("sort") as Sort) || "ending";
  const status = sp.get("status") || "live";

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => set("q", q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    setItems(null);
    const p = new URLSearchParams({ sort, status, limit: "60" });
    if (category) p.set("category", category);
    if (city) p.set("city", city);
    if (region) p.set("region", region);
    if (sp.get("q")) p.set("q", sp.get("q")!);
    api(`/auctions?${p}`).then((r) => setItems(r.auctions));
  }, [category, city, region, sort, status, sp]);

  return (
    <div className="page">
      <div className="container">
        <div className="eyebrow">{status === "live" ? "En direct" : "Archives"}</div>
        <h1 className="display page-title">
          <SplitTitle text={region ? `Enchères · ${REGION_LABEL[region] || region}` : category || "Toutes les enchères"} />
        </h1>
        <div className="toolbar">
          <input className="input" placeholder="Rechercher : baskets, smartphone, friperie…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Toutes catégories</option>
            {meta?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="select" value={city} onChange={(e) => set("city", e.target.value)}>
            <option value="">Tout le Sénégal</option>
            {meta?.cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {region && (
            <button className="chip chip-red" onClick={() => set("region", "")}>
              {REGION_LABEL[region] || region} ✕
            </button>
          )}
        </div>
        <div className="row wrap between" style={{ marginBottom: 26 }}>
          <Segmented<Sort>
            id="sort"
            value={sort}
            onChange={(v) => set("sort", v === "ending" ? "" : v)}
            options={[
              ["ending", "Fin proche"],
              ["new", "Nouveautés"],
              ["popular", "Populaires"],
              ["price_asc", "Prix ↑"],
              ["price_desc", "Prix ↓"],
            ]}
          />
          <Segmented
            id="status"
            value={status}
            onChange={(v) => set("status", v === "live" ? "" : v)}
            options={[
              ["live", "En cours"],
              ["ended", "Terminées"],
            ]}
          />
        </div>
        {items && items.length === 0 ? (
          <Empty title="Aucune vente ne correspond.">
            <p>Essaie une autre catégorie, ou publie une demande pour prévenir les importateurs.</p>
          </Empty>
        ) : (
          <motion.div className="grid-cards" layout>
            <AnimatePresence mode="popLayout">
              {items
                ? items.map((a, i) => (
                    <motion.div
                      key={a.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9, rotateX: -20 }}
                      animate={{ opacity: 1, scale: 1, rotateX: 0, transition: { delay: Math.min(i, 12) * 0.035, duration: 0.5 } }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      style={{ transformPerspective: 900 }}
                    >
                      <AuctionCard a={a} />
                    </motion.div>
                  ))
                : Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
