import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { IMegaphone, IPin } from "../components/Icons";
import { Empty, Reveal, SplitTitle } from "../components/ui";
import { api, post } from "../lib/api";
import { ago, money } from "../lib/format";
import { useApp } from "../lib/store";

type Req = { id: number; title: string; category: string; budget_max: number | null; city: string; details: string; votes: number; voted: boolean; name: string; created_at: number };

export default function Requests() {
  const { user, meta, toast } = useApp();
  const nav = useNavigate();
  const [items, setItems] = useState<Req[] | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", category: "", budget_max: "", details: "" });
  const [err, setErr] = useState("");

  const load = () => api("/requests").then((r) => setItems(r.items));
  useEffect(() => {
    load();
  }, []);

  async function vote(r: Req) {
    if (!user) return nav("/connexion?suite=/demandes");
    if (r.voted) return;
    const res = await post(`/requests/${r.id}/vote`);
    setItems((l) => l!.map((x) => (x.id === r.id ? { ...x, voted: true, votes: res.votes } : x)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await post("/requests", { ...f, budget_max: f.budget_max ? Number(f.budget_max.replace(/\D/g, "")) : null });
      setOpen(false);
      setF({ title: "", category: "", budget_max: "", details: "" });
      toast("Demande publiée", "Les importateurs sont prévenus. Tu recevras une alerte dès qu'un produit correspond.", "ok");
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="row between wrap" style={{ alignItems: "end", gap: 20 }}>
          <div>
            <div className="eyebrow">Espace demande</div>
            <h1 className="display page-title">
              <SplitTitle text="Ce que les acheteurs cherchent" />
            </h1>
            <p className="muted" style={{ maxWidth: 560 }}>
              Ajoute ton « moi aussi » aux demandes qui te concernent. Plus une demande est soutenue, plus les importateurs la voient.
            </p>
          </div>
          <button className="btn btn-red btn-lg" onClick={() => (user ? setOpen(true) : nav("/connexion?suite=/demandes"))}>
            <IMegaphone size={18} /> Publier une demande
          </button>
        </div>

        <div className="grid-cards" style={{ marginTop: 36, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {items?.length === 0 && <Empty title="Aucune demande pour l'instant." />}
          {items?.map((r, i) => (
            <Reveal key={r.id} i={i % 3}>
              <motion.div className="card req-card" whileHover={{ y: -6, rotateX: 4 }} style={{ transformPerspective: 900, height: "100%" }}>
                <div className="row between">
                  <span className="chip">{r.category}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {ago(r.created_at)}
                  </span>
                </div>
                <h3>{r.title}</h3>
                {r.details && <p className="muted" style={{ fontSize: 14 }}>{r.details}</p>}
                <div className="row wrap muted" style={{ fontSize: 13, gap: 12, marginTop: "auto" }}>
                  <span className="row" style={{ gap: 4 }}>
                    <IPin size={13} /> {r.city}
                  </span>
                  {r.budget_max && <span className="num">Budget max {money(r.budget_max)} F</span>}
                  <span>par {r.name}</span>
                </div>
                <motion.button className={`vote ${r.voted ? "on" : ""}`} onClick={() => vote(r)} whileTap={{ scale: 0.9 }} style={{ alignSelf: "start" }}>
                  <motion.span key={r.votes} initial={{ rotateX: -90 }} animate={{ rotateX: 0 }} className="num">
                    +{r.votes}
                  </motion.span>
                  {r.voted ? "Tu soutiens" : "Moi aussi"}
                </motion.button>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div className="modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.form
              className="card modal glass"
              onClick={(e) => e.stopPropagation()}
              onSubmit={submit}
              initial={{ rotateX: 30, y: 40, opacity: 0 }}
              animate={{ rotateX: 0, y: 0, opacity: 1 }}
              exit={{ rotateX: 20, y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
            >
              <h2 className="display" style={{ fontSize: 34, marginBottom: 20 }}>
                Je cherche…
              </h2>
              <div className="form-grid">
                <label className="field">
                  <span>Produit recherché</span>
                  <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex. Réfrigérateur 2 portes" required />
                </label>
                <div className="form-2">
                  <label className="field">
                    <span>Catégorie</span>
                    <select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} required>
                      <option value="">Choisir</option>
                      {meta?.categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Budget max (FCFA)</span>
                    <input className="input" inputMode="numeric" value={f.budget_max} onChange={(e) => setF({ ...f, budget_max: e.target.value })} placeholder="Optionnel" />
                  </label>
                </div>
                <label className="field">
                  <span>Précisions</span>
                  <textarea className="textarea" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} placeholder="Taille, couleur, état, quantité…" />
                </label>
                {err && <p className="err">{err}</p>}
                <div className="row" style={{ justifyContent: "end" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                    Annuler
                  </button>
                  <button className="btn btn-red">Publier</button>
                </div>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
