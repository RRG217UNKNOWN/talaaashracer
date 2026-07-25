import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Text, Stars, useTexture } from "@react-three/drei";
import talaashLogo from "@/assets/talaash-logo.png";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import * as THREE from "three";

const NAVY = "#0a1230";
const NEON = "#6fb4ff";
const NEON_SOFT = "#a9d4ff";

// Billboard content, in travel order. Actual world-Z (i.e. distance travelled by the
// bike, since the bike/camera move directly along world Z) is derived below from a
// single fixed interval so every gap — including the one before the finale board —
// is identical regardless of how the content list changes.
const BILLBOARD_CONTENT: { side: "L" | "R" | "C"; line1: string; line2?: string; finale?: boolean }[] = [
  { side: "L", line1: "12,000+", line2: "STUDENTS" },
  { side: "R", line1: "10,000+", line2: "PARTICIPANTS" },
  { side: "L", line1: "27 YEARS", line2: "RUNNING" },
  { side: "L", line1: "MUMBAI'S ONE OF", line2: "THE BIGGEST FEST" },
  { side: "R", line1: "200+ EVENTS", line2: "3 DAYS" },
  { side: "L", line1: "LIVE CONCERTS", line2: "& HEADLINERS" },
  { side: "C", line1: "TALAASH", line2: "12 · 13 · 14 DECEMBER 2026", finale: true },
];

const BILLBOARD_START_Z = -60; // distance to the first billboard
const BILLBOARD_INTERVAL = 60; // fixed travel-distance gap between every billboard, finale included

const BILLBOARDS: { z: number; side: "L" | "R" | "C"; line1: string; line2?: string; finale?: boolean }[] =
  BILLBOARD_CONTENT.map((b, i) => ({ ...b, z: BILLBOARD_START_Z - i * BILLBOARD_INTERVAL }));

const TOTAL_LENGTH = 460;
const FLIGHT_DURATION = 26; // seconds
const FINAL_Z = BILLBOARDS[BILLBOARDS.length - 1].z;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function Road() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, -TOTAL_LENGTH / 2]} receiveShadow>
        <planeGeometry args={[24, TOTAL_LENGTH + 100]} />
        <meshStandardMaterial color="#050813" roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -TOTAL_LENGTH / 2]}>
        <planeGeometry args={[0.18, TOTAL_LENGTH + 100]} />
        <meshBasicMaterial color={NEON} toneMapped={false} />
      </mesh>
      {[-6, 6].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, -TOTAL_LENGTH / 2]}>
          <planeGeometry args={[0.08, TOTAL_LENGTH + 100]} />
          <meshBasicMaterial color={NEON_SOFT} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function DashedLines() {
  const dashes = useMemo(() => {
    const arr: number[] = [];
    for (let z = 10; z > -TOTAL_LENGTH - 20; z -= 6) arr.push(z);
    return arr;
  }, []);
  return (
    <group>
      {dashes.map((z, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-3, 0.006, z]}>
          <planeGeometry args={[0.14, 2.5]} />
          <meshBasicMaterial color="#4a7dc4" toneMapped={false} />
        </mesh>
      ))}
      {dashes.map((z, i) => (
        <mesh key={"r" + i} rotation={[-Math.PI / 2, 0, 0]} position={[3, 0.006, z]}>
          <planeGeometry args={[0.14, 2.5]} />
          <meshBasicMaterial color="#4a7dc4" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function StreetLamp({ position, side }: { position: [number, number, number]; side: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 5, 8]} />
        <meshStandardMaterial color="#1a2340" metalness={0.8} roughness={0.4} />
      </mesh>
      <mesh position={[side * 0.6, 5, 0]} rotation={[0, 0, side * Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 1.2, 6]} />
        <meshStandardMaterial color="#1a2340" metalness={0.8} roughness={0.4} />
      </mesh>
      <mesh position={[side * 1.2, 5, 0]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial color={NEON_SOFT} toneMapped={false} />
      </mesh>
      <pointLight position={[side * 1.2, 4.8, 0]} intensity={4} distance={12} color={NEON_SOFT} />
    </group>
  );
}

function Lamps() {
  const items = useMemo(() => {
    const arr: { pos: [number, number, number]; side: number }[] = [];
    for (let z = 0; z > -TOTAL_LENGTH - 20; z -= 14) {
      arr.push({ pos: [-8, 0, z], side: 1 });
      arr.push({ pos: [8, 0, z], side: -1 });
    }
    return arr;
  }, []);
  return (
    <>
      {items.map((it, i) => (
        <StreetLamp key={i} position={it.pos} side={it.side} />
      ))}
    </>
  );
}

function Barriers() {
  const items = useMemo(() => {
    const arr: [number, number, number][] = [];
    for (let z = 0; z > -TOTAL_LENGTH - 20; z -= 3.5) {
      arr.push([-6.6, 0.3, z]);
      arr.push([6.6, 0.3, z]);
    }
    return arr;
  }, []);
  return (
    <>
      {items.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.15, 0.6, 2.8]} />
          <meshStandardMaterial color="#0f1830" emissive={NEON} emissiveIntensity={0.12} />
        </mesh>
      ))}
    </>
  );
}

