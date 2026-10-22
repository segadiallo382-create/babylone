import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuctionCard } from "../components/AuctionCard";
import { ICheck, IPin, IStore } from "../components/Icons";
import { ShareWhatsApp } from "../components/Share";
import { CountUp, Empty, Reveal, SplitTitle, Stars, Tilt } from "../components/ui";
import { api, post, type Auction } from "../lib/api";
import { ago } from "../lib/format";
import { useApp } from "../lib/store";

type Shop = {
  seller: { id: number; name: string; city: string; bio: string | null; verified: boolean; pro: boolean; since: number; rating: number | null; reviews: number; sold: number; followers: number; following: boolean };
  live: Auction[];
  sold: Auction[];
  reviews: { rating: number; comment: string; created_at: number; name: string }[];
};

export default function Boutique() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const nav = useNavigate();
  const [d, setD] = useState<Shop | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setD(null);
    api(`/sellers/${id}`)
      .then(setD)
      .catch(() => setMissing(true));
  }, [id]);

  async function follow() {
    if (!user) return nav(`/connexion?suite=/boutique/${id}`);
    const r = await post(`/sellers/${id}/follow`);
    setD((x) => x && { ...x, seller: { ...x.seller, following: r.following, followers: r.followers } });
    if (r.following) toast("Abonné", "Tu seras prévenu de chaque nouvel arrivage et de ses lives.", "ok");
  }

  if (missing) return <div className="page container"><Empty title="Boutique introuvable." /></div>;
  if (!d) return <div className="page container"><div className="skeleton" style={{ height: 320 }} /></div>;
  const s = d.seller;
  const years = Math.max(0, Math.floor((Date.now() - s.since) / (365 * 864e5)));

  return (
    <div className="page">
      <div className="container">
        <Tilt max={4} glare={false}>
          <div className="card shop-hero">
            <div className="shop-badge">
              <motion.div initial={{ rotateY: -180, scale: 0.6 }} animate={{ rotateY: 0, scale: 1 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}>
                <IStore size={42} />
              </motion.div>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="row wrap" style={{ gap: 6 }}>
                {s.verified && (
                  <span className="chip chip-ok">
                    <ICheck size={13} /> Vendeur vérifié
                  </span>
                )}
                {s.pro && <span className="chip chip-red">Pro</span>}
                <span className="chip">
                  <IPin size={13} /> {s.city}
                </span>
              </div>
              <h1 className="display" style={{ fontSize: "clamp(36px,6vw,64px)", margin: "12px 0 6px" }}>
                <SplitTitle text={s.name} />
              </h1>
              <p className="muted" style={{ maxWidth: 560 }}>{s.bio || "Importateur sur Babylone."}</p>
              <div className="row wrap" style={{ marginTop: 18 }}>
                {user?.id !== s.id && (
                  <button className={`btn ${s.following ? "btn-ghost" : "btn-red"}`} onClick={follow}>
                    {s.following ? "Abonné ✓" : "+ Suivre la boutique"}
                  </button>
                )}
                <ShareWhatsApp text={`Découvre la boutique ${s.name} sur Babylone :`} path={`/boutique/${s.id}`} label="Partager" />
              </div>
            </div>
            <div className="shop-stats">
              {[
                ["Ventes conclues", s.sold],
                ["Abonnés", s.followers],
                ["Avis", s.reviews],
              ].map(([l, v]) => (
                <div key={l as string}>
                  <b className="display">
                    <CountUp to={v as number} />
                  </b>
                  <span>{l}</span>
                </div>
              ))}
              <div>
                <b className="display">{s.rating ? `${s.rating}★` : "–"}</b>
                <span>{years ? `${years} an${years > 1 ? "s" : ""} sur Babylone` : "Nouveau vendeur"}</span>
              </div>
            </div>
          </div>
        </Tilt>

        <section style={{ marginTop: 48 }}>
          <h2 className="display" style={{ fontSize: 36, marginBottom: 20 }}>
            En vente maintenant · {d.live.length}
          </h2>
          {d.live.length ? (
            <div className="grid-cards">
              {d.live.map((a, i) => (
                <Reveal key={a.id} i={i % 4}>
                  <AuctionCard a={a} />
                </Reveal>
              ))}
            </div>
          ) : (
            <Empty title="Aucune vente en cours.">Suis la boutique pour être prévenu du prochain arrivage.</Empty>
          )}
        </section>

        {d.reviews.length > 0 && (
          <section style={{ marginTop: 56 }}>
            <h2 className="display" style={{ fontSize: 36, marginBottom: 20 }}>
              Ce qu'en disent les acheteurs
            </h2>
            <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {d.reviews.map((r, i) => (
                <Reveal key={i} i={i % 3}>
                  <div className="card pad">
                    <Stars value={r.rating} />
                    <p style={{ margin: "10px 0" }}>{r.comment || "Pas de commentaire."}</p>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {r.name} · {ago(r.created_at)}
                    </span>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {d.sold.length > 0 && (
          <section style={{ marginTop: 56 }}>
            <h2 className="display" style={{ fontSize: 36, marginBottom: 20 }}>
              Déjà vendu
            </h2>
            <div className="grid-cards">
              {d.sold.map((a, i) => (
                <Reveal key={a.id} i={i % 4}>
                  <AuctionCard a={a} />
                </Reveal>
              ))}
            </div>
          </section>
        )}
        <p className="muted" style={{ marginTop: 40, fontSize: 13 }}>
          <Link to="/encheres">← Toutes les enchères</Link>
        </p>
      </div>
    </div>
  );
}
