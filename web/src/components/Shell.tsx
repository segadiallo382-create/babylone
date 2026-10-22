import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ago, initials, money } from "../lib/format";
import { liteMode, setLiteMode } from "../lib/perf";
import { useApp, useFeed } from "../lib/store";
import { IBell, ICheck, IClose, IGavel, IGrid, IHome, ILogout, IMegaphone, IMenu, IStore, IUser } from "./Icons";
import { Logo } from "./ui";

const LINKS: [string, string][] = [
  ["/encheres", "Enchères"],
  ["/carte", "Carte live"],
  ["/demandes", "Demandes"],
  ["/vendre", "Vendre"],
];

export function Nav() {
  const { user, unread } = useApp();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <>
      <header className="nav">
        <div className="container">
          <Link to="/" aria-label="Accueil Babylone">
            <Logo size={32} />
          </Link>
          <nav className="nav-links">
            {LINKS.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="nav-right">
            {user ? (
              <>
                <Bell />
                <UserMenu />
              </>
            ) : (
              <>
                <Link to="/connexion" className="btn btn-ghost btn-sm hide-m">
                  Connexion
                </Link>
                <Link to="/inscription" className="btn btn-red btn-sm">
                  Créer un compte
                </Link>
              </>
            )}
            <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Menu">
              <IMenu />
              {!!unread && <span className="badge-count">{unread}</span>}
            </button>
          </div>
        </div>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div className="mobile-sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="icon-btn" style={{ position: "absolute", top: 12, right: 16 }} onClick={() => setOpen(false)} aria-label="Fermer">
              <IClose />
            </button>
            {[["/", "Accueil"], ...LINKS, ...(user ? [[user.role === "seller" ? "/vendeur" : user.role === "admin" ? "/admin" : "/compte", "Mon espace"]] : [["/connexion", "Connexion"]])].map(
              ([to, label], i) => (
                <motion.div
                  key={to}
                  initial={{ opacity: 0, y: 30, rotateX: -40 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformPerspective: 800 }}
                >
                  <Link to={to}>{label}</Link>
                </motion.div>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return ref;
}

function Bell() {
  const { notifs, unread, markRead } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const nav = useNavigate();
  return (
    <div ref={ref} style={{ position: "relative" }} className="hide-m">
      <motion.button
        className="icon-btn"
        aria-label="Notifications"
        onClick={() => {
          setOpen(!open);
          if (!open && unread) setTimeout(markRead, 1500);
        }}
        animate={unread ? { rotate: [0, -14, 12, -8, 0] } : {}}
        transition={{ duration: 0.7 }}
        key={unread}
      >
        <IBell size={19} />
        {!!unread && <span className="badge-count">{unread}</span>}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="drop glass"
            initial={{ opacity: 0, y: -8, rotateX: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            style={{ transformOrigin: "top right", transformPerspective: 900 }}
          >
            <div className="row between" style={{ padding: "8px 12px" }}>
              <b>Notifications</b>
              <button className="muted" style={{ fontSize: 13 }} onClick={markRead}>
                Tout marquer lu
              </button>
            </div>
            {notifs.length === 0 && <div className="empty">Rien pour l'instant.</div>}
            {notifs.map((n) => (
              <button
                key={n.id}
                className={`notif ${n.read ? "" : "unread"}`}
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => {
                  setOpen(false);
                  if (n.link) nav(n.link);
                }}
              >
                <span className="ndot" />
                <span>
                  <b>{n.title}</b>
                  <p>{n.body}</p>
                  <p style={{ fontSize: 12, marginTop: 2, color: "var(--dim)" }}>{ago(n.created_at)}</p>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const nav = useNavigate();
  if (!user) return null;
  const items: [string, string, any][] = [
    ...(user.role === "seller" ? ([["/vendeur", "Espace vendeur", IStore]] as [string, string, any][]) : []),
    ...(user.role === "admin" ? ([["/admin", "Administration", IGrid]] as [string, string, any][]) : []),
    ["/compte", "Mes enchères", IGavel],
    ["/compte/commandes", "Mes commandes", ICheck],
  ];
  return (
    <div ref={ref} style={{ position: "relative" }} className="hide-m">
      <button className="avatar" onClick={() => setOpen(!open)} aria-label="Mon compte">
        {initials(user.name)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="drop glass"
            style={{ width: 260, transformOrigin: "top right" }}
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
          >
            <div style={{ padding: "10px 12px 12px" }}>
              <b>{user.name}</b>
              <div className="muted" style={{ fontSize: 13 }}>
                {user.role === "seller" ? user.shop_name : user.city}
                {user.plan === "pro" && " · Pro"}
              </div>
            </div>
            {items.map(([to, label, Icon]) => (
              <Link key={to} to={to} className="notif" onClick={() => setOpen(false)}>
                <Icon size={18} /> {label}
              </Link>
            ))}
            <button
              className="notif"
              style={{ width: "100%" }}
              onClick={() => {
                logout();
                setOpen(false);
                nav("/");
              }}
            >
              <ILogout size={18} /> Déconnexion
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Ticker() {
  const feed = useFeed();
  if (!feed.length) return <div className="ticker" />;
  const items = [...feed, ...feed];
  return (
    <div className="ticker" aria-label="Dernières offres">
      <div className="ticker-track">
        {items.map((f, i) => (
          <Link to={`/enchere/${f.auction_id}`} className="ticker-item" key={i}>
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            <b>{f.bidder}</b> a proposé <b className="red num">{money(f.amount)} F</b> · {f.title.slice(0, 34)} · {f.city}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast glass ${t.kind === "ok" ? "ok" : ""}`}
            initial={{ opacity: 0, x: 60, rotateY: -35 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            style={{ transformPerspective: 900 }}
            onClick={() => dismiss(t.id)}
          >
            <span className="tico">{t.kind === "ok" ? <ICheck size={16} /> : <IBell size={16} />}</span>
            <span>
              <b style={{ fontSize: 14 }}>{t.title}</b>
              {t.body && <p className="muted" style={{ fontSize: 13 }}>{t.body}</p>}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function BottomBar() {
  const { user, unread } = useApp();
  const space = user?.role === "seller" ? "/vendeur" : user?.role === "admin" ? "/admin" : user ? "/compte" : "/connexion";
  const items: [string, string, any][] = [
    ["/", "Accueil", IHome],
    ["/encheres", "Enchères", IGavel],
    ["/demandes", "Demandes", IMegaphone],
    [space, "Compte", IUser],
  ];
  return (
    <nav className="bottom-bar glass">
      {items.map(([to, label, Icon]) => (
        <NavLink key={label} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")} style={{ position: "relative" }}>
          <Icon size={21} />
          {label}
          {label === "Compte" && !!unread && <span className="badge-count" style={{ right: 4 }}>{unread}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-cols">
          <div>
            <Logo size={30} />
            <p className="muted" style={{ marginTop: 14, maxWidth: 340 }}>
              La plateforme sénégalaise de vente à prix évolutif. Les importateurs fixent le départ, les acheteurs fixent le prix.
            </p>
          </div>
          <div>
            <h4>Acheter</h4>
            <Link to="/encheres">Toutes les ventes</Link>
            <Link to="/carte">Carte en direct</Link>
            <Link to="/demandes">Espace demande</Link>
          </div>
          <div>
            <h4>Vendre</h4>
            <Link to="/vendre">Devenir vendeur</Link>
            <Link to="/vendre#tarifs">Tarifs</Link>
            <Link to="/vendeur">Espace vendeur</Link>
          </div>
          <div>
            <h4>Babylone E-Commerce</h4>
            <Link to="/regles">Règles des enchères</Link>
            <Link to="/cgu">Conditions générales</Link>
            <Link to="/confidentialite">Confidentialité</Link>
            <button className="muted" style={{ padding: "4px 0", fontSize: 15 }} onClick={() => setLiteMode(!liteMode())}>
              Mode allégé : {liteMode() ? "activé" : "désactivé"}
            </button>
          </div>
        </div>
        <div className="footer-big">babylone</div>
        <div className="row between wrap muted" style={{ fontSize: 13, marginTop: 20 }}>
          <span>© 2026 Babylone E-Commerce SUARL · Thiès</span>
          <span>Paiement sécurisé · fonds bloqués jusqu'à la livraison</span>
        </div>
      </div>
    </footer>
  );
}
