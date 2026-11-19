export type Phase = "lobby" | "countdown" | "playing" | "paused" | "finished";
export type Action = "idle" | "weak" | "strong" | "air" | "roll" | "hurt";
export type Difficulty = "easy" | "normal" | "hard";
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface GameOptions {
  playerCount: 4 | 6 | 8 | 12 | 16 | 24;
  difficulty: Difficulty;
  playerColor: number;
  seed: number;
}
export interface InputFrame {
  /** World-space movement, normalized by the input adapter. */
  moveX: number;
  moveZ: number;
  jump: boolean;
  weak: boolean;
  strong: boolean;
  roll: boolean;
  throw: boolean;
}
export const EMPTY_INPUT: InputFrame = {
  moveX: 0,
  moveZ: 0,
  jump: false,
  weak: false,
  strong: false,
  roll: false,
  throw: false,
};
export interface Fighter extends Vec3 {
  id: number;
  name: string;
  color: number;
  isPlayer: boolean;
  vx: number;
  vy: number;
  vz: number;
  /** Facing yaw in radians: zero faces +Z. */
  facing: number;
  damage: number;
  stamina: number;
  staminaDelay: number;
  alive: boolean;
  grounded: boolean;
  action: Action;
  actionTime: number;
  actionDuration: number;
  invulnerable: number;
  attackId: number;
  hitTargets: number[];
  item: boolean;
  kills: number;
  damageDealt: number;
  reflections: number;
  placement: number;
  lastHitBy: number | null;
  lastHitTime: number;
  aiTimer: number;
  aiStrafe: number;
}
export interface Tile {
  id: number;
  col: number;
  row: number;
  x: number;
  z: number;
  ring: number;
  state: "solid" | "warning" | "falling" | "gone";
  fallTime: number;
  kind: "normal" | "spring";
}
export interface Projectile extends Vec3 {
  id: number;
  vx: number;
  vy: number;
  vz: number;
  ownerId: number | null;
  color: number;
  radius: number;
  ttl: number;
  reflections: number;
  immunity: number;
}
export interface Pickup extends Vec3 {
  id: number;
  active: boolean;
  respawn: number;
}
export interface Bumper {
  id: number;
  x: number;
  z: number;
  radius: number;
  pulse: number;
}
export type EventKind =
  | "hit"
  | "strong"
  | "jump"
  | "roll"
  | "reflect"
  | "throw"
  | "pickup"
  | "eliminate"
  | "collapse"
  | "bounce"
  | "start"
  | "finish";
export interface GameEvent extends Vec3 {
  id: number;
  kind: EventKind;
  age: number;
  color: number;
  fighterId?: number;
  amount?: number;
}
export interface GameState {
  phase: Phase;
  options: GameOptions;
  elapsed: number;
  countdown: number;
  fighters: Fighter[];
  tiles: Tile[];
  projectiles: Projectile[];
  pickups: Pickup[];
  bumpers: Bumper[];
  events: GameEvent[];
  spinnerAngle: number;
  spinnerSpeed: number;
  spinnerRadius: number;
  safeRing: number;
  nextCollapse: number;
  warning: boolean;
  winnerId: number | null;
  shake: number;
}
export interface GameController {
  readonly state: GameState;
  start(options?: Partial<GameOptions>): void;
  reset(options?: Partial<GameOptions>): void;
  step(input: InputFrame, dt: number): void;
  setPaused(paused: boolean): void;
}
export const TILE_SIZE = 1.8;
export const GRID_RADIUS = 5;
export const MAX_STAMINA = 100;
export const FIGHTER_RADIUS = 0.48;
export const COLORS = [
  0x76e7c6, 0xffb957, 0xb89aff, 0xff7da2, 0x77caff, 0xf4e786, 0xff9471, 0xa5db78,
] as const;
export const DEFAULT_OPTIONS: GameOptions = {
  playerCount: 24,
  difficulty: "normal",
  playerColor: COLORS[0],
  seed: 5821,
};
