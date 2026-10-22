import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ICheck, IChart, IClock, IMegaphone, IStore, IZap } from "../components/Icons";
import { Reveal, SplitTitle, Tilt } from "../components/ui";
import { money } from "../lib/format";
import { useApp } from "../lib/store";

export default function Sell() {
  const { user, meta } = useApp();
  const cta = user?.role === "seller" ? "/vendeur" : "/inscription?role=seller";
  return (
    <div className="page">
      <div className="container">
        <div className="eyebrow">Pour les importateurs</div>
        <h1 className="display" style={{ fontSize: "clamp(46px,8vw,110px)", margin: "10px 0 20px" }}>
          <SplitTitle text="Vos stocks," />
          <br />
          <SplitTitle text="vendus au juste prix." className="red" delay={0.3} />
        </h1>
        <p className="muted" style={{ maxWidth: 560, fontSize: 18 }}>
          Fins de série, invendus, arrivages de conteneur : publiez en 2 minutes depuis votre téléphone. Les acheteurs de tout le Sénégal font monter le
          prix.
        </p>
        <div className="row wrap" style={{ marginTop: 30 }}>
          <Link to={cta} className="btn btn-red btn-lg">
            {user?.role === "seller" ? "Mon espace vendeur" : "Ouvrir ma boutique gratuitement"}
          </Link>
        </div>

        <div className="steps" style={{ marginTop: 80 }}>
          {[
            [IStore, "Publiez", "Photos, état, prix de départ et durée de 1 à 7 jours. Vendez à l'unité ou par lot."],
            [IClock, "Laissez monter", "Les offres arrivent en direct. Fixez un prix de réserve pour ne jamais vendre à perte."],
            [IZap, "Encaissez", "L'acheteur paie par Wave ou Orange Money. Vous êtes payé dès qu'il confirme la réception."],
            [IMegaphone, "Écoutez la demande", "L'espace demande montre ce que les acheteurs cherchent. Importez ce qui se vend."],
          ].map(([Icon, t, d]: any, i) => (
            <Reveal key={t} i={i}>
              <Tilt max={8} glare={false}>
                <div className="card step">
                  <span className="cat" style={{ height: "auto", padding: 0, border: 0, marginBottom: "auto" }}>
                    <span className="ico">
                      <Icon size={22} />
                    </span>
                  </span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </Tilt>
            </Reveal>
          ))}
        </div>

        <section className="section" id="tarifs">
          <div className="section-head">
            <Reveal>
              <div className="eyebrow">Tarifs</div>
              <h2 className="display">Simple. Sans surprise.</h2>
            </Reveal>
          </div>
          <div className="pricing" style={{ perspective: 1400 }}>
            <Reveal>
              <motion.div className="card plan" whileHover={{ rotateY: 4, rotateX: -2 }} style={{ height: "100%" }}>
                <span className="chip">Standard</span>
                <div className="big">{Math.round((meta?.commission_rate || 0.15) * 100)} %</div>
                <div className="muted">de commission, uniquement sur les ventes conclues</div>
                <ul>
                  {["Publication gratuite", "Jusqu'à 10 ventes en même temps", "Clôture et attribution automatiques", "Paiement sécurisé et versement rapide", "0 % de commission le premier mois"].map((x) => (
                    <li key={x}>
                      <ICheck size={16} /> {x}
                    </li>
                  ))}
                </ul>
                <Link to={cta} className="btn btn-ghost btn-block">
                  Commencer
                </Link>
              </motion.div>
            </Reveal>
            <Reveal i={1}>
              <motion.div className="card plan pro" whileHover={{ rotateY: -4, rotateX: -2 }} style={{ height: "100%" }}>
                <span className="chip chip-red">Pro</span>
                <div className="big num">{money(meta?.pro_price || 5000)} F</div>
                <div className="muted">par mois, en plus de la commission</div>
                <ul>
                  {["Ventes illimitées", "Statistiques : vues, offres, taux de vente", "Mise en avant « À la une »", "Badge Pro sur vos ventes", "Priorité sur l'espace demande"].map((x) => (
                    <li key={x}>
                      <IChart size={16} /> {x}
                    </li>
                  ))}
                </ul>
                <Link to={cta} className="btn btn-red btn-block">
                  Passer en Pro
                </Link>
              </motion.div>
            </Reveal>
          </div>
        </section>
      </div>
    </div>
  );
}
