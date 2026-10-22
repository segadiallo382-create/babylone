import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import regions from "../data/senegal.json";
import { socket } from "../lib/store";
import type { FeedItem } from "../lib/api";
import { canvasTexture, useInView, webglOK } from "./common";
import { CITY_COORDS } from "../data/geo";
import { liteMode } from "../lib/perf";

type Region = { name: string; rings: number[][][] };
const K = Math.cos((14.5 * Math.PI) / 180);
const project = (lon: number, lat: number) => new THREE.Vector2((lon + 14.45) * K, lat - 14.45);

type Props = {
  byRegion: Record<string, number>;
  byCity: Record<string, number>;
  onHover: (r: { name: string; x: number; y: number } | null) => void;
  onPick: (region: string) => void;
};

function Controls() {
  const { camera, gl, size } = useThree();
  const ctl = useRef<OrbitControls>();
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.enablePan = false;
    c.enableZoom = false;
    c.minPolarAngle = 0.25;
    c.maxPolarAngle = 1.2;
    c.rotateSpeed = 0.6;
    c.target.set(0, 0, 0.2);
    // Sur mobile, on recule la caméra pour voir tout le pays
    if (size.width < 700) {
      const cam = camera as THREE.PerspectiveCamera;
      cam.fov = 40;
      cam.updateProjectionMatrix();
      cam.position.set(0, 12.5, 6.5);
    }
    ctl.current = c;
    return () => c.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);
  useFrame(() => ctl.current?.update());
  return null;
}

function RegionMesh({ r, count, max, onHover, onPick }: { r: Region; count: number; max: number; onHover: Props["onHover"]; onPick: Props["onPick"] }) {
  const [hover, setHover] = useState(false);
  const mesh = useRef<THREE.Mesh>(null);
  const height = 0.1 + (count / Math.max(1, max)) * 0.55;
  const { geo, edges } = useMemo(() => {
    const shapes = r.rings.map((ring) => new THREE.Shape(ring.map(([lon, lat]) => project(lon, lat))));
    const g = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 1 });
    const pts: THREE.Vector3[] = [];
    for (const ring of r.rings)
      for (let i = 0; i < ring.length - 1; i++) {
        const a = project(ring[i][0], ring[i][1]);
        const b = project(ring[i + 1][0], ring[i + 1][1]);
        pts.push(new THREE.Vector3(a.x, a.y, 1.002), new THREE.Vector3(b.x, b.y, 1.002));
      }
    return { geo: g, edges: new THREE.BufferGeometry().setFromPoints(pts) };
  }, [r]);
  const heat = count / Math.max(1, max);
  const color = useMemo(() => new THREE.Color("#19191d").lerp(new THREE.Color("#7a1016"), heat * 0.9), [heat]);
  const target = useRef(height);
  target.current = hover ? height + 0.12 : height;
  const grp = useRef<THREE.Group>(null);
  // Les régions « poussent » depuis le sol à l'apparition
  useLayoutEffect(() => {
    if (grp.current) grp.current.scale.z = 0.001;
  }, []);
  useFrame((_, dt) => {
    if (grp.current) grp.current.scale.z += (target.current - grp.current.scale.z) * Math.min(1, dt * 4);
  });
  return (
    <group ref={grp}>
      <mesh
        ref={mesh}
        geometry={geo}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerMove={(e) => onHover({ name: r.name, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
        onPointerOut={() => {
          setHover(false);
          onHover(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onPick(r.name);
        }}
      >
        <meshStandardMaterial color={hover ? "#e3262f" : color} roughness={0.55} metalness={0.15} emissive={hover ? "#e3262f" : "#000"} emissiveIntensity={hover ? 0.35 : 0} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={hover ? "#ffd0d1" : "#ff4b4f"} transparent opacity={hover ? 0.9 : 0.35} />
      </lineSegments>
    </group>
  );
}

function Beam({ city, count, max }: { city: string; count: number; max: number }) {
  const [lon, lat] = CITY_COORDS[city];
  const p = project(lon, lat);
  const h = beamHeight(count, max);
  const top = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (top.current) top.current.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 3 + lon) * 0.18);
  });
  return (
    <group position={[p.x, p.y, 0.05]}>
      <mesh position={[0, 0, h / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.035, h, 12, 1, true]} />
        <meshBasicMaterial color="#ff4b4f" transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={top} position={[0, 0, h]}>
        <sphereGeometry args={[0.07, 20, 20]} />
        <meshBasicMaterial color="#ffd5d6" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, h]}>
        <sphereGeometry args={[0.16, 20, 20]} />
        <meshBasicMaterial color="#ff2a33" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

