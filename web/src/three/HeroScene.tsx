import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { money } from "../lib/format";
import { useFeed } from "../lib/store";
import { Logo } from "../components/ui";
import { StudioEnv, canvasTexture, roundedRect, useInView, webglOK } from "./common";
import { liteMode } from "../lib/perf";

const RED = new THREE.Color("#e3262f");

function bagShape() {
  // Corps légèrement trapézoïdal, coins arrondis
  const s = new THREE.Shape();
  const wb = 1.0;
  const wt = 1.15;
  const h = 2.3;
  const r = 0.12;
  s.moveTo(-wb + r, -h / 2);
  s.lineTo(wb - r, -h / 2);
  s.quadraticCurveTo(wb, -h / 2, wb + 0.01, -h / 2 + r);
  s.lineTo(wt, h / 2 - r);
  s.quadraticCurveTo(wt, h / 2, wt - r, h / 2);
  s.lineTo(-wt + r, h / 2);
  s.quadraticCurveTo(-wt, h / 2, -wt, h / 2 - r);
  s.lineTo(-wb - 0.01, -h / 2 + r);
  s.quadraticCurveTo(-wb, -h / 2, -wb + r, -h / 2);
  return s;
}

function Bag() {
  const g = useRef<THREE.Group>(null);
  const geo = useMemo(() => {
    const geom = new THREE.ExtrudeGeometry(bagShape(), { depth: 0.85, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 6, curveSegments: 16 });
    geom.center();
    return geom;
  }, []);
  const emblem = useMemo(
    () =>
      canvasTexture(512, 512, (c) => {
        c.clearRect(0, 0, 512, 512);
        c.strokeStyle = "#f4f1ec";
        c.lineWidth = 26;
        c.lineCap = "round";
        c.lineJoin = "round";
        c.beginPath();
        c.arc(256, 256, 150, -0.25 * Math.PI, 1.55 * Math.PI);
        c.stroke();
        c.beginPath();
        c.moveTo(352, 108);
        c.lineTo(366, 152);
        c.lineTo(320, 162);
        c.stroke();
        c.fillStyle = "#f4f1ec";
        c.beginPath();
        c.moveTo(220, 200);
        c.lineTo(330, 250);
        c.lineTo(282, 268);
        c.lineTo(262, 318);
        c.closePath();
        c.fill();
      }),
    [],
  );
  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = clock.getElapsedTime();
    g.current.position.y = Math.sin(t * 0.9) * 0.12;
    g.current.rotation.y = Math.sin(t * 0.35) * 0.5 + 0.35;
    g.current.rotation.z = Math.sin(t * 0.6) * 0.04;
  });
  return (
    <group ref={g}>
      <mesh geometry={geo} castShadow>
        <meshPhysicalMaterial color={RED} roughness={0.32} metalness={0.05} clearcoat={1} clearcoatRoughness={0.18} />
      </mesh>
      <mesh position={[0, 0.1, 0.49]}>
        <planeGeometry args={[1.25, 1.25]} />
        <meshBasicMaterial map={emblem} transparent toneMapped={false} />
      </mesh>
      {[-0.42, 0.42].map((z) => (
        <mesh key={z} position={[0, 1.15, z * 0.7]}>
          <torusGeometry args={[0.5, 0.065, 20, 48, Math.PI]} />
          <meshPhysicalMaterial color="#121214" roughness={0.25} clearcoat={1} />
        </mesh>
      ))}
    </group>
  );
}

