/**
 * Hide & Seek (boju boju) in the family compound. Pure rules and map data,
 * shared by the 3D and 2D renderers, the CPU kids and server-side validation.
 *
 * World units are metres on the ground plane: x across the yard, z from the
 * gate (z = -8) to the back rooms (z = +8.4).
 */
export type Mode = "hide" | "seek";
export type Difficulty = "easy" | "normal" | "hard";

export interface Vec {
  x: number;
  z: number;
}

/** Walkable yard: between the verandahs of the side rooms, the back rooms and the gate wall. */
export const YARD = { x0: -6.3, x1: 6.3, z0: -7.9, z1: 9.9 } as const;

/** Base: the gate, where the seeker counts. Touch it to be "home free". */
export const BASE: Vec & { r: number } = { x: 0, z: -7.2, r: 1.3 };

/** Verandah pillars along the side rooms and the back rooms. */
const PILLARS: Solid[] = [
  ...[-8, -5, -2, 1, 4, 7].flatMap((z) => [-5.25, 5.25].map((x) => ({ x, z, r: 0.2 }))),
  ...[-3.25, 0, 3.25].map((x) => ({ x, z: 8.95, r: 0.2 })),
];

/** Something solid: a circle, or a capsule stretched `hz` metres each way along z. */
export interface Solid extends Vec {
  r: number;
  hz?: number;
}

/** Solid things you walk round. */
export const SOLIDS: Solid[] = [
  { x: 5.2, z: 8.8, r: 0.8 }, // water tank stand
  { x: -4.9, z: 8.9, r: 0.55 }, // generator
  { x: -4.8, z: 5.2, r: 0.45 }, // drums
  { x: -3.2, z: -5.3, r: 0.95, hz: 1.3 }, // covered car
  { x: 3.7, z: 2.6, r: 0.45 }, // mango tree trunk
  { x: -4.5, z: -0.9, r: 0.5 }, // cooking corner
  { x: 4.3, z: -2.0, r: 0.5 }, // plastic chairs
  ...PILLARS,
];

export interface Spot extends Vec {
  id: string;
  name: string;
  /** How hard it is for the seeker to think of looking here (0 obvious .. 1 sneaky). */
  sneaky: number;
}

/** Hiding spots: stand in one and press HIDE. */
export const SPOTS: Spot[] = [
  { id: "tank", name: "behind the water tank", x: 4.3, z: 9.6, sneaky: 0.5 },
  { id: "wrapperL", name: "among the wrappers", x: -1.6, z: 8.0, sneaky: 0.7 },
  { id: "wrapperR", name: "behind the ankara", x: 1.6, z: 8.0, sneaky: 0.6 },
  { id: "generator", name: "behind the generator", x: -3.9, z: 9.6, sneaky: 0.4 },
  { id: "drums", name: "behind the drums", x: -5.0, z: 6.0, sneaky: 0.45 },
  { id: "tree", name: "behind the mango tree", x: 4.3, z: 3.4, sneaky: 0.3 },
  { id: "car", name: "behind the car", x: -4.75, z: -5.3, sneaky: 0.55 },
  { id: "doorL", name: "in Mama Nkechi's doorway", x: -6.0, z: 1.8, sneaky: 0.8 },
  { id: "doorR", name: "in Baba Tunde's doorway", x: 6.0, z: 0.2, sneaky: 0.75 },
  { id: "kitchen", name: "by the cooking corner", x: -5.2, z: -0.2, sneaky: 0.35 },
  { id: "chairs", name: "behind the plastic chairs", x: 4.95, z: -1.2, sneaky: 0.4 },
];

/** You count as "in" a spot within this distance of it. */
export const SPOT_R = 0.85;
/** Speeds (m/s). */
export const SPEED = { walk: 2.4, run: 4.4, seekerWalk: 2.2, hiderBolt: 4.0 } as const;
export const TAG_R = 0.75;

