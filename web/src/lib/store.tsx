import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { api, post, tokenStore, type FeedItem, type Notif, type User } from "./api";

// ---------- Flux temps réel (hors React, partagé par tous les composants) ----------
type Live = { price: number; bids: number; next_min: number; ends_at: number; reserve_met?: boolean; at: number; ended?: boolean };
const live = new Map<number, Live>();
let feed: FeedItem[] = [];
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useLive(id: number) {
  useSyncExternalStore(subscribe, () => version);
  return live.get(id);
}
export function useFeed() {
  useSyncExternalStore(subscribe, () => version);
  return feed;
}
export function seedFeed(items: FeedItem[]) {
  if (!feed.length) {
    feed = items;
    emit();
  }
}

export const socket: Socket = io({ autoConnect: false, transports: ["websocket", "polling"] });
socket.on("feed", (e: FeedItem) => {
  live.set(e.auction_id, {
    price: e.price ?? e.amount,
    bids: e.bids_count ?? 0,
    next_min: e.next_min ?? e.amount,
    ends_at: e.ends_at ?? 0,
    reserve_met: e.reserve_met,
    at: Date.now(),
  });
  feed = [e, ...feed].slice(0, 30);
  emit();
});
socket.on("feed:ended", ({ auction_id }) => {
  const l = live.get(auction_id);
  live.set(auction_id, { ...(l || { price: 0, bids: 0, next_min: 0, ends_at: 0 }), ended: true, at: Date.now() } as Live);
  emit();
});

// ---------- Contexte applicatif ----------
type Toast = { id: number; title: string; body?: string; kind?: "ok" | "info" };
type Meta = {
  categories: string[];
  cities: string[];
  conditions: string[];
  commission_rate: number;
  pro_price: number;
  demo: boolean;
  wave: boolean;
  paydunya: boolean;
  sms: boolean;
  whatsapp: boolean;
  sizes: string[];
  relay_fee: number;
  deposit_amount: number;
  deposit_threshold: number;
  ai?: boolean;
};

type Ctx = {
  user: User | null;
  ready: boolean;
  meta: Meta | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (u: User) => void;
  notifs: Notif[];
  unread: number;
  markRead: () => void;
  toasts: Toast[];
  toast: (title: string, body?: string, kind?: "ok" | "info") => void;
  dismiss: (id: number) => void;
};

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (title: string, body?: string, kind: "ok" | "info" = "info") => {
      const id = ++tid.current;
      setToasts((t) => [...t.slice(-3), { id, title, body, kind }]);
      setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );

  useEffect(() => {
    api("/meta").then(setMeta).catch(() => {});
    api("/feed")
      .then((r) => seedFeed(r.feed))
      .catch(() => {});
    if (!tokenStore.get()) {
      setReady(true);
      socket.connect();
      return;
    }
    api("/me")
      .then((r) => setUser(r.user))
      .catch(() => tokenStore.set(null))
      .finally(() => setReady(true));
  }, []);

  // (Re)connexion du socket avec le jeton courant
  useEffect(() => {
    if (!ready) return;
    socket.disconnect();
    socket.auth = { token: tokenStore.get() };
    socket.connect();
    if (!user) {
      setNotifs([]);
      return;
    }
    api("/notifications")
      .then((r) => setNotifs(r.items))
      .catch(() => {});
    const onNotify = (n: Notif) => {
      setNotifs((list) => [n, ...list].slice(0, 40));
      toast(n.title, n.body, n.type === "won" || n.type === "paid" || n.type === "payout" ? "ok" : "info");
    };
    socket.on("notify", onNotify);
    return () => {
      socket.off("notify", onNotify);
    };
  }, [user?.id, ready, toast]);

  const value = useMemo<Ctx>(
    () => ({
      user,
      ready,
      meta,
      login: (token, u) => {
        tokenStore.set(token);
        setUser(u);
      },
      logout: () => {
        tokenStore.set(null);
        setUser(null);
      },
      setUser,
      notifs,
      unread: notifs.filter((n) => !n.read).length,
      markRead: () => {
        setNotifs((l) => l.map((n) => ({ ...n, read: 1 })));
        post("/notifications/read").catch(() => {});
      },
      toasts,
      toast,
      dismiss,
    }),
    [user, ready, meta, notifs, toasts, toast, dismiss],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

// Tic d'horloge partagé pour les comptes à rebours, calé sur l'heure du serveur
// (un téléphone mal réglé afficherait sinon une mauvaise fin de vente)
let offset = 0;
async function syncClock() {
  try {
    const t0 = Date.now();
    const { now: server } = await api<{ now: number }>("/time");
    const t1 = Date.now();
    offset = server - (t0 + t1) / 2;
  } catch {
    /* hors ligne : on garde l'heure locale */
  }
}
syncClock();
setInterval(syncClock, 5 * 60 * 1000);
export const serverNow = () => Date.now() + offset;

const clockListeners = new Set<() => void>();
let now = serverNow();
setInterval(() => {
  now = serverNow();
  clockListeners.forEach((l) => l());
}, 1000);
export function useNow() {
  return useSyncExternalStore(
    (l) => {
      clockListeners.add(l);
      return () => clockListeners.delete(l);
    },
    () => now,
  );
}

// Statistiques d'audience anonymes (visites et pages vues)
const session = (() => {
  try {
    let s = sessionStorage.getItem("babylone.session");
    if (!s) sessionStorage.setItem("babylone.session", (s = Math.random().toString(36).slice(2)));
    return s;
  } catch {
    return "";
  }
})();
export function track(kind: "visit" | "view", path = location.pathname) {
  fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, path, session }), keepalive: true }).catch(() => {});
}
