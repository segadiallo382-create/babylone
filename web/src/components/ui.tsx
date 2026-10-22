import { motion, useMotionValue, useSpring, useTransform, type Variants } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { money, remaining, shortLeft } from "../lib/format";
import { useNow } from "../lib/store";
import { IClock } from "./Icons";

export function Logo({ size = 34, word = true }: { size?: number; word?: boolean }) {
  return (
    <span className="row" style={{ gap: 10 }}>
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        whileHover={{ rotate: -12, scale: 1.06 }}
        transition={{ type: "spring", stiffness: 300, damping: 14 }}
      >
        <path d="M19 26h26l-2.5 24h-21z" fill="#E3262F" />
        <path d="M25 26v-4a7 7 0 0 1 14 0v4" fill="none" stroke="#F4F1EC" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M50 22a22 22 0 1 1-8-9" fill="none" stroke="#E3262F" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M43 7l1 8-8 1" fill="none" stroke="#E3262F" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M30 34l9 4-4 1.4-1.4 4z" fill="#F4F1EC" />
      </motion.svg>
      {word && (
        <span className="display" style={{ fontSize: size * 0.68, letterSpacing: "-0.04em" }}>
          babylone
        </span>
      )}
    </span>
  );
}

// Chiffres qui roulent comme un compteur mécanique
export function Odometer({ value }: { value: number }) {
  const chars = money(value).split("");
  return (
    <span className="odo num" aria-label={money(value)}>
      {chars.map((c, i) =>
        /\d/.test(c) ? (
          <span key={chars.length - i} className="odo-col" style={{ transform: `translateY(-${Number(c)}em)` }}>
            {"0123456789".split("").map((d) => (
              <span key={d}>{d}</span>
            ))}
          </span>
        ) : (
          <span key={`s${chars.length - i}`} className="odo-sep" style={{ width: "0.28em" }} />
        ),
      )}
    </span>
  );
}

export function TimerPill({ endsAt, ended }: { endsAt: number; ended?: boolean }) {
  const now = useNow();
  const left = endsAt - now;
  const urgent = left > 0 && left < 5 * 60 * 1000;
  return (
    <span className={`timer-pill num ${urgent ? "urgent" : ""}`}>
      <IClock size={14} />
      {ended || left <= 0 ? "Terminé" : shortLeft(left)}
    </span>
  );
}

export function RingTimer({ endsAt, startsAt }: { endsAt: number; startsAt: number }) {
  const now = useNow();
  const total = Math.max(1, endsAt - startsAt);
  const left = Math.max(0, endsAt - now);
  const r = remaining(left);
  const R = 28;
  const C = 2 * Math.PI * R;
  // L'anneau représente la dernière heure, le dernier jour, ou toute la durée
  const span = left < 3600 * 1000 ? 3600 * 1000 : left < 24 * 3600 * 1000 ? 24 * 3600 * 1000 : total;
  const frac = Math.min(1, left / span);
  const urgent = left < 5 * 60 * 1000;
  const parts = r.d > 0 ? [[r.d, "j"], [r.h, "h"], [r.m, "min"]] : [[r.h, "h"], [r.m, "min"], [r.s, "s"]];
  return (
    <div className="ring-timer">
      <svg width="68" height="68">
        <circle cx="34" cy="34" r={R} stroke="rgba(255,255,255,.08)" strokeWidth="5" fill="none" />
        <circle
          cx="34"
          cy="34"
          r={R}
          stroke={urgent ? "#ff4b4f" : "#e3262f"}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          style={{ transition: "stroke-dashoffset 1s linear", filter: urgent ? "drop-shadow(0 0 6px #ff4b4f)" : undefined }}
        />
      </svg>
      <div>
        <div className="eyebrow">{r.done ? "Vente" : "Fin dans"}</div>
        <div className="t num">
          {r.done
            ? "Terminée"
            : parts.map(([v, u]) => (
                <span key={u as string} style={{ marginRight: 8 }}>
                  {String(v).padStart(2, "0")}
                  <small className="muted" style={{ fontSize: 14, marginLeft: 2 }}>
                    {u}
                  </small>
                </span>
              ))}
        </div>
      </div>
    </div>
  );
}