// Road surface + barriers sit within |x| <= ~6.6, lamp posts out to |x| = 8. Buildings
// need a much larger, strictly-enforced clearance beyond that so skyline variety (random
// width/offset) can never push a building's nearest edge onto the drivable surface.
// This is intentionally separate from the tighter spawn logic used for lamps/barriers.
const BUILDING_ROAD_CLEARANCE_X = 10; // nearest building edge never comes closer than this
const BUILDING_X_VARIETY = 26; // extra random spread per lane, added beyond the clearance
const BUILDING_LANE_SPACING = 3; // outward step per lane so buildings still layer into a skyline

function Skyline({ zBase, seed }: { zBase: number; seed: number }) {
  const buildings = useMemo(() => {
    const arr: { x: number; h: number; w: number; d: number }[] = [];
    const rng = (n: number) => {
      const x = Math.sin(n * 9999 + seed * 131) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = 0; i < 40; i++) {
      const side = i % 2 === 0 ? -1 : 1; // alternate left/right of the road
      const lane = Math.floor(i / 2);
      const w = 2.5 + rng(i + 200) * 2;
      // Center x is placed so that (clearance + lane spread) measures to the building's
      // NEAREST edge, then w/2 is added back to get the center — the min-clearance
      // guarantee holds regardless of the random width/variety terms.
      const nearEdgeDist = BUILDING_ROAD_CLEARANCE_X + rng(i + 400) * BUILDING_X_VARIETY + lane * BUILDING_LANE_SPACING;
      arr.push({
        x: side * (nearEdgeDist + w / 2),
        h: 6 + rng(i + 100) * 22,
        w,
        d: 3 + rng(i + 300) * 3,
      });
    }
    return arr;
  }, [seed]);

  return (
    <group position={[0, 0, zBase]}>
      {buildings.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, 0]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial
            color="#060a1c"
            emissive={NEON}
            emissiveIntensity={0.04 + ((i * 13) % 7) * 0.01}
          />
        </mesh>
      ))}
    </group>
  );
}

const RIPPLE_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIPPLE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uPhase;
  uniform vec2 uAspect;

  vec3 hue(vec3 a, vec3 b, float t) { return mix(a, b, clamp(t, 0.0, 1.0)); }

  void main() {
    vec2 p = (vUv - 0.5) * uAspect;
    float r = length(p);
    float rings = sin(r * 18.0 - uTime * 2.2 + uPhase) * 0.5 + 0.5;
    rings = pow(rings, 2.2);

    // radial color: warm center -> cool edge
    vec3 hot = vec3(1.0, 0.25, 0.55);   // hot pink
    vec3 amber = vec3(1.0, 0.55, 0.15); // amber
    vec3 purple = vec3(0.55, 0.2, 1.0);
    vec3 cyan = vec3(0.15, 0.9, 1.0);
    float radial = clamp(r / 1.4, 0.0, 1.0);
    vec3 warm = mix(hot, amber, 0.5 + 0.5 * sin(uTime * 0.6 + uPhase));
    vec3 cool = mix(purple, cyan, 0.5 + 0.5 * sin(uTime * 0.5 + uPhase * 1.3));
    vec3 col = mix(warm, cool, radial);

    // background fade tint
    vec3 bg = vec3(0.04, 0.05, 0.14);
    float ringAlpha = rings * (1.0 - radial * 0.55);
    vec3 finalCol = mix(bg, col, 0.55 * ringAlpha + 0.15);

    // subtle outer vignette so text panel reads
    float vign = smoothstep(1.4, 0.3, r);
    finalCol *= 0.55 + 0.45 * vign;

    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

function RippleBackground({ w, h, phase }: { w: number; h: number; phase: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPhase: { value: phase },
      uAspect: { value: new THREE.Vector2(w / Math.min(w, h), h / Math.min(w, h)) },
    }),
    [phase, w, h],
  );
  useFrame(({ clock }) => {
    if (matRef.current) (matRef.current.uniforms.uTime as any).value = clock.getElapsedTime();
  });
  return (
    <mesh position={[0, 0, 0.13]}>
      <planeGeometry args={[w, h]} />
      <shaderMaterial ref={matRef} vertexShader={RIPPLE_VERT} fragmentShader={RIPPLE_FRAG} uniforms={uniforms} toneMapped={false} />
    </mesh>
  );
}

