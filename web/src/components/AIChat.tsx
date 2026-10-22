import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Auction, post } from "../lib/api";
import { money } from "../lib/format";
import { useApp } from "../lib/store";
import { IClose, ISparkle } from "./Icons";

type Msg = { role: "user" | "assistant"; content: string; auctions?: Auction[] };

const SUGGESTIONS = ["Je cherche des baskets pointure 42", "Comment marche l'enchère automatique ?", "Comment se passe la livraison à Dakar ?"];
const KEY = "babylone.ai.chat";

// Assistant acheteur : bulle flottante, conversation gardée pendant la session
export function AIChat() {
  const { meta } = useApp();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-20)));
    } catch {}
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  if (!meta?.ai) return null;

  async function send(q: string) {
    q = q.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const r = await post<{ reply: string; auctions: Auction[] }>("/ai/chat", { messages: next.map(({ role, content }) => ({ role, content })) });
      setMsgs([...next, { role: "assistant", content: r.reply, auctions: r.auctions }]);
    } catch (e: any) {
      setMsgs([...next, { role: "assistant", content: e.message || "Assistant indisponible. Réessaie." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <motion.button className="ai-fab" onClick={() => setOpen((o) => !o)} whileTap={{ scale: 0.92 }} aria-label="Assistant Babylone">
        {open ? <IClose size={22} /> : <ISparkle size={22} />}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="ai-panel glass"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
          >
            <div className="ai-head">
              <b>Assistant Babylone</b>
              <span className="muted">Trouve un produit, pose une question</span>
            </div>
            <div className="ai-body">
              {msgs.length === 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <p className="muted" style={{ fontSize: 14 }}>Salut ! Dis-moi ce que tu cherches, ton budget ou ta ville.</p>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="chip" style={{ justifySelf: "start" }} onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`ai-msg ${m.role}`}>
                  <p>{m.content}</p>
                  {!!m.auctions?.length && (
                    <div className="ai-cards">
                      {m.auctions.map((a) => (
                        <Link key={a.id} to={`/enchere/${a.id}`} className="ai-card" onClick={() => setOpen(false)}>
                          <img src={a.thumbs?.[0] || a.images[0]} alt="" />
                          <span>
                            <b>{a.title}</b>
                            <span className="red num">{money(a.current_price)} F</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {busy && <div className="ai-msg assistant muted">…</div>}
              <div ref={end} />
            </div>
            <form
              className="ai-form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                send(text);
              }}
            >
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Écris ta question…" maxLength={1000} />
              <button className="btn btn-red btn-sm" disabled={busy || !text.trim()}>
                Envoyer
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
