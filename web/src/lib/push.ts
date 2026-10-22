import { api, post } from "./api";

// Notifications push du navigateur : alertes même quand le site est fermé
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const b64 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export async function pushEnabled() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Ton navigateur ne gère pas les notifications push.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications refusées dans le navigateur.");
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const { key } = await api<{ key: string }>("/push/key");
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
  await post("/push/subscribe", { subscription: sub.toJSON() });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await post("/push/unsubscribe", { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}
