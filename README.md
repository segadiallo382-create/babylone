# Babylone

Plateforme sénégalaise de vente de produits importés **à prix évolutif** (enchères montantes).
Projet de Mouhamed Abdou Dial (business plan Performics, 2025/2026).

## En ligne (Render)

[![Déployer sur Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/segadiallo382-create/babylone)

Le fichier `render.yaml` crée le service automatiquement. Le mot de passe admin (`ADMIN_PASSWORD`) est généré par Render et visible dans *Environment*. Avec l'offre gratuite, la base de démo repart de zéro à chaque redémarrage du service.

## Lancer

```bash
npm install
npm run seed      # base de démo (23 ventes en direct, comptes de test)
npm run build     # compile le front
npm start         # http://localhost:4000 (API + site)
```

Développement avec rechargement à chaud : `npm run server` dans un terminal, `npm run web` dans un autre (http://localhost:5173).

Test du parcours complet (serveur lancé, `DEMO_BOTS=0` conseillé) : `node --no-warnings test/flow.mjs`.

### Comptes de démo (mot de passe `babylone2027`)

| Rôle | Téléphone |
|---|---|
| Acheteur | 781234567 |
| Vendeur (Ndiaye Import Thiès) | 771000001 |
| Admin | 770000000 |

## Ce qui est en place

- **Enchères en direct** (Socket.IO) : prix, compte à rebours, historique et carte mis à jour en temps réel.
- **Règles** (`server/rules.js`) :
  - Palier minimum fixé par la plateforme selon le prix.
  - Prix de réserve caché.
  - Anti-snipe : une offre dans les 2 dernières minutes prolonge la vente de 2 minutes.
  - Vente par lot.
- **Clôture automatique** :
  - Le gagnant a 24 h pour payer.
  - Sans paiement, la vente passe au 2ᵉ offrant.
  - 2 impayés suspendent le compte.
- **Paiement séquestre** :
  - L'argent est bloqué jusqu'à la confirmation de réception, puis versé au vendeur moins 15 %.
  - Libération automatique 72 h après la livraison.
  - Litiges et remboursements gérés par l'admin.
- **Espace demande** :
  - Les acheteurs publient ce qu'ils cherchent et votent « moi aussi ».
  - Les vendeurs sont prévenus.
  - Les acheteurs sont prévenus dès qu'une vente de la catégorie est publiée.
- **Espaces** :
  - Acheteur : enchères, suivis, commandes, notifications.
  - Vendeur : statistiques, publication avec photos, expéditions, offre Pro à 5 000 F/mois.
  - Admin : GMV, commissions, fonds bloqués, vérification des vendeurs.
- **Offre de bienvenue** : 0 % de commission le premier mois.
- **Design et 3D** :
  - Three.js / React Three Fiber : sac 3D animé, étiquettes de prix branchées sur les vraies offres, carte 3D du Sénégal (14 régions, hauteur selon le nombre de ventes, ondes à chaque offre).
  - Framer Motion : transitions de page, cartes inclinables, compteurs, confettis.
  - Si WebGL est absent, la carte s'affiche en SVG.

## Fonctions ajoutées (v2)

- **Enchère automatique** : plafond secret, Babylone surenchérit palier par palier (façon eBay).
- **Vente multiple** : N pièces identiques, les N meilleures offres gagnent chacune une pièce et paient leur propre offre.
- **Achat immédiat** : prix optionnel qui arrête la vente.
- **Code SMS** à l'inscription et pour « mot de passe oublié » (6 chiffres, 10 min, 5 essais, 1 envoi par minute).
- **WhatsApp** :
  - alertes « dépassé », « gagné », « rappel de paiement 4 h avant », « expédié » ;
  - désactivables dans Réglages ;
  - aperçu riche (titre, prix, photo) quand on partage le lien d'une vente.
- **Parrainage** : code personnel, lien d'invitation WhatsApp, liste des filleuls.
- **Modération** : les annonces des vendeurs non vérifiés attendent la validation de l'admin.
- **Anti-fraude** : signale l'enchérisseur qui a la même IP que le vendeur, ou deux comptes depuis la même IP. L'admin peut bloquer un compte.
- **Application installable** (PWA) et **mode allégé** (sans 3D), automatique sur les petits appareils ou réglable.
- **Pages légales** : règles des enchères, CGU et confidentialité, à faire relire par un juriste.

## Fonctions ajoutées (v3)

- **Fiabilité**
  - Comptes à rebours calés sur l'heure du serveur.
  - En-têtes de sécurité (CSP, HSTS…), limites de requêtes.
  - Journal d'audit des actions admin.
  - Sauvegarde automatique chaque nuit (7 gardées, téléchargeables depuis l'admin).
- **Argent réel**
  - Les vendeurs sont payés par déboursement PayDunya (Wave ou Orange Money) ; les remboursements et les cautions rendues passent par le même circuit. Tout est simulé en démo.
  - **Caution** de 5 000 F, remboursable, exigée pour enchérir à partir de 100 000 F. Elle est perdue au profit du vendeur si le gagnant ne paie pas.
- **Livraison**
  - Points relais (1 000 F), ou livraison à domicile.
  - **Code de retrait à 4 chiffres** : le vendeur le saisit à la remise, ce qui débloque son paiement.
- **Litiges** : messagerie de commande avec photos, litige avec preuves, décision motivée de l'admin.
- **Recherche intelligente**
  - Comprend « baskets pointure 43 moins de 15 000 à Thiès ».
  - Tolère accents et pluriels, filtres taille, budget, flash, inspecté, achat immédiat.
  - Pagination.
  - **Alertes** : recherches sauvegardées qui préviennent des nouveaux arrivages.
- **Boutiques** publiques avec abonnement, avis, ventes en cours et déjà vendues.
- **Vendeurs**
  - Modifier, dupliquer et remettre en vente.
  - **Publication multiple** : une photo, une vente.
  - **Prix du marché** et prix de départ conseillé d'après les ventes passées.
  - Heures d'affluence, export CSV comptable, versements, ventes flash (Pro).
- **Acheteurs**
  - Fidélité : points et niveaux Bronze, Argent, Or, Platine ; parrainage récompensé.
  - Note de fiabilité visible par les vendeurs.
  - Notifications push.
  - Profil, export et suppression des données (loi 2008-12).
- **Enchères en live** (`/live`)
  - Salle avec vidéo YouTube ou Facebook intégrée, ou à défaut une scène 3D.
  - Chat, enchère en un tap, « Une fois… deux fois… adjugé » (le lot se termine dans 20 s).
  - Régie vendeur.
- **Arrivages en précommande** (`/arrivages`)
  - L'importateur annonce son conteneur, les acheteurs réservent avec un acompte.
  - Si l'objectif est atteint, la commande est confirmée ; sinon, les acomptes sont remboursés automatiquement.
  - Le solde se paie à l'arrivée.
- **Bot WhatsApp**
  - Commandes `VENTES`, `23`, `OUI`, `E 23 15000`, `MES ENCHERES`, `STOP`.
  - Relance par `OUI` après une alerte « dépassé ».
  - Simulateur dans Admin → Intégrations.
  - Webhook : `/api/webhooks/whatsapp` (`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`).
- **Interface en wolof** (partielle : navigation et boutons principaux). **Traductions à faire relire par un locuteur natif.**
- **SEO** : `sitemap.xml`, `robots.txt`, aperçus riches. **Mesure d'audience** : tunnel visites → vues → offres → paiements.
- **3D**
  - Vitrine produit qu'on fait tourner.
  - Port à conteneurs animé.
  - Scène de live avec podium et projecteurs.
  - Cadeau qui s'ouvre quand on gagne.
  - Anneau de catégories, conteneurs et médailles en CSS 3D.
  - **Mode allégé** automatique sur les appareils faibles.

Pas encore fait, car il faut un partenaire ou un compte :
- passage à PostgreSQL (SQLite et ses sauvegardes suffisent au début) ;
- application Play Store (le site est déjà installable) ;
- USSD ;
- paiement en plusieurs fois ;
- expansion régionale.

Les intégrations PayDunya (encaissement et déboursement), Orange SMS et WhatsApp ne sont pas testées avec de vraies clés : il faudra les essayer en bac à sable.

## Variables d'environnement (production)

| Variable | Rôle |
|---|---|
| `PUBLIC_URL` | Adresse publique, ex. `https://babylone.sn` |
| `BABYLONE_SECRET` | Clé de signature des sessions (longue chaîne aléatoire) |
| `PAYDUNYA_MASTER_KEY`, `PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_TOKEN`, `PAYDUNYA_MODE=live` | Paiements Wave, Orange Money et carte. Sans `PAYDUNYA_MODE`, c'est le bac à sable. |
| `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET` | Alternative : Wave Checkout en direct |
| `ORANGE_CLIENT_ID`, `ORANGE_CLIENT_SECRET`, `ORANGE_SMS_SENDER`, `ORANGE_SMS_NAME` | SMS via l'API Orange |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` | WhatsApp Cloud API. Modèle « utilitaire » à 3 variables : titre, message, lien. |
| `DEMO_BOTS=0` | Coupe les acheteurs fictifs (obligatoire en production) |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Webhook du bot WhatsApp (vérification Meta, signature des messages) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Notifications push. Sans ces variables, les clés sont générées dans `data/`, mais avec l'offre gratuite de Render elles changent à chaque redéploiement et les abonnements push sont perdus. |
| `DEPOSIT_AMOUNT`, `DEPOSIT_THRESHOLD` | Montant de la caution et seuil d'enchère où elle est exigée |

Dès qu'une clé de paiement est définie, le mode démo se coupe. Les intégrations PayDunya, Wave, Orange SMS et WhatsApp suivent la documentation des fournisseurs, mais elles n'ont pas été testées avec de vraies clés : il faudra les tester en bac à sable.

## Avant la mise en ligne réelle

1. **Wave Business** : obtenir une clé API marchand. Définir `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET` et `PUBLIC_URL`. Le mode démo se coupe alors tout seul : `server/payments.js` est prêt, mais il n'a pas été testé avec de vraies clés.
2. **Orange Money** : passe par PayDunya (recommandé). Sinon, l'API Web Payment d'Orange reste à intégrer.
3. **Séquestre** : faire valider par un juriste le fait de détenir l'argent des acheteurs (réglementation BCEAO sur la monnaie électronique). Sinon, passer par un agrégateur (PayDunya, CinetPay…).
4. **Enchères en ligne** : vérifier le cadre légal au Sénégal.
5. **Hébergement** : un VPS Node 22+ suffit (`npm start`). Penser à sauvegarder le dossier `data/` (base SQLite et photos). Définir `BABYLONE_SECRET`.
6. **Bots de démo** : mettre `DEMO_BOTS=0`. Ce sont des acheteurs fictifs qui animent la démo. Ils ne doivent jamais tourner face à de vrais utilisateurs.

Les photos de démo viennent d'Unsplash. Il faudra les remplacer par les vraies photos des importateurs.
