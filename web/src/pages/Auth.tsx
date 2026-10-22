import { motion } from "framer-motion";
import { lazy, Suspense, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { post } from "../lib/api";
import { useApp } from "../lib/store";

const HeroScene = lazy(() => import("../three/HeroScene").then((m) => ({ default: m.HeroScene })));

// Six cases pour le code SMS, avec collage et retour arrière
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<HTMLInputElement[]>([]);
  return (
    <div className="code-boxes">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => el && (refs.current[i] = el)}
          className="input num"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={6}
          value={value[i] || ""}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "");
            if (d.length > 1) {
              onChange(d.slice(0, 6));
              refs.current[Math.min(5, d.length - 1)]?.focus();
              return;
            }
            const next = (value.slice(0, i) + d + value.slice(i + 1)).slice(0, 6);
            onChange(next);
            if (d && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => e.key === "Backspace" && !value[i] && i > 0 && refs.current[i - 1]?.focus()}
        />
      ))}
    </div>
  );
}

export default function Auth({ mode }: { mode: "login" | "register" | "reset" }) {
  const [sp] = useSearchParams();
  const { login, meta, toast } = useApp();
  const nav = useNavigate();
  const [role, setRole] = useState<"buyer" | "seller">(sp.get("role") === "seller" ? "seller" : "buyer");
  const [f, setF] = useState({ name: "", phone: "", password: "", city: "Thiès", shop_name: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"form" | "code">("form");
  const [code, setCode] = useState("");
  const [accept, setAccept] = useState(false);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function sendCode() {
    const r = await post("/auth/otp", { phone: f.phone, purpose: mode === "reset" ? "reset" : "register" });
    setStep("code");
    setCode("");
    if (r.dev_code) toast("Code SMS (démo)", `En production il arrive par SMS. Code : ${r.dev_code}`);
    else toast("Code envoyé", "Regarde tes SMS.", "ok");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode !== "login" && step === "form") {
        await sendCode();
        return;
      }
      const r =
        mode === "login"
          ? await post("/auth/login", { phone: f.phone, password: f.password })
          : mode === "reset"
            ? await post("/auth/reset", { phone: f.phone, password: f.password, code })
            : await post("/auth/register", { ...f, role, code, accept_terms: accept, ref: sp.get("ref") || undefined });
      login(r.token, r.user);
      toast(mode === "login" ? `Content de te revoir, ${r.user.name.split(" ")[0]}` : mode === "reset" ? "Mot de passe changé" : "Compte créé", undefined, "ok");
      const next = sp.get("suite");
      nav(next || (r.user.role === "seller" ? "/vendeur" : r.user.role === "admin" ? "/admin" : "/encheres"));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-art">
        <Suspense fallback={null}>
          <div style={{ position: "absolute", inset: 0 }}>
            <HeroScene compact />
          </div>
        </Suspense>
        <div className="quote">
          <div className="display" style={{ fontSize: 44 }}>
            La bonne affaire se joue en direct.
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Inscription gratuite pour les acheteurs. Paiement Wave et Orange Money.
          </p>
        </div>
      </div>
      <div className="auth-form">
        <motion.div
          key={mode}
          className="card auth-card"
          initial={{ rotateY: mode === "login" ? -90 : 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <h1 className="display" style={{ fontSize: 40 }}>
            {mode === "login" ? "Connexion" : mode === "reset" ? "Mot de passe oublié" : "Créer un compte"}
          </h1>
          <p className="muted" style={{ margin: "8px 0 26px" }}>
            {step === "code"
              ? `Entre le code à 6 chiffres envoyé par SMS au ${f.phone}.`
              : mode === "login"
                ? "Avec ton numéro de téléphone."
                : mode === "reset"
                  ? "On t'envoie un code par SMS pour choisir un nouveau mot de passe."
                  : "Moins d'une minute. Ton numéro sert d'identifiant."}
          </p>
          {step === "code" ? (
            <form className="form-grid" onSubmit={submit}>
              <CodeInput value={code} onChange={setCode} />
              {err && <p className="err">{err}</p>}
              <button className="btn btn-red btn-lg btn-block" disabled={busy || code.length !== 6}>
                {busy ? "Vérification…" : mode === "reset" ? "Changer mon mot de passe" : "Créer mon compte"}
              </button>
              <div className="row between" style={{ fontSize: 14 }}>
                <button type="button" className="muted" onClick={() => setStep("form")}>
                  ← Modifier
                </button>
                <button type="button" className="red" onClick={() => sendCode().catch((e) => setErr(e.message))}>
                  Renvoyer le code
                </button>
              </div>
            </form>
          ) : (
          <form className="form-grid" onSubmit={submit}>
            {sp.get("ref") && mode === "register" && <span className="chip chip-ok">Invité avec le code {sp.get("ref")}</span>}
            {mode === "register" && (
              <>
                <div className="role-pick">
                  {(
                    [
                      ["buyer", "J'achète", "Enchérir sur les arrivages"],
                      ["seller", "Je vends", "Importateur, j'écoule mes stocks"],
                    ] as const
                  ).map(([r, t, d]) => (
                    <button type="button" key={r} className={role === r ? "on" : ""} onClick={() => setRole(r)}>
                      <b>{t}</b>
                      <span>{d}</span>
                    </button>
                  ))}
                </div>
                <label className="field">
                  <span>Nom complet</span>
                  <input className="input" value={f.name} onChange={set("name")} autoComplete="name" required />
                </label>
                {role === "seller" && (
                  <label className="field">
                    <span>Nom de la boutique</span>
                    <input className="input" value={f.shop_name} onChange={set("shop_name")} placeholder="Ex. Ndiaye Import" />
                  </label>
                )}
              </>
            )}
            <label className="field">
              <span>Téléphone</span>
              <input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="77 123 45 67" required />
            </label>
            {mode === "register" && (
              <label className="field">
                <span>Ville</span>
                <select className="select" value={f.city} onChange={set("city")}>
                  {meta?.cities.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>{mode === "reset" ? "Nouveau mot de passe" : "Mot de passe"}</span>
              <input
                className="input"
                type="password"
                value={f.password}
                onChange={set("password")}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={6}
                required
              />
            </label>
            {mode === "register" && (
              <label className="row" style={{ gap: 10, alignItems: "start", fontSize: 13.5 }}>
                <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} required style={{ marginTop: 3 }} />
                <span className="muted">
                  J'ai 18 ans ou plus et j'accepte les{" "}
                  <Link to="/cgu" target="_blank" className="red">
                    conditions générales
                  </Link>
                  , les{" "}
                  <Link to="/regles" target="_blank" className="red">
                    règles des enchères
                  </Link>{" "}
                  et la{" "}
                  <Link to="/confidentialite" target="_blank" className="red">
                    politique de confidentialité
                  </Link>
                  .
                </span>
              </label>
            )}
            {err && <p className="err">{err}</p>}
            <button className="btn btn-red btn-lg btn-block" disabled={busy}>
              {busy ? "Un instant…" : mode === "login" ? "Se connecter" : "Recevoir le code par SMS"}
            </button>
            {mode === "login" && (
              <Link to="/mot-de-passe-oublie" className="muted" style={{ fontSize: 13.5, textAlign: "center" }}>
                Mot de passe oublié ?
              </Link>
            )}
          </form>
          )}
          <p className="muted" style={{ marginTop: 20, fontSize: 14, textAlign: "center" }}>
            {mode === "login" ? (
              <>
                Pas encore de compte ? <Link to={`/inscription${sp.toString() ? `?${sp}` : ""}`} className="red">Inscription</Link>
              </>
            ) : (
              <>
                Déjà inscrit ? <Link to={`/connexion${sp.toString() ? `?${sp}` : ""}`} className="red">Connexion</Link>
              </>
            )}
          </p>
          {meta?.demo && mode === "login" && (
            <div className="card" style={{ padding: 14, marginTop: 18, fontSize: 13 }}>
              <b>Comptes de démo</b> (mot de passe <span className="num">babylone2027</span>)
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                {[
                  ["781234567", "Acheteur"],
                  ["771000001", "Vendeur"],
                ].map(([p, l]) => (
                  <button key={p} type="button" className="chip" onClick={() => setF({ ...f, phone: p, password: "babylone2027" })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
