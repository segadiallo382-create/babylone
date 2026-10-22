// Scènes 3D secondaires : vitrine produit, port à conteneurs, scène de live, cadeau de victoire.
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { money } from "../lib/format";
import { StudioEnv, canvasTexture, roundedRect, useInView } from "./common";
export { can3D } from "./capability";

function Frame({ children, camera, className, style }: { children: React.ReactNode; camera: any; className?: string; style?: React.CSSProperties }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={className} style={{ position: "relative", ...style }}>
      <Canvas frameloop={inView ? "always" : "never"} dpr={[1, 1.6]} camera={camera} gl={{ antialias: true, alpha: true }}>
        {children}
      </Canvas>
    </div>
  );
}

// Carte photo épaisse, aux coins arrondis, UV ajustés sur la face avant
function photoCardGeometry(w: number, h: number, depth = 0.06) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, h, 0.14), { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 4 });
  g.center();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
  return g;
}

// ---------- Vitrine produit : la photo en objet 3D qu'on fait tourner au doigt ----------
function PhotoCard({ src, drag }: { src: string; drag: React.MutableRefObject<{ x: number; y: number; active: boolean }> }) {
  const tex = useLoader(THREE.TextureLoader, src);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = useRef<THREE.Group>(null);
  const geo = useMemo(() => photoCardGeometry(2.6, 2.6), []);
  useFrame(({ clock }, dt) => {
    if (!m.current) return;
    const t = clock.getElapsedTime();
    const d = drag.current;
    const ty = d.active ? d.x : Math.sin(t * 0.5) * 0.45;
    const tx = d.active ? d.y : Math.sin(t * 0.7) * 0.1;
    m.current.rotation.y += (ty - m.current.rotation.y) * Math.min(1, dt * 6);
    m.current.rotation.x += (tx - m.current.rotation.x) * Math.min(1, dt * 6);
    m.current.position.y = 0.15 + Math.sin(t * 1.2) * 0.06;
  });
  return (
    <group ref={m}>
      <mesh geometry={geo}>
        <meshPhysicalMaterial map={tex} roughness={0.35} clearcoat={1} clearcoatRoughness={0.08} />
      </mesh>
      {/* Reflet au sol */}
      <mesh position={[0, -1.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.8, 48]} />
        <meshBasicMaterial color="#e3262f" transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

export function ProductViewer({ src }: { src: string }) {
  const drag = useRef({ x: 0, y: 0, active: false });
  return (
    <div
      style={{ position: "absolute", inset: 0, cursor: "grab", touchAction: "pan-y" }}
      onPointerDown={() => (drag.current.active = true)}
      onPointerUp={() => (drag.current.active = false)}
      onPointerLeave={() => (drag.current.active = false)}
      onPointerMove={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (drag.current.active || e.pointerType === "mouse") {
          drag.current.x = ((e.clientX - r.left) / r.width - 0.5) * 2.4;
          drag.current.y = ((e.clientY - r.top) / r.height - 0.5) * 0.9;
          if (e.pointerType === "mouse") drag.current.active = true;
        }
      }}
    >
      <Frame camera={{ position: [0, 0.2, 5.4], fov: 38 }} style={{ position: "absolute", inset: 0 }}>
        <StudioEnv intensity={1} />
        <ambientLight intensity={0.5} />
        <spotLight position={[3, 5, 4]} angle={0.5} penumbra={0.8} intensity={60} />
        <pointLight position={[-3, -1, 2]} intensity={10} color="#ff2a33" />
        <Suspense fallback={null}>
          <PhotoCard src={src} drag={drag} />
        </Suspense>
      </Frame>
    </div>
  );
}

// ---------- Port à conteneurs : les arrivages qui se remplissent ----------
const CONTAINER_COLORS = ["#e3262f", "#16161a", "#f4efe8", "#b51d25", "#2a2a30"];

function containerTexture(color: string) {
  return canvasTexture(256, 128, (c) => {
    c.fillStyle = color;
    c.fillRect(0, 0, 256, 128);
    // Tôle ondulée
    for (let x = 0; x < 256; x += 10) {
      c.fillStyle = "rgba(0,0,0,.18)";
      c.fillRect(x, 0, 4, 128);
      c.fillStyle = "rgba(255,255,255,.07)";
      c.fillRect(x + 5, 0, 2, 128);
    }
    c.fillStyle = color === "#f4efe8" ? "#e3262f" : "rgba(255,255,255,.85)";
    c.font = "800 26px 'Bricolage Grotesque', Inter, sans-serif";
    c.fillText("BABYLONE", 70, 74);
  });
}

function Containers({ progress }: { progress: number }) {
  const mats = useMemo(() => CONTAINER_COLORS.map((c) => new THREE.MeshStandardMaterial({ map: containerTexture(c), roughness: 0.6, metalness: 0.3 })), []);
  const slots = useMemo(() => {
    const out: { p: [number, number, number]; m: number; delay: number }[] = [];
    let i = 0;
    for (let level = 0; level < 3; level++)
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 4; col++) {
          if (level === 2 && (row + col) % 2) continue;
          out.push({ p: [(col - 1.5) * 1.35, 0.32 + level * 0.62, (row - 1) * 0.7], m: (i * 7 + level) % mats.length, delay: i * 0.12 });
          i++;
        }
    return out;
  }, [mats.length]);
  const group = useRef<THREE.Group>(null);
  const shown = Math.max(3, Math.round(slots.length * progress));
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    group.current?.children.forEach((c, i) => {
      const s = slots[i];
      const visible = i < shown;
      // Chaque conteneur descend du ciel à son tour, comme posé par la grue
      const k = visible ? Math.min(1, Math.max(0, (t - s.delay) / 0.9)) : 0;
      const ease = 1 - Math.pow(1 - k, 3);
      c.position.set(s.p[0], s.p[1] + (1 - ease) * 4, s.p[2]);
      c.visible = k > 0;
      c.rotation.y = (1 - ease) * 0.6;
    });
  });
  return (
    <group ref={group}>
      {slots.map((s, i) => (
        <mesh key={i} material={mats[s.m]}>
          <boxGeometry args={[1.25, 0.58, 0.62]} />
        </mesh>
      ))}
    </group>
  );
}

