import { Rotate3D, Sparkles } from "lucide-react";
import React, { useEffect, useMemo, useRef } from "react";
import type {
  BufferGeometry,
  Group,
  Line,
  Material,
  Mesh,
  Points,
  Sprite,
  Texture,
  WebGLRenderer,
} from "three";

import type {
  SandboxInteractionMode,
  SandboxScenario,
} from "./agent-sandbox-model";
import { DEFAULT_LANGUAGE, Language } from "../language";

interface AgentSandboxOrbProps {
  scenario: SandboxScenario;
  activeAgentIds?: string[];
  activeStageLabel?: string;
  activeStageTitle?: string;
  progressPercent?: number;
  interactionMode?: SandboxInteractionMode;
  language?: Language;
  compact?: boolean;
}

interface SphereSignal {
  id: string;
  agentId: string;
  label: string;
  glyph: string;
  position: [number, number, number];
  active: boolean;
}

type ThreeModule = typeof import("three");
type OrbitControlsConstructor = typeof import("three/examples/jsm/controls/OrbitControls.js").OrbitControls;
type OrbitControlsInstance = InstanceType<OrbitControlsConstructor>;

const POINT_COUNT = 144;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const ORB_AUTO_SPIN_Y = 0.0022;

export function getOrbAutoMotionStep(): { spinY: number; pitchOscillationAmplitude: number } {
  return {
    spinY: ORB_AUTO_SPIN_Y,
    pitchOscillationAmplitude: 0,
  };
}

const MODE_TONE: Record<SandboxInteractionMode, {
  text: string;
  glow: string;
  border: string;
  active: string;
  hex: number;
  softHex: number;
}> = {
  observe: {
    text: "text-white/76",
    glow: "shadow-[0_0_34px_rgba(255,255,255,0.16)]",
    border: "border-white/18",
    active: "text-white",
    hex: 0xffffff,
    softHex: 0x94a3b8,
  },
  support: {
    text: "text-emerald-100",
    glow: "shadow-[0_0_38px_rgba(110,231,183,0.24)]",
    border: "border-emerald-300/34",
    active: "text-emerald-100",
    hex: 0x6ee7b7,
    softHex: 0x94a3b8,
  },
  challenge: {
    text: "text-rose-100",
    glow: "shadow-[0_0_38px_rgba(251,113,133,0.26)]",
    border: "border-rose-300/38",
    active: "text-rose-100",
    hex: 0xfb7185,
    softHex: 0xfbbf24,
  },
  arbitrate: {
    text: "text-amber-100",
    glow: "shadow-[0_0_38px_rgba(251,191,36,0.25)]",
    border: "border-amber-300/38",
    active: "text-amber-100",
    hex: 0xfbbf24,
    softHex: 0x94a3b8,
  },
  synthesize: {
    text: "text-cyan-100",
    glow: "shadow-[0_0_38px_rgba(103,232,249,0.24)]",
    border: "border-cyan-300/38",
    active: "text-cyan-100",
    hex: 0x67e8f9,
    softHex: 0xa78bfa,
  },
};

const ACCENT_TONE = {
  amber: {
    radial: "from-amber-200/24 via-orange-300/12 to-fuchsia-300/20",
    halo: "bg-[radial-gradient(circle,rgba(251,191,36,0.20),transparent_62%)]",
    hex: 0xfacc15,
    softHex: 0x93c5fd,
  },
  rose: {
    radial: "from-rose-200/24 via-fuchsia-300/12 to-indigo-300/18",
    halo: "bg-[radial-gradient(circle,rgba(251,113,133,0.20),transparent_62%)]",
    hex: 0xfb7185,
    softHex: 0xc4b5fd,
  },
  indigo: {
    radial: "from-indigo-200/22 via-cyan-200/16 to-violet-300/18",
    halo: "bg-[radial-gradient(circle,rgba(103,232,249,0.20),transparent_62%)]",
    hex: 0x67e8f9,
    softHex: 0xa78bfa,
  },
} as const;

