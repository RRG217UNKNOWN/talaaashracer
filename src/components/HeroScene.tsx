import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Text, Stars, useTexture } from "@react-three/drei";
import talaashLogo from "@/assets/talaash-logo.png.asset.json";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import * as THREE from "three";

const NAVY = "#0a1230";
const NEON = "#6fb4ff";
const NEON_SOFT = "#a9d4ff";
const VIOLET = "#9a6bff";
const SKY = "#79c2f2";

// Spacing reduced ~21% from 70 -> 55 (still wide enough that no two
// billboards are simultaneously readable in frame).
const BILLBOARD_SPACING = 55; // equal travel-distance interval between billboards
const BILLBOARD_START_Z = -70;
const BILLBOARD_DATA: { side: "L" | "R" | "C"; line1: string; line2?: string; finale?: boolean }[] = [
  { side: "L", line1: "12,000+", line2: "STUDENTS" },
  { side: "R", line1: "10,000+", line2: "PARTICIPANTS" },
  { side: "L", line1: "27 YEARS", line2: "RUNNING" },
  { side: "R", line1: "LIVE CONCERTS", line2: "& HEADLINERS" },
  { side: "C", line1: "TALAASH", line2: "12 · 13 · 14 DECEMBER 2026", finale: true },
];
const BILLBOARDS = BILLBOARD_DATA.map((b, i) => ({
  ...b,
  z: BILLBOARD_START_Z - i * BILLBOARD_SPACING,
}));

const FINAL_Z = BILLBOARDS[BILLBOARDS.length - 1].z + 7;
const TOTAL_LENGTH = Math.abs(FINAL_Z) + 80;
const FLIGHT_DURATION = 26; // seconds

// --- Jump ramp (between last stat billboard and the finale board) ---
const RAMP_Z = FINAL_Z + 41; // takeoff point
const RAMP_LEN = 6;
const LAND_Z = FINAL_Z + 31; // fixed landing point, independent of speed
const SETTLE_LEN = 6; // suspension settle distance after landing
const JUMP_HEIGHT = 1.15;

/** Vertical offset of bike/camera for the ramp hop + landing settle. */
function jumpOffset(z: number) {
  if (z <= RAMP_Z && z >= LAND_Z) {
    const t = (RAMP_Z - z) / (RAMP_Z - LAND_Z);
    return Math.sin(Math.PI * t) * JUMP_HEIGHT;
  }
  if (z < LAND_Z && z > LAND_Z - SETTLE_LEN) {
    const u = (LAND_Z - z) / SETTLE_LEN; // 0..1
    return -0.22 * Math.exp(-u * 4.5) * Math.cos(u * 14);
  }
  return 0;
}

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

// Buildings live strictly beyond the barrier (|x|≈6.6) and lamp (|x|≈8) line.
const BUILDING_MIN_CLEAR = 20;
// Depth rows: nearest row is the most saturated / shortest-capped.
const BUILDING_ROWS = [
  { offset: 0, spread: 0, tint: 0.0, cap: 16 },
  { offset: 10, spread: -22, tint: 0.45, cap: 24 },
  { offset: 22, spread: -46, tint: 0.8, cap: 32 },
];