function Crane() {
  const arm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (arm.current) arm.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.4) * 0.6;
  });
  const mat = <meshStandardMaterial color="#e3262f" roughness={0.4} metalness={0.4} />;
  return (
    <group position={[3.6, 0, -0.6]}>
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[0.18, 3.6, 0.18]} />
        {mat}
      </mesh>
      <group ref={arm} position={[0, 3.55, 0]}>
        <mesh position={[-1.4, 0, 0]}>
          <boxGeometry args={[3.4, 0.14, 0.14]} />
          {mat}
        </mesh>
        <mesh position={[-2.6, -0.7, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 1.4]} />
          <meshBasicMaterial color="#888" />
        </mesh>
      </group>
    </group>
  );
}

function Sea() {
  const geo = useMemo(() => new THREE.PlaneGeometry(30, 30, 60, 60), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      p.setZ(i, Math.sin(x * 0.6 + t) * 0.06 + Math.cos(y * 0.5 + t * 0.8) * 0.06);
    }
    p.needsUpdate = true;
  });
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 6]}>
      <meshStandardMaterial color="#0d1418" roughness={0.25} metalness={0.6} />
    </mesh>
  );
}

function OrbitCam() {
  const { camera } = useThree();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.12;
    camera.position.set(Math.sin(t) * 9, 4.6, Math.cos(t) * 9);
    camera.lookAt(0, 0.8, 0);
  });
  return null;
}

export function PortScene({ progress = 0.6, className, style }: { progress?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <Frame camera={{ position: [0, 4.6, 9], fov: 34 }} className={className} style={style}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[-5, 8, 4]} intensity={1.6} />
      <pointLight position={[0, 3, 3]} intensity={10} color="#ff3b40" distance={12} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[8, 4.2]} />
        <meshStandardMaterial color="#1b1b20" roughness={0.9} />
      </mesh>
      <Sea />
      <Containers progress={progress} />
      <Crane />
      <OrbitCam />
    </Frame>
  );
}

// ---------- Scène de live : podium tournant, projecteurs, prix flottant ----------
function priceTex(price: number, label: string) {
  return canvasTexture(512, 192, (c) => {
    c.clearRect(0, 0, 512, 192);
    c.fillStyle = "rgba(10,10,11,.85)";
    c.beginPath();
    (c as any).roundRect(6, 6, 500, 180, 40);
    c.fill();
    c.strokeStyle = "#e3262f";
    c.lineWidth = 6;
    c.stroke();
    c.fillStyle = "#a19d97";
    c.font = "600 30px Inter, sans-serif";
    c.fillText(label, 40, 62);
    c.fillStyle = "#f4f1ec";
    c.font = "800 84px 'Bricolage Grotesque', Inter, sans-serif";
    c.fillText(`${money(price)} F`, 36, 150);
  });
}

function Podium({ src, price, label, pulse }: { src: string; price: number; label: string; pulse: number }) {
  const tex = useLoader(THREE.TextureLoader, src);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = useMemo(() => photoCardGeometry(2, 2, 0.05), []);
  const card = useRef<THREE.Group>(null);
  const tag = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const tagTex = useMemo(() => priceTex(price, label), [price, label]);
  const bump = useRef(0);
  useEffect(() => {
    bump.current = 1;
  }, [pulse]);
  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime();
    bump.current = Math.max(0, bump.current - dt * 1.5);
    if (card.current) {
      card.current.rotation.y = t * 0.6;
      card.current.position.y = 1.55 + Math.sin(t * 1.4) * 0.05;
    }
    if (tag.current) {
      tag.current.scale.setScalar(1 + bump.current * 0.35);
      tag.current.position.y = 3.05 + Math.sin(t * 2) * 0.04;
    }
    if (ring.current) {
      const k = 1 - bump.current;
      ring.current.scale.setScalar(0.5 + k * 3);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = bump.current * 0.8;
    }
  });
  return (
    <>
      <group ref={card}>
        <mesh geometry={geo}>
          <meshPhysicalMaterial map={tex} roughness={0.35} clearcoat={1} />
        </mesh>
      </group>
      <mesh ref={tag} position={[0, 3.05, 0.4]}>
        <planeGeometry args={[2.2, 0.82]} />
        <meshBasicMaterial map={tagTex} transparent toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1, 64]} />
        <meshBasicMaterial color="#ff4b4f" transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  );
}

