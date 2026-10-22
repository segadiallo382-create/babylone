// Espace vendeur v3 : modification d'annonce, publication multiple, lives, arrivages, versements, heures d'affluence.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Empty } from "../components/ui";
import { api, post, type Auction, type User } from "../lib/api";
import { fcfa, money, resizeImage } from "../lib/format";
import { useApp } from "../lib/store";
import type { Live } from "./Lives";
import type { Preorder } from "./Arrivages";

// Photo principale + vignette légère pour les listes (économise la data mobile)
export async function photoPair(file: File) {
  const [full, thumb] = await Promise.all([resizeImage(file, 1400, 0.82), resizeImage(file, 520, 0.72)]);
  return { full, thumb };
}

export function HourChart({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  const best = hours.indexOf(max);
  return (
    <div className="card pad">
      <div className="row between wrap">
        <h3>Heures d'affluence</h3>
        {hours.some(Boolean) && <span className="chip chip-ok">Meilleure heure de clôture : {best} h – {best + 1} h</span>}
      </div>
      <div className="hours">
        {hours.map((v, h) => (
          <motion.i
            key={h}
            title={`${h} h : ${v} offres`}
            initial={{ height: 0 }}
            animate={{ height: `${8 + (v / max) * 92}%` }}
            transition={{ delay: h * 0.02, duration: 0.6 }}
            className={h === best && v ? "best" : ""}
          />
        ))}
      </div>
      <div className="row between muted" style={{ fontSize: 11 }}>
        <span>0 h</span>
        <span>6 h</span>
        <span>12 h</span>
        <span>18 h</span>
        <span>23 h</span>
      </div>
    </div>
  );
}

export function EditModal({ a, onClose, onSaved }: { a: Auction; onClose: () => void; onSaved: () => void }) {
  const { meta, toast } = useApp();
  const locked = a.bids_count > 0;
  const [f, setF] = useState({
    title: a.title,
    description: a.description,
    category: a.category,
    condition: a.condition,
    size: a.size || "",
    start_price: String(a.start_price),
    reserve_price: String(a.reserve_price || ""),
    buy_now_price: String(a.buy_now_price || ""),
  });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const n = (s: string) => Number(s.replace(/\D/g, "")) || 0;
  async function save() {
    setErr("");
    try {
      await post(
        `/auctions/${a.id}/edit`,
        locked
          ? { description: f.description }
          : { ...f, start_price: n(f.start_price), reserve_price: n(f.reserve_price), buy_now_price: n(f.buy_now_price) },
      );
      toast("Vente mise à jour", undefined, "ok");
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    }
  }
  return (
    <motion.div className="modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="card modal glass" onClick={(e) => e.stopPropagation()} initial={{ rotateX: 30, y: 40, opacity: 0 }} animate={{ rotateX: 0, y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
        <h2 className="display" style={{ fontSize: 30, marginBottom: 6 }}>
          Modifier la vente
        </h2>
        {locked && <p className="chip chip-warn" style={{ marginBottom: 12 }}>Des offres existent : seule la description est modifiable.</p>}
        <div className="form-grid">
          <label className="field">
            <span>Titre</span>
            <input className="input" value={f.title} onChange={set("title")} disabled={locked} />
          </label>
          <div className="form-2">
            <label className="field">
              <span>Catégorie</span>
              <select className="select" value={f.category} onChange={set("category")} disabled={locked}>
                {meta?.categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Taille</span>
              <select className="select" value={f.size} onChange={set("size")} disabled={locked}>
                <option value="">—</option>
                {meta?.sizes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Description</span>
            <textarea className="textarea" value={f.description} onChange={set("description")} />
          </label>
          {!locked && (
            <div className="form-2">
              <label className="field">
                <span>Départ</span>
                <input className="input num" value={f.start_price} onChange={set("start_price")} />
              </label>
              <label className="field">
                <span>Réserve</span>
                <input className="input num" value={f.reserve_price} onChange={set("reserve_price")} />
              </label>
            </div>
          )}
          {!locked && a.mode === "lot" && (
            <label className="field">
              <span>Achat immédiat</span>
              <input className="input num" value={f.buy_now_price} onChange={set("buy_now_price")} />
            </label>
          )}
          {err && <p className="err">{err}</p>}
          <div className="row" style={{ justifyContent: "end" }}>
            <button className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button className="btn btn-red" onClick={save}>
              Enregistrer
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

type Row = { full: string; thumb: string; title: string; category: string; start: string; size: string; status?: string };

// Une photo = une annonce : idéal pour vider un arrivage de 30 articles en 5 minutes
export function BulkPublish({ onDone }: { onDone: () => void }) {
  const { meta, user, toast } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [common, setCommon] = useState({ condition: "neuf", duration_hours: "48", city: user?.city || "Thiès" });
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function add(files: FileList | null) {
    if (!files) return;
    const list = await Promise.all([...files].slice(0, 30).map(photoPair));
    setRows((r) => [...r, ...list.map((p) => ({ ...p, title: "", category: "", start: "", size: "" }))].slice(0, 30));
  }
  const upd = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  async function suggest(i: number) {
    const r = rows[i];
    if (r.title.length < 3) return;
    const s = await api("/suggest", { body: { title: r.title } });
    setRows((x) => x.map((y, j) => (j === i ? { ...y, category: y.category || s.category || "", start: y.start || (s.start_hint ? String(s.start_hint) : "") } : y)));
  }
  async function publishAll() {
    setBusy(true);
    let ok = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.status === "ok") continue;
      try {
        await post("/auctions", {
          title: r.title,
          category: r.category,
          condition: common.condition,
          city: common.city,
          size: r.size || undefined,
          start_price: Number(r.start.replace(/\D/g, "")),
          duration_hours: Number(common.duration_hours),
          images: [r.full],
          thumbs: [r.thumb],
        });
        ok++;
        upd(i, "status", "ok");
      } catch (e: any) {
        upd(i, "status", e.message);
      }
    }
    setBusy(false);
    toast(`${ok} vente${ok > 1 ? "s" : ""} publiée${ok > 1 ? "s" : ""}`, ok < rows.length ? "Certaines lignes ont une erreur, corrige-les puis relance." : undefined, "ok");
    if (ok === rows.length) onDone();
  }
  return (
    <div className="stack">
      <div className="card pad">
        <h2 className="display" style={{ fontSize: 30 }}>
          Publication multiple
        </h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          Ajoute jusqu'à 30 photos : chaque photo devient une vente. Tape le titre, Babylone propose la catégorie et un prix de départ.
        </p>
        <div className="form-2" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <select className="select" value={common.condition} onChange={(e) => setCommon({ ...common, condition: e.target.value })}>
            {meta?.conditions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="select" value={common.duration_hours} onChange={(e) => setCommon({ ...common, duration_hours: e.target.value })}>
            {[["24", "1 jour"], ["48", "2 jours"], ["72", "3 jours"], ["168", "7 jours"]].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select className="select" value={common.city} onChange={(e) => setCommon({ ...common, city: e.target.value })}>
            {meta?.cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="drop-zone" style={{ marginTop: 14 }} onClick={() => input.current?.click()}>
          <b>+ Ajouter des photos</b>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
        </div>
      </div>
      {rows.map((r, i) => (
        <motion.div key={i} className="card bulk-row" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <img src={r.thumb} alt="" />
          <input className="input" placeholder="Titre" value={r.title} onChange={(e) => upd(i, "title", e.target.value)} onBlur={() => suggest(i)} />
          <select className="select" value={r.category} onChange={(e) => upd(i, "category", e.target.value)}>
            <option value="">Catégorie</option>
            {meta?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="select" value={r.size} onChange={(e) => upd(i, "size", e.target.value)}>
            <option value="">Taille</option>
            {meta?.sizes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input className="input num" placeholder="Départ F" value={r.start} onChange={(e) => upd(i, "start", e.target.value)} />
          <span className={`chip ${r.status === "ok" ? "chip-ok" : r.status ? "chip-red" : ""}`} title={r.status}>
            {r.status === "ok" ? "Publiée" : r.status ? "Erreur" : "Prête"}
          </span>
          <button className="icon-btn" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Retirer">
            ×
          </button>
        </motion.div>
      ))}
      {rows.length > 0 && (
        <button className="btn btn-red btn-lg" onClick={publishAll} disabled={busy}>
          {busy ? "Publication…" : `Publier ${rows.length} vente${rows.length > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}

export function SellerLives({ auctions }: { auctions: Auction[] }) {
  const { user, toast } = useApp();
  const [lives, setLives] = useState<Live[]>([]);
  const [f, setF] = useState({ title: "", stream_url: "", starts_at: "" });
  const [pick, setPick] = useState<number[]>([]);
  const load = () => api("/lives").then((r) => setLives(r.items.filter((l: Live) => l.seller.id === user?.id)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const live = auctions.filter((a) => a.status === "live" && a.moderation === "approved");
  async function create() {
    try {
      await post("/lives", { ...f, starts_at: f.starts_at || undefined, auction_ids: pick });
      toast("Live programmé", "Tes abonnés seront prévenus au démarrage.", "ok");
      setF({ title: "", stream_url: "", starts_at: "" });
      setPick([]);
      load();
    } catch (e: any) {
      toast(e.message);
    }
  }
  return (
    <div className="stack">
      <div className="card pad form-grid">
        <h2 className="display" style={{ fontSize: 30 }}>
          Lancer un live
        </h2>
        <p className="muted" style={{ fontSize: 14 }}>
          Présente tes lots en direct. Filme sur YouTube ou Facebook Live (la vidéo s'affiche dans Babylone) ou sur TikTok (un bouton y renvoie). Sans vidéo, Babylone affiche une
          scène 3D avec le lot en cours.
        </p>
        <input className="input" placeholder="Titre du live (ex. Déballage sneakers du vendredi)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="form-2">
          <input className="input" placeholder="Lien de la vidéo (optionnel)" value={f.stream_url} onChange={(e) => setF({ ...f, stream_url: e.target.value })} />
          <input className="input" type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} />
        </div>
        <span className="eyebrow">Lots présentés ({pick.length})</span>
        <div className="pick-grid">
          {live.map((a) => (
            <button key={a.id} className={pick.includes(a.id) ? "on" : ""} onClick={() => setPick(pick.includes(a.id) ? pick.filter((x) => x !== a.id) : [...pick, a.id])}>
              <img src={a.thumbs?.[0] || a.images[0]} alt="" />
              <span>{a.title}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-red" onClick={create} disabled={!pick.length || f.title.length < 4}>
          Programmer le live
        </button>
      </div>
      {lives.map((l) => (
        <Link key={l.id} to={`/live/${l.id}`} className="card pad row between wrap">
          <span>
            <b>{l.title}</b>
            <div className="muted" style={{ fontSize: 13 }}>
              {l.lots.length} lots · {new Date(l.starts_at).toLocaleString("fr-FR")}
            </div>
          </span>
          <span className={`chip ${l.status === "live" ? "chip-red" : ""}`}>{l.status === "live" ? "En direct · ouvrir la régie" : l.status === "scheduled" ? "Programmé" : "Terminé"}</span>
        </Link>
      ))}
    </div>
  );
}

export function SellerPreorders() {
  const { user, meta, toast } = useApp();
  const [items, setItems] = useState<Preorder[]>([]);
  const [open, setOpen] = useState(false);
  const day = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ title: "", description: "", category: "", unit_price: "", total_units: "", min_units: "", deposit_pct: "20", deadline: day(5), eta: day(15) });
  const [img, setImg] = useState<string>("");
  const input = useRef<HTMLInputElement>(null);
  const load = () => api("/preorders").then((r) => setItems(r.items.filter((p: Preorder) => p.seller.id === user?.id)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function create() {
    try {
      await post("/preorders", { ...f, images: img ? [img] : [] });
      toast("Arrivage publié", "Tes abonnés sont prévenus.", "ok");
      setOpen(false);
      load();
    } catch (e: any) {
      toast(e.message);
    }
  }
  return (
    <div className="stack">
      <div className="card pad row between wrap">
        <span>
          <h2 className="display" style={{ fontSize: 30 }}>Arrivages en précommande</h2>
          <p className="muted" style={{ fontSize: 14 }}>Vends ton conteneur avant qu'il arrive : les acheteurs réservent avec un acompte.</p>
        </span>
        <button className="btn btn-red" onClick={() => setOpen(!open)} disabled={!user?.verified}>
          {user?.verified ? "+ Nouvel arrivage" : "Réservé aux vendeurs vérifiés"}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="card pad form-grid" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <input className="input" placeholder="Titre (ex. Conteneur Chine : 300 paires de baskets)" value={f.title} onChange={set("title")} />
            <textarea className="textarea" placeholder="Contenu, tailles, provenance…" value={f.description} onChange={set("description")} />
            <div className="form-2">
              <select className="select" value={f.category} onChange={set("category")}>
                <option value="">Catégorie</option>
                {meta?.categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input className="input num" placeholder="Prix unitaire F" value={f.unit_price} onChange={set("unit_price")} />
            </div>
            <div className="form-2" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <input className="input num" placeholder="Quantité totale" value={f.total_units} onChange={set("total_units")} />
              <input className="input num" placeholder="Minimum pour lancer" value={f.min_units} onChange={set("min_units")} />
              <select className="select" value={f.deposit_pct} onChange={set("deposit_pct")}>
                {[10, 20, 30, 50].map((p) => (
                  <option key={p} value={p}>
                    Acompte {p} %
                  </option>
                ))}
              </select>
            </div>
            <div className="form-2">
              <label className="field">
                <span>Fin des réservations</span>
                <input className="input" type="date" value={f.deadline} onChange={set("deadline")} />
              </label>
              <label className="field">
                <span>Arrivée prévue</span>
                <input className="input" type="date" value={f.eta} onChange={set("eta")} />
              </label>
            </div>
            <div className="drop-zone" onClick={() => input.current?.click()}>
              {img ? <img src={img} alt="" style={{ maxHeight: 140, margin: "0 auto", borderRadius: 12 }} /> : <b>+ Photo (échantillon, catalogue du fournisseur)</b>}
              <input
                ref={input}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => e.target.files?.[0] && setImg(await resizeImage(e.target.files[0]))}
              />
            </div>
            <button className="btn btn-red" onClick={create}>
              Publier l'arrivage
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {items.length === 0 && !open && <Empty title="Aucun arrivage en cours." />}
      {items.map((p) => (
        <Link key={p.id} to={`/arrivage/${p.id}`} className="card pad row between wrap" style={{ gap: 12 }}>
          <span className="prod-cell">
            <img src={p.images[0]} alt="" />
            <span>
              <b>{p.title}</b>
              <div className="muted" style={{ fontSize: 13 }}>
                {p.reserved}/{p.total_units} réservées · {fcfa(p.unit_price)} / pièce
              </div>
            </span>
          </span>
          <span className="chip">{p.status}</span>
        </Link>
      ))}
    </div>
  );
}

export function SellerSettings({ payouts }: { payouts: { id: number; kind: string; amount: number; method: string; account: string; status: string; created_at: number }[] }) {
  const { user, setUser, meta, toast } = useApp();
  const [f, setF] = useState({
    shop_name: user?.shop_name || "",
    bio: user?.bio || "",
    city: user?.city || "Thiès",
    payout_method: user?.payout_method || "wave",
    payout_account: user?.payout_account || user?.phone || "",
  });
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function save() {
    try {
      const r = await post("/me/profile", f);
      setUser(r.user as User);
      toast("Profil enregistré", undefined, "ok");
    } catch (e: any) {
      toast(e.message);
    }
  }
  const ST: Record<string, string> = { sent: "Envoyé", simulated: "Envoyé (démo)", pending: "En cours", failed: "Échec", missing_account: "Numéro manquant" };
  return (
    <div className="stack">
      <div className="card pad form-grid">
        <h2 className="display" style={{ fontSize: 30 }}>
          Versements & boutique
        </h2>
        <div className="form-2">
          <label className="field">
            <span>Recevoir mes ventes sur</span>
            <select className="select" value={f.payout_method} onChange={set("payout_method")}>
              <option value="wave">Wave</option>
              <option value="orange_money">Orange Money</option>
            </select>
          </label>
          <label className="field">
            <span>Numéro</span>
            <input className="input num" value={f.payout_account} onChange={set("payout_account")} />
          </label>
        </div>
        <label className="field">
          <span>Nom de la boutique</span>
          <input className="input" value={f.shop_name} onChange={set("shop_name")} />
        </label>
        <label className="field">
          <span>Présentation (visible sur ta boutique)</span>
          <textarea className="textarea" value={f.bio} onChange={set("bio")} placeholder="Ce que tu importes, d'où, depuis quand…" />
        </label>
        <label className="field">
          <span>Ville</span>
          <select className="select" value={f.city} onChange={set("city")}>
            {meta?.cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="row">
          <button className="btn btn-red" onClick={save}>
            Enregistrer
          </button>
          {user && (
            <Link to={`/boutique/${user.id}`} className="btn btn-ghost">
              Voir ma boutique
            </Link>
          )}
        </div>
      </div>
      <div className="card pad">
        <h3 style={{ marginBottom: 10 }}>Derniers versements</h3>
        {payouts.length === 0 && <p className="muted">Aucun versement pour l'instant.</p>}
        {payouts.map((p) => (
          <div key={p.id} className="row between" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <span className="num">
              {money(p.amount)} F {(p as any).order_id ? `· commande #${(p as any).order_id}` : ""}
            </span>
            <span className={`chip ${["sent", "simulated"].includes(p.status) ? "chip-ok" : p.status === "failed" ? "chip-red" : "chip-warn"}`}>{ST[p.status] || p.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
