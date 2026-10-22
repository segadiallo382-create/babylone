import { AnimatePresence, motion } from "framer-motion";
import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BottomBar, Footer, Nav, Ticker, Toasts } from "./components/Shell";
import { useApp } from "./lib/store";
import Home from "./pages/Home";

const Auctions = lazy(() => import("./pages/Auctions"));
const AuctionDetail = lazy(() => import("./pages/AuctionDetail"));
const LiveMap = lazy(() => import("./pages/LiveMap"));
const Requests = lazy(() => import("./pages/Requests"));
const Auth = lazy(() => import("./pages/Auth"));
const Account = lazy(() => import("./pages/Account"));
const OrderPage = lazy(() => import("./pages/OrderPage"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Sell = lazy(() => import("./pages/Sell"));
const Seller = lazy(() => import("./pages/Seller"));
const Admin = lazy(() => import("./pages/Admin"));
const Legal = lazy(() => import("./pages/Legal"));

function Page({ children }: { children: ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 24, rotateX: -6, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, rotateX: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -16, rotateX: 4, filter: "blur(6px)" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformPerspective: 1600, transformOrigin: "50% 0%" }}
    >
      {children}
    </motion.main>
  );
}

function Guard({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { user, ready } = useApp();
  const loc = useLocation();
  if (!ready) return <div className="page container"><div className="skeleton" style={{ height: 300 }} /></div>;
  if (!user) return <Navigate to={`/connexion?suite=${encodeURIComponent(loc.pathname)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/compte" replace />;
  return <>{children}</>;
}

export function App() {
  const loc = useLocation();
  const { meta } = useApp();
  useEffect(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }), [loc.pathname]);
  const bare = loc.pathname.startsWith("/paiement");

  return (
    <>
      {meta?.demo && <div className="demo-banner">Démo · paiements simulés, aucun débit réel</div>}
      {!bare && <Nav />}
      {!bare && <Ticker />}
      <Toasts />
      <Suspense fallback={<div className="page container"><div className="skeleton" style={{ height: 400 }} /></div>}>
        <AnimatePresence mode="wait">
          <Routes location={loc} key={loc.pathname.split("/")[1] + (loc.pathname.split("/")[2] || "")}>
            <Route path="/" element={<Page><Home /></Page>} />
            <Route path="/encheres" element={<Page><Auctions /></Page>} />
            <Route path="/enchere/:id" element={<Page><AuctionDetail /></Page>} />
            <Route path="/carte" element={<Page><LiveMap /></Page>} />
            <Route path="/demandes" element={<Page><Requests /></Page>} />
            <Route path="/connexion" element={<Page><Auth mode="login" /></Page>} />
            <Route path="/inscription" element={<Page><Auth mode="register" /></Page>} />
            <Route path="/mot-de-passe-oublie" element={<Page><Auth mode="reset" /></Page>} />
            <Route path="/cgu" element={<Page><Legal doc="cgu" /></Page>} />
            <Route path="/confidentialite" element={<Page><Legal doc="privacy" /></Page>} />
            <Route path="/regles" element={<Page><Legal doc="rules" /></Page>} />
            <Route path="/vendre" element={<Page><Sell /></Page>} />
            <Route path="/compte/commandes/:id" element={<Page><Guard><OrderPage /></Guard></Page>} />
            <Route path="/compte/*" element={<Page><Guard><Account /></Guard></Page>} />
            <Route path="/paiement/:id" element={<Page><Guard><Checkout /></Guard></Page>} />
            <Route path="/vendeur" element={<Page><Guard roles={["seller", "admin"]}><Seller /></Guard></Page>} />
            <Route path="/admin" element={<Page><Guard roles={["admin"]}><Admin /></Guard></Page>} />
            <Route path="*" element={<Page><NotFound /></Page>} />
          </Routes>
        </AnimatePresence>
      </Suspense>
      {!bare && <Footer />}
      {!bare && <BottomBar />}
    </>
  );
}

function NotFound() {
  return (
    <div className="page container" style={{ textAlign: "center", paddingTop: 120 }}>
      <div className="display" style={{ fontSize: 140, color: "var(--red)" }}>404</div>
      <p className="muted" style={{ margin: "10px 0 24px" }}>Cette page a été adjugée à quelqu'un d'autre.</p>
      <a href="/" className="btn btn-red">Retour à l'accueil</a>
    </div>
  );
}
