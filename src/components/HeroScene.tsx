import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Text, Stars } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState, Suspense, Component, type ReactNode } from "react";
import * as THREE from "three";

// Served as a plain static file from public/ so the URL is host-agnostic and
// never depends on the hashed asset pipeline.
const talaashLogoUrl = "/talaash-logo.png";

/**
 * Non-suspending texture loader. A failed load resolves to `null` instead of
 * throwing, so a missing asset degrades that one mesh rather than tearing down
 * the React tree (and with it the WebGL context).
 */
function useSafeTexture(url: string): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let disposed = false;
    let tex: THREE.Texture | undefined;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (t) => {
        if (disposed) {
          t.dispose();
          return;
        }
        tex = t;
        t.colorSpace = THREE.SRGBColorSpace;
        setTexture(t);
      },
      undefined,
      () => {
        console.warn(`[HeroScene] texture failed to load, continuing without it: ${url}`);
        if (!disposed) setTexture(null);
      },
    );
    return () => {
      disposed = true;
      tex?.dispose();
    };
  }, [url]);

  return texture;
}

const NAVY = "#0a1230";
const NEON = "#6fb4ff";
const NEON_SOFT = "#a9d4ff";
const VIOLET = "#9a6bff";
const SKY = "#79c2f2";

// ---------------------------------------------------------------------------
// BILLBOARD IMAGES — swap these paths to change what each billboard displays.
// Files live in /public, so a path like "/my-image.png" just works.
// ---------------------------------------------------------------------------
const billboard1Image = "/billboard-1.png";
const billboard2Image = "/billboard-2.png";
const billboard3Image = "/billboard-3.png";
const billboard4Image = "/billboard-4.png";
const BILLBOARD_IMAGES = [billboard1Image, billboard2Image, billboard3Image, billboard4Image];

// Where the ride begins (camera/bike rest position).
const RIDE_START_Z = 8;
const BILLBOARD_SPACING = 41.25; // equal travel-distance interval between billboards
// First board sits exactly one interval ahead of the start, so start->1 and
// 1->2 (and every later gap) are identical.
const BILLBOARD_START_Z = RIDE_START_Z - BILLBOARD_SPACING;
const BILLBOARD_DATA: { side: "L" | "R" | "C"; line1: string; line2?: string; finale?: boolean }[] = [
  { side: "L", line1: "12,000+", line2: "STUDENTS" },
  { side: "R", line1: "10,000+", line2: "PARTICIPANTS" },
  { side: "L", line1: "27 YEARS", line2: "RUNNING" },
  { side: "R", line1: "LIVE CONCERTS", line2: "& HEADLINERS" },
  { side: "C", line1: "TALAASH", line2: "12 · 13 · 14 DECEMBER 2026", finale: true },
];
const BILLBOARDS = BILLBOARD_DATA.map((b, i) => ({
  ...b,
  image: b.finale ? undefined : BILLBOARD_IMAGES[i],
  z: BILLBOARD_START_Z - i * BILLBOARD_SPACING,
}));


const FINAL_Z = BILLBOARDS[BILLBOARDS.length - 1].z + 7;
const TOTAL_LENGTH = Math.abs(FINAL_Z) + 80;
const FLIGHT_DURATION = 26; // seconds

// --- Jump ramp (between last stat billboard and the finale board) ---
const RAMP_Z = FINAL_Z + 41; // takeoff point (ramp lip)
const RAMP_LEN = 6;
const RAMP_W = 9;
const RAMP_H = 1.35;
const RAMP_FOOT_Z = RAMP_Z + RAMP_LEN; // where the ramp meets the road
const LAND_Z = FINAL_Z + 31; // fixed landing point, independent of speed
const SETTLE_LEN = 6; // suspension settle distance after landing

/**
 * Single source of truth for the ramp's driving surface.
 * u = 0 at the foot, 1 at the lip. The visual mesh is generated from this
 * exact profile so the bike can never clip through or float above it.
 */