// Inclinaison 3D qui suit le pointeur, avec reflet
export function Tilt({ children, max = 10, className = "", glare = true }: { children: ReactNode; max?: number; className?: string; glare?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const sx = useSpring(x, { stiffness: 180, damping: 18 });
  const sy = useSpring(y, { stiffness: 180, damping: 18 });
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const gx = useTransform(sx, (v) => `${v * 100}%`);
  const gy = useTransform(sy, (v) => `${v * 100}%`);
  const bg = useTransform([gx, gy] as any, ([a, b]: any) => `radial-gradient(circle at ${a} ${b}, rgba(255,255,255,.55), transparent 55%)`);
  const fine = useMemo(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches, []);
  return (
    <div className={`a-card-wrap ${className}`}>
      <motion.div
        ref={ref}
        style={fine ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined}
        onPointerMove={(e) => {
          if (!fine || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          x.set((e.clientX - r.left) / r.width);
          y.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => {
          x.set(0.5);
          y.set(0.5);
        }}
      >
        {children}
        {glare && fine && <motion.div className="glare" style={{ background: bg, borderRadius: "inherit" }} />}
      </motion.div>
    </div>
  );
}

const revealV: Variants = {
  hidden: { opacity: 0, y: 40, rotateX: -18, filter: "blur(6px)" },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    rotateX: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Reveal({ children, i = 0, className, style }: { children: ReactNode; i?: number; className?: string; style?: any }) {
  return (
    <motion.div
      className={className}
      style={{ transformPerspective: 1000, ...style }}
      variants={revealV}
      custom={i}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

// Titre qui apparaît mot par mot en basculant en 3D
export function SplitTitle({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className} style={{ perspective: 800, display: "inline" }}>
      {text.split(" ").map((w, i) => (
        <span className="word" key={i}>
          <motion.span
            initial={{ y: "110%", rotateX: -80, opacity: 0 }}
            animate={{ y: "0%", rotateX: 0, opacity: 1 }}
            transition={{ duration: 1, delay: delay + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "50% 100%" }}
          >
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export function CountUp({ to, duration = 1.6, suffix = "" }: { to: number; duration?: number; suffix?: string }) {
  const [v, setV] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let started = false;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started) return;
      started = true;
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / (duration * 1000));
        setV(Math.round(to * (1 - Math.pow(1 - k, 4))));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);
  return (
    <span ref={ref} className="num">
      {money(v)}
      {suffix}
    </span>
  );
}

// Éclat de confettis 3D (offre réussie)
export function Burst({ fire }: { fire: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        x: (Math.random() - 0.5) * 520,
        y: -120 - Math.random() * 300,
        z: (Math.random() - 0.5) * 400,
        r: Math.random() * 720,
        c: i % 3 === 0 ? "#f4f1ec" : i % 3 === 1 ? "#e3262f" : "#ff8a8c",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fire],
  );
  if (!fire) return null;
  return (
    <div className="burst" key={fire}>
      {pieces.map((p, i) => (
        <motion.i
          key={i}
          style={{ background: p.c }}
          initial={{ x: 0, y: 0, z: 0, rotateX: 0, rotateY: 0, opacity: 1 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 420], z: p.z, rotateX: p.r, rotateY: p.r * 1.3, opacity: [1, 1, 0] }}
          transition={{ duration: 1.8, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= Math.round(value) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
          <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z" />
        </svg>
      ))}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty card">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, id }: { value: T; options: [T, string][]; onChange: (v: T) => void; id: string }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)}>
          {v === value && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
          {label}
        </button>
      ))}
    </div>
  );
}
