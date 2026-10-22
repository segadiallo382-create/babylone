import { useEffect, useState } from "react";
import type { Auction } from "../lib/api";
import { api } from "../lib/api";
import { money, shortLeft } from "../lib/format";
import { serverNow } from "../lib/store";
import { Reveal } from "./ui";

type Stats = { count: number; low: number; high: number; median: number; similar: boolean; recent: { id: number; title: string; price: number; ends_at: number }[] } | null;

// « Des articles similaires sont partis entre X et Y » : rassure l'acheteur, guide le vendeur
export function MarketPrice({ id, current }: { id: number; current: number }) {
  const [s, setS] = useState<Stats | undefined>(undefined);
  useEffect(() => {
    api(`/auctions/${id}/comparables`)
      .then((r) => setS(r.stats))
      .catch(() => setS(null));
  }, [id]);
  if (!s) return null;
  const min = Math.min(s.low, current) * 0.85;
  const max = Math.max(s.high, current) * 1.1;
  const pos = (v: number) => `${Math.max(2, Math.min(98, ((v - min) / (max - min)) * 100))}%`;
  const verdict = current < s.low ? ["Bonne affaire", "chip-ok"] : current > s.high ? ["Au-dessus du marché", "chip-warn"] : ["Dans les prix du marché", ""];
  return (
    <Reveal>
      <div className="card pad market">
        <div className="row between wrap">
          <h3>Prix du marché</h3>
          <span className={`chip ${verdict[1]}`}>{verdict[0]}</span>
        </div>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
          {s.count} vente{s.count > 1 ? "s" : ""} {s.similar ? "similaire" : "de la catégorie"}
          {s.count > 1 ? "s" : ""} sur 4 mois : la plupart entre <b className="num">{money(s.low)} F</b> et <b className="num">{money(s.high)} F</b>.
        </p>
        <div className="market-bar">
          <span className="market-pin num" style={{ left: pos(current), color: "var(--red-ink)" }}>
            Ici {money(current)} F
          </span>
        </div>
        <div className="row between muted num" style={{ fontSize: 12 }}>
          <span>{money(Math.round(min))} F</span>
          <span>médiane {money(s.median)} F</span>
          <span>{money(Math.round(max))} F</span>
        </div>
      </div>
    </Reveal>
  );
}

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

// Affiche verticale pour les statuts WhatsApp et TikTok, générée dans le navigateur
export function Poster({ a }: { a: Auction }) {
  const [busy, setBusy] = useState(false);
  async function make() {
    setBusy(true);
    try {
      await document.fonts?.ready;
      const W = 1080;
      const H = 1920;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d")!;
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#1a0b0d");
      bg.addColorStop(1, "#0a0a0b");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      const glow = g.createRadialGradient(W * 0.7, 520, 50, W * 0.7, 520, 700);
      glow.addColorStop(0, "rgba(227,38,47,.45)");
      glow.addColorStop(1, "rgba(227,38,47,0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      // Photo avec coins arrondis
      const img = await loadImg(a.images[0]);
      const x = 90;
      const y = 300;
      const s = W - 180;
      g.save();
      g.beginPath();
      (g as any).roundRect(x, y, s, s, 60);
      g.clip();
      const k = Math.max(s / img.width, s / img.height);
      g.drawImage(img, x + (s - img.width * k) / 2, y + (s - img.height * k) / 2, img.width * k, img.height * k);
      g.restore();
      // En-tête
      g.fillStyle = "#e3262f";
      g.beginPath();
      (g as any).roundRect(90, 150, 330, 76, 38);
      g.fill();
      g.fillStyle = "#fff";
      g.font = "700 38px Inter, sans-serif";
      g.fillText("● EN DIRECT", 122, 202);
      g.fillStyle = "#f4f1ec";
      g.font = "800 64px 'Bricolage Grotesque', Inter, sans-serif";
      g.fillText("babylone", W - 400, 210);
      // Titre
      g.font = "800 72px 'Bricolage Grotesque', Inter, sans-serif";
      const words = a.title.split(" ");
      let line = "";
      let ty = y + s + 130;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (g.measureText(test).width > W - 180 && line) {
          g.fillText(line, 90, ty);
          line = w;
          ty += 84;
          if (ty > y + s + 300) break;
        } else line = test;
      }
      if (ty <= y + s + 300) g.fillText(line, 90, ty);
      // Prix et compte à rebours
      g.fillStyle = "#a19d97";
      g.font = "600 40px Inter, sans-serif";
      g.fillText(a.bids_count ? "Offre actuelle" : "Prix de départ", 90, 1600);
      g.fillStyle = "#ff4b4f";
      g.font = "800 132px 'Bricolage Grotesque', Inter, sans-serif";
      g.fillText(`${money(a.current_price)} F`, 84, 1730);
      g.fillStyle = "#f4f1ec";
      g.font = "600 40px Inter, sans-serif";
      g.fillText(`Fin dans ${shortLeft(a.ends_at - serverNow())} · ${a.city}`, 90, 1810);
      g.fillStyle = "#a19d97";
      g.font = "500 34px Inter, sans-serif";
      g.fillText(`${location.host}/enchere/${a.id}`, 90, 1868);
      const url = c.toDataURL("image/png");
      const link = Object.assign(document.createElement("a"), { href: url, download: `babylone-${a.id}.png` });
      link.click();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className="btn btn-ghost btn-sm" onClick={make} disabled={busy}>
      {busy ? "Création…" : "Affiche pour statut"}
    </button>
  );
}
