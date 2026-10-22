import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Auction } from "../lib/api";
import { useLive } from "../lib/store";
import { IPin, IZap } from "./Icons";
import { Odometer, Tilt, TimerPill } from "./ui";

export function AuctionCard({ a }: { a: Auction }) {
  const l = useLive(a.id);
  const price = l && l.at > 0 && l.price ? Math.max(l.price, a.current_price) : a.current_price;
  const bids = l?.bids || a.bids_count;
  const endsAt = l?.ends_at || a.ends_at;
  const reserveMet = l?.reserve_met ?? a.reserve_met;
  const ended = a.status !== "live" || l?.ended;
  const [flash, setFlash] = useState(false);
  const last = useRef(price);
  useEffect(() => {
    if (price !== last.current) {
      last.current = price;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1000);
      return () => clearTimeout(t);
    }
  }, [price]);

  return (
    <Tilt max={9}>
      <Link to={`/enchere/${a.id}`} className={`a-card ${flash ? "flash" : ""}`}>
        <div className="media">
          <img src={a.images[0]} alt={a.title} loading="lazy" />
          <div className="tags">
            {!ended && (
              <span className="chip">
                <span className="live-dot" /> En direct
              </span>
            )}
            {a.boosted && (
              <span className="chip chip-red">
                <IZap size={12} /> À la une
              </span>
            )}
            {a.mode === "multi" ? (
              <span className="chip">{a.quantity} pièces · {a.quantity} gagnants</span>
            ) : (
              a.quantity > 1 && <span className="chip">Lot × {a.quantity}</span>
            )}
          </div>
          <div className="timer">
            <TimerPill endsAt={endsAt} ended={ended} />
          </div>
        </div>
        <div className="body">
          <h3>{a.title}</h3>
          <div className="meta">
            <IPin size={13} /> {a.city} · {a.seller.name}
          </div>
          <div className="price-row">
            <div>
              <div className="eyebrow" style={{ fontSize: 10.5, marginBottom: 2 }}>
                {a.mode === "multi" ? "Prix d'entrée" : bids ? "Offre actuelle" : "Prix de départ"}
              </div>
              <div className="price">
                <Odometer value={price} /> <small>F</small>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="num" style={{ fontWeight: 700 }}>
                {bids}
              </div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                offre{bids > 1 ? "s" : ""}
              </div>
            </div>
          </div>
          {a.buy_now_price > 0 && !ended && (
            <div style={{ marginTop: 10 }}>
              <span className="chip chip-red" style={{ height: 24, fontSize: 11.5 }}>
                Achat immédiat {a.buy_now_price.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} F
              </span>
            </div>
          )}
          {a.has_reserve && (
            <div style={{ marginTop: 10 }}>
              <span className={`chip ${reserveMet ? "chip-ok" : "chip-warn"}`} style={{ height: 24, fontSize: 11.5 }}>
                {reserveMet ? "Réserve atteinte" : "Réserve non atteinte"}
              </span>
            </div>
          )}
        </div>
      </Link>
    </Tilt>
  );
}

export function CardSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ aspectRatio: "1/1.32" }} />
    </div>
  );
}
