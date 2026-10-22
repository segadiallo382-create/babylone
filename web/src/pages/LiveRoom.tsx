import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Burst, Empty, Odometer, TimerPill } from "../components/ui";
import { api, post, type Auction } from "../lib/api";
import { fcfa, money } from "../lib/format";
import { socket, useApp } from "../lib/store";
import { can3D } from "../three/capability";
import type { Live } from "./Lives";

const LiveStage = lazy(() => import("../three/Scenes").then((m) => ({ default: m.LiveStage })));

type Chat = { id: number; body: string; name: string; created_at: number; seller?: boolean };

// YouTube et Facebook s'intègrent dans la page ; TikTok et Instagram s'ouvrent dans leur appli
function embedUrl(url: string | null) {
  if (!url) return null;
  const yt = /(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1&playsinline=1`;
  if (/facebook\.com|fb\.watch/.test(url)) return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=true&mute=true`;
  return null;
}

export default function LiveRoom() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const nav = useNavigate();
  const [l, setL] = useState<Live | null>(null);
  const [chat, setChat] = useState<Chat[]>([]);
  const [msg, setMsg] = useState("");
  const [cur, setCur] = useState<Auction | null>(null);
  const [pulse, setPulse] = useState(0);
  const [hammer, setHammer] = useState(0);
  const [burst, setBurst] = useState(0);
  const [missing, setMissing] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(
    () =>
      api(`/lives/${id}`)
        .then((r) => {
          setL(r.live);
          setCur(r.live.current);
          setChat(r.chat);
        })
        .catch(() => setMissing(true)),
    [id],
  );

  useEffect(() => {
    load();
    socket.emit("live:join", id);
    const onUpdate = () => load();
    const onChat = (c: Chat) => setChat((x) => [...x, c].slice(-80));
    const onHammer = () => {
      setHammer(Date.now());
      setTimeout(load, 21_000);
    };
    socket.on("live:update", onUpdate);
    socket.on("live:chat", onChat);
    socket.on("live:hammer", onHammer);
    return () => {
      socket.emit("live:leave", id);
      socket.off("live:update", onUpdate);
      socket.off("live:chat", onChat);
      socket.off("live:hammer", onHammer);
    };
  }, [id, load]);

  // Prix du lot en cours en temps réel
  useEffect(() => {
    if (!cur) return;
    socket.emit("watch", cur.id);
    const onBid = (e: any) => {
      if (e.auction_id !== cur.id) return;
      setCur((a) => a && { ...a, current_price: e.price ?? e.amount, bids_count: e.bids_count, next_min: e.next_min, ends_at: e.ends_at, leader: e.bidder ?? a.leader, is_leader: e.bidder_id === user?.id });
      setPulse(Date.now());
    };
    const onEnded = (e: any) => e.auction_id === cur.id && setTimeout(load, 800);
    socket.on("bid", onBid);
    socket.on("ended", onEnded);
    return () => {
      socket.emit("unwatch", cur.id);
      socket.off("bid", onBid);
      socket.off("ended", onEnded);
    };
  }, [cur?.id, user?.id, load]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [chat.length]);

  if (missing) return <div className="page container"><Empty title="Live introuvable." /></div>;
  if (!l) return <div className="page container"><div className="skeleton" style={{ height: 520 }} /></div>;
  const owner = user && (user.id === l.seller.id || user.role === "admin");
  const embed = embedUrl(l.stream_url);

  async function bid(amount: number) {
    if (!user) return nav(`/connexion?suite=/live/${id}`);
    try {
      const r = await post(`/auctions/${cur!.id}/bid`, { amount });
      if (r.bid.you_lead) {
        setBurst(Date.now());
        toast("En tête !", `${fcfa(amount)} sur ${cur!.title}`, "ok");
      } else toast("Déjà dépassé", "Relance !");
    } catch (e: any) {
      toast(e.message);
    }
  }
  async function send() {
    if (!user) return nav(`/connexion?suite=/live/${id}`);
    if (!msg.trim()) return;
    try {
      await post(`/lives/${id}/chat`, { body: msg });
      setMsg("");
    } catch (e: any) {
      toast(e.message);
    }
  }
  const control = (action: string) => post(`/lives/${id}/${action}`).then(load).catch((e) => toast(e.message));
  const step = cur ? cur.next_min - (cur.bids_count ? cur.current_price : cur.next_min) || cur.next_min * 0.05 : 0;

  return (
    <div className="page live-page">
      <div className="container">
        <div className="row between wrap" style={{ marginBottom: 16 }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              {l.status === "live" ? (
                <span className="chip chip-red">
                  <span className="live-dot" style={{ background: "#fff" }} /> EN DIRECT
                </span>
              ) : (
                <span className="chip">{l.status === "scheduled" ? "Programmé" : "Terminé"}</span>
              )}
              <Link to={`/boutique/${l.seller.id}`} className="chip">
                {l.seller.name}
              </Link>
            </div>
            <h1 className="display" style={{ fontSize: "clamp(28px,4vw,46px)", marginTop: 10 }}>
              {l.title}
            </h1>
          </div>
          {owner && (
            <div className="row wrap live-controls">
              {l.status !== "live" && l.status !== "ended" && (
                <button className="btn btn-red btn-sm" onClick={() => control("start")}>
                  Démarrer le live
                </button>
              )}
              {l.status === "live" && (
                <>
                  <button className="btn btn-light btn-sm" onClick={() => control("hammer")}>
                    🔨 Adjuger dans 20 s
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => control("next")}>
                    Lot suivant →
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => confirm("Terminer le live ?") && control("end")}>
                    Terminer
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="live-grid">
          <div className="live-stage card">
            {embed ? (
              <iframe src={embed} title="Live vidéo" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
            ) : cur && can3D() ? (
              <Suspense fallback={null}>
                <LiveStage src={cur.images[0]} price={cur.current_price} label={cur.bids_count ? "Offre actuelle" : "Départ"} pulse={pulse} />
              </Suspense>
            ) : cur ? (
              <img src={cur.images[0]} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }} className="muted">
                {l.status === "scheduled" ? `Début le ${new Date(l.starts_at).toLocaleString("fr-FR")}` : "Aucun lot en cours"}
              </div>
            )}
            {l.stream_url && !embed && (
              <a className="btn btn-red btn-sm" href={l.stream_url} target="_blank" rel="noreferrer" style={{ position: "absolute", left: 16, top: 16, zIndex: 3 }}>
                Regarder la vidéo du live
              </a>
            )}
            <AnimatePresence>
              {hammer > 0 && Date.now() - hammer < 20_000 && (
                <motion.div key={hammer} className="hammer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {["Une fois…", "Deux fois…", "Dernière chance !"].map((t, i) => (
                    <motion.span key={t} initial={{ opacity: 0, scale: 2.2, rotateX: 60 }} animate={{ opacity: [0, 1, 1, 0], scale: [2.2, 1, 1, 0.8], rotateX: 0 }} transition={{ delay: i * 6, duration: 5.5, times: [0, 0.15, 0.85, 1] }}>
                      {t}
                    </motion.span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="live-side">
            {cur ? (
              <div className="card pad" style={{ position: "relative", overflow: "hidden" }}>
                <Burst fire={burst} />
                <div className="row between">
                  <span className="eyebrow">Lot en cours</span>
                  <TimerPill endsAt={cur.ends_at} ended={cur.status !== "live"} />
                </div>
                <Link to={`/enchere/${cur.id}`}>
                  <h3 style={{ margin: "8px 0", fontSize: 18 }}>{cur.title}</h3>
                </Link>
                <motion.div key={cur.current_price} className="price-big" initial={{ rotateX: -70, opacity: 0.4 }} animate={{ rotateX: 0, opacity: 1 }} style={{ transformPerspective: 600, fontSize: 52 }}>
                  <Odometer value={cur.current_price} />
                  <small>F</small>
                </motion.div>
                <div className="muted" style={{ fontSize: 13, margin: "6px 0 14px" }}>
                  {cur.bids_count} offres{cur.leader ? ` · en tête : ${cur.is_leader ? "toi" : cur.leader}` : ""}
                </div>
                {cur.status === "live" && !cur.is_leader && user?.id !== l.seller.id && (
                  <div className="quick" style={{ margin: 0 }}>
                    {[0, 1, 3].map((k) => {
                      const v = Math.round(cur.next_min + k * Math.max(250, step));
                      return (
                        <motion.button key={k} whileTap={{ scale: 0.92 }} onClick={() => bid(v)} className={k === 0 ? "hot" : ""}>
                          {money(v)} F
                        </motion.button>
                      );
                    })}
                  </div>
                )}
                {cur.is_leader && <div className="leader-banner">Tu es en tête !</div>}
              </div>
            ) : (
              <div className="card pad muted">Le vendeur prépare le prochain lot…</div>
            )}

            <div className="card live-chat">
              <div className="chat-list">
                {chat.map((c) => (
                  <motion.div key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={c.seller ? "seller" : ""}>
                    <b>{c.name}</b> {c.body}
                  </motion.div>
                ))}
                <div ref={chatEnd} />
              </div>
              <div className="row" style={{ gap: 8, padding: 10, borderTop: "1px solid var(--line)" }}>
                <input className="input" style={{ height: 42 }} value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Pose ta question…" maxLength={200} />
                <button className="btn btn-red btn-sm" onClick={send}>
                  ➤
                </button>
              </div>
            </div>
          </div>
        </div>

        <h2 className="display" style={{ fontSize: 28, margin: "36px 0 16px" }}>
          Lots du live
        </h2>
        <div className="lots-row">
          {l.lots.map((a) => (
            <Link key={a.id} to={`/enchere/${a.id}`} className={`lot ${a.id === cur?.id ? "on" : ""} ${a.status !== "live" ? "done" : ""}`}>
              <img src={a.thumbs?.[0] || a.images[0]} alt="" />
              <span>{a.title}</span>
              <b className="num">{a.status === "sold" ? `Adjugé ${money(a.current_price)} F` : `${money(a.current_price)} F`}</b>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