function clampPercent(percent: number | undefined): number {
  if (percent === undefined) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function getAgentGlyph(label: string, index: number): string {
  if (index % 5 === 0) return "7";
  const trimmed = label.trim();
  if (!trimmed) return "A";
  return trimmed.length > 8 ? trimmed.slice(0, 1).toUpperCase() : trimmed.slice(0, 2).toUpperCase();
}

function buildSphereSignals(scenario: SandboxScenario, activeAgentIds: string[]): SphereSignal[] {
  const activeIds = new Set(activeAgentIds);

  return Array.from({ length: POINT_COUNT }, (_, index) => {
    const y = 1 - (index / (POINT_COUNT - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = index * GOLDEN_ANGLE;
    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;
    const agent = scenario.agents[index % scenario.agents.length];

    return {
      id: `${scenario.type}-webgl-orb-signal-${index}`,
      agentId: agent.id,
      label: agent.label,
      glyph: getAgentGlyph(agent.label, index),
      position: [x, y, z],
      active: activeIds.has(agent.id),
    };
  });
}

export function getOrbSignalSignature(scenario: SandboxScenario, activeAgentIds: string[]): string {
  const agentSignature = scenario.agents
    .map((agent) => `${agent.id}:${agent.label}`)
    .join(",");
  const activeSignature = Array.from(new Set(activeAgentIds)).sort().join(",");

  return `${scenario.type}|${agentSignature}|${activeSignature}`;
}

function createGlyphTexture(THREE: ThreeModule, glyph: string, color: string, active: boolean): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.025)";
    context.beginPath();
    context.arc(64, 64, active ? 35 : 29, 0, Math.PI * 2);
    context.fill();
    context.shadowColor = color;
    context.shadowBlur = active ? 22 : 10;
    context.fillStyle = color;
    context.font = active ? "900 40px Inter, Arial, sans-serif" : "800 34px Inter, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(glyph, 64, 64);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function disposeObject(object: Group | Mesh | Points | Line | Sprite): void {
  object.traverse((child) => {
    const maybeMesh = child as Mesh | Points | Line | Sprite;
    const geometry = (maybeMesh as Mesh).geometry as BufferGeometry | undefined;
    const material = maybeMesh.material as Material | Material[] | undefined;

    geometry?.dispose();

    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
      return;
    }

    material?.dispose();
  });
}

