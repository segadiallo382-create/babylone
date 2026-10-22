import { useSyncExternalStore } from "react";

// Interface en wolof (partielle) : navigation et actions principales.
// Traductions à faire relire par un locuteur natif avant le lancement.
const WO: Record<string, string> = {
  Accueil: "Kër",
  Enchères: "Njaay yi",
  Live: "Ci direct",
  Arrivages: "Ñëw yi",
  Demandes: "Laaj yi",
  Vendre: "Jaay",
  Compte: "Sama kont",
  Connexion: "Dugg",
  "Créer un compte": "Sos sa kont",
  "Voir les enchères": "Xool njaay yi",
  "Vendre mes stocks": "Jaay sama marsandiis",
  "Offre actuelle": "Njëg bi leegi",
  "Prix de départ": "Njëg bu njëkk",
  "Fin dans": "Dina jeex ci",
  Enchérir: "Yokk njëg bi",
  Suivre: "Topp",
  Suivie: "Mangi ko topp",
  "Acheter maintenant": "Jënd leegi",
  "Partager sur WhatsApp": "Yónne ko ci WhatsApp",
  Rechercher: "Wut",
  "En direct": "Ci direct",
  Terminé: "Jeex na",
};

const KEY = "babylone.lang";
let lang: "fr" | "wo" = (() => {
  try {
    return localStorage.getItem(KEY) === "wo" ? "wo" : "fr";
  } catch {
    return "fr";
  }
})();
const listeners = new Set<() => void>();

export function setLang(l: "fr" | "wo") {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* stockage indisponible */
  }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

export function useLang() {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => lang,
  );
}

export function useT() {
  const l = useLang();
  return (s: string) => (l === "wo" && WO[s]) || s;
}
