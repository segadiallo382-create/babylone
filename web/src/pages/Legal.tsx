import { Link } from "react-router-dom";
import { SplitTitle } from "../components/ui";

// Brouillons à faire relire par un juriste avant la mise en ligne. Les [À COMPLÉTER] sont des informations légales à fournir.
const COMPANY = "BABYLONE E-COMMERCE SUARL, Thiès (Sénégal), RCCM [À COMPLÉTER], NINEA [À COMPLÉTER]";

const DOCS: Record<string, { title: string; body: [string, string[]][] }> = {
  rules: {
    title: "Règles des enchères",
    body: [
      ["Le principe", ["Le vendeur fixe un prix de départ et une durée. Les acheteurs proposent des montants de plus en plus élevés. À la fin du compte à rebours, la meilleure offre l'emporte."]],
      [
        "Palier minimum",
        [
          "Chaque nouvelle offre doit dépasser la précédente d'un palier fixé automatiquement par Babylone selon le prix : 250 F sous 5 000 F, 500 F jusqu'à 20 000 F, 1 000 F jusqu'à 50 000 F, 2 500 F jusqu'à 100 000 F, 5 000 F jusqu'à 250 000 F, 10 000 F jusqu'à 500 000 F, 25 000 F au-delà.",
        ],
      ],
      ["Prix de réserve", ["Le vendeur peut fixer un prix minimum caché. S'il n'est pas atteint à la fin, la vente n'est pas conclue. La page indique seulement si la réserve est atteinte."]],
      ["Pas de coup de dernière seconde", ["Une offre placée dans les 2 dernières minutes prolonge la vente de 2 minutes, autant de fois que nécessaire."]],
      [
        "Enchère automatique",
        ["Tu peux fixer un plafond secret. Babylone surenchérit pour toi d'un palier à la fois, seulement si quelqu'un te dépasse, sans jamais dépasser ton plafond. À plafond égal, le premier arrivé garde la tête."],
      ],
      ["Vente multiple", ["Pour N pièces identiques, les N meilleures offres gagnent chacune une pièce. Chaque gagnant paie le montant de sa propre offre."]],
      ["Achat immédiat", ["Si le vendeur a fixé un prix d'achat immédiat, tu peux acheter tout de suite à ce prix tant que les offres ne l'ont pas atteint. La vente s'arrête alors."]],
      [
        "Paiement et engagement",
        [
          "Une offre engage à acheter. Le gagnant a 24 heures pour payer par Wave, Orange Money ou carte. Sans paiement, la vente passe à l'offrant suivant.",
          "Après 2 ventes gagnées non payées, le compte ne peut plus enchérir.",
        ],
      ],
      ["Livraison", ["Les frais de livraison s'ajoutent au prix et sont affichés avant le paiement : 1 500 F dans la même ville, 2 000 F dans la même région, 3 500 F ailleurs au Sénégal."]],
    ],
  },
  cgu: {
    title: "Conditions générales",
    body: [
      ["Éditeur", [`La plateforme Babylone est éditée par ${COMPANY}. Contact : [À COMPLÉTER : e-mail et téléphone du support].`]],
      ["Objet", ["Babylone met en relation des vendeurs professionnels (importateurs) et des acheteurs, au moyen de ventes à prix évolutif. Babylone n'est pas le vendeur des produits."]],
      [
        "Inscription",
        ["L'inscription est gratuite pour les acheteurs. Elle exige un numéro de téléphone sénégalais vérifié par code SMS. Les vendeurs fournissent une pièce d'identité et, le cas échéant, leur RCCM et leur NINEA. Leurs annonces sont vérifiées avant publication."],
      ],
      ["Règles des ventes", ["Les ventes suivent les règles publiées sur la page « Règles des enchères », qui font partie des présentes conditions."]],
      [
        "Paiement sécurisé",
        [
          "L'acheteur paie Babylone via un prestataire de paiement agréé. Les fonds sont conservés jusqu'à la confirmation de réception par l'acheteur, ou 72 heures après la livraison sans contestation, puis reversés au vendeur, déduction faite de la commission.",
          "[À FAIRE VALIDER : conformité de ce mécanisme avec la réglementation BCEAO et le contrat du prestataire de paiement.]",
        ],
      ],
      ["Commissions et abonnements", ["Babylone prélève 15 % du prix de vente sur chaque vente conclue (0 % pendant le premier mois du vendeur). L'offre Pro coûte 5 000 FCFA par mois."]],
      [
        "Obligations du vendeur",
        ["Le vendeur garantit qu'il détient légalement les produits, que les photos sont réelles et que la description est exacte. Il expédie sous 48 heures après le paiement. Les produits interdits, contrefaits ou dangereux sont proscrits."],
      ],
      ["Litiges", ["Si l'article n'est pas conforme, l'acheteur ouvre un litige avant de confirmer la réception. Babylone examine le litige et peut rembourser l'acheteur ou libérer les fonds au vendeur."]],
      ["Suspension", ["Babylone peut suspendre un compte en cas de fraude, d'enchères fictives, d'impayés répétés ou de non-respect des présentes conditions."]],
      ["Droit applicable", ["Les présentes conditions sont soumises au droit sénégalais et aux Actes uniformes OHADA. [À COMPLÉTER : tribunal compétent, en principe Thiès.]"]],
    ],
  },
  privacy: {
    title: "Confidentialité",
    body: [
      ["Responsable du traitement", [`${COMPANY}. Déclaration auprès de la Commission de protection des données personnelles (CDP) : [À COMPLÉTER : numéro de récépissé].`]],
      [
        "Données collectées",
        ["Nom, numéro de téléphone, ville, adresse de livraison, historique d'offres et de commandes, photos publiées par les vendeurs, adresse IP (lutte contre la fraude). Babylone ne stocke aucun code secret de paiement."],
      ],
      [
        "Pourquoi",
        ["Gérer ton compte et tes ventes, t'envoyer les notifications utiles (offre dépassée, vente gagnée, rappel de paiement) par l'application, SMS ou WhatsApp, prévenir la fraude et respecter nos obligations comptables."],
      ],
      ["Partage", ["Le numéro de téléphone de l'acheteur et du vendeur est partagé entre eux seulement après le paiement, pour organiser la livraison. Le prestataire de paiement et le livreur reçoivent les informations nécessaires à leur mission."]],
      ["Conservation", ["Les données de compte sont conservées tant que le compte est actif, puis 3 ans. Les données comptables sont conservées 10 ans."]],
      ["Tes droits", ["Conformément à la loi n° 2008-12 du 25 janvier 2008, tu peux accéder à tes données, les rectifier, t'opposer à leur traitement ou demander leur suppression : [À COMPLÉTER : e-mail de contact]. Tu peux désactiver les messages WhatsApp dans tes réglages."]],
    ],
  },
};

export default function Legal({ doc }: { doc: "cgu" | "privacy" | "rules" }) {
  const d = DOCS[doc];
  return (
    <div className="page">
      <div className="container legal">
        <div className="eyebrow">Babylone</div>
        <h1 className="display page-title">
          <SplitTitle text={d.title} />
        </h1>
        {doc !== "rules" && <p className="chip chip-warn" style={{ margin: "10px 0 6px" }}>Brouillon : à faire relire par un juriste avant la mise en ligne.</p>}
        {d.body.map(([h, ps]) => (
          <section key={h}>
            <h2>{h}</h2>
            {ps.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
        <div className="row wrap" style={{ marginTop: 40 }}>
          <Link to="/regles" className="chip">Règles des enchères</Link>
          <Link to="/cgu" className="chip">Conditions générales</Link>
          <Link to="/confidentialite" className="chip">Confidentialité</Link>
        </div>
      </div>
    </div>
  );
}
