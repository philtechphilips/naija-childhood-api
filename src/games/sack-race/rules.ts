import { createRng, type Rng } from "@/games/core/rng";

/**
 * Sack race (inter-house sports day). Pure rules + racer simulation shared by
 * the 3D and 2D renderers, the CPU racers and server-side validation.
 *
 * HOP: press it as you land to chain hops and build momentum. Pressing well
 * before you land is a wobble (tiny hop); do it twice in a row and you fall
 * over in your sack (not on Easy). Four Perfect hops in a row give you GINGER,
 * which raises your top speed until you miss one.
 *
 * The whistle counts as your first landing, so a press right on GO is a rocket
 * start. Press during "Get set" and it's a false start: you wait a moment.
 *
 * Obstacle course: foam hurdles across every lane (LEAP over them or you knock
 * them down and fall) and mud patches (land in one and you're stuck wobbling
 * until you hop out).
 */
export const RACE_M = 30;
export const LANES = 4;

export const HOP = {
  /** Seconds in the air per hop. */
  air: 0.46,
  /** Metres covered by a plain hop. */
  base: 0.95,
  /** Distance multipliers by how the hop was launched. */
  mult: { perfect: 1.25, good: 1.0, late: 0.85, wobble: 0.45 },
  /** Timing windows around the landing (s), before difficulty scaling. */
  window: { perfect: 0.07, good: 0.15 },
  momentumMax: 1.35,
  /** Perfect hops in a row for GINGER, and the momentum cap while it lasts. */
  gingerStreak: 4,
  gingerMax: 1.5,
  fallSeconds: 1.8,
  /** Presses earlier than this before landing are ignored (not even a wobble). */
  ignoreEarly: 0.42,
  /** Pressing within this long before GO is a false start, costing `falseStartWait` after GO. */
  falseStart: 1,
  falseStartWait: 0.6,
  /** The big LEAP: longer and higher but no momentum bonus. */
  leap: { air: 0.62, base: 1.65 },
  /** Peak height of each kind of hop (m), for the renderers. */
  height: { hop: 0.34, wobble: 0.16, leap: 0.66, leapWobble: 0.22 },
} as const;

/** Half the depth of a hurdle: a hop that lands within this of one hits it. */
export const HURDLE_HALF = 0.12;

export type Difficulty = "easy" | "normal" | "hard";

/** `forget`: chance a CPU hops into a hurdle instead of leaping it. `rubber`: CPUs ease off / push to keep races close. */
export const LEVELS: Record<Difficulty, { window: number; falls: boolean; cpu: number; forget: number; rubber: boolean }> = {
  easy: { window: 1.7, falls: false, cpu: 0.45, forget: 0.3, rubber: true },
  normal: { window: 1.25, falls: true, cpu: 0.66, forget: 0.14, rubber: true },
  hard: { window: 1, falls: true, cpu: 0.84, forget: 0.05, rubber: false },
};

/**
 * CPU racing styles by lane: added to their accuracy early (first 40%) and late
 * (last 35%) in the race. Lane 1 is the player.
 */
export const PERSONAS = [
  { style: "Fast starter", early: 0.12, late: -0.1 },
  { style: "You", early: 0, late: 0 },
  { style: "Steady", early: 0.02, late: 0.02 },
  { style: "Strong finisher", early: -0.08, late: 0.14 },
] as const;

// ------------------------------------------------------------------ courses

export type CourseKind = "race" | "obstacles";

export interface Course {
  kind: CourseKind;
  length: number;
  /** Hurdle positions (m from the start line), ascending. */
  hurdles: number[];
  /** Mud patches [from, to] (m), ascending. */
  mud: [number, number][];
}

export const COURSE_LENGTH: Record<CourseKind, number> = { race: RACE_M, obstacles: 34 };
export const OBSTACLE_HURDLES = 4;
/** Time (s) below which every second earns bonus points. */
export const PAR: Record<CourseKind, number> = { race: 24, obstacles: 30 };

