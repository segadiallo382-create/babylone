import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { IShield } from "../components/Icons";
import { Logo } from "../components/ui";
import { api, post, type Order } from "../lib/api";
import { fcfa } from "../lib/format";

// Page de paiement simulée (mode démo uniquement). En production, l'acheteur est redirigé vers Wave.
export default function Checkout() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [o, setO] = useState<Order | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const via = sp.get("via") === "orange_money" ? "Orange Money" : "Wave";

  useEffect(() => {
    api(`/orders/${id}`).then((r) => setO(r.order));
  }, [id]);

  async function pay() {
    setState("busy");
    await new Promise((r) => setTimeout(r, 1400));
    await post(`/orders/${id}/demo-confirm`);
    setState("done");
    setTimeout(() => nav(`/compte/commandes/${id}?paiement=ok`), 1300);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, perspective: 1400 }}>
      <motion.div
        className="card"
        style={{ width: "100%", maxWidth: 440, padding: 32, textAlign: "center" }}
        initial={{ rotateX: 40, y: 60, opacity: 0 }}
        animate={{ rotateX: 0, y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <Logo size={28} />
        <span className="chip chip-warn" style={{ margin: "18px auto 0" }}>
          Simulation : aucun débit réel
        </span>
        <motion.div
          style={{
            margin: "28px auto",
            width: 260,
            height: 160,
            borderRadius: 22,
            background: "linear-gradient(135deg,#e3262f,#5c0a0f)",
            boxShadow: "0 30px 60px -20px rgba(227,38,47,.6)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 20,
            textAlign: "left",
            transformStyle: "preserve-3d",
          }}
          animate={state === "busy" ? { rotateY: [0, 360] } : state === "done" ? { rotateY: 0, scale: 1.05 } : { rotateY: [-14, 14] }}
          transition={state === "busy" ? { duration: 1.2, repeat: Infinity, ease: "linear" } : { duration: 3, repeat: state === "idle" ? Infinity : 0, repeatType: "mirror" }}
        >
          <span style={{ fontWeight: 700, opacity: 0.9 }}>{via}</span>
          <span className="display num" style={{ fontSize: 30 }}>
            {o ? fcfa(o.total) : "…"}
          </span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Commande #{id} · Babylone</span>
        </motion.div>
        {state === "done" ? (
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <div className="display" style={{ fontSize: 30, color: "var(--ok)" }}>
              Paiement validé
            </div>
            <p className="muted">Redirection vers ta commande…</p>
          </motion.div>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
              {o?.auction.title}
            </p>
            <button className="btn btn-red btn-lg btn-block" onClick={pay} disabled={state === "busy" || !o}>
              {state === "busy" ? "Traitement…" : `Confirmer le paiement ${via}`}
            </button>
            <Link to={`/compte/commandes/${id}`} className="btn btn-ghost btn-block" style={{ marginTop: 10 }}>
              Annuler
            </Link>
          </>
        )}
        <p className="muted row" style={{ justifyContent: "center", fontSize: 12.5, marginTop: 18 }}>
          <IShield size={14} /> Fonds bloqués jusqu'à la confirmation de livraison
        </p>
      </motion.div>
    </div>
  );
}