export const LEVELS: Record<Difficulty, { count: number; hideSeconds: number; seekSeconds: number; vision: number; fov: number; checkTime: number; bolt: number; chase: number; headStart: number }> = {
  /**
   * count = seconds the seeker counts; vision = metres; fov = half-angle (rad);
   * bolt = chance a hider runs for base when you get close; chase = the CPU
   * seeker's sprint (m/s); headStart = seconds the seeker stands shouting "I see you!".
   */
  easy: { count: 14, hideSeconds: 60, seekSeconds: 100, vision: 6.5, fov: 0.75, checkTime: 1.4, bolt: 0.25, chase: 4.0, headStart: 1.0 },
  normal: { count: 11, hideSeconds: 70, seekSeconds: 90, vision: 8, fov: 0.95, checkTime: 1.1, bolt: 0.4, chase: 4.5, headStart: 0.7 },
  hard: { count: 9, hideSeconds: 80, seekSeconds: 80, vision: 9.5, fov: 1.1, checkTime: 0.8, bolt: 0.6, chase: 4.8, headStart: 0.5 },
};

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

/** Keeps a position inside the yard and out of solid things. */
/** Nearest point of a solid's core (its centre, or the closest point on a capsule's spine). */
const core = (o: Solid, p: Vec): Vec => (o.hz ? { x: o.x, z: Math.max(o.z - o.hz, Math.min(o.z + o.hz, p.z)) } : o);

/** Keeps a position inside the yard and out of solid things. */
export function collide(p: Vec, radius = 0.3): Vec {
  let x = Math.min(YARD.x1 - radius, Math.max(YARD.x0 + radius, p.x));
  let z = Math.min(YARD.z1 - radius, Math.max(YARD.z0 + radius, p.z));
  for (const o of SOLIDS) {
    const c = core(o, { x, z });
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const min = o.r + radius;
    if (d < min && d > 1e-6) {
      x = c.x + (dx / d) * min;
      z = c.z + (dz / d) * min;
    }
  }
  return { x, z };
}

/**
 * Walks `s` metres from `from` towards `to`, sliding round anything solid in
 * the way. `memo` (one per walker) remembers which way round it chose, so it
 * doesn't dither, and flips it when that way turns out to be blocked.
 */
export function walkToward(from: Vec, to: Vec, s: number, memo: { side: number } = { side: 0 }, radius = 0.3): Vec {
  const d = dist(from, to);
  if (d < 1e-6) return from;
  const dir = { x: (to.x - from.x) / d, z: (to.z - from.z) / d };
  let step = { x: dir.x * s, z: dir.z * s };
  let blocked = false;
  for (const o of SOLIDS) {
    const c = core(o, from);
    const nx = from.x - c.x;
    const nz = from.z - c.z;
    const nd = Math.hypot(nx, nz);
    const ahead = { x: from.x + step.x, z: from.z + step.z };
    if (nd < 1e-6 || dist(ahead, core(o, ahead)) >= o.r + radius) continue;
    const n = { x: nx / nd, z: nz / nd };
    const into = step.x * n.x + step.z * n.z;
    if (into >= 0) continue;
    blocked = true;
    if (!memo.side) memo.side = -n.x * dir.z + n.z * dir.x >= 0 ? 1 : -1;
    // Keep walking round it, the remembered way.
    step = { x: n.z * memo.side * s, z: -n.x * memo.side * s };
    // Ease back towards the target once the way is clear on that side.
    const along = dir.x * step.x + dir.z * step.z;
    if (along > 0) {
      const slide = { x: dir.x * s - into * n.x, z: dir.z * s - into * n.z };
      const len = Math.hypot(slide.x, slide.z);
      if (len > s * 0.3 && slide.x * step.x + slide.z * step.z > 0) step = { x: (slide.x / len) * s, z: (slide.z / len) * s };
    }
  }
  if (!blocked) memo.side = 0;
  const next = collide({ x: from.x + step.x, z: from.z + step.z }, radius);
  // Pinned against a wall that way: go round the other way next time.
  if (blocked && dist(from, next) < s * 0.3) memo.side = -memo.side;
  return next;
}

