import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuctionCard, CardSkeleton } from "../components/AuctionCard";
import { IBell, ISearch } from "../components/Icons";
import { Empty, Segmented, SplitTitle } from "../components/ui";
import { REGION_LABEL } from "../data/geo";
import { api, post, type Auction } from "../lib/api";
import { money } from "../lib/format";
import { useApp } from "../lib/store";
import { useT } from "../lib/i18n";

type Sort = "ending" | "new" | "popular" | "price_asc" | "price_desc";
type Parsed = { size: string | null; maxPrice: number | null; city: string | null; category: string | null; terms: string[] } | null;
const PAGE = 24;

const TOGGLES: [string, string][] = [
  ["flash", "⚡ Flash"],
  ["inspected", "Inspecté"],
  ["buy_now", "Achat immédiat"],
  ["mode", "Vente multiple"],
];

export default function Auctions() {
  const [sp, setSp] = useSearchParams();
  const { meta, user, toast } = useApp();
  const nav = useNavigate();
  const t = useT();
  const [items, setItems] = useState<Auction[] | null>(null);
  const [total, setTotal] = useState(0);
  const [parsed, setParsed] = useState<Parsed>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState(sp.get("q") || "");
  const get = (k: string) => sp.get(k) || "";
  const sort = (get("sort") as Sort) || "ending";
  const status = get("status") || "live";
  const reqId = useRef(0);

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
  };

  useEffect(() => {
    const id = setTimeout(() => q.trim() !== get("q") && set("q", q.trim()), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const params = (offset: number) => {
    const p = new URLSearchParams(sp);
    if (!p.get("status")) p.set("status", "live");
    if (p.get("mode")) p.set("mode", "multi");
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    return p;
  };

  useEffect(() => {
    const id = ++reqId.current;
    setItems(null);
    api(`/auctions?${params(0)}`).then((r) => {
      if (id !== reqId.current) return;
      setItems(r.auctions);
      setTotal(r.total);
      setParsed(r.parsed);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  async function more() {
    if (!items) return;
    setLoadingMore(true);
    const r = await api(`/auctions?${params(items.length)}`);
    setItems([...items, ...r.auctions]);
    setLoadingMore(false);
  }

  async function saveSearch() {
    if (!user) return nav("/connexion?suite=/encheres");
    await post("/me/searches", { q: get("q"), category: get("category") || undefined, size: get("size") || undefined, city: get("city") || undefined, max_price: get("max_price") || undefined });
    toast("Alerte créée", "On te prévient dès qu'un article correspondant est mis en vente.", "ok");
  }

  const region = get("region");
  const title = region ? `Enchères · ${REGION_LABEL[region] || region}` : get("category") || (get("flash") ? "Ventes flash" : "Toutes les enchères");

  return (
    <div className="page">
      <div className="container">
        <div className="eyebrow">{status === "live" ? t("En direct") : "Archives"}</div>
        <h1 className="display page-title">
          <SplitTitle text={title} />
        </h1>

        <div className="search-hero">
          <ISearch size={20} />
          <input
            className="input"
            placeholder="Ex. « baskets pointure 43 moins de 15 000 à Thiès »"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t("Rechercher")}
          />
        </div>
        <AnimatePresence>
          {parsed && (parsed.size || parsed.maxPrice || parsed.city) && (
            <motion.div className="row wrap" style={{ gap: 6, marginTop: 10 }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <span className="muted" style={{ fontSize: 13 }}>J'ai compris :</span>
              {parsed.size && <span className="chip chip-ok">Taille {parsed.size}</span>}
              {parsed.maxPrice && <span className="chip chip-ok">≤ {money(parsed.maxPrice)} F</span>}
              {parsed.city && <span className="chip chip-ok">{parsed.city}</span>}
              {parsed.terms.length > 0 && <span className="chip">« {parsed.terms.join(" ")} »</span>}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="toolbar">
          <select className="select" value={get("category")} onChange={(e) => set("category", e.target.value)}>
            <option value="">Toutes catégories</option>
            {meta?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="select" value={get("city")} onChange={(e) => set("city", e.target.value)}>
            <option value="">Tout le Sénégal</option>
            {meta?.cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="select" value={get("size")} onChange={(e) => set("size", e.target.value)} style={{ minWidth: 120 }}>
            <option value="">Taille / pointure</option>
            {meta?.sizes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="select" value={get("max_price")} onChange={(e) => set("max_price", e.target.value)} style={{ minWidth: 140 }}>
            <option value="">Tous les prix</option>
            {[5000, 10000, 20000, 50000, 100000].map((p) => (
              <option key={p} value={p}>
                Moins de {money(p)} F
              </option>
            ))}
          </select>
          {region && (
            <button className="chip chip-red" onClick={() => set("region", "")}>
              {REGION_LABEL[region] || region} ✕
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={saveSearch} style={{ marginLeft: "auto" }}>
            <IBell size={16} /> Créer une alerte
          </button>
        </div>

        <div className="row wrap" style={{ gap: 6, marginBottom: 16 }}>
          {TOGGLES.map(([k, label]) => (
            <button key={k} className={`chip ${get(k) ? "chip-red" : ""}`} onClick={() => set(k, get(k) ? "" : "1")}>
              {label}
            </button>
          ))}
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
          <div className="row">
            <span className="muted num" style={{ fontSize: 13 }}>
              {items ? `${total} vente${total > 1 ? "s" : ""}` : ""}
            </span>
            <Segmented id="status" value={status} onChange={(v) => set("status", v === "live" ? "" : v)} options={[["live", "En cours"], ["ended", "Terminées"]]} />
          </div>
        </div>

        {items && items.length === 0 ? (
          <Empty title="Aucune vente ne correspond.">
            <p>Crée une alerte : on te prévient dès qu'un importateur publie ce que tu cherches.</p>
            <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
              <button className="btn btn-red btn-sm" onClick={saveSearch}>
                <IBell size={16} /> Me prévenir
              </button>
            </div>
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
                      animate={{ opacity: 1, scale: 1, rotateX: 0, transition: { delay: Math.min(i % PAGE, 12) * 0.035, duration: 0.5 } }}
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
        {items && items.length < total && (
          <div className="row" style={{ justifyContent: "center", marginTop: 32 }}>
            <button className="btn btn-ghost btn-lg" onClick={more} disabled={loadingMore}>
              {loadingMore ? "Chargement…" : `Voir plus (${total - items.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
