// Règles métier partagées : paliers d'enchère, commission, livraison, villes.

export const COMMISSION_RATE = 0.15;
export const PRO_PRICE = 5000;
export const ANTI_SNIPE_MS = 2 * 60 * 1000; // une offre dans les 2 dernières minutes prolonge la vente
export const PAY_DELAY_MS = Number(process.env.PAY_DELAY_MS || 24 * 3600 * 1000);
export const AUTO_RELEASE_MS = 72 * 3600 * 1000; // fonds libérés 72 h après livraison sans litige
export const MAX_STRIKES = 2;

// Marge d'évolution du prix fixée par la plateforme selon le prix courant
const STEPS = [
  [5_000, 250],
  [20_000, 500],
  [50_000, 1_000],
  [100_000, 2_500],
  [250_000, 5_000],
  [500_000, 10_000],
  [Infinity, 25_000],
];
export function increment(price) {
  return STEPS.find(([max]) => price < max)[1];
}

export const CITIES = {
  Dakar: "Dakar",
  Pikine: "Dakar",
  Rufisque: "Dakar",
  Thiès: "Thies",
  Mbour: "Thies",
  Tivaouane: "Thies",
  "Saint-Louis": "Saint Louis",
  Touba: "Diourbel",
  Diourbel: "Diourbel",
  Kaolack: "Kaolack",
  Fatick: "Fatick",
  Louga: "Louga",
  Ziguinchor: "Ziguinchor",
  Kolda: "Kolda",
  Tambacounda: "Tambacounda",
  Kaffrine: "Kaffrine",
  Matam: "Matam",
  Sédhiou: "Sedhiou",
  Kédougou: "Kedougou",
};

export function deliveryFee(fromCity, toCity) {
  if (fromCity === toCity) return 1_500;
  if (CITIES[fromCity] && CITIES[fromCity] === CITIES[toCity]) return 2_000;
  return 3_500;
}

export const CATEGORIES = [
  "Chaussures",
  "Friperie",
  "Vêtements",
  "Accessoires",
  "Électronique",
  "Électroménager",
  "Beauté",
  "Maison",
];

export const CONDITIONS = ["neuf", "comme neuf", "bon état", "friperie premier choix"];