function Billboard({
  z,
  side,
  line1,
  line2,
  finale,
  cameraZRef,
}: {
  z: number;
  side: "L" | "R" | "C";
  line1: string;
  line2?: string;
  finale?: boolean;
  cameraZRef: React.MutableRefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const frameMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const x = side === "L" ? -7.5 : side === "R" ? 7.5 : 0;
  const y = finale ? 4.2 : 4;
  const rotY = side === "L" ? Math.PI / 7 : side === "R" ? -Math.PI / 7 : 0;
  const w = finale ? 10 : 5.5;
  const h = finale ? 6 : 3;
  const phase = useMemo(() => (Math.abs(z) * 0.017) % (Math.PI * 2), [z]);
  const cycleColor = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const dist = cameraZRef.current - z;
    const approach = THREE.MathUtils.clamp(1 - dist / 40, 0, 1);
    const scale = 0.6 + approach * 0.4;
    groupRef.current.scale.setScalar(scale);
    const targetRot = rotY * (1 - approach * 0.4);
    groupRef.current.rotation.y = targetRot;
    if (matRef.current) {
      matRef.current.emissiveIntensity = finale ? 1.6 : 0.7 + approach * 0.6;
      (matRef.current as any).opacity = 0.2 + approach * 0.8;
    }
    if (!finale && frameMatRef.current) {
      // color-cycle magenta -> orange -> cyan -> magenta over ~4.5s
      const t = clock.getElapsedTime() * (2 * Math.PI / 4.5) + phase;
      const r = 0.5 + 0.5 * Math.sin(t);
      const g = 0.5 + 0.5 * Math.sin(t + (2 * Math.PI) / 3);
      const b = 0.5 + 0.5 * Math.sin(t + (4 * Math.PI) / 3);
      cycleColor.setRGB(r, g, b);
      frameMatRef.current.emissive.copy(cycleColor);
      frameMatRef.current.color.copy(cycleColor).multiplyScalar(0.35);
      frameMatRef.current.emissiveIntensity = 1.2 + approach * 1.4;
    }
  });

  return (
    <group ref={groupRef} position={[x, y, z]} rotation={[0, rotY, 0]}>
      {!finale && (
        <>
          <mesh position={[-w / 2 + 0.3, -y / 2, 0]}>
            <boxGeometry args={[0.15, y, 0.15]} />
            <meshStandardMaterial color="#1a2340" />
          </mesh>
          <mesh position={[w / 2 - 0.3, -y / 2, 0]}>
            <boxGeometry args={[0.15, y, 0.15]} />
            <meshStandardMaterial color="#1a2340" />
          </mesh>
        </>
      )}
      {finale && (
        <>
          <mesh position={[0, -y + 0.5, -0.2]}>
            <boxGeometry args={[0.3, 4, 0.3]} />
            <meshStandardMaterial color="#1a2340" />
          </mesh>
          <pointLight position={[0, 0, 3]} intensity={20} distance={20} color={NEON_SOFT} />
        </>
      )}
      <mesh>
        <boxGeometry args={[w + 0.3, h + 0.3, 0.2]} />
        {finale ? (
          <meshStandardMaterial color="#0a1230" />
        ) : (
          <meshStandardMaterial ref={frameMatRef} color="#0a1230" emissive={NEON} emissiveIntensity={1.2} toneMapped={false} />
        )}
      </mesh>
      <mesh position={[0, 0, 0.12]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          ref={matRef}
          color={NAVY}
          emissive={NEON}
          emissiveIntensity={0.7}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </mesh>

      {!finale && <RippleBackground w={w * 0.98} h={h * 0.98} phase={phase} />}

      {finale ? (
        <FinaleContent />
      ) : (
        <>
          {/* readable backing panel behind text */}
          <mesh position={[0, 0.35, 0.18]}>
            <planeGeometry args={[w * 0.9, h * 0.42]} />
            <meshBasicMaterial color="#050718" transparent opacity={0.55} toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.55, 0.18]}>
            <planeGeometry args={[w * 0.75, h * 0.28]} />
            <meshBasicMaterial color="#050718" transparent opacity={0.45} toneMapped={false} />
          </mesh>
          <Text position={[0, 0.4, 0.22]} fontSize={0.9} color="#ffffff" anchorX="center" anchorY="middle">
            {line1}
          </Text>
          {line2 && (
            <Text position={[0, -0.55, 0.22]} fontSize={0.42} color="#ffffff" anchorX="center" anchorY="middle">
              {line2}
            </Text>
          )}
        </>
      )}
    </group>
  );
}


function FinaleContent() {
  const logoTex = useTexture(talaashLogo);
  return (
    <group position={[0, 0, 0.2]}>
      <mesh position={[0, 1.2, 0.02]}>
        <planeGeometry args={[2.4, 2.4]} />
        <meshBasicMaterial map={logoTex} transparent toneMapped={false} />
      </mesh>
      <Text position={[0, -0.8, 0.05]} fontSize={1.15} color="#ffffff" anchorX="center" anchorY="middle" letterSpacing={0.15}>
        TALAASH
      </Text>
      <Text position={[0, -2.0, 0.05]} fontSize={0.5} color={NEON_SOFT} anchorX="center" anchorY="middle" letterSpacing={0.2}>
        12 · 13 · 14 DECEMBER 2026
      </Text>
    </group>
  );
}

// Leather jacket palette — dark brown/black base with a lighter highlight for the
// shoulder curves/seams so it reads as structured leather rather than flat fabric.
const LEATHER_BASE = "#1c130d";
const LEATHER_HIGHLIGHT = "#4a2f1d";
const HAIR_COLORS = ["#150e0a", "#1e140d", "#120c08"];

// Hair strands flowing from the back of the head. `side` fans strands outward
// (0 = center, over the spine; -1/1 = streaming out to the left/right in the wind).
// `spread` is the base outward rotation, `swayMul` scales how much each strand
// responds to speed-driven sway so center strands stay calmer than the outer ones.
const HAIR_STRANDS: { side: number; len: number; spread: number; tiltX: number; swayMul: number }[] = [
  { side: 0, len: 0.58, spread: 0.02, tiltX: 0.32, swayMul: 0.3 },
  { side: 0, len: 0.48, spread: -0.06, tiltX: 0.4, swayMul: 0.3 },
  { side: 0, len: 0.4, spread: 0.08, tiltX: 0.46, swayMul: 0.35 },
  { side: -1, len: 0.52, spread: 0.3, tiltX: 0.22, swayMul: 1 },
  { side: -1, len: 0.4, spread: 0.5, tiltX: 0.15, swayMul: 1.2 },
  { side: -1, len: 0.6, spread: 0.2, tiltX: 0.28, swayMul: 0.8 },
  { side: 1, len: 0.52, spread: 0.3, tiltX: 0.22, swayMul: 1 },
  { side: 1, len: 0.4, spread: 0.5, tiltX: 0.15, swayMul: 1.2 },
  { side: 1, len: 0.6, spread: 0.2, tiltX: 0.28, swayMul: 0.8 },
];