function SpotCone({ x, color }: { x: number; color: string }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (m.current) m.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.7 + x) * 0.25 + (x > 0 ? 0.35 : -0.35);
  });
  return (
    <mesh ref={m} position={[x, 3.4, -0.5]}>
      <coneGeometry args={[1.1, 4.4, 32, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={0.09} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function LookAt({ y }: { y: number }) {
  const { camera } = useThree();
  useEffect(() => camera.lookAt(0, y, 0), [camera, y]);
  return null;
}

export function LiveStage({ src, price, label, pulse }: { src: string; price: number; label: string; pulse: number }) {
  return (
    <Frame camera={{ position: [0, 2.4, 7.2], fov: 40 }} style={{ position: "absolute", inset: 0 }}>
      <LookAt y={1.7} />
      <StudioEnv intensity={0.6} />
      <ambientLight intensity={0.4} />
      <spotLight position={[0, 6, 3]} angle={0.45} penumbra={0.6} intensity={80} />
      <pointLight position={[0, 1, 2]} intensity={12} color="#ff2a33" />
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[1.6, 1.8, 0.4, 64]} />
        <meshPhysicalMaterial color="#141416" roughness={0.3} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.45, 1.55, 64]} />
        <meshBasicMaterial color="#e3262f" toneMapped={false} />
      </mesh>
      <SpotCone x={-2.2} color="#ff3b40" />
      <SpotCone x={2.2} color="#ffd5d6" />
      <Suspense fallback={null}>
        <Podium src={src} price={price} label={label} pulse={pulse} />
      </Suspense>
    </Frame>
  );
}

// ---------- Cadeau de victoire : la boîte s'ouvre et libère des confettis ----------
function Gift() {
  const lid = useRef<THREE.Group>(null);
  const box = useRef<THREE.Group>(null);
  const conf = useRef<THREE.InstancedMesh>(null);
  const N = 120;
  const seeds = useMemo(() => Array.from({ length: N }, () => [Math.random() - 0.5, Math.random(), Math.random() - 0.5, Math.random() * 6]), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => {
    const c = new Float32Array(N * 3);
    const pal = [new THREE.Color("#e3262f"), new THREE.Color("#f4efe8"), new THREE.Color("#ffb020")];
    for (let i = 0; i < N; i++) pal[i % 3].toArray(c, i * 3);
    return c;
  }, []);
  useEffect(() => {
    conf.current?.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colors, 3));
  }, [colors]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const open = Math.min(1, Math.max(0, (t - 0.8) / 0.6));
    if (lid.current) {
      lid.current.position.y = 1.05 + open * 1.2;
      lid.current.rotation.z = open * 0.8;
      lid.current.rotation.x = open * -0.4;
    }
    if (box.current) box.current.rotation.y = t * 0.35;
    if (conf.current) {
      const ct = Math.max(0, t - 1);
      seeds.forEach(([x, y, z, r], i) => {
        const k = ct * (0.8 + y);
        dummy.position.set(x * k * 2.4, 1 + k * 2.6 - k * k * 0.9, z * k * 2.4);
        dummy.rotation.set(r + ct * 3, r * 2 + ct * 2, 0);
        dummy.scale.setScalar(ct > 0 && dummy.position.y > -1 ? 1 : 0);
        dummy.updateMatrix();
        conf.current!.setMatrixAt(i, dummy.matrix);
      });
      conf.current.instanceMatrix.needsUpdate = true;
    }
  });
  const red = <meshPhysicalMaterial color="#e3262f" roughness={0.3} clearcoat={1} />;
  const ribbon = <meshStandardMaterial color="#f4efe8" roughness={0.4} />;
  return (
    <group position={[0, -0.6, 0]}>
      <group ref={box}>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1.6, 1, 1.6]} />
          {red}
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.24, 1.02, 1.62]} />
          {ribbon}
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1.62, 1.02, 0.24]} />
          {ribbon}
        </mesh>
      </group>
      <group ref={lid} position={[0, 1.05, 0]}>
        <mesh>
          <boxGeometry args={[1.75, 0.22, 1.75]} />
          {red}
        </mesh>
        <mesh position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.28, 0.08, 12, 32]} />
          {ribbon}
        </mesh>
      </group>
      <instancedMesh ref={conf} args={[undefined, undefined, N]}>
        <boxGeometry args={[0.08, 0.12, 0.01]} />
        <meshBasicMaterial vertexColors toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export function GiftScene({ style }: { style?: React.CSSProperties }) {
  return (
    <Frame camera={{ position: [0, 1.4, 5.2], fov: 40 }} style={style}>
      <StudioEnv intensity={0.8} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 3]} intensity={1.5} />
      <Gift />
    </Frame>
  );
}
