// Accueil v3 : live du moment, ventes flash, rendez-vous de la semaine, carrousel 3D, arrivages, économie circulaire.
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AuctionCard } from "./AuctionCard";
import { CAT_ICONS, IArrow } from "./Icons";
import { CountUp, Reveal } from "./ui";
import { api, type Auction } from "../lib/api";
import { money } from "../lib/format";
import type { Live } from "../pages/Lives";
import type { Preorder } from "../pages/Arrivages";
import { Progress } from "../pages/Arrivages";

export function LiveBanner() {
  const [l, setL] = useState<Live | null>(null);
  useEffect(() => {
    api("/lives").then((r) => setL(r.items.find((x: Live) => x.status === "live") || null));
  }, []);
  if (!l) return null;
  return (
    <section className="container" style={{ marginTop: 10 }}>
      <Reveal>
        <Link to={`/live/${l.id}`} className="live-banner">
          <span className="live-banner-img">
            {l.current && <img src={l.current.images[0]} alt="" />}
            <motion.i animate={{ scale: [1, 1.8], opacity: [0.7, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="chip chip-red">
              <span className="live-dot" style={{ background: "#fff" }} /> EN DIRECT
            </span>
            <b className="display" style={{ display: "block", fontSize: "clamp(22px,3vw,34px)", marginTop: 8 }}>
              {l.title}
            </b>
            <span className="muted">
              {l.seller.name} · {l.lots.length} lots{l.current ? ` · en ce moment : ${l.current.title} à ${money(l.current.current_price)} F` : ""}
            </span>
          </span>
          <span className="btn btn-red">
            Rejoindre <IArrow size={16} />
          </span>
        </Link>
      </Reveal>
    </section>
  );
}

export function FlashRow() {
  const [items, setItems] = useState<Auction[]>([]);
  useEffect(() => {
    api("/auctions?flash=1&limit=8").then((r) => setItems(r.auctions));
  }, []);
  if (!items.length) return null;
  return (
    <section className="section" style={{ paddingTop: 30, paddingBottom: 30 }}>
      <div className="container">
        <div className="section-head">
          <Reveal>
            <div className="eyebrow">⚡ Ventes flash</div>
            <h2 className="display">Départ à 100 F</h2>
          </Reveal>
          <Link to="/encheres?flash=1" className="btn btn-ghost">
            Toutes les ventes flash <IArrow size={16} />
          </Link>
        </div>
        <div className="grid-cards">
          {items.map((a, i) => (
            <Reveal key={a.id} i={i % 4}>
              <AuctionCard a={a} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const THEMES: [number, string, string, string][] = [
  [2, "Mardi friperie", "Vestes, jeans et ballots premier choix", "/encheres?category=Friperie"],
  [4, "Jeudi électronique", "Téléphones, casques, montres connectées", "/encheres?category=%C3%89lectronique"],
  [5, "Vendredi sneakers", "Le grand live chaussures de la semaine", "/live"],
  [6, "Samedi maison", "Électroménager et déco à petits prix", "/encheres?category=%C3%89lectrom%C3%A9nager"],
];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export function Themes() {
  const today = new Date().getDay();
  return (
    <section className="section" style={{ paddingTop: 40 }}>
      <div className="container">
        <div className="section-head">
          <Reveal>
            <div className="eyebrow">Les rendez-vous de la semaine</div>
            <h2 className="display">Un thème par jour</h2>
          </Reveal>
        </div>
        <div className="themes">
          {THEMES.map(([d, t, sub, to], i) => (
            <Reveal key={t} i={i}>
              <Link to={to} className={`theme card ${d === today ? "today" : ""}`}>
                <span className="eyebrow">{d === today ? "Aujourd'hui" : DAYS[d]}</span>
                <b className="display">{t}</b>
                <span className="muted">{sub}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// Anneau 3D de catégories qu'on fait tourner au doigt
export function CategoryRing({ categories, counts }: { categories: string[]; counts: (c: string) => number }) {
  const rot = useMotionValue(0);
  const drag = useRef<{ x: number; r: number } | null>(null);
  const transform = useTransform(rot, (r) => `translateZ(calc(var(--ring-r) * -1)) rotateY(${r}deg)`);
  useEffect(() => {
    const ctl = animate(rot, [0, -360], { duration: 60, ease: "linear", repeat: Infinity });
    return () => ctl.stop();
  }, [rot]);
  const n = categories.length || 1;
  return (
    <div
      className="ring-stage"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, r: rot.get() };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => drag.current && rot.set(drag.current.r + (e.clientX - drag.current.x) * 0.3)}
      onPointerUp={() => (drag.current = null)}
    >
      <motion.div className="ring" style={{ transform }}>
        {categories.map((c, i) => {
          const Icon = CAT_ICONS[c];
          return (
            <Link
              key={c}
              to={`/encheres?category=${encodeURIComponent(c)}`}
              className="ring-card card"
              style={{ transform: `rotateY(${(i * 360) / n}deg) translateZ(var(--ring-r))` }}
              draggable={false}
              onClick={(e) => drag.current && e.preventDefault()}
            >
              <span className="ico">{Icon && <Icon size={26} />}</span>
              <b className="display">{c}</b>
              <span className="muted">{counts(c)} en cours</span>
            </Link>
          );
        })}
      </motion.div>
    </div>
  );
}

export function ArrivagesTeaser() {
  const [items, setItems] = useState<Preorder[]>([]);
  useEffect(() => {
    api("/preorders").then((r) => setItems(r.items.filter((p: Preorder) => p.status === "open").slice(0, 3)));
  }, []);
  if (!items.length) return null;
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <Reveal>
            <div className="eyebrow">Précommande de conteneurs</div>
            <h2 className="display">Réservez avant l'arrivée</h2>
          </Reveal>
          <Link to="/arrivages" className="btn btn-ghost">
            Tous les arrivages <IArrow size={16} />
          </Link>
        </div>
        <div className="containers3d">
          {items.map((p, i) => (
            <Reveal key={p.id} i={i}>
              <Link to={`/arrivage/${p.id}`} className="box3d">
                <span className="face front">
                  <img src={p.images[0]} alt="" />
                  <span className="box-label">
                    <b>{p.title}</b>
                    <span className="num">{money(p.unit_price)} F / pièce</span>
                  </span>
                </span>
                <span className="face side" />
                <span className="face top" />
              </Link>
              <div style={{ marginTop: 14 }}>
                <Progress p={p} />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Circular({ sold }: { sold: number }) {
  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <div className="card circular">
            <div>
              <div className="eyebrow">Économie circulaire</div>
              <h2 className="display" style={{ fontSize: "clamp(32px,5vw,56px)", margin: "10px 0" }}>
                Moins d'invendus, plus de bonnes affaires.
              </h2>
              <p className="muted" style={{ maxWidth: 520 }}>
                Chaque article vendu sur Babylone est un stock qui ne dort plus en entrepôt et un vêtement de seconde main qui reprend du service.
              </p>
            </div>
            <div className="circ-num">
              <b className="display">
                <CountUp to={sold} />
              </b>
              <span>articles ont trouvé preneur</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