function BikeRider({
  cameraZRef,
  speedRef,
  accelRef,
}: {
  cameraZRef: React.MutableRefObject<number>;
  speedRef: React.MutableRefObject<number>;
  accelRef: React.MutableRefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const frontWheelRef = useRef<THREE.Mesh>(null);
  const rearWheelRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const riderRef = useRef<THREE.Group>(null);
  const hairRefs = useRef<(THREE.Group | null)[]>([]);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const bikeZ = cameraZRef.current - 4.5;
    groupRef.current.position.z = bikeZ;

    const speedNorm = THREE.MathUtils.clamp(speedRef.current / 25, 0, 1);
    const bounce = (Math.sin(t * 14) * 0.03 + Math.sin(t * 7) * 0.02) * speedNorm;
    // accelRef is normalized -1..1 (positive = accelerating forward, negative = braking)
    const a = THREE.MathUtils.clamp(accelRef.current, -1, 1);
    if (bodyRef.current) {
      bodyRef.current.position.y = bounce;
      // Lean forward on accel, lean back on decel
      bodyRef.current.rotation.x = a * 0.12;
    }
    if (riderRef.current) {
      riderRef.current.rotation.x = a * 0.2;
    }

    // Wheel rotation tied to actual velocity (units/sec)
    const dr = (speedRef.current / 0.45) * delta;
    if (frontWheelRef.current) frontWheelRef.current.rotation.x -= dr;
    if (rearWheelRef.current) rearWheelRef.current.rotation.x -= dr;

    // Hair physics: simple per-strand sine sway, amplitude & frequency scale with speed
    // so hair sits calmer at a standstill and streams harder at full speed.
    const swayFreq = 2.1 + speedNorm * 3.2;
    const swayAmp = 0.06 + speedNorm * 0.22;
    hairRefs.current.forEach((g, i) => {
      if (!g) return;
      const strand = HAIR_STRANDS[i];
      const base = strand.side * strand.spread;
      const wave = Math.sin(t * swayFreq + i * 0.9) * swayAmp * strand.swayMul;
      g.rotation.z = base + (strand.side === 0 ? wave * 0.4 : wave * strand.side);
      g.rotation.x = strand.tiltX + Math.sin(t * swayFreq * 0.6 + i) * 0.03 * speedNorm;
    });
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]}>
        <planeGeometry args={[1.6, 3.2]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.45} depthWrite={false} />
      </mesh>

      <group ref={bodyRef}>
        {/* === SUPERSPORT BIKE (blue/black/yellow) === */}
        {/* Color refs */}
        {/* BLUE #1f5cff, DARK BLUE #0b2a8a, BLACK #0a0d18, YELLOW #f5c033, GOLD #c9922b */}

        {/* Engine block (exposed, dark gunmetal) */}
        <mesh position={[0, 0.6, -0.05]}>
          <boxGeometry args={[0.5, 0.42, 0.55]} />
          <meshStandardMaterial color="#141821" metalness={0.85} roughness={0.35} />
        </mesh>
        {/* Cylinder head hint */}
        <mesh position={[0, 0.78, -0.15]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.14, 0.14, 0.44, 12]} />
          <meshStandardMaterial color="#1a1f2c" metalness={0.9} roughness={0.3} />
        </mesh>
        {/* Belly pan / lower fairing (BLACK) */}
        <mesh position={[0, 0.38, 0]}>
          <boxGeometry args={[0.56, 0.28, 1.15]} />
          <meshStandardMaterial color="#0a0d18" metalness={0.6} roughness={0.45} />
        </mesh>
        {/* Yellow accent panel on belly */}
        <mesh position={[0, 0.3, 0.35]}>
          <boxGeometry args={[0.58, 0.14, 0.28]} />
          <meshStandardMaterial color="#f5c033" emissive="#f5c033" emissiveIntensity={0.25} metalness={0.5} roughness={0.4} />
        </mesh>

        {/* Side fairings (BLUE) — left/right */}
        {[-1, 1].map((s) => (
          <mesh key={"fair" + s} position={[s * 0.32, 0.72, -0.25]} rotation={[0, 0, s * -0.08]}>
            <boxGeometry args={[0.12, 0.6, 0.9]} />
            <meshStandardMaterial color="#1f5cff" emissive="#1f5cff" emissiveIntensity={0.35} metalness={0.7} roughness={0.25} />
          </mesh>
        ))}
        {/* Front nose fairing (BLUE, tapered) */}
        <mesh position={[0, 0.95, -0.85]} rotation={[0.35, 0, 0]}>
          <coneGeometry args={[0.34, 0.7, 4]} />
          <meshStandardMaterial color="#1f5cff" emissive="#1f5cff" emissiveIntensity={0.4} metalness={0.75} roughness={0.22} />
        </mesh>
        {/* Nose black inner panel */}
        <mesh position={[0, 0.82, -0.98]} rotation={[0.35, 0, 0]}>
          <boxGeometry args={[0.34, 0.22, 0.14]} />
          <meshStandardMaterial color="#0a0d18" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Windscreen (raked, translucent blue) */}
        <mesh position={[0, 1.15, -0.7]} rotation={[-0.45, 0, 0]}>
          <boxGeometry args={[0.38, 0.32, 0.03]} />
          <meshStandardMaterial color="#3a7bff" emissive="#3a7bff" emissiveIntensity={0.6} transparent opacity={0.55} metalness={0.9} roughness={0.05} />
        </mesh>

        {/* Fuel tank (BLUE, sculpted) */}
        <mesh position={[0, 1.02, -0.15]} rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[0.44, 0.28, 0.7]} />
          <meshStandardMaterial color="#1f5cff" emissive="#1f5cff" emissiveIntensity={0.4} metalness={0.85} roughness={0.15} />
        </mesh>
        {/* Tank dark blue underline */}
        <mesh position={[0, 0.88, -0.15]}>
          <boxGeometry args={[0.46, 0.06, 0.72]} />
          <meshStandardMaterial color="#0b2a8a" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Seat (BLACK, low) */}
        <mesh position={[0, 1.02, 0.35]}>
          <boxGeometry args={[0.32, 0.08, 0.42]} />
          <meshStandardMaterial color="#050810" roughness={0.9} />
        </mesh>
        {/* Tail section (BLUE, upswept, short) */}
        <mesh position={[0, 1.08, 0.72]} rotation={[0.25, 0, 0]}>
          <boxGeometry args={[0.3, 0.22, 0.5]} />
          <meshStandardMaterial color="#1f5cff" emissive="#1f5cff" emissiveIntensity={0.35} metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Tail black underside */}
        <mesh position={[0, 0.94, 0.78]} rotation={[0.25, 0, 0]}>
          <boxGeometry args={[0.28, 0.1, 0.4]} />
          <meshStandardMaterial color="#0a0d18" />
        </mesh>
        {/* Tail light */}
        <mesh position={[0, 1.02, 0.98]} rotation={[0.25, 0, 0]}>
          <boxGeometry args={[0.22, 0.05, 0.04]} />
          <meshBasicMaterial color="#ff3344" toneMapped={false} />
        </mesh>

        {/* Subframe trellis (BLACK bars from seat to rear) */}
        {[-1, 1].map((s) => (
          <mesh key={"sub" + s} position={[s * 0.11, 0.85, 0.55]} rotation={[-0.35, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.55, 6]} />
            <meshStandardMaterial color="#0a0d18" metalness={0.85} roughness={0.3} />
          </mesh>
        ))}

        {/* Swingarm to rear wheel */}
        <mesh position={[0, 0.45, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.5, 0.08, 0.08]} />
          <meshStandardMaterial color="#0a0d18" metalness={0.85} roughness={0.35} />
        </mesh>

        {/* Front forks — dual telescopic with gold band */}
        {[-1, 1].map((s) => (
          <group key={"fork" + s} position={[s * 0.13, 0, -0.85]}>
            <mesh position={[0, 0.7, 0]} rotation={[Math.PI / 14, 0, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.85, 10]} />
              <meshStandardMaterial color="#0a0d18" metalness={0.9} roughness={0.25} />
            </mesh>
            {/* Gold accent band near top */}
            <mesh position={[0, 1.02, -0.03]} rotation={[Math.PI / 14, 0, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.12, 12]} />
              <meshStandardMaterial color="#c9922b" emissive="#c9922b" emissiveIntensity={0.5} metalness={0.95} roughness={0.15} />
            </mesh>
          </group>
        ))}

        {/* Headlight */}
        <mesh position={[0, 0.86, -1.0]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <pointLight position={[0, 0.9, -1.3]} intensity={2.5} distance={10} color={NEON_SOFT} />

        {/* Clip-on handlebars (angled down/forward) */}
        {[-1, 1].map((s) => (
          <mesh key={"clip" + s} position={[s * 0.22, 1.08, -0.55]} rotation={[0.35, s * 0.4, 0]}>
            <cylinderGeometry args={[0.028, 0.028, 0.28, 8]} />
            <meshStandardMaterial color="#0a0d18" metalness={0.9} roughness={0.25} />
          </mesh>
        ))}
        {/* Mirrors */}
        {[-1, 1].map((s) => (
          <group key={"mir" + s} position={[s * 0.3, 1.22, -0.6]}>
            <mesh rotation={[0, 0, s * 0.3]}>
              <cylinderGeometry args={[0.015, 0.015, 0.18, 6]} />
              <meshStandardMaterial color="#0a0d18" metalness={0.9} roughness={0.3} />
            </mesh>
            <mesh position={[s * 0.08, 0.1, 0]}>
              <boxGeometry args={[0.11, 0.07, 0.03]} />
              <meshStandardMaterial color="#1f5cff" metalness={0.85} roughness={0.2} />
            </mesh>
          </group>
        ))}

        {/* WHEELS — blue rims, black tires (axle along X, wheel plane in YZ) */}
        {/* Front */}
        <group position={[0, 0.42, -0.9]}>
          <mesh ref={frontWheelRef} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.42, 0.11, 12, 28]} />
            <meshStandardMaterial color="#05070f" roughness={0.7} />
          </mesh>
          {/* Blue rim */}
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.3, 0.04, 8, 24]} />
            <meshStandardMaterial color="#1f5cff" emissive="#1f5cff" emissiveIntensity={0.6} metalness={0.9} roughness={0.15} />
          </mesh>
          {/* Spokes (3-spoke look) — spin around X axle */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} rotation={[(i * Math.PI) / 3, 0, Math.PI / 2]}>
              <boxGeometry args={[0.6, 0.04, 0.03]} />
              <meshStandardMaterial color="#1f5cff" emissive="#1f5cff" emissiveIntensity={0.4} metalness={0.9} roughness={0.2} />
            </mesh>
          ))}
          {/* Twin brake rotors with gold caliper — on sides of wheel along X */}
          {[-1, 1].map((s) => (
            <group key={"rot" + s} position={[s * 0.13, 0, 0]}>
              <mesh rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[0.22, 0.015, 6, 20]} />
                <meshStandardMaterial color="#cfd4dc" metalness={0.95} roughness={0.2} />
              </mesh>
              <mesh position={[0, 0.22, 0]}>
                <boxGeometry args={[0.06, 0.09, 0.09]} />
                <meshStandardMaterial color="#c9922b" emissive="#c9922b" emissiveIntensity={0.5} metalness={0.95} roughness={0.15} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Rear */}
        <group position={[0, 0.42, 0.85]}>
          <mesh ref={rearWheelRef} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.42, 0.13, 12, 28]} />
            <meshStandardMaterial color="#05070f" roughness={0.7} />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.3, 0.04, 8, 24]} />
            <meshStandardMaterial color="#1f5cff" emissive="#1f5cff" emissiveIntensity={0.6} metalness={0.9} roughness={0.15} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} rotation={[(i * Math.PI) / 3, 0, Math.PI / 2]}>
              <boxGeometry args={[0.6, 0.04, 0.03]} />
              <meshStandardMaterial color="#1f5cff" emissive="#1f5cff" emissiveIntensity={0.4} metalness={0.9} roughness={0.2} />
            </mesh>
          ))}
          {/* Single rear rotor */}
          <group position={[-0.13, 0, 0]}>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.2, 0.015, 6, 20]} />
              <meshStandardMaterial color="#cfd4dc" metalness={0.95} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
              <boxGeometry args={[0.06, 0.09, 0.09]} />
              <meshStandardMaterial color="#c9922b" emissive="#c9922b" emissiveIntensity={0.5} metalness={0.95} roughness={0.15} />
            </mesh>
          </group>
        </group>



        {/* Rider */}
        <group ref={riderRef} position={[0, 1.1, 0.25]}>
          {/* Torso / leather jacket */}
          <mesh position={[0, 0.3, 0]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.55, 0.75, 0.4]} />
            <meshStandardMaterial color={LEATHER_BASE} emissive={NEON} emissiveIntensity={0.08} roughness={0.55} metalness={0.15} />
          </mesh>
          {/* Center-back seam */}
          <mesh position={[0, 0.3, 0.205]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.025, 0.72, 0.015]} />
            <meshStandardMaterial color={LEATHER_HIGHLIGHT} roughness={0.4} metalness={0.2} />
          </mesh>
          {/* Shoulder panel seam lines (diagonal, back-to-shoulder) */}
          <mesh position={[0.16, 0.56, 0.08]} rotation={[0.25, 0, -0.55]}>
            <boxGeometry args={[0.24, 0.02, 0.015]} />
            <meshStandardMaterial color={LEATHER_HIGHLIGHT} roughness={0.35} metalness={0.25} />
          </mesh>
          <mesh position={[-0.16, 0.56, 0.08]} rotation={[0.25, 0, 0.55]}>
            <boxGeometry args={[0.24, 0.02, 0.015]} />
            <meshStandardMaterial color={LEATHER_HIGHLIGHT} roughness={0.35} metalness={0.25} />
          </mesh>
          {/* Shoulder panels with subtle lighter highlight to read as leather */}
          <mesh position={[0.2, 0.62, 0]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.16, 0.13, 0.36]} />
            <meshStandardMaterial color={LEATHER_HIGHLIGHT} roughness={0.35} metalness={0.3} />
          </mesh>
          <mesh position={[-0.2, 0.62, 0]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.16, 0.13, 0.36]} />
            <meshStandardMaterial color={LEATHER_HIGHLIGHT} roughness={0.35} metalness={0.3} />
          </mesh>

          {/* Arms: shoulder -> elbow -> forearm, angled forward/down to the hidden bars
              with elbows kicked outward then bent back in, matching the racing tuck. */}
          {[1, -1].map((side) => (
            <group key={side} position={[side * 0.25, 0.58, -0.05]} rotation={[-0.6, 0, side * 0.22]}>
              {/* Upper arm */}
              <mesh position={[0, -0.17, 0]}>
                <boxGeometry args={[0.14, 0.34, 0.14]} />
                <meshStandardMaterial color={LEATHER_BASE} emissive={NEON} emissiveIntensity={0.06} roughness={0.55} metalness={0.15} />
              </mesh>
              {/* Elbow bend */}
              <group position={[0, -0.34, 0]} rotation={[-0.4, 0, -side * 0.28]}>
                <mesh position={[0, -0.16, -0.02]}>
                  <boxGeometry args={[0.13, 0.32, 0.13]} />
                  <meshStandardMaterial color={LEATHER_BASE} emissive={NEON} emissiveIntensity={0.06} roughness={0.55} metalness={0.15} />
                </mesh>
              </group>
            </group>
          ))}

          {/* Head — no helmet, mostly covered by hair */}
          <mesh position={[0, 0.82, -0.04]}>
            <sphereGeometry args={[0.16, 14, 14]} />
            <meshStandardMaterial color="#8a6046" emissive={NEON_SOFT} emissiveIntensity={0.04} roughness={0.8} />
          </mesh>

          {/* Long wind-blown hair: several overlapping tapered strands of varying length,
              anchored at the back of the head and draping down over the jacket collar. */}
          <group position={[0, 0.88, 0.04]}>
            {HAIR_STRANDS.map((s, i) => (
              <group
                key={i}
                ref={(el) => (hairRefs.current[i] = el)}
                rotation={[s.tiltX, 0, s.side * s.spread]}
              >
                <mesh position={[0, -s.len / 2, 0]}>
                  <cylinderGeometry args={[0.045, 0.012, s.len, 6]} />
                  <meshStandardMaterial color={HAIR_COLORS[i % HAIR_COLORS.length]} roughness={0.65} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

const MAX_SPEED = 26;
const ACCEL = 14; // units/sec² while key held
const RELEASE_DECEL = 9; // units/sec² when key released (coast to stop)
const AUTO_LOCK_Z = FINAL_Z + 22; // once camera passes this z, take over

function CameraRig({
  cameraZRef,
  speedRef,
  accelRef,
  keyHeldRef,
  lockedRef,
  onLock,
}: {
  cameraZRef: React.MutableRefObject<number>;
  speedRef: React.MutableRefObject<number>;
  accelRef: React.MutableRefObject<number>;
  keyHeldRef: React.MutableRefObject<boolean>;
  lockedRef: React.MutableRefObject<boolean>;
  onLock: () => void;
}) {
  const { camera } = useThree();
  const zRef = useRef<number>(8);
  const lockStartZ = useRef<number>(0);
  const lockElapsed = useRef<number>(0);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 1 / 30);
    let z = zRef.current;
    let v = speedRef.current;

    if (!lockedRef.current && z <= AUTO_LOCK_Z) {
      lockedRef.current = true;
      lockStartZ.current = z;
      lockElapsed.current = 0;
      onLock();
    }

    if (lockedRef.current) {
      // Auto ease to FINAL_Z over ~2.4s using cubic ease-out
      lockElapsed.current += dt;
      const t = Math.min(lockElapsed.current / 2.4, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const newZ = THREE.MathUtils.lerp(lockStartZ.current, FINAL_Z, eased);
      v = Math.abs(newZ - z) / Math.max(dt, 1e-4);
      z = newZ;
      // Decel signal for lean
      accelRef.current = THREE.MathUtils.lerp(accelRef.current, -0.6, Math.min(1, dt * 4));
    } else if (keyHeldRef.current) {
      v = Math.min(MAX_SPEED, v + ACCEL * dt);
      z -= v * dt;
      accelRef.current = THREE.MathUtils.lerp(accelRef.current, v / MAX_SPEED, Math.min(1, dt * 3));
    } else {
      v = Math.max(0, v - RELEASE_DECEL * dt);
      z -= v * dt;
      const target = v > 0.05 ? -0.4 : 0;
      accelRef.current = THREE.MathUtils.lerp(accelRef.current, target, Math.min(1, dt * 3));
    }

    zRef.current = z;
    speedRef.current = v;
    cameraZRef.current = z;

    const now = clock.getElapsedTime();
    const speedNorm = THREE.MathUtils.clamp(v / MAX_SPEED, 0, 1);
    const bobY = (Math.sin(now * 1.3) * 0.05 + Math.sin(now * 0.7) * 0.04) * speedNorm;
    const bobX = Math.sin(now * 0.9) * 0.06 * speedNorm;
    const swayRot = Math.sin(now * 0.6) * 0.008 * speedNorm;

    camera.position.set(bobX, 3.2 + bobY, z + 2.2);
    camera.lookAt(bobX * 0.3, 1.6 + bobY * 0.4, z - 8);
    camera.rotation.z = swayRot;
  });

  return null;
}

function Scene({
  keyHeldRef,
  lockedRef,
  onLock,
}: {
  keyHeldRef: React.MutableRefObject<boolean>;
  lockedRef: React.MutableRefObject<boolean>;
  onLock: () => void;
}) {
  const cameraZRef = useRef(8);
  const speedRef = useRef(0);
  const accelRef = useRef(0);
  return (
    <>
      <fog attach="fog" args={["#050817", 25, 120]} />
      <color attach="background" args={["#050817"]} />
      <ambientLight intensity={0.15} color={NEON_SOFT} />
      <directionalLight position={[10, 20, 5]} intensity={0.2} color={NEON} />

      <Stars radius={200} depth={60} count={2000} factor={4} saturation={0} fade speed={0.3} />

      <Road />
      <DashedLines />
      <Lamps />
      <Barriers />

      <Skyline zBase={-200} seed={1} />
      <Skyline zBase={-300} seed={2} />
      <Skyline zBase={-450} seed={3} />

      {BILLBOARDS.map((b, i) => (
        <Billboard key={i} {...b} cameraZRef={cameraZRef} />
      ))}

      <BikeRider cameraZRef={cameraZRef} speedRef={speedRef} accelRef={accelRef} />
      <CameraRig
        cameraZRef={cameraZRef}
        speedRef={speedRef}
        accelRef={accelRef}
        keyHeldRef={keyHeldRef}
        lockedRef={lockedRef}
        onLock={onLock}
      />

      <EffectComposer>
        <Bloom intensity={1.2} luminanceThreshold={0.15} luminanceSmoothing={0.9} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.9} />
      </EffectComposer>
    </>
  );
}