export function makeCourse(kind: CourseKind, seed: number): Course {
  if (kind === "race") return { kind, length: RACE_M, hurdles: [], mud: [] };
  const rng = createRng((seed ^ 0x5ac4) >>> 0);
  const hurdles: number[] = [];
  const mud: [number, number][] = [];
  for (let i = 0; i < OBSTACLE_HURDLES; i++) {
    hurdles.push(Math.round((6 + i * 7 + (rng() - 0.5) * 1.4) * 100) / 100);
    const a = 9.5 + i * 7 + (rng() - 0.5);
    mud.push([Math.round(a * 100) / 100, Math.round((a + 1.1 + rng() * 0.4) * 100) / 100]);
  }
  return { kind, length: COURSE_LENGTH.obstacles, hurdles, mud };
}

export const inMud = (course: Course, x: number) => course.mud.some(([a, b]) => x >= a && x <= b);

// ------------------------------------------------------------------ racers

export type Launch = "perfect" | "good" | "late" | "wobble";

export interface Racer {
  lane: number;
  x: number;
  /** Where the current hop started and will land. */
  fromX: number;
  toX: number;
  state: "ready" | "air" | "ground" | "fallen" | "done";
  /** Time the current hop/fall started. */
  t0: number;
  /** Air time of the current hop. */
  air: number;
  /** The current hop is a LEAP. */
  leap: boolean;
  momentum: number;
  earlyStreak: number;
  /** Press waiting to fire at landing (offset in seconds from landing, negative = early). */
  queued: { offset: number; leap: boolean } | null;
  /** Mashed: falls over on landing. */
  doomed: boolean;
  launch: Launch;
  finishTime: number | null;
  perfects: number;
  falls: number;
  hops: number;
  /** Perfect hops in a row, the best run, and whether GINGER is on. */
  streak: number;
  bestStreak: number;
  ginger: boolean;
  /** Hurdles cleared, and which ones this racer has knocked flat. */
  cleared: number;
  knocked: boolean[];
  /** The current hop ends at this hurdle (and in a fall). */
  trip: number | null;
  /** Hurdles the current leap clears. */
  clears: number[];
  /** Standing in mud: every hop is a wobble. */
  stuck: boolean;
  /** False start: can't go before this clock time. */
  blockedUntil: number;
  falseStart: boolean;
}

export function makeRacer(lane: number, hurdles = 0): Racer {
  return {
    lane,
    x: 0,
    fromX: 0,
    toX: 0,
    state: "ready",
    t0: 0,
    air: HOP.air,
    leap: false,
    momentum: 1,
    earlyStreak: 0,
    queued: null,
    doomed: false,
    launch: "late",
    finishTime: null,
    perfects: 0,
    falls: 0,
    hops: 0,
    streak: 0,
    bestStreak: 0,
    ginger: false,
    cleared: 0,
    knocked: Array.from({ length: hurdles }, () => false),
    trip: null,
    clears: [],
    stuck: false,
    blockedUntil: 0,
    falseStart: false,
  };
}

export type RaceEvent =
  | { type: "hop"; lane: number; launch: Launch; leap: boolean }
  | { type: "land"; lane: number; mud: boolean }
  | { type: "fall"; lane: number }
  | { type: "trip"; lane: number; hurdle: number }
  | { type: "clear"; lane: number; hurdle: number }
  | { type: "splash"; lane: number }
  | { type: "ginger"; lane: number }
  | { type: "rocket"; lane: number }
  | { type: "falsestart"; lane: number }
  | { type: "finish"; lane: number; place: number; time: number };

/** Longest single hop or leap (m), and the top speed (m/s) if every hop is Perfect with GINGER: used by validation. */
export const MAX_HOP = Math.max(HOP.base * HOP.mult.perfect * HOP.gingerMax, HOP.leap.base * HOP.mult.perfect);
export const MAX_SPEED = (HOP.base * HOP.mult.perfect * HOP.gingerMax) / HOP.air;

export function judgeLaunch(offset: number, scale: number): Launch {
  const a = Math.abs(offset);
  if (a <= HOP.window.perfect * scale) return "perfect";
  if (a <= HOP.window.good * scale) return "good";
  return offset < 0 ? "wobble" : "late";
}

/** How far this racer's next hop could carry them: Perfect, with the momentum (and maybe GINGER) it would add. */
export function hopReach(r: Racer) {
  const cap = r.streak + 1 >= HOP.gingerStreak ? HOP.gingerMax : HOP.momentumMax;
  return HOP.base * HOP.mult.perfect * Math.min(cap, Math.max(1, r.momentum) + 0.09);
}

