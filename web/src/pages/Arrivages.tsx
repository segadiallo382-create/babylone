import { motion } from "framer-motion";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ICheck } from "../components/Icons";
import { Empty, Reveal, SplitTitle, Tilt } from "../components/ui";
import { api } from "../lib/api";
import { money, shortLeft } from "../lib/format";
import { socket, useNow } from "../lib/store";
import { can3D } from "../three/capability";

const PortScene = lazy(() => import("../three/Scenes").then((m) => ({ default: m.PortScene })));

export type Preorder = {
  id: number;
  title: string;
  description: string;
  category: string;
  images: string[];
  city: string;
  unit_price: number;
  deposit_pct: number;
  deposit_unit: number;
  total_units: number;
  min_units: number;
  reserved: number;
  remaining: number;
  buyers: number;
  eta: number;
  deadline: number;
  status: "open" | "confirmed" | "arrived" | "cancelled" | "closed";
  seller: { id: number; name: string; verified: boolean; city: string };
  mine: { id: number; qty: number; deposit: number; status: string }[];
  reservations?: { id: number; qty: number; deposit: number; status: string; name: string; phone: string }[];
};

export const PRE_STATUS: Record<string, [string, string]> = {
  open: ["Réservations ouvertes", "chip-red"],
  confirmed: ["Commande confirmée", "chip-ok"],
  arrived: ["Arrivé · solde à payer", "chip-ok"],
  cancelled: ["Annulé, acomptes remboursés", ""],
  closed: ["Terminé", ""],
};

export function Progress({ p }: { p: Preorder }) {
  const pct = Math.min(100, (p.reserved / p.total_units) * 100);
  const minPct = (p.min_units / p.total_units) * 100;
  return (
    <div>
      <div className="pre-bar">
        <motion.i initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
        <span style={{ left: `${minPct}%` }} title="Objectif minimum" />
      </div>
      <div className="row between muted num" style={{ fontSize: 12.5, marginTop: 6 }}>
        <span>
          {p.reserved}/{p.total_units} réservées · {p.buyers} acheteur{p.buyers > 1 ? "s" : ""}
        </span>
        <span>{p.reserved >= p.min_units ? "Objectif atteint ✓" : `Objectif ${p.min_units}`}</span>
      </div>
    </div>
  );
}

export default function Arrivages() {
  const [items, setItems] = useState<Preorder[] | null>(null);
  const now = useNow();
  useEffect(() => {
    const load = () => api("/preorders").then((r) => setItems(r.items));
    load();
    socket.on("preorder", load);
    return () => {
      socket.off("preorder", load);
    };
  }, []);
  const filled = items?.length ? items.reduce((s, p) => s + p.reserved / p.total_units, 0) / items.length : 0.5;

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <section className="port-hero">
        {can3D() ? (
          <Suspense fallback={null}>
            <PortScene progress={0.35 + filled * 0.65} style={{ position: "absolute", inset: 0 }} />
          </Suspense>
        ) : (
          <div className="hero-bg" />
        )}
        <div className="container port-text">
          <div className="eyebrow">Précommande de conteneurs</div>
          <h1 className="display" style={{ fontSize: "clamp(42px,7vw,92px)" }}>
            <SplitTitle text="Réservez l'arrivage" />
            <br />
            <SplitTitle text="avant qu'il accoste." className="outline" delay={0.3} />
          </h1>
          <p className="muted" style={{ maxWidth: 520, fontSize: 17, marginTop: 18 }}>
            Les importateurs annoncent leurs conteneurs avant l'arrivée. Tu réserves avec un petit acompte, au prix de gros. Si l'objectif n'est pas atteint, ton acompte
            t'est remboursé.
          </p>
        </div>
      </section>

      <div className="container" style={{ marginTop: 40 }}>
        {items?.length === 0 && <Empty title="Aucun arrivage en précommande pour l'instant." />}
        <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {items?.map((p, i) => (
            <Reveal key={p.id} i={i % 3}>
              <Tilt max={7}>
                <Link to={`/arrivage/${p.id}`} className="a-card" style={{ display: "block" }}>
                  <div className="media" style={{ aspectRatio: "16/10" }}>
                    <img src={p.images[0]} alt="" loading="lazy" />
                    <div className="tags">
                      <span className={`chip ${PRE_STATUS[p.status][1]}`}>{PRE_STATUS[p.status][0]}</span>
                      {p.seller.verified && (
                        <span className="chip chip-ok">
                          <ICheck size={12} /> Vérifié
                        </span>
                      )}
                    </div>
                    {p.status === "open" && (
                      <div className="timer">
                        <span className="timer-pill num">Clôture dans {shortLeft(p.deadline - now)}</span>
                      </div>
                    )}
                  </div>
                  <div className="body">
                    <h3>{p.title}</h3>
                    <div className="meta">
                      {p.seller.name} · {p.city} · arrivée vers le {new Date(p.eta).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </div>
                    <div className="price-row">
                      <div>
                        <div className="eyebrow" style={{ fontSize: 10.5 }}>
                          Prix à la pièce
                        </div>
                        <div className="price">
                          {money(p.unit_price)} <small>F</small>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="num" style={{ fontWeight: 700 }}>
                          {money(p.deposit_unit)} F
                        </div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          d'acompte / pièce
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <Progress p={p} />
                    </div>
                  </div>
                </Link>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