function rampProfile(u: number) {
  const c = Math.min(1, Math.max(0, u));
  return RAMP_H * (0.65 * c * c + 0.35 * c);
}
/** d(height)/d(distance travelled up the ramp). */
function rampSlope(u: number) {
  const c = Math.min(1, Math.max(0, u));
  return (RAMP_H * (1.3 * c + 0.35)) / RAMP_LEN;
}

const LIP_SLOPE = rampSlope(1);
const JUMP_D = RAMP_Z - LAND_Z; // horizontal flight distance
// Projectile: y(s) = H + slope*D*s - K*s^2, chosen so y(1) = 0 at LAND_Z.
const JUMP_K = RAMP_H + LIP_SLOPE * JUMP_D;

/** Vertical offset of bike/camera: ramp surface, jump arc, landing settle. */
function jumpOffset(z: number) {
  if (z <= RAMP_FOOT_Z && z >= RAMP_Z) {
    return rampProfile((RAMP_FOOT_Z - z) / RAMP_LEN);
  }
  if (z < RAMP_Z && z >= LAND_Z) {
    const s = (RAMP_Z - z) / JUMP_D;
    return RAMP_H + LIP_SLOPE * JUMP_D * s - JUMP_K * s * s;
  }
  if (z < LAND_Z && z > LAND_Z - SETTLE_LEN) {
    const u = (LAND_Z - z) / SETTLE_LEN; // 0..1
    return -0.22 * Math.exp(-u * 4.5) * Math.cos(u * 14);
  }
  return 0;
}

