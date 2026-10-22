export const money = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ");
export const fcfa = (n: number) => `${money(n)} FCFA`;

export function remaining(ms: number) {
  if (ms <= 0) return { done: true, d: 0, h: 0, m: 0, s: 0 };
  const s = Math.floor(ms / 1000);
  return { done: false, d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function shortLeft(ms: number) {
  const r = remaining(ms);
  if (r.done) return "Terminé";
  if (r.d > 0) return `${r.d} j ${r.h} h`;
  if (r.h > 0) return `${r.h} h ${String(r.m).padStart(2, "0")} min`;
  return `${String(r.m).padStart(2, "0")}:${String(r.s).padStart(2, "0")}`;
}

export function ago(t: number) {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

export const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const ORDER_STATUS: Record<string, [string, "red" | "ok" | "warn" | ""]> = {
  awaiting_payment: ["À payer", "warn"],
  paid: ["Payé · fonds sécurisés", "ok"],
  shipped: ["En livraison", "ok"],
  delivered: ["Livré", "ok"],
  released: ["Terminé", ""],
  expired: ["Délai dépassé", "red"],
  disputed: ["Litige en cours", "red"],
  refunded: ["Remboursé", ""],
};

// Redimensionne une image côté navigateur avant envoi (économise la data mobile)
export function resizeImage(file: File, max = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = URL.createObjectURL(file);
  });
}
