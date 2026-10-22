// Compte acheteur v3 : fidélité, abonnements & alertes, réglages complets.
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Tilt } from "../components/ui";
import { api, del, download, post, type User } from "../lib/api";
import { fcfa, money } from "../lib/format";
import { setLang, useLang } from "../lib/i18n";
import { completePayment } from "../lib/pay";
import { liteMode, setLiteMode } from "../lib/perf";
import { disablePush, enablePush, pushEnabled, pushSupported } from "../lib/push";
import { useApp } from "../lib/store";

type Loy = { points: number; level: string; next: { name: string; at: number } | null; levels: { at: number; name: string }[]; reliability: { paid: number; unpaid: number; score: number | null } };

const LEVEL_COLORS: Record<string, string> = { Bronze: "#c8834a", Argent: "#cfd3d8", Or: "#f2c94c", Platine: "#e8f1ff" };

export function Loyalty() {
  const [d, setD] = useState<Loy | null>(null);
  useEffect(() => {
    api("/me/loyalty").then(setD);
  }, []);
  if (!d) return <div className="skeleton" style={{ height: 260 }} />;
  const prev = [...d.levels].reverse().find((l) => d.points >= l.at)?.at || 0;
  const pct = d.next ? ((d.points - prev) / (d.next.at - prev)) * 100 : 100;
  return (
    <div className="stack">
      <Tilt max={10}>
        <div className="card loyalty-card" style={{ ["--lv" as any]: LEVEL_COLORS[d.level] }}>
          <motion.div className="medal" initial={{ rotateY: 0 }} animate={{ rotateY: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }}>
            <span>{d.level[0]}</span>
          </motion.div>
          <div style={{ flex: 1 }}>
            <div className="eyebrow">Niveau</div>
            <div className="display" style={{ fontSize: 48 }}>{d.level}</div>
            <div className="num" style={{ fontSize: 18 }}>{money(d.points)} points</div>
            <div className="pre-bar" style={{ marginTop: 14 }}>
              <motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1.2 }} />
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              {d.next ? `Encore ${money(d.next.at - d.points)} points pour le niveau ${d.next.name}.` : "Niveau maximum atteint."}
            </p>
          </div>
        </div>
      </Tilt>
      <div className="card pad">
        <h3>Comment gagner des points</h3>
        <ul className="muted" style={{ paddingLeft: 18, marginTop: 8, display: "grid", gap: 6 }}>
          <li>1 point pour chaque 1 000 F payés.</li>
          <li>500 points quand un filleul fait son premier achat.</li>
          <li>Les niveaux Or et Platine donnent un accès anticipé aux ventes flash.</li>
        </ul>
      </div>
      <div className="card pad row between wrap">
        <span>
          <b>Ta fiabilité d'acheteur</b>
          <p className="muted" style={{ fontSize: 13 }}>Visible par les vendeurs : ventes gagnées réellement payées.</p>
        </span>
        <span className={`chip ${d.reliability.score == null || d.reliability.score >= 90 ? "chip-ok" : "chip-warn"}`}>
          {d.reliability.score == null ? "Nouveau" : `${d.reliability.score} %`} · {d.reliability.paid} payée(s)
        </span>
      </div>
    </div>
  );
}

