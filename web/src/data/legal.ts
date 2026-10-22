// Textes légaux de Babylone (droit sénégalais). Les mentions « [À COMPLÉTER : …] » sont des informations que seule la société peut fournir :
// tant qu'il en reste, la page affiche un avertissement. Faire relire l'ensemble par un juriste avant l'ouverture au public.

export const UPDATED = "22 octobre 2026";

const TODO = (what: string) => `[À COMPLÉTER : ${what}]`;

export const COMPANY = {
  name: "BABYLONE E-COMMERCE SUARL",
  form: "société unipersonnelle à responsabilité limitée (SUARL) de droit sénégalais",
  capital: TODO("capital social en FCFA"),
  address: TODO("adresse du siège social"),
  city: "Thiès, Sénégal",
  rccm: TODO("numéro RCCM"),
  ninea: TODO("numéro NINEA"),
  manager: TODO("nom du gérant"),
  email: TODO("e-mail de contact, ex. contact@babylone.sn"),
  privacyEmail: TODO("e-mail pour les données personnelles, ex. donnees@babylone.sn"),
  phone: TODO("téléphone du support"),
  cdp: TODO("numéro de récépissé de déclaration ou d'autorisation de la CDP"),
};

const ID = `${COMPANY.name}, ${COMPANY.form} au capital de ${COMPANY.capital}, dont le siège est situé ${COMPANY.address}, ${COMPANY.city}, immatriculée au Registre du Commerce et du Crédit Mobilier sous le numéro ${COMPANY.rccm}, NINEA ${COMPANY.ninea}`;

export type Block = string | string[];
export type Doc = { title: string; intro?: string; sections: [string, Block[]][] };

