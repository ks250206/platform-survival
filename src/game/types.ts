export type Phase = "lobby" | "countdown" | "playing" | "paused" | "finished";
export type Action = "idle" | "weak" | "strong" | "air" | "roll" | "hurt";
export type Difficulty = "easy" | "normal" | "hard";
export type MatchMode = "single" | "first-to-three";
export type StageId =
  | "sky"
  | "twin"
  | "hammers"
  | "conveyor"
  | "holes"
  | "meteors"
  | "safezone"
  | "chaos";
export type StageSelection = StageId | "shuffle";
export type Accessory = "none" | "glasses" | "visor" | "headband" | "headphones" | "bow";
export interface FighterAppearance {
  tailTipColor: number;
  shoeColor: number;
  accessory: Accessory;
  accessoryColor: number;
}
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
  mode: MatchMode;
  stage: StageSelection;
  playerAppearance: FighterAppearance;
}
export interface RoundResult {
  round: number;
  stageId: StageId;
  winnerId: number | null;
}
export interface SeriesState {
  round: number;
  targetWins: 1 | 3;
  wins: number[];
  championId: number | null;
  history: RoundResult[];
}
export interface MeteorConfig {
  interval: number;
  warningTime: number;
  radius: number;
  count: number;
}
export interface StageState {
  id: StageId;
  gridRadius: number;
  groundMode: "collapse" | "safe-zone";
  level: 1 | 2 | 3;
  speedMultiplier: number;
  firstCollapse: number;
  collapseInterval: number;
  collapseWarning: number;
  projectileInterval: number;
  trapCycle: number;
  trapOpenDuration: number;
  trapWarningDuration: number;
  conveyorPeriod: number;
  meteor: MeteorConfig | null;
  modifier: string;
}
export interface SafeZone {
  x: number;
  z: number;
  radius: number;
  fromX: number;
  fromZ: number;
  fromRadius: number;
  targetX: number;
  targetZ: number;
  targetRadius: number;
  phase: "holding" | "warning" | "moving";
  timer: number;
  duration: number;
  wave: number;
  outsideLimit: number;
  arenaHalfSize: number;
  speedMultiplier: number;
}
export interface Spinner {
  id: number;
  x: number;
  z: number;
  y: number;
  radius: number;
  maxRadius: number;
  angle: number;
  speed: number;
  baseSpeed: number;
  color: number;
}
export interface Hammer extends Vec3 {
  id: number;
  pivot: Vec3;
  axis: "x" | "z";
  length: number;
  amplitude: number;
  phase: number;
  speed: number;
  angle: number;
  radius: number;
}
export interface Meteor {
  id: number;
  x: number;
  z: number;
  radius: number;
  warningTime: number;
  timeToImpact: number;
  impactAge: number;
  phase: "warning" | "impact";
  hitTargets: number[];
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
  appearance: FighterAppearance;
  outsideZoneTime: number;
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
  trap?: {
    group: number;
    phase: "closed" | "warning" | "open";
    remaining: number;
    openness: number;
  };
  conveyor?: {
    baseX: number;
    baseZ: number;
    x: number;
    z: number;
    speed: number;
    reversing: boolean;
  };
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
  | "meteor"
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
  series: SeriesState;
  stage: StageState;
  safeZone: SafeZone | null;
  elapsed: number;
  countdown: number;
  fighters: Fighter[];
  tiles: Tile[];
  projectiles: Projectile[];
  pickups: Pickup[];
  bumpers: Bumper[];
  spinners: Spinner[];
  hammers: Hammer[];
  meteors: Meteor[];
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
  nextRound(): void;
  step(input: InputFrame, dt: number): void;
  setPaused(paused: boolean): void;
}
export const TILE_SIZE = 1.8;
export const GRID_RADIUS = 5;
export const MAX_STAMINA = 100;
export const FIGHTER_RADIUS = 0.48;
export const COLORS = [
  0x76e7c6, 0xffb957, 0xb89aff, 0xff7da2, 0x77caff, 0xf4e786, 0xff9471, 0xa5db78, 0xe66f91,
  0x779ce8, 0xde9c70, 0x56b9a0, 0xd7b8f4, 0x90d6f1, 0xe7bb49, 0xda8bd4, 0x9bba4e, 0xee7d58,
  0x72aeca, 0xc0cf8d, 0xe9a8bd, 0x8d84cf, 0xc8b19b, 0x69c9de,
] as const;
export const DEFAULT_APPEARANCE: FighterAppearance = {
  tailTipColor: 0xffd56b,
  shoeColor: 0x377e92,
  accessory: "glasses",
  accessoryColor: 0x334456,
};
export const DEFAULT_OPTIONS: GameOptions = {
  playerCount: 24,
  difficulty: "normal",
  playerColor: COLORS[0],
  seed: 5821,
  mode: "first-to-three",
  stage: "shuffle",
  playerAppearance: { ...DEFAULT_APPEARANCE },
};