// Onde à chaque nouvelle offre, à l'endroit de la vente
function Pulses() {
  const pool = useRef<{ mesh: THREE.Mesh; t: number }[]>([]);
  const group = useRef<THREE.Group>(null);
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.9, 1, 64), []);
  useEffect(() => {
    const onBid = (e: FeedItem) => {
      const c = CITY_COORDS[e.city];
      if (!c || !group.current) return;
      const p = project(c[0], c[1]);
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ff4b4f", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(p.x, p.y, 0.75);
      group.current.add(m);
      pool.current.push({ mesh: m, t: 0 });
    };
    socket.on("feed", onBid);
    return () => {
      socket.off("feed", onBid);
    };
  }, [ringGeo]);
  useFrame((_, dt) => {
    pool.current = pool.current.filter((p) => {
      p.t += dt / 1.8;
      const s = 0.05 + p.t * 0.9;
      p.mesh.scale.setScalar(s);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - p.t;
      if (p.t >= 1) {
        group.current?.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  });
  return <group ref={group} />;
}

function Ground() {
  const tex = useMemo(
    () =>
      canvasTexture(1024, 1024, (c) => {
        const g = c.createRadialGradient(512, 512, 0, 512, 512, 512);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = "#000";
        c.fillRect(0, 0, 1024, 1024);
        for (let x = 0; x < 1024; x += 16)
          for (let y = 0; y < 1024; y += 16) {
            const d = Math.hypot(x - 512, y - 512) / 512;
            if (d > 1) continue;
            c.fillStyle = `rgba(255,90,95,${0.35 * (1 - d)})`;
            c.fillRect(x, y, 2, 2);
          }
      }),
    [],
  );
  return (
    <mesh position={[0, 0, -0.01]}>
      <planeGeometry args={[14, 14]} />
      <meshBasicMaterial map={tex} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

const beamHeight = (count: number, max: number) => 0.25 + (count / Math.max(1, max)) * 0.85;

function Labels({ cities, byCity }: { cities: string[]; byCity: Record<string, number> }) {
  const { camera, size } = useThree();
  const els = useRef<HTMLDivElement[]>([]);
  const host = useThree((s) => s.gl.domElement.parentElement);
  useEffect(() => {
    if (!host) return;
    els.current = cities.map((c) => {
      const d = document.createElement("div");
      d.textContent = c;
      Object.assign(d.style, {
        position: "absolute",
        left: "0",
        top: "0",
        pointerEvents: "none",
        font: "600 12px Inter, sans-serif",
        color: "#f4f1ec",
        textShadow: "0 1px 8px #000",
        whiteSpace: "nowrap",
        zIndex: "2",
      });
      host.appendChild(d);
      return d;
    });
    return () => els.current.forEach((d) => d.remove());
  }, [cities, host]);
  const v = useMemo(() => new THREE.Vector3(), []);
  const max = Math.max(1, ...Object.values(byCity));
  useFrame(({ scene }) => {
    const root = scene.getObjectByName("map-root");
    if (!root) return;
    cities.forEach((c, i) => {
      const [lon, lat] = CITY_COORDS[c];
      const p = project(lon, lat);
      v.set(p.x, p.y, 0.05 + beamHeight(byCity[c], max) + 0.12);
      root.localToWorld(v);
      v.project(camera);
      const el = els.current[i];
      if (!el) return;
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width + 10}px, ${((1 - v.y) / 2) * size.height - 8}px)`;
      el.style.opacity = v.z < 1 ? "1" : "0";
    });
  });
  return null;
}

function MapRoot({ byRegion, byCity, onHover, onPick }: Props) {
  const g = useRef<THREE.Group>(null);
  const maxR = Math.max(1, ...Object.values(byRegion));
  const maxC = Math.max(1, ...Object.values(byCity));
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.15) * 0.12;
  });
  const cities = Object.keys(byCity).filter((c) => CITY_COORDS[c]);
  return (
    <>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group ref={g} name="map-root">
          <Ground />
          {(regions as Region[]).map((r) => (
            <RegionMesh key={r.name} r={r} count={byRegion[r.name] || 0} max={maxR} onHover={onHover} onPick={onPick} />
          ))}
          {cities.map((c) => (
            <Beam key={c} city={c} count={byCity[c]} max={maxC} />
          ))}
          <Pulses />
        </group>
      </group>
      <Labels cities={cities} byCity={byCity} />
    </>
  );
}

export function MapScene(props: Props) {
  const [ref, inView] = useInView<HTMLDivElement>();
  if (!webglOK() || liteMode()) return <MapFallback {...props} />;
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <Canvas frameloop={inView ? "always" : "never"} dpr={[1, 1.6]} camera={{ position: [0, 6.8, 6], fov: 34 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[-4, 8, 6]} intensity={1.5} />
        <pointLight position={[0, 3, 0]} intensity={8} color="#ff2a33" distance={9} />
        <MapRoot {...props} />
        <Controls />
      </Canvas>
    </div>
  );
}

// Sans WebGL : carte SVG inclinée en CSS 3D
function MapFallback({ byRegion, onPick, onHover }: Props) {
  const max = Math.max(1, ...Object.values(byRegion));
  const S = 100;
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", perspective: 1100 }}>
      <svg viewBox="-330 -250 660 500" style={{ width: "92%", transform: "rotateX(48deg) rotateZ(-6deg)", filter: "drop-shadow(0 30px 30px rgba(227,38,47,.25))" }}>
        {(regions as Region[]).map((r) => {
          const heat = (byRegion[r.name] || 0) / max;
          return (
            <path
              key={r.name}
              d={r.rings.map((ring) => "M" + ring.map(([lon, lat]) => `${project(lon, lat).x * S},${-project(lon, lat).y * S}`).join("L") + "Z").join("")}
              fill={`rgba(${25 + heat * 190},${25 + heat * 10},${29 + heat * 10},1)`}
              stroke="#ff4b4f"
              strokeOpacity={0.5}
              strokeWidth={1}
              style={{ cursor: "pointer" }}
              onClick={() => onPick(r.name)}
              onMouseMove={(e) => onHover({ name: r.name, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
              onMouseLeave={() => onHover(null)}
            />
          );
        })}
      </svg>
    </div>
  );
}