export const DOCS: Record<"rules" | "cgu" | "privacy" | "mentions", Doc> = {
  rules: {
    title: "Règles des enchères",
    sections: [
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
    sections: [
      ["Éditeur", [`La plateforme Babylone est éditée par ${ID}. Contact : ${COMPANY.email}, ${COMPANY.phone}.`]],
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
      ["Données personnelles", ["Le traitement des données personnelles est décrit dans la Politique de confidentialité, qui fait partie des présentes conditions."]],
      ["Droit applicable", [`Les présentes conditions sont soumises au droit sénégalais et aux Actes uniformes OHADA. ${TODO("tribunal compétent, en principe le Tribunal de commerce de Thiès")}`]],
    ],
  },

  privacy: {
    title: "Politique de confidentialité",
    intro:
      "Cette politique explique quelles données personnelles Babylone collecte, pourquoi, avec qui elles sont partagées, combien de temps elles sont gardées et comment exercer tes droits. Elle s'applique au site, à l'application installable et aux échanges par SMS et WhatsApp.",
    sections: [
      [
        "1. Responsable du traitement",
        [
          `Le responsable du traitement est ${ID}, représentée par son gérant, ${COMPANY.manager}.`,
          `Contact pour toute question sur tes données : ${COMPANY.privacyEmail}, ou par courrier à l'adresse du siège.`,
          `Formalités auprès de la Commission de Protection des Données Personnelles (CDP) : ${COMPANY.cdp}.`,
        ],
      ],
      [
        "2. Cadre légal",
        [
          "Les traitements respectent la loi n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel et son décret d'application n° 2008-721 du 30 juin 2008, ainsi que la loi n° 2008-08 du 25 janvier 2008 sur les transactions électroniques.",
          "Babylone applique les principes de cette loi : collecte loyale et licite, finalités déterminées, données limitées au nécessaire, exactitude, durée de conservation limitée, sécurité et confidentialité.",
        ],
      ],
      [
        "3. Données collectées",
        [
          "Babylone collecte uniquement les données nécessaires au service :",
          [
            "Compte : nom, numéro de téléphone, ville, mot de passe (stocké uniquement sous forme chiffrée irréversible), langue, préférences de notification.",
            "Vendeurs : nom de boutique, présentation, compte de versement (Wave ou Orange Money) et les documents que tu transmets à l'équipe pour faire vérifier ta boutique (pièce d'identité, RCCM, NINEA).",
            "Ventes et commandes : offres, plafonds d'enchère automatique, ventes suivies, recherches enregistrées, commandes, adresse ou point relais de livraison, paiements (référence et statut, jamais de code secret ni de numéro de carte), avis.",
            "Échanges : messages entre acheteur et vendeur liés à une commande, litiges et photos jointes, demandes publiées dans l'espace demande.",
            "Contenus publiés par les vendeurs : photos et descriptions des produits.",
            "Assistant IA : questions posées à l'assistant sur le site ou par WhatsApp, photos envoyées pour rédiger une annonce.",
            "Données techniques : adresse IP, identifiant d'appareil généré par le site, journaux de connexion, abonnement aux notifications push. Elles servent à la sécurité et à la lutte contre la fraude.",
          ],
          "Babylone ne collecte aucune donnée sensible au sens de la loi (origine, opinions, religion, santé, vie sexuelle). Ne publie jamais ce type d'information dans une annonce, un message ou une question à l'assistant.",
        ],
      ],
      [
        "4. Pourquoi et sur quelle base",
        [
          [
            "Créer et gérer ton compte, organiser les ventes, les paiements, la livraison et les litiges : exécution du contrat (Conditions générales).",
            "T'envoyer les messages liés à tes ventes (offre dépassée, vente gagnée, rappel de paiement, expédition) par notification, SMS ou WhatsApp : exécution du contrat. Les alertes WhatsApp et push se désactivent à tout moment dans ton compte.",
            "Vérifier les vendeurs, modérer les annonces, détecter les comptes multiples, les enchères fictives et la fraude : intérêt légitime de Babylone et de ses utilisateurs à une plateforme sûre.",
            "Tenir la comptabilité, répondre aux autorités : obligation légale.",
            "Améliorer le service avec des statistiques de fréquentation agrégées, sans publicité ni revente : intérêt légitime.",
          ],
          "Babylone ne vend pas tes données et ne les utilise pas pour de la publicité ciblée.",
        ],
      ],
      [
        "5. Intelligence artificielle",
        [
          "Babylone utilise un modèle d'intelligence artificielle (Google Gemini) pour trois usages : répondre aux questions dans l'assistant, aider les vendeurs à rédiger une annonce à partir de leurs photos, et repérer les annonces suspectes (produit interdit, contrefaçon, photo de catalogue).",
          "Seules les données utiles sont envoyées : le texte de ta question, ou les photos et le texte de l'annonce. Ton nom et ton numéro ne sont jamais transmis. Quand tu demandes tes enchères en cours, l'assistant reçoit seulement la liste des ventes concernées. Google peut conserver ces échanges et les faire relire pour améliorer ses services, sans les relier à ton identité, qui ne lui est pas communiquée.",
          "Ne transmets aucune donnée personnelle (mot de passe, code reçu par SMS, numéro de pièce d'identité, adresse) à l'assistant.",
          "L'IA ne prend aucune décision définitive à ta place. Une annonce signalée par l'IA est mise en attente puis examinée par un membre de l'équipe Babylone, qui décide de la publier ou de la refuser. Tu peux contester toute décision en écrivant au contact ci-dessus.",
        ],
      ],
      [
        "6. Destinataires",
        [
          "Tes données sont accessibles uniquement aux personnes qui en ont besoin :",
          [
            "L'équipe Babylone habilitée (support, modération, comptabilité), tenue à la confidentialité.",
            "L'autre partie à une commande : après le paiement uniquement, l'acheteur et le vendeur reçoivent le nom et le numéro de téléphone nécessaires à la livraison. Avant, ton nom apparaît masqué (ex. « Moussa D. ») dans les offres.",
            "Les sous-traitants techniques, chacun pour sa seule mission : hébergement du site (Render), paiement (Wave, PayDunya), SMS (Orange), intelligence artificielle (Google), notifications push (service de ton navigateur).",
            "Les autorités administratives ou judiciaires, uniquement sur demande légale.",
          ],
          "Les boutons WhatsApp du site ouvrent l'application WhatsApp : le message que tu choisis d'envoyer est alors traité par WhatsApp (Meta) selon ses propres conditions.",
        ],
      ],
      [
        "7. Transferts hors du Sénégal",
        [
          "Certains sous-traitants traitent des données hors du Sénégal : le serveur du site est hébergé dans l'Union européenne (Francfort, Allemagne) par Render Services, Inc. (États-Unis), et l'intelligence artificielle est fournie par Google LLC (États-Unis).",
          `Conformément à la loi n° 2008-12, ces transferts sont limités aux données nécessaires, encadrés par les engagements contractuels de ces prestataires et soumis aux formalités prévues auprès de la CDP : ${COMPANY.cdp}.`,
        ],
      ],
      [
        "8. Durée de conservation",
        [
          [
            "Compte : tant qu'il est actif. Après 3 ans sans aucune activité (connexion, offre ou commande), il est automatiquement anonymisé.",
            "Commandes, paiements, factures et versements : 10 ans, durée légale de conservation des pièces comptables.",
            "Litiges et messages liés à une commande : jusqu'à la fin du litige, puis 5 ans pour la preuve.",
            "Documents de vérification des vendeurs : pendant la relation, puis 5 ans.",
            "Données techniques et de sécurité (IP, appareils, journaux) : 12 mois.",
            "Questions à l'assistant IA : gardées pendant ta session sur le site, 30 minutes pour WhatsApp, puis effacées des serveurs de Babylone.",
            "Sauvegardes de la base : 7 jours glissants.",
          ],
          "Quand tu supprimes ton compte, ton nom, ton numéro, ta boutique et ton compte de versement sont effacés immédiatement. Seules restent, anonymisées ou pour la durée légale, les données comptables des commandes passées.",
        ],
      ],
      [
        "9. Sécurité",
        [
          "Babylone protège tes données par des mesures adaptées : connexion chiffrée (HTTPS), mots de passe chiffrés de façon irréversible, accès à l'administration limité et journalisé, vérification de signature des messages des prestataires (paiement, WhatsApp), limitation des tentatives de connexion, sauvegardes quotidiennes.",
          "En cas de violation de données présentant un risque pour toi, Babylone t'en informe dans les meilleurs délais et informe la CDP.",
        ],
      ],
      [
        "10. Tes droits",
        [
          "Conformément à la loi n° 2008-12, tu disposes des droits suivants :",
          [
            "Droit d'information : cette page.",
            "Droit d'accès : obtenir une copie de tes données. Le bouton « Télécharger mes données » de ton compte la fournit immédiatement.",
            "Droit de rectification : corriger tes informations dans ton compte, ou en écrivant au contact.",
            "Droit d'opposition : t'opposer, pour un motif légitime, à un traitement, et sans motif aux messages non indispensables.",
            "Droit à l'effacement : le bouton « Supprimer mon compte » efface tes données, sous réserve des obligations légales ci-dessus et des commandes en cours.",
          ],
          `Pour exercer un droit, écris à ${COMPANY.privacyEmail} depuis le numéro ou l'adresse liés au compte. Babylone répond dans un délai d'un mois au plus.`,
          "Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la Commission de Protection des Données Personnelles (CDP), Dakar, www.cdp.sn.",
        ],
      ],
      [
        "11. Mineurs",
        ["Babylone est réservé aux personnes majeures (18 ans). Les enchères engagent à payer. Un compte ouvert par un mineur est supprimé dès que Babylone en a connaissance."],
      ],
      [
        "12. Cookies et stockage local",
        [
          "Babylone n'utilise aucun cookie publicitaire ni outil de suivi tiers. Le site enregistre seulement dans ton navigateur les éléments nécessaires à son fonctionnement :",
          [
            "babylone.token : te garder connecté.",
            "babylone.device : identifiant d'appareil aléatoire, contre la fraude et les comptes multiples.",
            "babylone.session : identifiant de visite, pour des statistiques anonymes.",
            "babylone.lang et babylone.lite : ta langue et le mode allégé.",
            "babylone.ai.chat : ta conversation avec l'assistant, effacée à la fermeture de l'onglet.",
          ],
          "Ces éléments sont strictement nécessaires et ne demandent donc pas de consentement. Tu peux les effacer depuis les réglages de ton navigateur, mais tu seras alors déconnecté.",
        ],
      ],
      [
        "13. Modifications",
        ["Babylone peut mettre à jour cette politique, par exemple pour un nouveau service. La date de mise à jour figure en haut de la page. Tu es prévenu dans l'application en cas de changement important."],
      ],
    ],
  },

  mentions: {
    title: "Mentions légales",
    intro: "Informations prévues par la loi n° 2008-08 du 25 janvier 2008 sur les transactions électroniques.",
    sections: [
      [
        "Éditeur du site",
        [
          ID + ".",
          `Contact : ${COMPANY.email}, ${COMPANY.phone}.`,
        ],
      ],
      ["Directeur de la publication", [`${COMPANY.manager}, gérant.`]],
      [
        "Hébergeur",
        ["Render Services, Inc., San Francisco, Californie, États-Unis (render.com). Serveur situé dans l'Union européenne (Francfort, Allemagne)."],
      ],
      [
        "Prestataires techniques",
        [
          [
            "Paiement : Wave et PayDunya, prestataires agréés. Babylone ne stocke ni code secret ni numéro de carte.",
            "SMS : Orange (API SMS Sénégal).",
            "Intelligence artificielle : Google LLC (Gemini).",
          ],
        ],
      ],
      [
        "Rôle de Babylone",
        [
          "Babylone est une plateforme d'intermédiation. Les produits sont vendus par des vendeurs indépendants, seuls responsables de leurs annonces, de la conformité et de la légalité des produits.",
          "Babylone vérifie les vendeurs et modère les annonces, mais n'a pas d'obligation générale de surveiller tous les contenus publiés. Babylone retire promptement tout contenu manifestement illicite qui lui est signalé.",
        ],
      ],
      [
        "Signaler un contenu illicite",
        [
          `Pour signaler une annonce ou un contenu illicite (contrefaçon, produit interdit, arnaque, atteinte à tes droits), écris à ${COMPANY.email} en indiquant le lien de l'annonce, la nature du problème et, pour une atteinte à tes droits, la preuve de ceux-ci. Babylone traite chaque signalement dans les meilleurs délais.`,
        ],
      ],
      [
        "Propriété intellectuelle",
        [
          "La marque Babylone, le logo, le design, les textes et le code du site appartiennent à l'éditeur. Toute reproduction sans autorisation écrite est interdite.",
          "Les vendeurs gardent les droits sur leurs photos et descriptions. En les publiant, ils autorisent Babylone à les afficher, les redimensionner et les partager sur le site et ses canaux de promotion, pendant la durée de la vente.",
        ],
      ],
      ["Données personnelles", ["Le traitement des données personnelles est décrit dans la Politique de confidentialité."]],
      ["Droit applicable", ["Le site et ces mentions sont soumis au droit sénégalais."]],
    ],
  },
};