/**
 * The first standing hurdle that a normal hop from `from` could hit, or null:
 * the cue to LEAP.
 */
export function hurdleAhead(course: Course, r: Racer, from: number): number | null {
  for (let k = 0; k < course.hurdles.length; k++) {
    const h = course.hurdles[k]!;
    if (r.knocked[k] || h + HURDLE_HALF <= from) continue;
    return h - HURDLE_HALF < from + hopReach(r) ? k : null;
  }
  return null;
}

/**
 * Step-by-step race. `clock` is seconds since GO (negative during the countdown).
 */
export function createRace(opts: { difficulty: Difficulty; seed: number; player: number; course?: CourseKind }) {
  const level = LEVELS[opts.difficulty];
  const course = makeCourse(opts.course ?? "race", opts.seed);
  const rng: Rng = createRng(opts.seed);
  const racers = Array.from({ length: LANES }, (_, i) => makeRacer(i, course.hurdles.length));
  let clock = -3;
  let places = 0;
  /** CPU: when each will press next (absolute clock). Off the whistle with a reaction time. */
  const cpuNext = racers.map(() => 0.02 + rng() * 0.22);

  function setStreak(r: Racer, perfect: boolean, ev: RaceEvent[]) {
    r.streak = perfect ? r.streak + 1 : 0;
    r.bestStreak = Math.max(r.bestStreak, r.streak);
    const was = r.ginger;
    r.ginger = r.streak >= HOP.gingerStreak;
    if (r.ginger && !was) ev.push({ type: "ginger", lane: r.lane });
    if (!r.ginger) r.momentum = Math.min(r.momentum, HOP.momentumMax);
  }

  function launch(r: Racer, how: Launch, leap: boolean, ev: RaceEvent[]) {
    if (r.stuck) how = "wobble";
    if (how === "perfect") r.perfects++;
    setStreak(r, how === "perfect", ev);
    const cap = r.ginger ? HOP.gingerMax : HOP.momentumMax;
    if (leap) {
      // A leap keeps momentum when timed well but never adds to it.
      if (how === "good") r.momentum = Math.max(1, r.momentum - 0.05);
      else if (how !== "perfect") r.momentum = 1;
    } else if (how === "perfect") r.momentum = Math.min(cap, r.momentum + 0.09);
    else if (how === "good") r.momentum = Math.min(HOP.momentumMax, r.momentum + 0.03);
    else r.momentum = 1;
    const dist = leap ? HOP.leap.base * HOP.mult[how] : HOP.base * HOP.mult[how] * (how === "perfect" || how === "good" ? r.momentum : 1);
    r.fromX = r.x;
    let to = Math.min(course.length + 1.2, r.x + dist);
    r.trip = null;
    r.clears = [];
    for (let k = 0; k < course.hurdles.length; k++) {
      const h = course.hurdles[k]!;
      if (r.knocked[k] || h + HURDLE_HALF <= r.fromX) continue;
      if (to <= h - HURDLE_HALF) break;
      if (leap && how !== "wobble" && to >= h + HURDLE_HALF) r.clears.push(k);
      else {
        // Into the hurdle: the hop stops short of it and you go down.
        r.trip = k;
        to = Math.max(r.fromX, h - 0.2);
        break;
      }
    }
    r.toX = to;
    r.state = "air";
    r.t0 = clock;
    r.air = leap ? HOP.leap.air : HOP.air;
    r.leap = leap;
    r.launch = how;
    r.hops++;
    ev.push({ type: "hop", lane: r.lane, launch: how, leap });
  }

  function fall(r: Racer, ev: RaceEvent[]) {
    r.state = "fallen";
    r.t0 = clock;
    r.momentum = 1;
    r.earlyStreak = 0;
    r.queued = null;
    r.doomed = false;
    r.falls++;
    setStreak(r, false, ev);
    ev.push({ type: "fall", lane: r.lane });
  }

  /** A HOP (or LEAP) press from racer `lane` at the current clock. */
  function press(lane: number, leap: boolean, ev: RaceEvent[]) {
    const r = racers[lane]!;
    if (r.state === "done" || r.state === "fallen") return;
    if (clock < 0) {
      if (clock > -HOP.falseStart && !r.falseStart) {
        r.falseStart = true;
        r.blockedUntil = HOP.falseStartWait;
        ev.push({ type: "falsestart", lane });
      }
      return;
    }
    if (clock < r.blockedUntil) return;
    if (r.state === "ready") {
      // The whistle is your first landing: go on it for a rocket start.
      const how = judgeLaunch(clock - r.blockedUntil, level.window);
      if (how === "perfect" && !r.falseStart) ev.push({ type: "rocket", lane });
      launch(r, how, leap, ev);
      return;
    }
    if (r.state === "ground") {
      launch(r, judgeLaunch(clock - (r.t0 + r.air), level.window), leap, ev);
      return;
    }
    if (r.state === "air") {
      const offset = clock - (r.t0 + r.air);
      if (offset < -HOP.ignoreEarly || r.queued !== null || r.doomed) return;
      if (offset < -HOP.window.good * level.window) {
        // Way too early: a wobble on landing, and mashing makes you fall.
        r.earlyStreak++;
        if (level.falls && r.earlyStreak >= 2) {
          r.doomed = true;
          return;
        }
      } else r.earlyStreak = 0;
      r.queued = { offset, leap };
    }
  }

  /** CPU accuracy right now: its style for this stage of the race, eased to keep it close on Easy/Normal. */
  function cpuSkill(i: number) {
    const r = racers[i]!;
    const p = PERSONAS[i] ?? PERSONAS[2];
    const prog = r.x / course.length;
    let s = level.cpu + (prog < 0.4 ? p.early : prog > 0.65 ? p.late : 0);
    if (level.rubber) {
      const gap = r.x - racers[opts.player]!.x;
      if (gap > 3) s -= 0.12;
      else if (gap < -3) s += 0.06;
    }
    return Math.min(0.97, Math.max(0.2, s));
  }

  function cpuTurn(i: number, ev: RaceEvent[]) {
    const r = racers[i]!;
    const from = r.state === "air" ? r.toX : r.x;
    const wantLeap = hurdleAhead(course, r, from) !== null && rng() > level.forget;
    press(i, wantLeap, ev);
    const skill = cpuSkill(i);
    const roll = rng();
    const err = roll < skill ? (rng() - 0.5) * 0.1 : roll < skill + 0.3 ? (rng() - 0.5) * 0.26 : 0.25 + rng() * 0.3;
    // Aim for the landing after the one this press is for.
    let landAt: number;
    if (r.state === "air" && r.t0 === clock) landAt = clock + r.air;
    else if (r.state === "air" && r.queued) landAt = r.t0 + r.air + (r.queued.leap ? HOP.leap.air : HOP.air);
    else if (r.state === "air") landAt = r.t0 + r.air;
    else landAt = clock + 0.1;
    cpuNext[i] = landAt + err + (rng() < 0.012 ? -0.33 : 0);
  }

  function step(dt: number): RaceEvent[] {
    const ev: RaceEvent[] = [];
    clock += dt;
    racers.forEach((r, i) => {
      if (i === opts.player || clock < 0 || r.state === "done" || r.state === "fallen") return;
      if (clock >= cpuNext[i]!) cpuTurn(i, ev);
    });

    for (const r of racers) {
      if (r.state === "air") {
        const p = Math.min(1, (clock - r.t0) / r.air);
        r.x = r.fromX + (r.toX - r.fromX) * p;
        if (p < 1) continue;
        r.x = r.toX;
        const mud = inMud(course, r.x);
        ev.push({ type: "land", lane: r.lane, mud });
        if (r.x >= course.length) {
          r.state = "done";
          r.finishTime = r.t0 + r.air;
          ev.push({ type: "finish", lane: r.lane, place: ++places, time: r.finishTime });
          continue;
        }
        r.state = "ground";
        for (const k of r.clears) {
          r.cleared++;
          ev.push({ type: "clear", lane: r.lane, hurdle: k });
        }
        r.clears = [];
        if (r.trip !== null) {
          r.knocked[r.trip] = true;
          ev.push({ type: "trip", lane: r.lane, hurdle: r.trip });
          r.trip = null;
          fall(r, ev);
          continue;
        }
        if (mud && !r.stuck) ev.push({ type: "splash", lane: r.lane });
        r.stuck = mud;
        if (mud) {
          r.momentum = 1;
          setStreak(r, false, ev);
        }
        const q = r.queued;
        r.queued = null;
        if (r.doomed) fall(r, ev);
        else if (q) launch(r, judgeLaunch(q.offset, level.window), q.leap, ev);
      } else if (r.state === "ground") {
        // Missed the landing window: you come to a stop and lose your momentum.
        if (clock - (r.t0 + r.air) > HOP.window.good * level.window && (r.momentum > 1 || r.streak > 0)) {
          r.momentum = 1;
          setStreak(r, false, ev);
        }
      } else if (r.state === "fallen" && clock - r.t0 > HOP.fallSeconds) {
        r.state = "ground";
        r.air = HOP.air;
        r.t0 = clock - HOP.air - 1; // treat as standing still
      }
    }
    return ev;
  }

  return {
    racers,
    course,
    get clock() {
      return clock;
    },
    press: (lane: number, leap = false) => {
      const ev: RaceEvent[] = [];
      press(lane, leap, ev);
      return ev;
    },
    step,
    /** Everyone has finished, or the player has and the others are given a few seconds. */
    over() {
      const me = racers[opts.player]!;
      return me.state === "done" && (racers.every((r) => r.state === "done") || clock - (me.finishTime ?? 0) > 4);
    },
    placeOf(lane: number) {
      const r = racers[lane]!;
      if (r.finishTime === null) return LANES;
      return 1 + racers.filter((o) => o.finishTime !== null && o.finishTime < r.finishTime!).length;
    },
    /** Live position: finished racers by time, then everyone else by distance. */
    standing(lane: number) {
      const r = racers[lane]!;
      if (r.finishTime !== null) return this.placeOf(lane);
      return 1 + racers.filter((o) => o !== r && (o.finishTime !== null || o.x > r.x)).length;
    },
  };
}

