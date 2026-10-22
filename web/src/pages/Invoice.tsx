import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Logo } from "../components/ui";
import { api } from "../lib/api";
import { fcfa } from "../lib/format";

// Facture imprimable (Imprimer → Enregistrer en PDF)
export default function Invoice() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api(`/orders/${id}/invoice`)
      .then(setD)
      .catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <div className="page container"><p className="err">{err}</p></div>;
  if (!d) return <div className="page container"><div className="skeleton" style={{ height: 500 }} /></div>;
  const o = d.order;
  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 820 }}>
        <div className="row between no-print" style={{ marginBottom: 16 }}>
          <Link to={`/compte/commandes/${o.id}`} className="muted">← Commande</Link>
          <button className="btn btn-red btn-sm" onClick={() => window.print()}>
            Imprimer / PDF
          </button>
        </div>
        <div className="invoice">
          <div className="row between wrap" style={{ alignItems: "start" }}>
            <div className="inv-logo">
              <Logo size={30} />
            </div>
            <div style={{ textAlign: "right" }}>
              <h1>Facture</h1>
              <div className="num">{d.number}</div>
              <div>{new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>
            </div>
          </div>
          <div className="inv-parties">
            <div>
              <small>Vendeur</small>
              <b>{d.seller.name}</b>
              <div>{d.seller.city}</div>
              <div className="num">{d.seller.phone}</div>
            </div>
            <div>
              <small>Acheteur</small>
              <b>{d.buyer.name}</b>
              <div>{d.buyer.city}</div>
              <div className="num">{d.buyer.phone}</div>
              <div>{o.delivery_mode === "relay" ? `Retrait : ${d.relay?.name || o.address}` : o.address}</div>
            </div>
          </div>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Qté</th>
                <th style={{ textAlign: "right" }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{d.item.title} (vente aux enchères n° {o.id})</td>
                <td className="num">{d.item.quantity}</td>
                <td className="num" style={{ textAlign: "right" }}>{fcfa(o.amount)}</td>
              </tr>
              <tr>
                <td>{o.delivery_mode === "relay" ? "Retrait en point relais" : "Livraison"}</td>
                <td>1</td>
                <td className="num" style={{ textAlign: "right" }}>{fcfa(o.delivery_fee)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total payé ({o.provider === "orange_money" ? "Orange Money" : o.provider === "paydunya" ? "PayDunya" : "Wave"})</td>
                <td className="num" style={{ textAlign: "right" }}>{fcfa(o.total)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="inv-foot">
            Vente réalisée par l'intermédiaire de la plateforme Babylone. {d.platform}. TVA : [À COMPLÉTER selon le régime fiscal du vendeur].
          </p>
        </div>
      </div>
    </div>
  );
}