function Skyline({
  zBase,
  seed,
  intensity = 1,
}: {
  zBase: number;
  seed: number;
  /** 0 = early ride (short, sparse) -> 1 = deep city (tall, dense) */
  intensity?: number;
}) {
  const { buildings, windows } = useMemo(() => {
    const rng = (n: number) => {
      const x = Math.sin(n * 9999 + seed * 131) * 43758.5453;
      return x - Math.floor(x);
    };
    const arr: {
      x: number;
      z: number;
      h: number;
      w: number;
      d: number;
      color: string;
      row: number;
    }[] = [];
    const wins: { p: [number, number, number]; b: number }[] = [];

    BUILDING_ROWS.forEach((row, r) => {
      const count = Math.round((10 + r * 4) * (0.45 + intensity * 0.55));
      for (let i = 0; i < count; i++) {
        const k = r * 100 + i;
        const w = 2.5 + rng(k + 200) * 2.2;
        const d = 3 + rng(k + 300) * 3;
        const side = i % 2 === 0 ? -1 : 1;
        const lane = Math.floor(i / 2);
        const x =
          side * (BUILDING_MIN_CLEAR + row.offset + w / 2 + lane * 4.5 + rng(k) * 2.5);
        const h = Math.min(row.cap, (5 + rng(k + 100) * 20) * (0.55 + intensity * 0.65));
        const z = row.spread - rng(k + 400) * 16;
        // light sky-blue <-> deep navy silhouettes, desaturated with depth
        const mix = rng(k + 500);
        const near = new THREE.Color(mix > 0.5 ? SKY : "#12235c");
        const far = new THREE.Color("#070c22");
        near.lerp(far, 0.55 + row.tint * 0.4);
        arr.push({ x, z, h, w, d, color: "#" + near.getHexString(), row: r });

        // Window glow — only on the nearest two rows (far row reads as silhouette)
        if (r < 2) {
          const cols = 2 + Math.floor(rng(k + 600) * 2);
          const rows = Math.max(2, Math.floor(h / 3));
          for (let c = 0; c < cols; c++) {
            for (let ry = 0; ry < rows; ry++) {
              if (rng(k * 31 + c * 7 + ry * 3) < 0.45) continue;
              const wx = x - side * (w / 2 + 0.03) * -1;
              wins.push({
                p: [
                  x + (c / Math.max(1, cols - 1) - 0.5) * (w * 0.6),
                  1.5 + ry * (h / rows) * 0.9,
                  z + d / 2 + 0.06,
                ],
                b: 0.5 + rng(k + ry * 13 + c) * 0.9,
              });
              void wx;
            }
          }
        }
      }
    });
    return { buildings: arr, windows: wins };
  }, [seed, intensity]);

  const winRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = winRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    windows.forEach((w, i) => {
      dummy.position.set(w.p[0], w.p[1], w.p[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.set(VIOLET).multiplyScalar(w.b);
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [windows]);

  return (
    <group position={[0, 0, zBase]}>
      {buildings.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial
            color={b.color}
            emissive={SKY}
            emissiveIntensity={0.03 + (2 - b.row) * 0.015}
          />
        </mesh>
      ))}
      {windows.length > 0 && (
        <instancedMesh
          ref={winRef}
          args={[undefined as never, undefined as never, windows.length]}
        >
          <boxGeometry args={[0.22, 0.34, 0.04]} />
          <meshBasicMaterial color={VIOLET} toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  );
}

function Ramp() {
  return (
    <group position={[0, 0, RAMP_Z]}>
      {/* wedge approach */}
      <mesh position={[0, 0.35, RAMP_LEN / 2]} rotation={[-0.22, 0, 0]}>
        <boxGeometry args={[7, 0.25, RAMP_LEN]} />
        <meshStandardMaterial color="#0d1836" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* lip glow */}
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[7.1, 0.07, 0.35]} />
        <meshBasicMaterial color={NEON} toneMapped={false} />
      </mesh>
      {[-3.5, 3.5].map((x) => (
        <mesh key={x} position={[x, 0.4, RAMP_LEN / 2]}>
          <boxGeometry args={[0.12, 0.8, RAMP_LEN]} />
          <meshStandardMaterial color="#0a1230" emissive={SKY} emissiveIntensity={0.5} />
        </mesh>
      ))}
      {/* landing marker strip */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.007, LAND_Z - RAMP_Z]}
      >
        <planeGeometry args={[7, 0.5]} />
        <meshBasicMaterial color={NEON_SOFT} toneMapped={false} transparent opacity={0.5} />
      </mesh>
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
    const scale = (0.6 + approach * 0.4) * 1.15;
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
  const logoTex = useTexture(talaashLogo.url);
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
  const hairRef = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const bikeZ = cameraZRef.current - 4.5;
    groupRef.current.position.z = bikeZ;
    const hop = jumpOffset(bikeZ);
    groupRef.current.position.y = hop;
    // slight nose-up on the way up, nose-down on descent
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      hop > 0.02 ? (bikeZ > (RAMP_Z + LAND_Z) / 2 ? -0.12 : 0.08) : 0,
      Math.min(1, delta * 5),
    );

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

    // Hair sway — each strand gets a phase-offset sine tied to speed
    if (hairRef.current) {
      const wind = 0.15 + speedNorm * 0.9; // stronger streaming at speed
      hairRef.current.children.forEach((strand, i) => {
        const phase = i * 0.6;
        const sway = Math.sin(t * (6 + i * 0.3) + phase) * 0.08 * wind;
        // base rotation stored in userData
        const base = (strand as any).userData.baseRot as
          | { x: number; y: number; z: number }
          | undefined;
        if (base) {
          strand.rotation.x = base.x + sway * 0.4;
          strand.rotation.z = base.z + sway;
          // Pull strands backward as speed rises (wind-blown streaming)
          strand.rotation.x = base.x + wind * 0.35 + sway * 0.3;
        }
      });
    }

    // Wheel rotation tied to actual velocity (units/sec)
    const dr = (speedRef.current / 0.45) * delta;
    if (frontWheelRef.current) frontWheelRef.current.rotation.x -= dr;
    if (rearWheelRef.current) rearWheelRef.current.rotation.x -= dr;
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



        {/* Rider — long-haired, leather jacket, viewed from behind */}
        <group ref={riderRef} position={[0, 1.1, 0.25]}>
          {/* Torso — dark leather jacket base */}
          <mesh position={[0, 0.3, 0]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.58, 0.78, 0.42]} />
            <meshStandardMaterial color="#1a0f08" metalness={0.35} roughness={0.55} />
          </mesh>
          {/* Center-back seam (visible from rear camera) */}
          <mesh position={[0, 0.32, 0.22]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.025, 0.72, 0.02]} />
            <meshStandardMaterial color="#0a0604" roughness={0.5} />
          </mesh>
          {/* Shoulder panels — lighter leather highlight along the shoulder curves */}
          {[-1, 1].map((s) => (
            <mesh
              key={"shpanel" + s}
              position={[s * 0.2, 0.58, 0.02]}
              rotation={[0.15, 0, s * -0.15]}
            >
              <boxGeometry args={[0.24, 0.14, 0.36]} />
              <meshStandardMaterial color="#3a2416" metalness={0.4} roughness={0.35} />
            </mesh>
          ))}
          {/* Shoulder-to-sleeve seam ridges */}
          {[-1, 1].map((s) => (
            <mesh
              key={"shseam" + s}
              position={[s * 0.31, 0.5, 0]}
              rotation={[0.25, 0, s * -0.35]}
            >
              <boxGeometry args={[0.02, 0.28, 0.42]} />
              <meshStandardMaterial color="#0a0604" roughness={0.5} />
            </mesh>
          ))}
          {/* Arms — leather sleeves reaching down/forward to clip-ons */}
          <mesh position={[0.24, 0.32, -0.35]} rotation={[-0.85, 0.15, -0.1]}>
            <boxGeometry args={[0.15, 0.15, 0.72]} />
            <meshStandardMaterial color="#1a0f08" metalness={0.35} roughness={0.55} />
          </mesh>
          <mesh position={[-0.24, 0.32, -0.35]} rotation={[-0.85, -0.15, 0.1]}>
            <boxGeometry args={[0.15, 0.15, 0.72]} />
            <meshStandardMaterial color="#1a0f08" metalness={0.35} roughness={0.55} />
          </mesh>
          {/* Elbow bump highlight */}
          {[-1, 1].map((s) => (
            <mesh key={"elb" + s} position={[s * 0.28, 0.42, -0.22]}>
              <sphereGeometry args={[0.09, 10, 10]} />
              <meshStandardMaterial color="#2a1810" metalness={0.4} roughness={0.5} />
            </mesh>
          ))}

          {/* Head — visible skin tone, tilted slightly forward */}
          <mesh position={[0, 0.86, -0.02]} rotation={[0.15, 0, 0]}>
            <sphereGeometry args={[0.19, 16, 16]} />
            <meshStandardMaterial color="#d9b18a" roughness={0.75} />
          </mesh>

          {/* Hair — back cap covering top/back of head */}
          <mesh position={[0, 0.9, 0.05]} rotation={[0.2, 0, 0]}>
            <sphereGeometry args={[0.22, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.65]} />
            <meshStandardMaterial color="#241611" roughness={0.85} />
          </mesh>

          {/* Long hair strands — several overlapping, varying length, wind-blown */}
          <group ref={hairRef} position={[0, 0.78, 0.12]}>
            {[
              { x: 0, z: 0, len: 0.85, w: 0.28, rotZ: 0, rotX: 0.15 },
              { x: -0.11, z: 0.02, len: 0.72, w: 0.18, rotZ: 0.25, rotX: 0.1 },
              { x: 0.11, z: 0.02, len: 0.72, w: 0.18, rotZ: -0.25, rotX: 0.1 },
              { x: -0.18, z: 0.05, len: 0.55, w: 0.14, rotZ: 0.5, rotX: 0.05 },
              { x: 0.18, z: 0.05, len: 0.55, w: 0.14, rotZ: -0.5, rotX: 0.05 },
              { x: -0.05, z: -0.05, len: 0.78, w: 0.2, rotZ: 0.08, rotX: 0.2 },
              { x: 0.05, z: -0.05, len: 0.78, w: 0.2, rotZ: -0.08, rotX: 0.2 },
            ].map((s, i) => (
              <mesh
                key={"hair" + i}
                position={[s.x, -s.len / 2, s.z]}
                rotation={[s.rotX, 0, s.rotZ]}
                userData={{ baseRot: { x: s.rotX, y: 0, z: s.rotZ } }}
              >
                <boxGeometry args={[s.w, s.len, 0.05]} />
                <meshStandardMaterial color="#1a0f0a" roughness={0.9} />
              </mesh>
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
const AUTO_LOCK_Z = FINAL_Z + 16; // once camera passes this z, take over

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

    const hopCam = jumpOffset(z - 4.5) * 0.7;
    camera.position.set(bobX, 3.2 + bobY + hopCam, z + 2.2);
    camera.lookAt(bobX * 0.3, 1.6 + bobY * 0.4 + hopCam * 0.6, z - 8);
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

      <Skyline zBase={-70} seed={1} intensity={0.2} />
      <Skyline zBase={-150} seed={2} intensity={0.45} />
      <Skyline zBase={-230} seed={3} intensity={0.75} />
      <Skyline zBase={-310} seed={4} intensity={1} />

      <Ramp />

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

function TouchJoystick({
  onEngage,
  onRelease,
  disabled,
}: {
  onEngage: () => void;
  onRelease: () => void;
  disabled: boolean;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeIdRef = useRef<number | null>(null);
  const engagedRef = useRef(false);
  const RADIUS = 52;
  const THRESHOLD = 18;

  const setEngaged = (v: boolean) => {
    if (engagedRef.current === v) return;
    engagedRef.current = v;
    if (v) onEngage();
    else onRelease();
  };

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    // Engage when pushed upward (dy negative) past threshold
    setEngaged(!disabled && dy < -THRESHOLD);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    activeIdRef.current = e.pointerId;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (activeIdRef.current !== e.pointerId) return;
    updateFromPointer(e.clientX, e.clientY);
  };
  const endPointer = (e: React.PointerEvent) => {
    if (activeIdRef.current !== e.pointerId) return;
    activeIdRef.current = null;
    setKnob({ x: 0, y: 0 });
    setEngaged(false);
  };

  useEffect(() => {
    if (disabled && engagedRef.current) {
      engagedRef.current = false;
      onRelease();
      setKnob({ x: 0, y: 0 });
    }
  }, [disabled, onRelease]);

  return (
    <div
      className="pointer-events-auto absolute bottom-8 left-8 select-none touch-none"
      style={{ opacity: disabled ? 0.35 : 1, transition: "opacity 400ms" }}
    >
      <div
        ref={baseRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        className="relative flex items-center justify-center rounded-full border border-[#6fb4ff66] bg-[#0a123099] backdrop-blur-sm shadow-[0_0_24px_#6fb4ff33]"
        style={{ width: 140, height: 140 }}
      >
        <div
          className="pointer-events-none absolute text-[10px] tracking-[0.3em] text-[#a9d4ff99]"
          style={{ top: 10 }}
        >
          ↑ RIDE
        </div>
        <div
          className="rounded-full border border-[#6fb4ff] bg-[#0a1230] shadow-[0_0_18px_#6fb4ff80]"
          style={{
            width: 58,
            height: 58,
            transform: `translate(${knob.x}px, ${knob.y}px)`,
            transition: activeIdRef.current === null ? "transform 180ms ease-out" : "none",
          }}
        />
      </div>
    </div>
  );
}

export default function HeroScene() {
  const keyHeldRef = useRef(false);
  const lockedRef = useRef(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

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

  const handleJoystickEngage = () => {
    if (lockedRef.current) return;
    keyHeldRef.current = true;
    if (!hasMoved) setHasMoved(true);
  };
  const handleJoystickRelease = () => {
    keyHeldRef.current = false;
  };

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

      {!isTouch && (
        <div
          className={`pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 transition-opacity duration-700 ${
            hasMoved ? "opacity-0" : "opacity-90"
          }`}
        >
          <div className="flex items-center gap-3 rounded-full border border-[#6fb4ff4d] bg-[#0a123099] px-5 py-2.5 backdrop-blur-sm">
            <kbd className="flex h-8 w-8 items-center justify-center rounded-md border border-[#6fb4ff66] bg-[#0a1230] text-[#a9d4ff] shadow-[0_0_12px_#6fb4ff40]">
              ↑
            </kbd>
            <span className="text-sm tracking-[0.2em] text-[#a9d4ff]">PRESS TO RIDE</span>
          </div>
        </div>
      )}

      {isTouch && (
        <TouchJoystick
          onEngage={handleJoystickEngage}
          onRelease={handleJoystickRelease}
          disabled={false}
        />
      )}
    </div>
  );
}