export type Race = ReturnType<typeof createRace>;

// ------------------------------------------------------------------ scoring

export const PLACE_POINTS = [1000, 600, 350, 150] as const;
export const CLEAR_POINTS = 40;

export interface RaceStats {
  place: number;
  time: number;
  perfects: number;
  falls: number;
  hops: number;
  course?: CourseKind;
  cleared?: number;
  bestStreak?: number;
}

export function scoreRace(s: { place: number; time: number; perfects: number; course?: CourseKind; cleared?: number }): number {
  const par = PAR[s.course ?? "race"];
  return (PLACE_POINTS[s.place - 1] ?? 0) + Math.max(0, Math.round((par - s.time) * 50)) + s.perfects * 10 + (s.cleared ?? 0) * CLEAR_POINTS;
}

/** Log: [place, time*100, perfects, falls, hops, course (0 race, 1 obstacles), hurdles cleared, best streak]. */
export function encodeRace(s: RaceStats): number[] {
  return [s.place, Math.round(s.time * 100), s.perfects, s.falls, s.hops, s.course === "obstacles" ? 1 : 0, s.cleared ?? 0, s.bestStreak ?? 0];
}

/** Accepts the current 8-number log and the original 5-number one (flat race only). */
export function validateRace(log: number[], score: number, durationSeconds: number): string | null {
  if ((log.length !== 5 && log.length !== 8) || log.some((n) => !Number.isInteger(n) || n < 0)) return "Unreadable race log";
  const [place, t100, perfects, , hops, courseId = 0, cleared = 0, bestStreak = 0] = log as number[] as [number, number, number, number, number, number?, number?, number?];
  if (courseId > 1) return "Unknown course";
  const course: CourseKind = courseId === 1 ? "obstacles" : "race";
  const length = COURSE_LENGTH[course];
  const time = t100 / 100;
  if (place < 1 || place > LANES) return "Impossible place";
  if (time < length / MAX_SPEED - 0.05) return "Faster than any sack can hop";
  if (hops < Math.ceil(length / MAX_HOP)) return "Too few hops";
  if (perfects > hops) return "More perfect hops than hops";
  if (bestStreak > perfects) return "Streak longer than the perfect hops";
  if (cleared > (course === "obstacles" ? OBSTACLE_HURDLES : 0)) return "More hurdles than the course has";
  if (time > durationSeconds + 1) return "Race longer than the session";
  if (scoreRace({ place, time: Math.round(time * 100) / 100, perfects, course, cleared }) !== score) return "Score does not match the race log";
  return null;
}
