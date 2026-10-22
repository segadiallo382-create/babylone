// Recherche : texte normalisé (sans accents), suggestion de catégorie, lecture de requêtes en langage naturel.
import { CITIES } from "./rules.js";

export const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const searchText = (a) => normalize([a.title, a.category, a.description, a.size, a.city, a.condition].join(" "));

const KEYWORDS = {
  Chaussures: ["basket", "baskets", "sneaker", "sneakers", "chaussure", "chaussures", "escarpin", "escarpins", "sandale", "sandales", "mocassin", "derby", "botte", "bottes", "talon", "running", "claquette", "tennis"],
  Friperie: ["friperie", "fripe", "fripes", "seconde", "occasion", "ballot"],
  Vêtements: ["tshirt", "t", "shirt", "chemise", "robe", "pantalon", "jean", "jeans", "veste", "bomber", "pull", "wax", "boubou", "jupe", "short", "costume", "maillot"],
  Accessoires: ["sac", "montre", "lunette", "lunettes", "ceinture", "casquette", "bijou", "bijoux", "collier", "portefeuille", "bracelet", "chapeau"],
  Électronique: ["telephone", "smartphone", "iphone", "samsung", "tecno", "infinix", "ordinateur", "laptop", "pc", "casque", "ecouteur", "ecouteurs", "tablette", "tv", "television", "enceinte", "camera", "appareil", "photo", "console", "chargeur", "powerbank"],
  Électroménager: ["frigo", "refrigerateur", "climatiseur", "clim", "ventilateur", "micro", "onde", "mixeur", "blender", "machine", "laver", "fer", "congelateur", "cuisiniere", "four", "bouilloire"],
  Beauté: ["parfum", "creme", "maquillage", "cosmetique", "savon", "lotion", "huile", "perruque", "meche", "vernis"],
  Maison: ["canape", "chaise", "table", "lit", "matelas", "rideau", "tapis", "ustensile", "casserole", "marmite", "drap", "coussin", "lampe"],
};

// « telephone » doit aussi trouver « Smartphone Android » : un mot-clé de catégorie vaut la catégorie entière
export function categoryOfWord(w) {
  for (const [cat, keys] of Object.entries(KEYWORDS)) if (keys.includes(w) || keys.includes(`${w}s`)) return cat;
  return null;
}

export function suggestCategory(title) {
  const words = normalize(title).split(" ");
  let best = null;
  let score = 0;
  for (const [cat, keys] of Object.entries(KEYWORDS)) {
    const s = words.filter((w) => keys.includes(w)).length;
    if (s > score) [best, score] = [cat, s];
  }
  return best;
}

const CITY_INDEX = Object.keys(CITIES).map((c) => [normalize(c), c]);
const STOP = new Set(["a", "au", "de", "des", "du", "la", "le", "les", "un", "une", "pour", "en", "et", "je", "cherche", "veux", "moins", "max", "maximum", "pointure", "taille", "f", "fcfa", "cfa", "sur", "dans", "pas", "cher"]);

// « baskets pointure 43 moins de 15 000 à Thiès » -> { terms, size, maxPrice, city, category }
export function parseQuery(q) {
  let text = normalize(q).replace(/(\d)\s+(\d{3})\b/g, "$1$2");
  const out = { terms: [], size: null, maxPrice: null, city: null, category: null };
  const price = /(?:moins de|max(?:imum)?|sous|budget|<)\s*(\d{3,7})|(\d{3,7})\s*(?:f|fcfa|cfa)\b(?:\s*max)?/.exec(text);
  if (price) {
    out.maxPrice = Number(price[1] || price[2]);
    text = text.replace(price[0], " ");
  }
  const size = /\b(?:pointure|taille|size)\s*([0-9]{2}|xxl|xl|xs|s|m|l)\b/.exec(text);
  if (size) {
    out.size = size[1].toUpperCase();
    text = text.replace(size[0], " ");
  }
  for (const [n, c] of CITY_INDEX)
    if (new RegExp(`\\b${n}\\b`).test(text)) {
      out.city = c;
      text = text.replace(new RegExp(`\\b${n}\\b`), " ");
      break;
    }
  out.category = suggestCategory(text);
  // « baskets 43 » : un nombre de 34 à 47 dans une recherche de chaussures est une pointure
  if (!out.size && out.category === "Chaussures") {
    const n = /\b(3[4-9]|4[0-7])\b/.exec(text);
    if (n) {
      out.size = n[1];
      text = text.replace(n[0], " ");
    }
  }
  // Pluriels : « baskets » trouve aussi « basket »
  out.terms = text
    .split(" ")
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w) && w.length > 1)
    .map((w) => (w.length > 4 ? w.replace(/(s|x)$/, "") : w));
  return out;
}