/** Bike pitch (rotation.x) that keeps it aligned with the surface/arc. */
function jumpPitch(z: number) {
  if (z <= RAMP_FOOT_Z && z >= RAMP_Z) {
    return -Math.atan(rampSlope((RAMP_FOOT_Z - z) / RAMP_LEN));
  }
  if (z < RAMP_Z && z >= LAND_Z) {
    const s = (RAMP_Z - z) / JUMP_D;
    const slope = LIP_SLOPE - (2 * JUMP_K * s) / JUMP_D;
    // Ease back toward level over the last part of the arc so the bike
    // touches down flat on the road.
    const k = 1 - THREE.MathUtils.smoothstep(s, 0.5, 1);
    return -Math.atan(slope) * k;
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
const BUILDING_MIN_CLEAR = 10.5; // just beyond barriers (6.6) and lamps (8)
// Four streetside depth rows build a dense, layered downtown canyon. The near
// row stays low so rooflines never lean into the centre of frame; each row
// further back is taller, wider-footprinted and coarser, so the city reads as
// continuous depth fading into fog.
const BUILDING_ROWS = [
  { base: BUILDING_MIN_CLEAR, cap: 9, tint: 0.0, step: 0 },
  { base: BUILDING_MIN_CLEAR + 9, cap: 20, tint: 0.35, step: 1 },
  { base: BUILDING_MIN_CLEAR + 22, cap: 34, tint: 0.6, step: 2 },
  { base: BUILDING_MIN_CLEAR + 40, cap: 52, tint: 0.85, step: 3 },
];
// One landmark supertall anchors the skyline in the middle distance.
const LANDMARK_Z = -TOTAL_LENGTH * 0.42;


type Box = { p: [number, number, number]; s: [number, number, number]; c: string };
type Win = { p: [number, number, number]; s: [number, number, number]; c: string };

/** Continuous streetside cityscape of modern glass towers and podiums. */
function Skyline() {
  const { boxes, crowns, litWins, darkWins, mullions } = useMemo(() => {
    const rng = (n: number) => {
      const x = Math.sin(n * 9999 + 131) * 43758.5453;
      return x - Math.floor(x);
    };
    const boxes: Box[] = [];
    const crowns: Box[] = [];
    const litWins: Win[] = [];
    const darkWins: Win[] = [];
    const mullions: Box[] = [];
    const endZ = -TOTAL_LENGTH - 30;

    // Exterior body is dark grey / near-black only — no coloured facades.
    const glassTone = new THREE.Color("#23262c");
    const podiumTone = new THREE.Color("#15171c");
    const deep = new THREE.Color("#05060a");
    const darkGlass = "#1c1f26";

    let k = 0;
    BUILDING_ROWS.forEach((row, r) => {
      [-1, 1].forEach((side) => {
        let z = 12;
        while (z > endZ) {
          k++;
          // Footprints grow with depth so distant towers read at real scale.
          const scale = 1 + row.step * 0.55;
          const d = (4.5 + rng(k + 300) * 5.5) * scale; // depth along the road
          const w = (3.2 + rng(k + 200) * 4.2) * scale; // footprint away from the road
          const prog = Math.min(1, Math.abs(z) / (TOTAL_LENGTH * 0.75));

          // Mixed short / mid / tall stock rather than uniform blocks.
          const classRoll = rng(k + 111);
          const classMul = classRoll < 0.4 ? 0.4 : classRoll < 0.78 ? 0.72 : 1.0;
          let h = Math.min(
            row.cap,
            row.cap * classMul * (0.45 + rng(k + 100) * 0.6) * (0.55 + prog * 0.55),
          );
          h = Math.max(h, 3 + row.step * 2.5);

          // Landmark supertall in the middle-far distance anchors the skyline.
          const isLandmark =
            r === BUILDING_ROWS.length - 1 &&
            side === -1 &&
            z <= LANDMARK_Z &&
            z > LANDMARK_Z - 12;
          if (isLandmark) h = row.cap * 1.55;

          const inner = row.base + rng(k + 700) * 0.5; // road-facing face x
          const zc = z - d / 2;
          const glass = h > row.cap * 0.45 || isLandmark;
          const tone = (glass ? glassTone : podiumTone).clone();
          tone.lerp(deep, 0.2 + row.tint * 0.5);
          const color = "#" + tone.getHexString();

          const shapeRoll = rng(k + 900);
          // Tier stack: [height, widthScale, depthScale]
          let tiers: [number, number, number][];
          if (isLandmark) {
            tiers = [
              [h * 0.5, 1, 1],
              [h * 0.28, 0.82, 0.84],
              [h * 0.22, 0.6, 0.62],
            ]; // tapered supertall + spire below
          } else if (shapeRoll < 0.36 || h < 5) {
            tiers = [[h, 1, 1]]; // flat top
          } else if (shapeRoll < 0.62) {
            tiers = [
              [h * 0.6, 1, 1],
              [h * 0.25, 0.86, 0.88],
              [h * 0.15, 0.72, 0.75],
            ]; // gently tapered upper section
          } else if (shapeRoll < 0.85) {
            tiers = [
              [h * 0.55, 1, 1],
              [h * 0.3, 0.78, 0.8],
              [h * 0.15, 0.56, 0.6],
            ]; // setback tiers
          } else {
            tiers = [
              [h * 0.72, 1, 1],
              [h * 0.28, 0.7, 0.72],
            ]; // tower with a crown added below
          }


          let baseY = 0;
          tiers.forEach((tier, ti) => {
            const [th, ws, ds] = tier;
            const tw = w * ws;
            const td = d * ds;
            const fx = side * (inner + tw / 2);
            boxes.push({
              p: [fx, baseY + th / 2, zc],
              s: [tw, th, td],
              c: color,
            });

            // Window grid on the road-facing facade of this tier.
            // Same grid-of-lit-windows logic everywhere; only the cell size
            // coarsens with distance so far rows stay cheap.
            const dens = 1.15 + row.step * 0.7; // coarser grid further back
            const cols = Math.max(2, Math.floor(td / dens));
            const rowsN = Math.max(2, Math.floor(th / (1.05 + row.step * 0.6)));

            const faceX = side * (inner - 0.03);
            for (let c = 0; c < cols; c++) {
              for (let ry = 0; ry < rowsN; ry++) {
                const cz =
                  zc + ((c + 0.5) / cols - 0.5) * td * 0.86;
                const wy = baseY + ((ry + 0.5) / rowsN) * th;
                const lit = rng(k * 37 + ti * 11 + c * 7 + ry * 3) > 0.45;
                const wh = Math.min(0.55, (th / rowsN) * 0.55);
                const ww = Math.min(0.55, (td / cols) * 0.55);
                const target = lit ? litWins : darkWins;
                let cc = darkGlass;
                if (lit) {
                  const b = 0.45 + rng(k + ry * 13 + c * 5) * 0.95;
                  cc =
                    "#" +
                    new THREE.Color(VIOLET).multiplyScalar(b).getHexString();
                }
                target.push({
                  p: [faceX, wy, cz],
                  s: [0.05, wh, ww],
                  c: cc,
                });
              }
            }

            // Curtain-wall mullions on glass towers.
            if (glass) {
              for (let c = 0; c <= cols; c++) {
                mullions.push({
                  p: [
                    side * (inner - 0.05),
                    baseY + th / 2,
                    zc + (c / cols - 0.5) * td * 0.95,
                  ],
                  s: [0.03, th, 0.05],
                  c: "#3a3e46",
                });
              }
              mullions.push({
                p: [side * (inner - 0.05), baseY + th, zc],
                s: [0.03, 0.05, td * 0.95],
                c: "#3a3e46",
              });
            }

            // Setback ledge between tiers.
            if (ti < tiers.length - 1) {
              boxes.push({
                p: [fx, baseY + th + 0.06, zc],
                s: [tw + 0.18, 0.12, td + 0.18],
                c: "#2b2f36",
              });
            }
            baseY += th;
          });

          // Pointed crown / spire on the tallest towers.
          if (isLandmark) {
            const topW = w * 0.5;
            crowns.push({
              p: [side * (inner + topW / 2), baseY + h * 0.1, zc],
              s: [topW * 0.5, h * 0.2, d * 0.5],
              c: color,
            });
            boxes.push({
              p: [side * (inner + topW / 2), baseY + h * 0.32, zc],
              s: [0.12, h * 0.3, 0.12],
              c: "#4a4f58",
            });
          } else if (shapeRoll >= 0.82) {

            const topW = w * 0.7;
            crowns.push({
              p: [side * (inner + topW / 2), baseY + h * 0.14, zc],
              s: [topW * 0.62, h * 0.28, d * 0.62],
              c: color,
            });
            boxes.push({
              p: [side * (inner + topW / 2), baseY + h * 0.32, zc],
              s: [0.07, h * 0.14, 0.07],
              c: "#4a4f58",
            });
          } else if (rng(k + 950) > 0.55) {
            // Rooftop water tower / plant block.
            const bw = Math.min(1.4, w * 0.35);
            boxes.push({
              p: [
                side * (inner + w * 0.4),
                baseY + 0.5,
                zc + (rng(k + 960) - 0.5) * d * 0.4,
              ],
              s: [bw, 1, bw],
              c: "#14161b",
            });
            if (rng(k + 970) > 0.5) {
              boxes.push({
                p: [side * (inner + w * 0.6), baseY + 1.2, zc],
                s: [0.06, 2.4, 0.06],
                c: "#4a4f58",
              });
            }
          }

          z -= d + 0.15; // continuous coverage, no gaps
        }
      });
    });
    return { boxes, crowns, litWins, darkWins, mullions };
  }, []);

  const bldRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const litRef = useRef<THREE.InstancedMesh>(null);
  const darkRef = useRef<THREE.InstancedMesh>(null);
  const mulRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const fill = (
      mesh: THREE.InstancedMesh | null,
      items: { p: [number, number, number]; s: [number, number, number]; c: string }[],
    ) => {
      if (!mesh) return;
      items.forEach((b, i) => {
        dummy.position.set(b.p[0], b.p[1], b.p[2]);
        dummy.scale.set(b.s[0], b.s[1], b.s[2]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        col.set(b.c);
        mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    fill(bldRef.current, boxes);
    fill(crownRef.current, crowns);
    fill(litRef.current, litWins);
    fill(darkRef.current, darkWins);
    fill(mulRef.current, mullions);
  }, [boxes, crowns, litWins, darkWins, mullions]);

  return (
    <group>
      <instancedMesh
        ref={bldRef}
        args={[undefined as never, undefined as never, boxes.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          emissive="#101216"
          emissiveIntensity={0.25}
          roughness={0.14}
          metalness={0.92}
        />
      </instancedMesh>

      {crowns.length > 0 && (
        <instancedMesh
          ref={crownRef}
          args={[undefined as never, undefined as never, crowns.length]}
          frustumCulled={false}
        >
          <coneGeometry args={[0.72, 1, 4]} />
          <meshStandardMaterial
            emissive="#101216"
            emissiveIntensity={0.3}
            roughness={0.16}
            metalness={0.9}
          />
        </instancedMesh>
      )}

      {litWins.length > 0 && (
        <instancedMesh
          ref={litRef}
          args={[undefined as never, undefined as never, litWins.length]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      )}

      {darkWins.length > 0 && (
        <instancedMesh
          ref={darkRef}
          args={[undefined as never, undefined as never, darkWins.length]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            roughness={0.1}
            metalness={0.95}
            emissive="#15171d"
            emissiveIntensity={0.45}
          />
        </instancedMesh>
      )}

      {mullions.length > 0 && (
        <instancedMesh
          ref={mulRef}
          args={[undefined as never, undefined as never, mullions.length]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            roughness={0.2}
            metalness={0.9}
            emissive="#1a1d24"
            emissiveIntensity={0.25}
          />
        </instancedMesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Dimensional portal — vertical oval rift with a torn, churning purple rim.
// Purple only; the hollow core is opaque black so it fully hides whatever
// sits behind it.
// ---------------------------------------------------------------------------
const PORTAL_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PORTAL_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    // Vertical oval space: squash x so the rift is taller than it is wide.
    vec2 p = (vUv - 0.5) * 2.0;
    vec2 q = vec2(p.x * 1.55, p.y);
    float r = length(q);
    float ang = atan(q.y, q.x);

    // Churning swirl field, rotating over time.
    vec2 sw = vec2(cos(ang), sin(ang)) * r;
    float swirl = fbm(sw * 3.0 + vec2(cos(uTime * 0.35), sin(uTime * 0.3)) * 1.5
                      + vec2(ang * 1.2 + uTime * 0.6, -uTime * 0.25));
    float swirl2 = fbm(sw * 6.0 - vec2(ang * 2.0 - uTime * 0.9, uTime * 0.4));

    // Torn, irregular rim radius — never a smooth ellipse.
    float jag = fbm(vec2(ang * 3.0 + uTime * 0.12, uTime * 0.18)) - 0.5;
    float jagFine = (noise(vec2(ang * 14.0, uTime * 0.4)) - 0.5) * 0.35;
    float R = 0.62 + jag * 0.26 + jagFine * 0.12;

    float d = r - R;                       // <0 inside the rift
    float pulse = 0.85 + 0.15 * sin(uTime * 0.9);

    // Hollow black core, opaque so it occludes the scene behind.
    float core = smoothstep(0.02, -0.10, d);

    // Bright torn rim.
    float rim = exp(-abs(d) * 16.0) * (0.75 + 0.55 * swirl);

    // Energy churning just inside the rift.
    float inner = smoothstep(0.0, -0.55, d) * (swirl * 0.55 + swirl2 * 0.35) * 0.9;

    // Wispy tendrils streaming outward, fading to transparent.
    float wispField = fbm(sw * 2.2 + vec2(ang * 2.5 - uTime * 0.8, uTime * 0.5));
    float wisp = smoothstep(0.0, 0.55, d) * exp(-d * 3.2) * pow(wispField, 2.0) * 1.6;

    // Soft outer glow radiating into the scene, slowly pulsing.
    float glow = exp(-max(d, 0.0) * 3.4) * 0.5 * pulse;

    float energy = (rim * 1.5 + inner + wisp + glow) * pulse;
    vec3 col = uColor * energy;

    float alpha = clamp(core + energy * 0.95, 0.0, 1.0);
    // Core stays black: energy only lights the rim / wisps.
    col *= (1.0 - core * 0.92);

    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

function Portal({
  position,
  width,
  height,
}: {
  position: [number, number, number];
  width: number;
  height: number;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color(VIOLET) } }),
    [],
  );
  useFrame(({ clock }) => {
    if (matRef.current)
      (matRef.current.uniforms.uTime as { value: number }).value = clock.getElapsedTime();
  });
  return (
    <group position={position}>
      <mesh renderOrder={12}>
        <planeGeometry args={[width, height]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={PORTAL_VERT}
          fragmentShader={PORTAL_FRAG}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight position={[0, 0, 1.6]} intensity={14} distance={26} color={VIOLET} />
    </group>
  );
}

function Ramp() {

  // Solid wedge whose top surface is sampled from rampProfile(), so the
  // visual mesh and the bike's collision surface are identical.
  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(RAMP_LEN, 0);
    shape.lineTo(RAMP_LEN, RAMP_H);
    const N = 24;
    for (let i = N - 1; i >= 0; i--) {
      const u = i / N;
      shape.lineTo(RAMP_LEN * u, rampProfile(u));
    }
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: RAMP_W,
      bevelEnabled: false,
    });
    // profile x -> world -z (rising toward travel), extrude -> world x
    g.rotateY(Math.PI / 2);
    g.translate(-RAMP_W / 2, 0, 0);
    return g;
  }, []);

  return (
    // group origin sits at the foot of the ramp; lip lands on RAMP_Z
    <group position={[0, 0, RAMP_Z + RAMP_LEN]}>
      <mesh geometry={geom}>
        <meshStandardMaterial
          color="#101c44"
          metalness={0.55}
          roughness={0.35}
          emissive={NAVY}
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* Neon trim along both side edges of the sloped surface */}
      {[-1, 1].map((s) => (
        <mesh
          key={"trim" + s}
          position={[s * (RAMP_W / 2 + 0.03), RAMP_H * 0.42, -RAMP_LEN / 2]}
          rotation={[Math.atan2(RAMP_H, RAMP_LEN), 0, 0]}
        >
          <boxGeometry args={[0.09, 0.1, RAMP_LEN * 1.02]} />
          <meshBasicMaterial color={NEON} toneMapped={false} />
        </mesh>
      ))}

      {/* Centre glow seam, segmented so it hugs the curved ramp surface */}
      {Array.from({ length: 8 }, (_, i) => {
        const u = (i + 0.5) / 8;
        return (
          <mesh
            key={"seam" + i}
            position={[0, rampProfile(u) + 0.03, -RAMP_LEN * u]}
            rotation={[Math.atan(rampSlope(u)), 0, 0]}
          >
            <boxGeometry args={[0.18, 0.05, RAMP_LEN / 8 + 0.02]} />
            <meshBasicMaterial color={NEON_SOFT} toneMapped={false} />
          </mesh>
        );
      })}

      {/* Chevron stripes for depth read on approach */}
      {[0.25, 0.45, 0.65, 0.85].map((t) => (
        <mesh
          key={t}
          position={[0, rampProfile(t) + 0.04, -RAMP_LEN * t]}
          rotation={[Math.atan(rampSlope(t)) - Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[RAMP_W * 0.85, 0.22]} />

          <meshBasicMaterial
            color={NEON_SOFT}
            toneMapped={false}
            transparent
            opacity={0.35}
          />
        </mesh>
      ))}

      {/* Lip / crest bar — bright leading edge */}
      <mesh position={[0, RAMP_H + 0.06, -RAMP_LEN]}>
        <boxGeometry args={[RAMP_W + 0.16, 0.12, 0.4]} />
        <meshBasicMaterial color={NEON} toneMapped={false} />
      </mesh>

      {/* Dimensional portal at the crest — conceals the final billboard on approach */}
      <Portal position={[0, RAMP_H + 2.6, -RAMP_LEN - 0.35]} width={12} height={9.5} />


      {/* Side skirts so the wedge reads solid, not a floating plane */}
      {[-1, 1].map((s) => (
        <mesh
          key={"skirt" + s}
          position={[s * (RAMP_W / 2 + 0.06), RAMP_H * 0.3, -RAMP_LEN / 2]}
        >
          <boxGeometry args={[0.1, RAMP_H * 0.6, RAMP_LEN]} />
          <meshStandardMaterial
            color="#0a1230"
            emissive={SKY}
            emissiveIntensity={0.35}
          />
        </mesh>
      ))}

      {/* Portal's own light spill onto the ramp (purple only) */}
      <pointLight
        position={[0, RAMP_H + 1.6, -RAMP_LEN + 1.5]}
        intensity={9}
        distance={22}
        color={VIOLET}
      />


      {/* Fixed landing marker strip */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.007, LAND_Z - (RAMP_Z + RAMP_LEN)]}
      >
        <planeGeometry args={[RAMP_W, 0.5]} />
        <meshBasicMaterial
          color={NEON_SOFT}
          toneMapped={false}
          transparent
          opacity={0.5}
        />
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

// Renders a single image filling the billboard panel with "cover" fit.
function BillboardImage({ src, w, h }: { src: string; w: number; h: number }) {
  const tex = useSafeTexture(src);
  const fitted = useMemo(() => {
    if (!tex || !tex.image) return null;
    const iw = (tex.image as { width: number }).width;
    const ih = (tex.image as { height: number }).height;
    if (!iw || !ih) return tex;
    const panel = w / h;
    const img = iw / ih;
    tex.center.set(0.5, 0.5);
    if (img > panel) {
      tex.repeat.set(panel / img, 1);
    } else {
      tex.repeat.set(1, img / panel);
    }
    tex.needsUpdate = true;
    return tex;
  }, [tex, w, h]);
  if (!fitted) return null;
  return (
    <mesh position={[0, 0, 0.2]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={fitted} toneMapped={false} />
    </mesh>
  );
}

function Billboard({
  z,
  side,
  line1,
  line2,
  image,
  finale,
  cameraZRef,
}: {
  z: number;
  side: "L" | "R" | "C";
  line1: string;
  line2?: string;
  image?: string;
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
        image && <BillboardImage src={image} w={w * 0.96} h={h * 0.96} />
      )}

    </group>
  );
}


function FinaleContent() {
  const logoTex = useSafeTexture(talaashLogoUrl);
  return (
    <group position={[0, 0, 0.2]}>
      {logoTex && (
        <mesh position={[0, 1.2, 0.02]}>
          <planeGeometry args={[2.4, 2.4]} />
          <meshBasicMaterial map={logoTex} transparent toneMapped={false} />
        </mesh>
      )}
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
    // Wheels track the ramp surface exactly; pitch matches the surface angle
    // during the climb and eases to level through the airborne arc.
    const targetPitch = jumpPitch(bikeZ);
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      targetPitch,
      Math.min(1, delta * 18),
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
          {/* Back-panel livery — "TALAASH LEGACY", arced to the jacket curve */}
          <group position={[0, 0.3, 0]} rotation={[0.25, 0, 0]}>
            {"TALAASH".split("").map((ch, i, a) => {
              const t = i - (a.length - 1) / 2;
              const x = t * 0.05;
              return (
                <Text
                  key={"jt" + i}
                  position={[x, 0.2, 0.245 - Math.abs(t) * 0.01]}
                  rotation={[0, -x * 1.1, 0]}
                  fontSize={0.062}
                  anchorX="center"
                  anchorY="middle"
                  letterSpacing={0.02}
                >
                  {ch}
                  <meshBasicMaterial
                    color={NEON}
                    toneMapped={false}
                    transparent
                    opacity={0.92}
                  />
                </Text>
              );
            })}
            {"LEGACY".split("").map((ch, i, a) => {
              const t = i - (a.length - 1) / 2;
              const x = t * 0.042;
              return (
                <Text
                  key={"jl" + i}
                  position={[x, 0.115, 0.245 - Math.abs(t) * 0.01]}
                  rotation={[0, -x * 1.1, 0]}
                  fontSize={0.04}
                  anchorX="center"
                  anchorY="middle"
                  letterSpacing={0.06}
                >
                  {ch}
                  <meshBasicMaterial
                    color={NEON_SOFT}
                    toneMapped={false}
                    transparent
                    opacity={0.8}
                  />
                </Text>
              );
            })}
          </group>

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

      <Skyline />


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

/**
 * Keeps a failed WebGL scene contained: the rest of the page stays alive and
 * the hero area simply renders as the flat background colour.
 */
class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[HeroScene] 3D scene failed, rendering static fallback:", error);
  }
  render() {
    if (this.state.failed) return <div className="absolute inset-0 bg-[#050817]" />;
    return this.props.children;
  }
}

export default function HeroScene() {
  const keyHeldRef = useRef(false);
  const lockedRef = useRef(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // 'never' halts the render loop entirely (off-screen / hidden tab / context lost).
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");
  const visibleRef = useRef(true);
  const contextOkRef = useRef(true);

  const syncFrameloop = useCallback(() => {
    const active =
      visibleRef.current && contextOkRef.current && document.visibilityState === "visible";
    setFrameloop(active ? "always" : "never");
  }, []);

  // Cap device pixel ratio: high-density panels gain no visible quality above
  // these ceilings but cost a lot of fill rate.
  const [maxDpr, setMaxDpr] = useState(2);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const compute = () => {
      const small = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
      setMaxDpr(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    };
    compute();
    // Debounced resize — raw resize events fire in bursts while dragging.
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(compute, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Pause when scrolled out of view, resume when back.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        syncFrameloop();
      },
      { threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [syncFrameloop]);

  // Pause on inactive tab.
  useEffect(() => {
    const onVis = () => syncFrameloop();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [syncFrameloop]);


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
    <div ref={containerRef} className="fixed inset-0 h-screen w-screen bg-[#050817]">
      <SceneErrorBoundary>
        <Canvas
          camera={{ fov: 65, near: 0.1, far: 800, position: [0, 3.2, 10] }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          dpr={[1, maxDpr]}
          frameloop={frameloop}
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            const onLost = (e: Event) => {
              // Preventing default lets the browser restore the context instead
              // of leaving a dead canvas behind.
              e.preventDefault();
              contextOkRef.current = false;
              syncFrameloop();
              console.warn("[HeroScene] WebGL context lost — rendering paused.");
            };
            const onRestored = () => {
              contextOkRef.current = true;
              syncFrameloop();
            };
            canvas.addEventListener("webglcontextlost", onLost as EventListener, false);
            canvas.addEventListener("webglcontextrestored", onRestored, false);
          }}
        >
          <Suspense fallback={null}>
            <Scene keyHeldRef={keyHeldRef} lockedRef={lockedRef} onLock={() => {}} />
          </Suspense>
        </Canvas>
      </SceneErrorBoundary>


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

