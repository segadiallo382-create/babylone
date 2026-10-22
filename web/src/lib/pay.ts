import { post } from "./api";
import { fcfa } from "./format";

// Suite d'un paiement hors commande (caution, acompte, solde) :
// redirection vers le prestataire en production, confirmation simulée en démo.
export async function completePayment(r: { payment_id: number; redirect: string | null; demo: boolean; amount: number }) {
  if (r.redirect) {
    window.location.href = r.redirect;
    return false;
  }
  if (!confirm(`Démo : simuler le paiement de ${fcfa(r.amount)} ? Aucun débit réel.`)) return false;
  await post(`/payments/${r.payment_id}/demo-confirm`);
  return true;
}