// Flèche circulaire qui tourne autour du sac : le prix qui évolue
function OrbitArrow() {
  const g = useRef<THREE.Group>(null);
  const arc = 1.72 * Math.PI;
  const R = 2.25;
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.z -= dt * 0.55;
  });
  return (
    <group rotation={[1.2, 0.15, 0]}>
      <group ref={g}>
        <mesh>
          <torusGeometry args={[R, 0.045, 16, 220, arc]} />
          <meshStandardMaterial color="#ff3b40" emissive="#e3262f" emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
        <mesh position={[R * Math.cos(arc), R * Math.sin(arc), 0]} rotation={[0, 0, arc]}>
          <coneGeometry args={[0.13, 0.32, 24]} />
          <meshStandardMaterial color="#ff3b40" emissive="#e3262f" emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function drawTag(c: CanvasRenderingContext2D, title: string, price: number, who: string) {
  c.clearRect(0, 0, 512, 256);
  c.fillStyle = "#f4efe8";
  c.beginPath();
  (c as any).roundRect(0, 0, 512, 256, 42);
  c.fill();
  c.fillStyle = "#e3262f";
  c.beginPath();
  c.arc(56, 60, 13, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#6d6a66";
  c.font = "600 30px Inter, sans-serif";
  c.fillText(who ? `${who} enchérit` : "Offre en direct", 84, 71);
  c.fillStyle = "#0a0a0b";
  c.font = "800 84px 'Bricolage Grotesque', Inter, sans-serif";
  c.fillText(`${money(price)} F`, 40, 168);
  c.fillStyle = "#6d6a66";
  c.font = "500 28px Inter, sans-serif";
  c.fillText(title.length > 30 ? title.slice(0, 29) + "…" : title, 42, 220);
}

function PriceTag({ pos, idx, phase }: { pos: [number, number, number]; idx: number; phase: number }) {
  const m = useRef<THREE.Mesh>(null);
  const feed = useFeed();
  const item = feed[idx];
  const tex = useMemo(() => canvasTexture(512, 256, () => {}), []);
  const geo = useMemo(() => {
    const gg = new THREE.ExtrudeGeometry(roundedRect(1.6, 0.8, 0.13), { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 });
    gg.center();
    // UV du devant entre 0 et 1
    const uv = gg.attributes.uv as THREE.BufferAttribute;
    const p = gg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + 0.8) / 1.6, (p.getY(i) + 0.4) / 0.8);
    return gg;
  }, []);
  const flip = useRef(0);
  useEffect(() => {
    const ctx = (tex.image as HTMLCanvasElement).getContext("2d")!;
    drawTag(ctx, item?.title || "Sneakers montantes", item?.amount || 12500 + idx * 7250, item?.bidder || "");
    tex.needsUpdate = true;
    flip.current = 1;
  }, [item?.amount, item?.title, item?.bidder, idx, tex]);
  useFrame(({ clock }, dt) => {
    if (!m.current) return;
    const t = clock.getElapsedTime() + phase;
    m.current.position.y = pos[1] + Math.sin(t * 1.1) * 0.12;
    flip.current = Math.max(0, flip.current - dt * 2.2);
    // Nouvelle offre : la carte fait un tour complet
    const spin = flip.current > 0 ? Math.sqrt(1 - flip.current) * Math.PI * 2 : 0;
    m.current.rotation.y = -0.35 + Math.sin(t * 0.5) * 0.15 + spin;
    m.current.rotation.x = Math.sin(t * 0.7) * 0.08;
  });
  return (
    <mesh ref={m} position={pos} geometry={geo}>
      <meshStandardMaterial map={tex} roughness={0.5} />
    </mesh>
  );
}

function Particles({ count = 500 }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 16;
      p[i * 3 + 1] = (Math.random() - 0.5) * 10;
      p[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [count]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.02;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.025} color="#ff8a8c" transparent opacity={0.6} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function Floaters() {
  const items = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        p: [(Math.random() - 0.5) * 7, (Math.random() - 0.5) * 4.5, -1.5 - Math.random() * 2] as [number, number, number],
        s: 0.12 + Math.random() * 0.18,
        k: i % 2,
        ph: Math.random() * 6,
      })),
    [],
  );
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    g.current?.children.forEach((c, i) => {
      const t = clock.getElapsedTime() + items[i].ph;
      c.rotation.x = t * 0.6;
      c.rotation.y = t * 0.4;
      c.position.y = items[i].p[1] + Math.sin(t) * 0.2;
    });
  });
  return (
    <group ref={g}>
      {items.map((f, i) => (
        <mesh key={i} position={f.p} scale={f.s}>
          {f.k ? <boxGeometry args={[1, 1, 1]} /> : <icosahedronGeometry args={[1, 0]} />}
          <meshPhysicalMaterial color={f.k ? "#141416" : "#e3262f"} roughness={0.2} clearcoat={1} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  // La scène se réduit quand le cadre est étroit (mobile, colonne)
  const vw = useThree((s) => s.viewport.width);
  const k = Math.min(1.1, vw / 6.4);
  useFrame(({ pointer }) => {
    if (!g.current) return;
    g.current.rotation.y += (pointer.x * 0.35 - g.current.rotation.y) * 0.05;
    g.current.rotation.x += (-pointer.y * 0.2 - g.current.rotation.x) * 0.05;
  });
  return (
    <group ref={g} scale={k}>
      {children}
    </group>
  );
}

export function HeroScene({ compact = false }: { compact?: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  if (!webglOK() || liteMode())
    return (
      <div className="hero-canvas" style={{ display: "grid", placeItems: "center", ...(compact ? { height: "100%" } : {}) }}>
        <div style={{ transform: "perspective(800px) rotateY(-18deg) rotateX(8deg)" }}>
          <Logo size={220} word={false} />
        </div>
      </div>
    );
  return (
    <div ref={ref} className="hero-canvas" style={compact ? { height: "100%" } : undefined}>
      <Canvas
        frameloop={inView ? "always" : "never"}
        dpr={[1, 1.6]}
        camera={{ position: [0, 0.2, 8.2], fov: 36 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <StudioEnv intensity={0.9} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <pointLight position={[-3, -2, 2]} intensity={14} color="#ff2a33" distance={10} />
        <Rig>
          <group position={compact ? [0, 0, 0] : [0.2, -0.1, 0]} scale={compact ? 0.9 : 1}>
            <Bag />
            <OrbitArrow />
            <PriceTag pos={[2.0, 1.3, 0.6]} idx={0} phase={0} />
            <PriceTag pos={[-2.1, -0.35, 0.4]} idx={1} phase={2} />
            {!compact && <PriceTag pos={[1.55, -1.5, 1.1]} idx={2} phase={4} />}
          </group>
          <Floaters />
        </Rig>
        <Particles />
      </Canvas>
    </div>
  );
}