export function Following() {
  const [shops, setShops] = useState<{ id: number; name: string; city: string; verified: number }[] | null>(null);
  const [searches, setSearches] = useState<{ id: number; q: string; category: string | null; size: string | null; city: string | null; max_price: number | null }[]>([]);
  const load = () => {
    api("/me/following").then((r) => setShops(r.items));
    api("/me/searches").then((r) => setSearches(r.items));
  };
  useEffect(load, []);
  return (
    <div className="stack">
      <div className="card pad">
        <h3 style={{ marginBottom: 10 }}>Boutiques suivies</h3>
        {shops?.length === 0 && <p className="muted">Suis une boutique pour être prévenu de ses arrivages et de ses lives.</p>}
        <div className="row wrap" style={{ gap: 8 }}>
          {shops?.map((s) => (
            <Link key={s.id} to={`/boutique/${s.id}`} className="chip">
              {s.verified ? "✓ " : ""}
              {s.name} · {s.city}
            </Link>
          ))}
        </div>
      </div>
      <div className="card pad">
        <h3 style={{ marginBottom: 10 }}>Mes alertes</h3>
        {searches.length === 0 && (
          <p className="muted">
            Aucune alerte. Fais une recherche dans <Link to="/encheres" className="red">Enchères</Link> puis « Créer une alerte ».
          </p>
        )}
        {searches.map((s) => (
          <div key={s.id} className="row between" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <span className="row wrap" style={{ gap: 6 }}>
              {s.q && <span className="chip">« {s.q} »</span>}
              {s.category && <span className="chip">{s.category}</span>}
              {s.size && <span className="chip">Taille {s.size}</span>}
              {s.city && <span className="chip">{s.city}</span>}
              {s.max_price && <span className="chip num">≤ {money(s.max_price)} F</span>}
            </span>
            <button className="chip" onClick={() => del(`/me/searches/${s.id}`).then(load)}>
              Supprimer
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={`switch ${on ? "on" : ""}`} onClick={onClick} aria-pressed={on}>
      <i />
    </button>
  );
}

export function SettingsPlus() {
  const { user, setUser, meta, toast, logout } = useApp();
  const nav = useNavigate();
  const lang = useLang();
  const [push, setPush] = useState(false);
  const [p, setP] = useState({ name: user?.name || "", city: user?.city || "Thiès", payout_method: user?.payout_method || "wave", payout_account: user?.payout_account || user?.phone || "" });
  const [pw, setPw] = useState({ old: "", password: "" });
  const [delPw, setDelPw] = useState("");
  useEffect(() => {
    pushEnabled().then(setPush);
  }, []);
  if (!user) return null;
  const saveProfile = async () => {
    try {
      const r = await post("/me/profile", { ...p, lang });
      setUser(r.user as User);
      toast("Profil enregistré", undefined, "ok");
    } catch (e: any) {
      toast(e.message);
    }
  };
  const refresh = async () => setUser((await api("/me")).user);
  return (
    <div className="stack">
      <div className="card" style={{ padding: 8 }}>
        <div className="row between notif" style={{ alignItems: "center" }}>
          <span>
            <b>Alertes WhatsApp</b>
            <p>Offre dépassée, vente gagnée, rappel de paiement, colis expédié. Réponds OUI pour relancer depuis WhatsApp.</p>
          </span>
          <Toggle
            on={user.whatsapp}
            onClick={async () => {
              const r = await post("/me/settings", { whatsapp: !user.whatsapp });
              setUser(r.user);
            }}
          />
        </div>
        {pushSupported() && (
          <div className="row between notif" style={{ alignItems: "center" }}>
            <span>
              <b>Notifications sur ce téléphone</b>
              <p>Même quand Babylone est fermé : « Dernière heure », « Tu as été dépassé »…</p>
            </span>
            <Toggle
              on={push}
              onClick={async () => {
                try {
                  if (push) await disablePush();
                  else await enablePush();
                  setPush(!push);
                } catch (e: any) {
                  toast(e.message);
                }
              }}
            />
          </div>
        )}
        <div className="row between notif" style={{ alignItems: "center" }}>
          <span>
            <b>Wolof</b>
            <p>Navigation et boutons principaux en wolof.</p>
          </span>
          <Toggle on={lang === "wo"} onClick={() => setLang(lang === "wo" ? "fr" : "wo")} />
        </div>
        <div className="row between notif" style={{ alignItems: "center" }}>
          <span>
            <b>Mode allégé</b>
            <p>Coupe les animations 3D. Utile sur les petits téléphones ou avec peu de connexion.</p>
          </span>
          <Toggle on={liteMode()} onClick={() => setLiteMode(!liteMode())} />
        </div>
      </div>

      <div className="card pad">
        <div className="row between wrap">
          <span>
            <h3>Caution d'enchère</h3>
            <p className="muted" style={{ fontSize: 13.5 }}>
              Exigée pour enchérir à partir de {fcfa(meta?.deposit_threshold || 100000)}. Rendue sur demande, perdue seulement si tu gagnes sans payer.
            </p>
          </span>
          {user.deposit ? (
            <span className="row">
              <span className="chip chip-ok">{fcfa(user.deposit)} versés</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    await post("/me/deposit/refund");
                    toast("Remboursement lancé", "La caution revient sur ton compte Wave ou Orange Money.", "ok");
                    refresh();
                  } catch (e: any) {
                    toast(e.message);
                  }
                }}
              >
                Récupérer
              </button>
            </span>
          ) : (
            <button
              className="btn btn-red btn-sm"
              onClick={async () => {
                try {
                  if (await completePayment(await post("/me/deposit"))) {
                    toast("Caution versée", undefined, "ok");
                    refresh();
                  }
                } catch (e: any) {
                  toast(e.message);
                }
              }}
            >
              Verser {fcfa(meta?.deposit_amount || 5000)}
            </button>
          )}
        </div>
      </div>

      <div className="card pad form-grid">
        <h3>Profil</h3>
        <div className="form-2">
          <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          <select className="select" value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })}>
            {meta?.cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <span className="eyebrow">Remboursements et cautions reversés sur</span>
        <div className="form-2">
          <select className="select" value={p.payout_method} onChange={(e) => setP({ ...p, payout_method: e.target.value as any })}>
            <option value="wave">Wave</option>
            <option value="orange_money">Orange Money</option>
          </select>
          <input className="input num" value={p.payout_account} onChange={(e) => setP({ ...p, payout_account: e.target.value })} />
        </div>
        <button className="btn btn-red" onClick={saveProfile} style={{ justifySelf: "start" }}>
          Enregistrer
        </button>
      </div>

      <div className="card pad form-grid">
        <h3>Mot de passe</h3>
        <div className="form-2">
          <input className="input" type="password" placeholder="Actuel" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} autoComplete="current-password" />
          <input className="input" type="password" placeholder="Nouveau (6 caractères min.)" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" />
        </div>
        <button
          className="btn btn-ghost"
          style={{ justifySelf: "start" }}
          onClick={async () => {
            try {
              await post("/me/password", pw);
              setPw({ old: "", password: "" });
              toast("Mot de passe changé", undefined, "ok");
            } catch (e: any) {
              toast(e.message);
            }
          }}
        >
          Changer
        </button>
      </div>

      <div className="card pad">
        <h3>Mes données</h3>
        <p className="muted" style={{ fontSize: 13.5, margin: "6px 0 12px" }}>
          Conformément à la loi n° 2008-12, tu peux télécharger tes données ou supprimer ton compte.
        </p>
        <div className="row wrap">
          <button className="btn btn-ghost btn-sm" onClick={() => download("/me/export", "babylone-mes-donnees.json").catch((e) => toast(e.message))}>
            Télécharger mes données
          </button>
        </div>
        <div className="divider" />
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input" type="password" placeholder="Mot de passe pour confirmer" value={delPw} onChange={(e) => setDelPw(e.target.value)} style={{ maxWidth: 280 }} />
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--red-ink)" }}
            onClick={async () => {
              if (!confirm("Supprimer définitivement ton compte ? Cette action est irréversible.")) return;
              try {
                await post("/me/delete", { password: delPw });
                logout();
                toast("Compte supprimé", "Tes données personnelles ont été effacées.", "ok");
                nav("/");
              } catch (e: any) {
                toast(e.message);
              }
            }}
          >
            Supprimer mon compte
          </button>
        </div>
      </div>
    </div>
  );
}
