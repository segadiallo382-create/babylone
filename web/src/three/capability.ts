import { liteMode } from "../lib/perf";

// Détection WebGL sans charger three.js (garde la 3D hors des chunks qui n'en ont pas besoin)
let glCache: boolean | null = null;
export function webglOK() {
  if (glCache !== null) return glCache;
  try {
    const c = document.createElement("canvas");
    glCache = !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    glCache = false;
  }
  return glCache;
}

export const can3D = () => webglOK() && !liteMode();
