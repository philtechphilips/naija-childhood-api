import type { PhotoName } from "@/lib/photos";
import type { Sfx } from "@/games/core/audio";

export type GameSlug = "ten-ten" | "police-thief" | "suwe" | "sack-race" | "skipping" | "hide-seek";

export interface OptionChoice {
  value: string;
  label: string;
}

export interface GameOption {
  id: string;
  label: string;
  choices: OptionChoice[];
  defaultValue: string;
  /** Only shown for these mode ids. Shown for every mode when omitted. */
  modes?: string[];
}

export interface GameMode {
  id: string;
  label: string;
  description: string;
  available: boolean;
  badge?: string;
}

export interface GameResult {
  game: GameSlug;
  mode: string;
  options: Record<string, string>;
  score: number;
  /** null for modes without a winner (e.g. endless score chase). */
  won: boolean | null;
  durationMs: number;
  headline: string;
  detail: string;
  stats: Record<string, number>;
  seed: number;
  /** Compact event log so a server can replay and validate the score. */
  log: number[];
}

export interface ControlButton {
  id: string;
  label: string;
  sublabel?: string;
  key: string;
  tone?: "primary" | "secondary" | "accent";
}

export type ControlSpec =
  | { kind: "buttons"; buttons: ControlButton[]; split?: boolean }
  | { kind: "joystick"; buttons: ControlButton[] }
  /** Swipe anywhere on the game: sends input("left" | "right" | "jump" | "slide"). */
  | { kind: "swipe" };

export interface EngineContext {
  canvas: HTMLCanvasElement;
  mode: string;
  options: Record<string, string>;
  seed: number;
  playerName: string;
  reducedMotion: boolean;
  /** "3d" = realistic WebGL scene, "2d" = lightweight canvas fallback. */
  graphics: "3d" | "2d";
  sfx: Sfx;
  /** Play the background Naija beats (separate from sound effects). */
  music: boolean;
  haptic: (pattern: number | number[]) => void;
  onEnd: (result: GameResult) => void;
}

/**
 * A running game. The engine owns its own frame loop; React only mounts the
 * canvas, forwards control input and listens for the end of the session.
 */
export interface GameEngine {
  start(): void;
  setPaused(paused: boolean): void;
  input(id: string, down: boolean): void;
  axis?(x: number, y: number): void;
  /** Music switched on/off mid-game (pause menu). */
  setMusic?(on: boolean): void;
  destroy(): void;
}

export interface GameModule {
  /** Optional: load and return the engine factory for a graphics tier (lets 3D code split out). */
  prepare?(graphics: "3d" | "2d"): Promise<(ctx: EngineContext) => GameEngine>;
  createEngine(ctx: EngineContext): GameEngine;
  controls(mode: string, options: Record<string, string>): ControlSpec;
}

export interface HowToStep {
  title: string;
  body: string;
}

export interface GameDefinition {
  slug: GameSlug;
  name: string;
  tagline: string;
  description: string;
  photo: PhotoName;
  accent: string;
  difficulty: "Easy" | "Medium" | "Hard";
  players: string;
  sessionLength: string;
  howTo: HowToStep[];
  controlsHelp: string;
  modes: GameMode[];
  options: GameOption[];
  load: () => Promise<GameModule>;
}