// Detects touch/tablet devices (phones, iPads) so the on-screen joystick only
// ever shows up for them — desktop/mouse users keep using ArrowUp untouched.
function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const touchCapable = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsTouch(coarsePointer || touchCapable);
  }, []);
  return isTouch;
}

const JOYSTICK_MAX_RADIUS = 42; // px the knob can travel from center
const JOYSTICK_FORWARD_THRESHOLD = 14; // px of upward push before it counts as "gas"

// Single-axis virtual joystick: pushing the knob up engages the same "held"
// state the ArrowUp key sets, and it decelerates/coasts exactly like releasing
// the key does. Camera, controls, and movement easing are untouched — this
// only ever writes to keyHeldRef, the same input the keyboard handler uses.
function VirtualJoystick({
  keyHeldRef,
  lockedRef,
  onFirstMove,
}: {
  keyHeldRef: React.MutableRefObject<boolean>;
  lockedRef: React.MutableRefObject<boolean>;
  onFirstMove: () => void;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const centerRef = useRef({ x: 0, y: 0 });
  const activePointerId = useRef<number | null>(null);

  const setKnob = (dx: number, dy: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!draggingRef.current || lockedRef.current) return;
    let dx = clientX - centerRef.current.x;
    let dy = clientY - centerRef.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_MAX_RADIUS) {
      dx = (dx / dist) * JOYSTICK_MAX_RADIUS;
      dy = (dy / dist) * JOYSTICK_MAX_RADIUS;
    }
    setKnob(dx, dy);
    keyHeldRef.current = dy < -JOYSTICK_FORWARD_THRESHOLD;
  };

  const handleEnd = () => {
    draggingRef.current = false;
    activePointerId.current = null;
    keyHeldRef.current = false;
    setKnob(0, 0);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      handleMove(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      handleEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        if (lockedRef.current || !baseRef.current) return;
        e.preventDefault();
        const rect = baseRef.current.getBoundingClientRect();
        centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        draggingRef.current = true;
        activePointerId.current = e.pointerId;
        onFirstMove();
        handleMove(e.clientX, e.clientY);
      }}
      className="pointer-events-auto absolute bottom-8 left-1/2 h-28 w-28 -translate-x-1/2 select-none rounded-full border border-[#6fb4ff66] bg-[#0a123099] backdrop-blur-sm"
      style={{ touchAction: "none" }}
    >
      <div
        ref={knobRef}
        className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a9d4ff] shadow-[0_0_16px_#6fb4ff99] transition-transform duration-75"
      />
    </div>
  );
}