export default function AgentSandboxOrb({
  scenario,
  activeAgentIds = ["primary"],
  activeStageLabel = scenario.stages[0]?.label ?? "Stage",
  activeStageTitle = scenario.centerLabel,
  progressPercent,
  interactionMode = "observe",
  language = DEFAULT_LANGUAGE,
  compact = false,
}: AgentSandboxOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const signalSignature = getOrbSignalSignature(scenario, activeAgentIds);
  const signals = useMemo(
    () => buildSphereSignals(scenario, activeAgentIds),
    [signalSignature],
  );
  const percent = clampPercent(progressPercent);
  const accent = ACCENT_TONE[scenario.accentName];
  const modeTone = MODE_TONE[interactionMode];
  const isEnglish = language === "en-US";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let disposed = false;
    let animationFrame = 0;
    let controls: OrbitControlsInstance | undefined;
    let renderer: WebGLRenderer | undefined;
    let orbGroup: Group | undefined;
    const textures: Texture[] = [];
    const cleanupCallbacks: Array<() => void> = [];

    async function setupScene() {
      const [{ OrbitControls }, THREE] = await Promise.all([
        import("three/examples/jsm/controls/OrbitControls.js"),
        import("three"),
      ]);

      if (disposed || !canvasRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      camera.position.set(0, 0, compact ? 6.4 : 6.8);

      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas: canvasRef.current,
        powerPreference: "high-performance",
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      rendererRef.current = renderer;

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.rotateSpeed = 0.58;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;

      const ambient = new THREE.AmbientLight(0xffffff, 1.7);
      scene.add(ambient);

      const keyLight = new THREE.PointLight(accent.hex, 24, 9);
      keyLight.position.set(2.6, 2.2, 3.6);
      scene.add(keyLight);

      orbGroup = new THREE.Group();
      scene.add(orbGroup);

      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(2.12, 48, 48),
        new THREE.MeshBasicMaterial({
          color: accent.softHex,
          opacity: 0.035,
          transparent: true,
          depthWrite: false,
        }),
      );
      orbGroup.add(shell);

      const rim = new THREE.Mesh(
        new THREE.SphereGeometry(2.18, 32, 16),
        new THREE.MeshBasicMaterial({
          color: modeTone.hex,
          opacity: 0.052,
          transparent: true,
          wireframe: true,
          depthWrite: false,
        }),
      );
      orbGroup.add(rim);

      const center = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 18, 18),
        new THREE.MeshBasicMaterial({ color: accent.hex }),
      );
      orbGroup.add(center);

      const activeMaterial = new THREE.LineBasicMaterial({
        color: modeTone.hex,
        transparent: true,
        opacity: 0.18,
      });
      const inactiveMaterial = new THREE.LineBasicMaterial({
        color: accent.softHex,
        transparent: true,
        opacity: 0.055,
      });

      signals.forEach((signal, index) => {
        const [x, y, z] = signal.position;
        const color = signal.active ? `#${modeTone.hex.toString(16).padStart(6, "0")}` : `#${accent.hex.toString(16).padStart(6, "0")}`;
        const texture = createGlyphTexture(THREE, signal.glyph, color, signal.active);
        textures.push(texture);

        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: signal.active ? 0.96 : 0.58,
            depthTest: true,
            depthWrite: false,
          }),
        );
        sprite.position.set(x * 2.08, y * 2.08, z * 2.08);
        const scale = signal.active ? 0.28 : 0.2 + (index % 3) * 0.012;
        sprite.scale.set(scale, scale, 1);
        sprite.userData = {
          agentId: signal.agentId,
          active: signal.active,
          label: signal.label,
        };
        orbGroup?.add(sprite);

        if (index % 7 === 0 || signal.active) {
          const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(x * 2.02, y * 2.02, z * 2.02),
          ]);
          const line = new THREE.Line(geometry, signal.active ? activeMaterial : inactiveMaterial);
          orbGroup?.add(line);
        }
      });

      const resize = () => {
        if (!renderer || !canvasRef.current) return;
        const bounds = canvasRef.current.getBoundingClientRect();
        const width = Math.max(1, Math.floor(bounds.width));
        const height = Math.max(1, Math.floor(bounds.height));
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };

      resize();
      window.addEventListener("resize", resize);
      cleanupCallbacks.push(() => window.removeEventListener("resize", resize));

      const autoMotion = getOrbAutoMotionStep();
      const render = () => {
        if (disposed || !renderer || !orbGroup) return;
        orbGroup.rotation.y += autoMotion.spinY;
        controls?.update();
        renderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(render);
      };

      render();
      cleanupCallbacks.push(() => {
        window.cancelAnimationFrame(animationFrame);
        controls?.dispose();
        activeMaterial.dispose();
        inactiveMaterial.dispose();
        textures.forEach((texture) => texture.dispose());
        if (orbGroup) disposeObject(orbGroup);
        renderer?.dispose();
        rendererRef.current = null;
      });
    }

    setupScene();

    return () => {
      disposed = true;
      cleanupCallbacks.forEach((cleanup) => cleanup());
    };
  }, [accent.hex, accent.softHex, compact, modeTone.hex, signals]);

  return (
    <div
      id="agent-sandbox-orb"
      className={`agent-sandbox-orb relative min-h-[22rem] overflow-hidden rounded-3xl border ${modeTone.border} bg-white/[0.045] p-4 ${modeTone.glow} backdrop-blur-xl`}
      data-draggable="true"
      data-renderer="three-webgl"
      data-point-count={POINT_COUNT}
      data-interaction-mode={interactionMode}
      data-orbit-azimuth="unbounded"
      data-orbit-polar="0-180"
      role="img"
      aria-label={isEnglish ? "Draggable Agent signal sphere" : "可拖动旋转的 Agent 信号球"}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className={`absolute inset-0 bg-gradient-to-br ${accent.radial} opacity-80`} />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:34px_34px] opacity-35" />
        <div className={`absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${accent.halo}`} />
      </div>

      <div className="relative z-10 mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/46">
            {isEnglish ? "Agent Orb" : "Agent 信号球"}
          </p>
          <p className="truncate text-sm font-black text-white">{activeStageTitle}</p>
          <p className={`truncate text-[11px] font-bold ${modeTone.text}`}>{activeStageLabel} · {scenario.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl border ${modeTone.border} bg-white/8`}>
            <Rotate3D className={`h-4 w-4 ${modeTone.active}`} aria-hidden="true" />
          </span>
          <span className={`inline-flex min-h-9 items-center rounded-full border ${modeTone.border} bg-black/18 px-3 text-xs font-black ${modeTone.active}`}>
            {percent}%
          </span>
        </div>
      </div>

      <div className="relative z-10 mx-auto aspect-square w-full max-w-[23rem] touch-none cursor-grab overflow-hidden rounded-full active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          className="agent-orb-webgl-canvas h-full w-full"
          data-testid="agent-orb-webgl-canvas"
        />
        <div className="pointer-events-none absolute inset-0 rounded-full border border-white/10 shadow-inner shadow-white/10" />
      </div>

      <div className="relative z-10 mt-3 flex flex-wrap items-center justify-end gap-2">
        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 text-[11px] font-black text-white/48">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {isEnglish ? "true 3D" : "真实 3D"} · {scenario.agents.length} agents · {POINT_COUNT} signals
        </span>
      </div>
    </div>
  );
}
