import { createRng, pick, type Rng } from "@/games/core/rng";

/**
 * Police & Thief "Street run": an endless runner down a chaotic Lagos road.
 * You are the thief; the police are always on your heels and only catch you
 * when you hit something. Pure rules and track generation (no DOM, no three.js)
 * so they can be unit-tested and replayed.
 *
 * Track space: `z` is metres from the start along the road, lanes are 0..2 (left to right).
 */
export const LANE_W = 2.1;
export const laneX = (lane: number) => (lane - 1) * LANE_W;

export const RUN = {
  startSpeed: 10.5,
  maxSpeed: 21,
  /** m/s gained per second of running. */
  accel: 0.085,
  jumpVel: 8.6,
  gravity: 27,
  slideTime: 0.72,
  laneTime: 0.13,
  /** Kid standing/sliding height and half extents (m). */
  standH: 1.45,
  slideH: 0.6,
  halfW: 0.28,
  halfD: 0.3,
  /** Seconds the police stay on your heels after a stumble. */
  heat: 5.5,
  introSeconds: 1.4,
  /** Long enough to watch the arrest before the results screen. */
  caughtSeconds: 3.6,
  /** Energy drains from full to empty in this many seconds of running. */
  energySeconds: 42,
  /** Below this the thief tires: slower, and the police creep up. */
  tired: 0.22,
  /** Energy-drink rush: seconds, speed multiplier. */
  rushSeconds: 4.5,
  rushBoost: 1.3,
} as const;

/** Street snacks the thief snatches from hawkers on the run. */
export type SnackKind = "roll" | "energy";

export const SNACKS: Record<SnackKind, { energy: number; rush: boolean; name: string }> = {
  /** Sausage roll off a hawker's tray: proper energy. */
  roll: { energy: 0.4, rush: false, name: "sausage roll" },
  /** Energy drink from the cooler: energy and a rush (faster, can't be tripped). */
  energy: { energy: 0.3, rush: true, name: "energy drink" },
};

export interface Snack {
  id: number;
  kind: SnackKind;
  lane: number;
  z: number;
  /** Which side of the lane the hawker stands (-1 left, 1 right). */
  side: -1 | 1;
  taken?: boolean;
}

/** How the player gets past: jump over, slide under, change lane, jump the hole, or dodge the person. */
export type Clearance = "jump" | "slide" | "block" | "hole" | "bump";

export type ObstacleKind = "danfo" | "brt" | "keke" | "okada" | "hawker" | "barrier" | "checkpoint" | "table" | "generator" | "cart" | "pole" | "banner" | "pothole";

export interface ObstacleSpec {
  clear: Clearance;
  /** Depth along the road (m). */
  len: number;
  /** Half width across the road (m). Full-road obstacles ignore it. */
  halfW: number;
  /** Top height for jump obstacles, gap height underneath for slide obstacles. */
  h: number;
  /** Spans all three lanes. */
  wide?: boolean;
}

export const OBSTACLES: Record<ObstacleKind, ObstacleSpec> = {
  danfo: { clear: "block", len: 4.8, halfW: 0.95, h: 2.6 },
  brt: { clear: "block", len: 11, halfW: 1.2, h: 3.2 },
  hawker: { clear: "bump", len: 0.5, halfW: 0.35, h: 1.0 },
  keke: { clear: "block", len: 2.7, halfW: 0.72, h: 1.9 },
  okada: { clear: "block", len: 2.0, halfW: 0.45, h: 1.6 },
  barrier: { clear: "jump", len: 0.5, halfW: 0.85, h: 1.0 },
  checkpoint: { clear: "jump", len: 0.6, halfW: 3.4, h: 1.0, wide: true },
  table: { clear: "jump", len: 1.1, halfW: 0.85, h: 0.95 },
  generator: { clear: "jump", len: 0.8, halfW: 0.5, h: 0.75 },
  cart: { clear: "jump", len: 1.7, halfW: 0.7, h: 1.0 },
  pole: { clear: "slide", len: 0.5, halfW: 0.95, h: 1.05 },
  banner: { clear: "slide", len: 0.4, halfW: 3.4, h: 1.05, wide: true },
  pothole: { clear: "hole", len: 1.7, halfW: 0.75, h: 0 },
};

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  lane: number;
  /** Near edge, in metres from the start. */
  z: number;
  /** Oncoming speed (m/s) for moving traffic; negative = driving ahead of you; 0 when parked. */
  speed: number;
  /** Hawkers weaving across the road: current x and sideways speed. */
  x?: number;
  vx?: number;
  /** Visual variety. */
  seed: number;
  hit?: boolean;
  honked?: boolean;
}

export interface Coin {
  id: number;
  lane: number;
  z: number;
  /** Height above the road of the coin's centre. */
  y: number;
  taken?: boolean;
}

