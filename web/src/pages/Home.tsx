import { motion, useScroll, useTransform } from "framer-motion";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AuctionCard, CardSkeleton } from "../components/AuctionCard";
import { CAT_ICONS, IArrow, ICheck, IGavel, IMegaphone, IShield, ITruck } from "../components/Icons";
import { MapSection } from "../components/MapSection";
import { CountUp, Reveal, SplitTitle, Tilt } from "../components/ui";
import { api, type Auction } from "../lib/api";
import { money } from "../lib/format";
import { useApp } from "../lib/store";

const HeroScene = lazy(() => import("../three/HeroScene").then((m) => ({ default: m.HeroScene })));

type Stats = { live: number; bids_24h: number; sellers: number; buyers: number; by_category: { category: string; n: number }[] };

export default function Home() {
  const [ending, setEnding] = useState<Auction[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reqs, setReqs] = useState<any[]>([]);
  const { meta } = useApp();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const heroO = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  useEffect(() => {
    api("/auctions?sort=ending&limit=8").then((r) => setEnding(r.auctions));
    api("/stats").then(setStats);
    api("/requests").then((r) => setReqs(r.items.slice(0, 3)));
  }, []);

  const catCount = (c: string) => stats?.by_category.find((x) => x.category === c)?.n || 0;

  return (
    <>
      <section className="hero" ref={heroRef}>
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="container">
          <motion.div style={{ y: heroY, opacity: heroO }}>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <span className="chip chip-red">
                <span className="live-dot" /> {stats ? `${stats.live} ventes en direct` : "Ventes en direct"} · Sénégal
              </span>
            </motion.div>
            <h1 className="display" style={{ marginTop: 22 }}>
              <SplitTitle text="Ils fixent le départ." />
              <br />
              <SplitTitle text="Vous fixez le prix." className="outline" delay={0.35} />
            </h1>
            <motion.p className="hero-lead" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.8 }}>
              Babylone met les importateurs en relation directe avec vous. Chaque produit démarre à un prix très bas, puis monte au fil des
              offres. À la fin du compte à rebours, la meilleure offre l'emporte.
            </motion.p>
            <motion.div className="hero-cta" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.7 }}>
              <Link to="/encheres" className="btn btn-red btn-lg">
                Voir les enchères <IArrow size={18} />
              </Link>
              <Link to="/vendre" className="btn btn-ghost btn-lg">
                Vendre mes stocks
              </Link>
            </motion.div>
            <motion.div className="hero-stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
              <div>
                <b>
                  <CountUp to={stats?.bids_24h || 0} />
                </b>
                <span>offres en 24 h</span>
              </div>
              <div>
                <b>
                  <CountUp to={stats?.sellers || 0} />
                </b>
                <span>importateurs</span>
              </div>
              <div>
                <b>0 F</b>
                <span>d'inscription acheteur</span>
              </div>
            </motion.div>
          </motion.div>
          <Suspense fallback={<div className="hero-canvas" />}>
            <HeroScene />
          </Suspense>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="section-head">
            <Reveal>
              <div className="eyebrow">Compte à rebours</div>
              <h2 className="display">Ça se termine bientôt</h2>
            </Reveal>
            <Reveal i={1}>
              <Link to="/encheres" className="btn btn-ghost">
                Toutes les ventes <IArrow size={16} />
              </Link>
            </Reveal>
          </div>
          <div className="grid-cards">
            {ending
              ? ending.map((a, i) => (
                  <Reveal key={a.id} i={i % 4}>
                    <AuctionCard a={a} />
                  </Reveal>
                ))
              : Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <Reveal>
              <div className="eyebrow">Carte en direct</div>
              <h2 className="display">Le Sénégal enchérit</h2>
            </Reveal>
            <Reveal i={1}>
              <p className="muted">
                Chaque colonne lumineuse est une ville avec des ventes en cours. Chaque onde, une offre qui vient d'être placée.
              </p>
            </Reveal>
          </div>
          <Reveal>
            <MapSection />
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <Reveal>
              <div className="eyebrow">Comment ça marche</div>
              <h2 className="display">Le prix évolutif, en 4 temps</h2>
            </Reveal>
          </div>
          <div className="steps">
            {[
              ["L'importateur publie", "Photos réelles, état, prix de départ très bas et durée de la vente. Il peut fixer un prix minimum caché."],
              ["Vous proposez", "Chaque offre doit dépasser la précédente d'un palier fixé par Babylone. Le prix se met à jour en direct."],
              ["Le chrono tranche", "Une offre dans les 2 dernières minutes prolonge la vente de 2 minutes. Pas de coup de dernière seconde."],
              ["Payé, livré, protégé", "Vous payez par Wave ou Orange Money. L'argent est bloqué jusqu'à ce que vous confirmiez la réception."],
            ].map(([t, d], i) => (
              <Reveal key={t} i={i}>
                <Tilt max={8} glare={false}>
                  <div className="card step">
                    <div className="n">0{i + 1}</div>
                    <h3>{t}</h3>
                    <p>{d}</p>
                  </div>
                </Tilt>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <Reveal>
              <div className="eyebrow">Catégories</div>
              <h2 className="display">Arrivages du moment</h2>
            </Reveal>
          </div>
          <div className="cats">
            {(meta?.categories || []).map((c, i) => {
              const Icon = CAT_ICONS[c];
              return (
                <Reveal key={c} i={i % 4}>
                  <Tilt max={12} glare={false}>
                    <Link to={`/encheres?category=${encodeURIComponent(c)}`} className="card cat" style={{ display: "flex" }}>
                      <span className="ico">{Icon && <Icon size={22} />}</span>
                      <span>
                        <b>{c}</b>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {catCount(c)} vente{catCount(c) > 1 ? "s" : ""} en cours
                        </div>
                      </span>
                    </Link>
                  </Tilt>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 40, alignItems: "center" }}>
          <Reveal>
            <div className="eyebrow">Espace demande</div>
            <h2 className="display" style={{ fontSize: "clamp(34px,5vw,60px)", margin: "8px 0 16px" }}>
              Vous ne trouvez pas ? Demandez.
            </h2>
            <p className="muted" style={{ maxWidth: 460, marginBottom: 26 }}>
              Dites ce que vous cherchez. Les importateurs voient les demandes les plus soutenues et vous êtes prévenu dès que le produit est mis en
              vente.
            </p>
            <Link to="/demandes" className="btn btn-red">
              <IMegaphone size={18} /> Publier une demande
            </Link>
          </Reveal>
          <div className="stack" style={{ perspective: 1200 }}>
            {reqs.map((r, i) => (
              <Reveal key={r.id} i={i}>
                <motion.div className="card req-card" whileHover={{ rotateY: -6, x: 6 }} style={{ transformPerspective: 900 }}>
                  <div className="row between">
                    <span className="chip">{r.category}</span>
                    <span className="chip chip-red num">+{r.votes} personnes</span>
                  </div>
                  <h3>{r.title}</h3>
                  {r.budget_max && <span className="muted num">Budget max : {money(r.budget_max)} F · {r.city}</span>}
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="pricing">
            {[
              [IShield, "Paiement bloqué", "Le vendeur n'est payé qu'après votre confirmation de réception."],
              [ITruck, "Livraison à domicile", "Partout au Sénégal, frais affichés avant de payer."],
              [ICheck, "Vendeurs vérifiés", "Pièce d'identité contrôlée et avis des acheteurs."],
              [IGavel, "Règles claires", "Paliers fixes, anti-dernière seconde, prix minimum respecté."],
            ].map(([Icon, t, d]: any, i) => (
              <Reveal key={t} i={i % 2}>
                <div className="card pad row" style={{ gap: 18, alignItems: "start" }}>
                  <span className="cat" style={{ height: "auto", padding: 0, border: 0 }}>
                    <span className="ico">
                      <Icon size={22} />
                    </span>
                  </span>
                  <span>
                    <b style={{ fontSize: 17 }}>{t}</b>
                    <p className="muted">{d}</p>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal>
            <div
              className="card"
              style={{
                padding: "clamp(32px, 6vw, 72px)",
                overflow: "hidden",
                background: "radial-gradient(90% 120% at 100% 0%, rgba(227,38,47,.35), transparent 60%), linear-gradient(180deg,#171012,#0f0b0c)",
                borderColor: "rgba(227,38,47,.35)",
              }}
            >
              <div className="eyebrow">Importateurs</div>
              <h2 className="display" style={{ fontSize: "clamp(36px,6vw,76px)", margin: "10px 0 18px", maxWidth: 820 }}>
                Videz vos conteneurs plus vite.
              </h2>
              <p className="muted" style={{ maxWidth: 520, marginBottom: 28 }}>
                Publiez gratuitement. Babylone prend 15 % seulement quand la vente aboutit. 0 % de commission le premier mois.
              </p>
              <div className="row wrap">
                <Link to="/inscription?role=seller" className="btn btn-red btn-lg">
                  Ouvrir ma boutique
                </Link>
                <Link to="/vendre#tarifs" className="btn btn-ghost btn-lg">
                  Voir les tarifs
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