export const spotAt = (p: Vec): Spot | null => SPOTS.find((s) => dist(s, p) <= SPOT_R) ?? null;

/**
 * Can a seeker at `eye`, facing `heading` (radians, 0 = +z), see someone at `p`
 * who is out in the open? Solids block the line of sight.
 */
export function canSee(eye: Vec, heading: number, p: Vec, level: Difficulty): boolean {
  const L = LEVELS[level];
  const d = dist(eye, p);
  if (d > L.vision) return false;
  if (d < 1.2) return true;
  const ang = Math.atan2(p.x - eye.x, p.z - eye.z);
  let diff = Math.abs(ang - heading) % (Math.PI * 2);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  if (diff > L.fov) return false;
  // Line of sight: blocked if it passes through a solid.
  const vx = p.x - eye.x;
  const vz = p.z - eye.z;
  for (const o of SOLIDS) {
    for (const c of o.hz ? [-1, -0.5, 0, 0.5, 1].map((k) => ({ x: o.x, z: o.z + k * o.hz! })) : [o]) {
      const t = Math.max(0, Math.min(1, ((c.x - eye.x) * vx + (c.z - eye.z) * vz) / (vx * vx + vz * vz)));
      const cx = eye.x + vx * t - c.x;
      const cz = eye.z + vz * t - c.z;
      if (Math.hypot(cx, cz) < o.r * 0.85 && t > 0.05 && t < 0.95) return false;
    }
  }
  return true;
}

// ------------------------------------------------------------------ scoring

export interface HideStats {
  hiddenSeconds: number;
  homeFree: boolean;
  caught: boolean;
  closeCalls: number;
}

export interface SeekStats {
  found: number;
  total: number;
  escaped: number;
  timeLeft: number;
}

export function scoreHide(s: HideStats): number {
  return Math.round(s.hiddenSeconds * 10) + (s.homeFree ? 800 : 0) + (s.caught ? 0 : 400) + s.closeCalls * 60;
}

export function scoreSeek(s: SeekStats): number {
  return s.found * 300 + (s.found === s.total ? Math.round(s.timeLeft * 10) : 0);
}

/** Log: hide = [0, hidden*10, homeFree, caught, closeCalls]; seek = [1, found, total, escaped, timeLeft*10]. */
export function encodeHide(s: HideStats): number[] {
  return [0, Math.round(s.hiddenSeconds * 10), s.homeFree ? 1 : 0, s.caught ? 1 : 0, s.closeCalls];
}
export function encodeSeek(s: SeekStats): number[] {
  return [1, s.found, s.total, s.escaped, Math.round(s.timeLeft * 10)];
}

export function validateHideSeek(log: number[], score: number, durationSeconds: number): string | null {
  if (log.length !== 5 || log.some((n) => !Number.isInteger(n) || n < 0)) return "Unreadable game log";
  if (log[0] === 0) {
    const [, h10, home, caught, close] = log as [number, number, number, number, number];
    const hiddenSeconds = h10 / 10;
    if (home > 1 || caught > 1 || (home === 1 && caught === 1)) return "Impossible outcome";
    if (hiddenSeconds > durationSeconds + 1 || hiddenSeconds > LEVELS.hard.hideSeconds + 1) return "Hid longer than the game";
    if (close > 30) return "Too many close calls";
    if (scoreHide({ hiddenSeconds, homeFree: home === 1, caught: caught === 1, closeCalls: close }) !== score) return "Score does not match the game log";
    return null;
  }
  if (log[0] === 1) {
    const [, found, total, escaped, t10] = log as [number, number, number, number, number];
    const timeLeft = t10 / 10;
    if (total < 1 || total > 4 || found + escaped > total) return "Impossible count";
    if (timeLeft > LEVELS.easy.seekSeconds) return "Impossible time";
    if (found > 0 && durationSeconds < found * 2) return "Found them too fast";
    if (scoreSeek({ found, total, escaped, timeLeft }) !== score) return "Score does not match the game log";
    return null;
  }
  return "Unknown mode";
}
