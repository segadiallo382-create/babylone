// Mode allégé : coupe la 3D sur les appareils modestes ou à la demande de l'utilisateur
const KEY = "babylone.lite";

function auto() {
  const nav = navigator as any;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  if (nav.connection?.saveData) return true;
  if (nav.deviceMemory && nav.deviceMemory <= 2) return true;
  if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) return true;
  return false;
}

export function liteMode(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* stockage indisponible */
  }
  return auto();
}

export function setLiteMode(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* stockage indisponible */
  }
  location.reload();
}

// Discussion avec le support Babylone (numéro au format international, ex. 221771234567)
export const whatsappTo = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
export const whatsappShare = (text: string, url: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