export default function HeroScene() {
  const keyHeldRef = useRef(false);
  const lockedRef = useRef(false);
  const [hasMoved, setHasMoved] = useState(false);
  const isTouch = useIsTouchDevice();

  useEffect(() => {
    const isMoveKey = (e: KeyboardEvent) => e.key === "ArrowUp" || e.code === "ArrowUp";
    const down = (e: KeyboardEvent) => {
      if (!isMoveKey(e) || lockedRef.current) return;
      e.preventDefault();
      keyHeldRef.current = true;
      if (!hasMoved) setHasMoved(true);
    };
    const up = (e: KeyboardEvent) => {
      if (!isMoveKey(e)) return;
      keyHeldRef.current = false;
    };
    const blur = () => {
      keyHeldRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [hasMoved]);

  return (
    <div className="fixed inset-0 h-screen w-screen bg-[#050817]">
      <Canvas
        camera={{ fov: 65, near: 0.1, far: 800, position: [0, 3.2, 10] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <Scene keyHeldRef={keyHeldRef} lockedRef={lockedRef} onLock={() => {}} />
        </Suspense>
      </Canvas>

      <div
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 transition-opacity duration-700 ${
          isTouch ? "bottom-40" : "bottom-10"
        } ${hasMoved ? "opacity-0" : "opacity-90"}`}
      >
        <div className="flex items-center gap-3 rounded-full border border-[#6fb4ff4d] bg-[#0a123099] px-5 py-2.5 backdrop-blur-sm">
          {isTouch ? (
            <span className="text-sm tracking-[0.2em] text-[#a9d4ff]">PUSH JOYSTICK TO RIDE</span>
          ) : (
            <>
              <kbd className="flex h-8 w-8 items-center justify-center rounded-md border border-[#6fb4ff66] bg-[#0a1230] text-[#a9d4ff] shadow-[0_0_12px_#6fb4ff40]">
                ↑
              </kbd>
              <span className="text-sm tracking-[0.2em] text-[#a9d4ff]">PRESS TO RIDE</span>
            </>
          )}
        </div>
      </div>

      {/* Joystick only renders for touch/tablet devices (phones, iPads) — desktop is unaffected */}
      {isTouch && (
        <VirtualJoystick
          keyHeldRef={keyHeldRef}
          lockedRef={lockedRef}
          onFirstMove={() => {
            if (!hasMoved) setHasMoved(true);
          }}
        />
      )}
    </div>
  );
}