const JUMPERS: ObstacleKind[] = ["barrier", "table", "generator", "cart"];
const BLOCKERS: ObstacleKind[] = ["danfo", "danfo", "keke"];

/** Height of the standard jump `d` metres after take-off at speed `v` (for coin arcs). */
function arcY(d: number, v: number) {
  const t = d / v;
  return Math.max(0, RUN.jumpVel * t - 0.5 * RUN.gravity * t * t);
}

/**
 * Endless, seeded street: emits patterns ("chunks") of obstacles and coins ahead
 * of the runner. Every chunk leaves at least one way through.
 */
export function createTrack(seed: number) {
  const rng: Rng = createRng(seed ^ 0x5ee7);
  const obstacles: Obstacle[] = [];
  const coins: Coin[] = [];
  const snacks: Snack[] = [];
  let sinceSnack = 0;
  let nextId = 1;
  // Clear road at the start while the thief gets going.
  let cursor = 48;

  const ob = (kind: ObstacleKind, lane: number, z: number, speed = 0) => obstacles.push({ id: nextId++, kind, lane, z, speed, seed: Math.floor(rng() * 1e6) });
  const line = (lane: number, z0: number, n: number, gap = 2.2, y = 0.75) => {
    for (let i = 0; i < n; i++) coins.push({ id: nextId++, lane, z: z0 + i * gap, y });
  };
  /** Coins following the jump over something at `zc` (centre). */
  const arc = (lane: number, zc: number, v: number) => {
    const span = (2 * RUN.jumpVel * v) / RUN.gravity;
    const z0 = zc - span / 2;
    for (let i = 0; i <= 6; i++) {
      const d = (i / 6) * span;
      coins.push({ id: nextId++, lane, z: z0 + d, y: 0.75 + arcY(d, v) });
    }
  };
  const lanesShuffled = () => {
    const l = [0, 1, 2];
    for (let i = 2; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [l[i], l[j]] = [l[j]!, l[i]!];
    }
    return l as [number, number, number];
  };

  /** Speed the runner will roughly have at track position z (for coin arcs). */
  const speedAt = (z: number) => Math.min(RUN.maxSpeed, RUN.startSpeed + RUN.accel * (z / ((RUN.startSpeed + RUN.maxSpeed) / 2)));

  function chunk(z: number): number {
    const level = Math.min(1, z / 2600);
    const v = speedAt(z);
    const [a, b, c] = lanesShuffled();
    const options = ["parked", "twoBlocked", "checkpoint", "banner", "market", "mixed", "potholes"];
    if (level > 0.03) options.push("busAhead", "hawkers", "hawkers");
    if (level > 0.08) options.push("okada", "okada", "kekeOncoming");
    if (level > 0.25) options.push("oncoming", "zigzag");
    if (level > 0.45) options.push("zigzag", "twoBlocked");
    switch (pick(rng, options)) {
      case "parked": {
        ob(pick(rng, BLOCKERS), a, z + 10);
        line(b, z + 4, 8);
        return 22;
      }
      case "twoBlocked": {
        ob(pick(rng, BLOCKERS), a, z + 10);
        ob(pick(rng, BLOCKERS), b, z + 12);
        if (level > 0.15 && rng() < 0.6) {
          ob(pick(rng, JUMPERS), c, z + 13);
          arc(c, z + 13.5, v);
        } else line(c, z + 6, 7);
        return 26;
      }
      case "checkpoint": {
        ob("checkpoint", 1, z + 10);
        arc(a, z + 10.3, v);
        return 20;
      }
      case "banner": {
        ob("banner", 1, z + 10);
        line(a, z + 6, 4, 2.2, 0.45);
        return 18;
      }
      case "market": {
        ob("table", a, z + 8);
        ob("table", b, z + 14);
        line(c, z + 4, 8);
        if (rng() < 0.5) arc(a, z + 8.5, v);
        return 22;
      }
      case "mixed": {
        // One lane of each kind: jump it, slide it, or go round the bus.
        ob(pick(rng, JUMPERS), a, z + 10);
        ob("pole", b, z + 10);
        if (level > 0.2) ob(pick(rng, BLOCKERS), c, z + 8);
        else line(c, z + 6, 6);
        return 22;
      }
      case "potholes": {
        ob("pothole", a, z + 6);
        ob("pothole", b, z + 13);
        ob("pothole", c, z + 20);
        line(a, z + 10, 5);
        return 26;
      }
      case "okada": {
        // Okada riding against traffic down your lane.
        ob("okada", a, z + 16, 6 + level * 3);
        line(b, z + 4, 8);
        if (level > 0.3 && rng() < 0.5) ob(pick(rng, JUMPERS), c, z + 12);
        return 24;
      }
      case "busAhead": {
        // Danfo or BRT pulling away from the stop ahead of you: you catch it up.
        ob(rng() < 0.4 ? "brt" : "danfo", a, z + 18, -(4 + rng() * 3));
        line(b, z + 6, 8);
        return 30;
      }
      case "kekeOncoming": {
        ob("keke", a, z + 20, 4 + level * 3);
        if (rng() < 0.5) ob("keke", b, z + 34, 4 + level * 3);
        line(c, z + 6, 8);
        return 30;
      }
      case "hawkers": {
        // Hawkers with head trays weaving through the traffic.
        for (const [dz, dir] of [
          [10, rng() < 0.5 ? -1 : 1],
          [20, rng() < 0.5 ? -1 : 1],
        ] as const) {
          obstacles.push({ id: nextId++, kind: "hawker", lane: 1, z: z + dz, speed: 0, seed: Math.floor(rng() * 1e6), x: (rng() - 0.5) * 2 * LANE_W, vx: dir * (0.8 + rng() * 0.6) });
        }
        line(a, z + 4, 6);
        return 26;
      }
      case "oncoming": {
        ob("danfo", a, z + 22, 5 + level * 3);
        ob("keke", b, z + 18);
        line(c, z + 6, 9);
        return 30;
      }
      default: {
        // Zigzag: one lane blocked per row, alternating sides.
        ob(pick(rng, BLOCKERS), a, z + 6);
        ob(pick(rng, BLOCKERS), b, z + 18);
        ob(pick(rng, JUMPERS), c, z + 30);
        line(c, z + 4, 6);
        return 36;
      }
    }
  }

  /** Lane with nothing solid within a few metres of z (or -1). */
  const freeLane = (z: number) => {
    const lanes = lanesShuffled().filter(
      (l) => !obstacles.some((o) => o.z < z + 4 && o.z + OBSTACLES[o.kind].len > z - 4 && (OBSTACLES[o.kind].wide || o.lane === l)),
    );
    return lanes.length ? lanes[0]! : -1;
  };

  return {
    obstacles,
    coins,
    snacks,
    /** Generate the street up to `z` metres. */
    fill(z: number) {
      while (cursor < z) {
        const len = chunk(cursor);
        // Now and then a hawker strolls across the road in the gap after a pattern.
        if (cursor > 60 && rng() < 0.3) {
          obstacles.push({ id: nextId++, kind: "hawker", lane: 1, z: cursor + len + 3, speed: 0, seed: Math.floor(rng() * 1e6), x: (rng() - 0.5) * 2 * LANE_W, vx: (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 0.5) });
        }
        const level = Math.min(1, cursor / 2600);
        const gap = 8 - level * 5 + rng() * 5;
        // A snack hawker roughly every 70-130 m, in the gap after a chunk where the road is clear.
        sinceSnack += len + gap;
        if (sinceSnack > 70 + rng() * 60) {
          const zs = cursor + len + gap / 2;
          const lane = freeLane(zs);
          if (lane >= 0) {
            const side: -1 | 1 = lane === 0 ? -1 : lane === 2 ? 1 : rng() < 0.5 ? -1 : 1;
            snacks.push({ id: nextId++, kind: rng() < 0.3 ? "energy" : "roll", lane, z: zs, side });
            sinceSnack = 0;
          }
        }
        cursor += len + gap;
      }
    },
    /** Forget everything behind `z` (keeps arrays small on long runs). */
    prune(z: number) {
      let i = 0;
      while (i < obstacles.length && obstacles[i]!.z + 8 < z) i++;
      if (i) obstacles.splice(0, i);
      let j = 0;
      while (j < coins.length && coins[j]!.z + 4 < z) j++;
      if (j) coins.splice(0, j);
      let k = 0;
      while (k < snacks.length && snacks[k]!.z + 4 < z) k++;
      if (k) snacks.splice(0, k);
    },
  };
}

export type Track = ReturnType<typeof createTrack>;

// ------------------------------------------------------------------ scoring
export interface RunStats {
  distance: number;
  coins: number;
  stumbles: number;
  seconds: number;
}

export const COIN_POINTS = 10;

export function scoreRun(s: { distance: number; coins: number }): number {
  return Math.floor(s.distance) + s.coins * COIN_POINTS;
}

/** Log layout: [distance (m), coins, stumbles, seconds*10]. */
export function encodeRun(s: RunStats): number[] {
  return [Math.floor(s.distance), s.coins, s.stumbles, Math.round(s.seconds * 10)];
}

export function validateRun(log: number[], score: number, durationSeconds: number): string | null {
  if (log.length !== 4 || log.some((n) => !Number.isInteger(n) || n < 0)) return "Unreadable run log";
  const [distance, coins, , t10] = log as [number, number, number, number];
  const seconds = t10 / 10;
  if (seconds > durationSeconds + 3) return "Run longer than the session";
  if (distance > RUN.maxSpeed * RUN.rushBoost * seconds + 40) return "Ran faster than possible";
  if (coins > distance / 2 + 5) return "Too many coins for the distance";
  if (scoreRun({ distance, coins }) !== score) return "Score does not match the run log";
  return null;
}
