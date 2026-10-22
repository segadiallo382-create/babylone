// Données de démonstration : vendeurs, acheteurs et articles importés.
export const SELLERS = [
  { name: "Mamadou Ndiaye", shop: "Ndiaye Import Thiès", city: "Thiès", phone: "771000001" },
  { name: "Awa Sarr", shop: "Awa Conteneurs Dakar", city: "Dakar", phone: "771000002" },
  { name: "Cheikh Fall", shop: "Fall Électro", city: "Touba", phone: "771000003" },
  { name: "Fatou Diop", shop: "Diop Mode & Friperie", city: "Saint-Louis", phone: "771000004" },
  { name: "Ibrahima Ba", shop: "Ba Tech Kaolack", city: "Kaolack", phone: "771000005" },
  { name: "Aminata Sané", shop: "Casamance Import", city: "Ziguinchor", phone: "771000006" },
  { name: "Ousmane Gueye", shop: "Gueye Sneakers Mbour", city: "Mbour", phone: "771000007" },
];

export const BUYERS = [
  ["Moussa Diallo", "Thiès"],
  ["Khady Mbaye", "Dakar"],
  ["Pape Seck", "Thiès"],
  ["Ndeye Faye", "Mbour"],
  ["Abdou Sow", "Dakar"],
  ["Mariama Cissé", "Saint-Louis"],
  ["Babacar Thiam", "Kaolack"],
  ["Coumba Ka", "Touba"],
  ["Modou Lo", "Thiès"],
  ["Astou Ndour", "Ziguinchor"],
  ["Serigne Mbacké", "Touba"],
  ["Aïda Kane", "Dakar"],
];

// [image, titre, catégorie, état, vendeur (index), prix départ, réserve, quantité, description]
export const ITEMS = [
  ["sneaker-noir", "Baskets running noires, lot de 12 paires", "Chaussures", "neuf", 6, 6000, 9000, 12, "Arrivage conteneur Chine. Pointures 40 à 45, semelle amortie, tissu respirant."],
  ["casque-jaune", "Casque audio sans fil circum-aural", "Électronique", "neuf", 4, 9000, 0, 1, "Bluetooth 5.0, 30 h d'autonomie, réduction de bruit passive. Boîte d'origine."],
  ["lunettes-rondes", "Lunettes de soleil rondes, monture dorée", "Accessoires", "neuf", 3, 2500, 0, 1, "Verres teintés vert, protection UV400. Étui inclus."],
  ["laptop", "Ordinateur portable 13'' reconditionné", "Électronique", "comme neuf", 1, 120000, 180000, 1, "Import Europe. 8 Go RAM, SSD 256 Go, batterie testée 89 %. Garantie vendeur 3 mois."],
  ["montre-blanche", "Montre minimaliste bracelet silicone blanc", "Accessoires", "neuf", 1, 4000, 0, 1, "Cadran noir mat, étanche 3 ATM, mouvement quartz."],
  ["sneaker-bordeaux", "Sneakers toile bordeaux, lot de 20", "Chaussures", "neuf", 0, 4500, 7000, 20, "Toile épaisse, semelle vulcanisée. Pointures 38 à 44 mélangées."],
  ["polaroid", "Appareil photo instantané", "Électronique", "bon état", 3, 15000, 25000, 1, "Testé et fonctionnel. Livré avec un pack de 8 films."],
  ["running-rouge", "Chaussures de running rouges", "Chaussures", "neuf", 6, 8000, 0, 1, "Tige en maille, très légère. Pointure 43."],
  ["escarpins", "Escarpins à fleurs talon 10 cm", "Chaussures", "neuf", 3, 5000, 0, 1, "Imprimé floral, cuir synthétique verni. Pointure 39."],
  ["smartwatch", "Montre connectée écran AMOLED", "Électronique", "neuf", 4, 12000, 18000, 1, "Suivi cardio, notifications WhatsApp, autonomie 5 jours."],
  ["veste-cuir", "Veste perfecto cuir noir", "Friperie", "friperie premier choix", 3, 7000, 0, 1, "Friperie Europe premier choix. Taille M. Doublure intacte."],
  ["sac-dos", "Sac à dos urbain bleu nuit, lot de 10", "Accessoires", "neuf", 1, 5000, 8000, 10, "Compartiment ordinateur 15'', tissu déperlant."],
  ["soin", "Crème hydratante visage 50 ml", "Beauté", "neuf", 5, 2000, 0, 1, "Import USA, scellé. Date d'expiration 2028."],
  ["sneaker-montante", "Sneakers montantes tricolores", "Chaussures", "comme neuf", 0, 10000, 15000, 1, "Portées 2 fois. Pointure 42. Boîte d'origine."],
  ["derby-vert", "Derby cuir vert sauge", "Chaussures", "neuf", 5, 9000, 0, 1, "Cuir véritable, semelle cousue. Pointure 41."],
  ["lunettes-noires", "Lunettes de soleil classiques noires", "Accessoires", "neuf", 0, 2000, 0, 1, "Monture acétate, verres polarisés."],
  ["casque-gris", "Casque filaire studio, lot de 15", "Électronique", "neuf", 2, 2500, 4000, 15, "Câble 1,2 m jack 3,5 mm. Idéal revendeurs."],
  ["parfum", "Parfum femme 100 ml", "Beauté", "neuf", 1, 8000, 0, 1, "Flacon scellé, import Dubaï."],
  ["bomber", "Bomber léger terracotta", "Vêtements", "neuf", 2, 4000, 0, 1, "Tailles S à XL disponibles, préciser après la vente."],
  ["sneaker-pastel", "Sneakers pastel plateforme", "Chaussures", "neuf", 6, 7000, 0, 1, "Cuir synthétique, semelle plateforme 4 cm. Pointure 38."],
  ["smartphone", "Smartphone Android 128 Go", "Électronique", "comme neuf", 4, 35000, 55000, 1, "Écran 6,5'', double SIM, débloqué tous opérateurs. Chargeur inclus."],
  ["training-vert", "Chaussures training vert fluo", "Chaussures", "neuf", 6, 7500, 0, 1, "Maintien latéral renforcé. Pointure 44."],
  ["tshirt-noir", "T-shirts coton noir, lot de 50", "Vêtements", "neuf", 2, 15000, 25000, 50, "100 % coton 180 g, tailles M/L/XL. Parfait pour boutiques."],
];

export const REQUESTS = [
  ["Réfrigérateur 2 portes pas cher", "Électroménager", 150000, "Pour une famille de 6, idéalement livré à Thiès."],
  ["Lot de friperie enfants 2-8 ans", "Friperie", 40000, "Pour revendre au marché central."],
  ["Climatiseur split 12 000 BTU", "Électroménager", 200000, "Avant la saison chaude."],
  ["Baskets blanches pointure 44", "Chaussures", 15000, ""],
  ["Ventilateur sur pied", "Électroménager", 20000, ""],
  ["Robes wax import Ghana", "Vêtements", 10000, "Tailles M et L."],
];
