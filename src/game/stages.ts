import { GRID_RADIUS, TILE_SIZE } from "./types";
import { createSafeZone } from "./safe-zone";
import type {
  Bumper,
  GameOptions,
  Hammer,
  Pickup,
  Spinner,
  StageId,
  StageState,
  Tile,
  Vec3,
  SafeZone,
} from "./types";

export type StageShape = "square" | "octagon" | "cross" | "rectangle" | "ring" | "diamond";
export interface StageDefinition {
  id: StageId;
  name: string;
  subtitle: string;
  description: string;
  shape: StageShape;
  shapeLabel: string;
  hazards: string[];
  color: number;
}
export const STAGES: readonly StageDefinition[] = [
  {
    id: "sky",
    name: "スカイ・スピナー",
    subtitle: "まずは、リズムをつかもう。",
    description: "広い四角のアリーナ。回転棒を跳び越え、しっぽで押し出そう。",
    shape: "square",
    shapeLabel: "スクエア",
    hazards: ["回転棒", "バンパー"],
    color: 0x76cdb5,
  },
  {
    id: "twin",
    name: "ツイン・テンポ",
    subtitle: "ふたつのリズム、すれ違う。",
    description: "八角形の足場で、長さと速さの違う2本の棒が逆方向へ回る。",
    shape: "octagon",
    shapeLabel: "オクタゴン",
    hazards: ["二重回転棒", "逆回転"],
    color: 0xb299e5,
  },
  {
    id: "hammers",
    name: "ハンマー・クロス",
    subtitle: "大きく振れた、その次に。",
    description: "十字の足場を振り子ハンマーが横切る。狭い接続部での攻防に注意。",
    shape: "cross",
    shapeLabel: "クロス",
    hazards: ["振り子ハンマー", "ジャンプ床"],
    color: 0xf2a8bb,
  },
  {
    id: "conveyor",
    name: "リバース・ファクトリー",
    subtitle: "足元の向きが、ひっくり返る。",
    description: "横長の足場とベルトコンベア。黄色く光ったら、もうすぐ流れが逆になる。",
    shape: "rectangle",
    shapeLabel: "ロングデッキ",
    hazards: ["反転コンベア", "回転棒"],
    color: 0xe9c76e,
  },
  {
    id: "holes",
    name: "ホロウ・リング",
    subtitle: "逃げ道にも、穴がある。",
    description: "中央が空いたドーナツ状の足場。予告された床が一時的に開き、経路が変わる。",
    shape: "ring",
    shapeLabel: "ドーナツ",
    hazards: ["開閉する床", "中央の穴"],
    color: 0x83bdde,
  },
  {
    id: "meteors",
    name: "メテオ・ガーデン",
    subtitle: "赤い円の、その先へ。",
    description: "ひし形の足場に隕石が落下。着弾予告を避け、広がる衝撃波はジャンプ。",
    shape: "diamond",
    shapeLabel: "ダイヤモンド",
    hazards: ["隕石予告", "衝撃波"],
    color: 0xf29a7b,
  },
  {
    id: "safezone",
    name: "ワンダリング・セーフティ",
    subtitle: "床は残る。居場所は、動く。",
    description: "広い足場を安全地帯が移動する。次の円へ先回り。区域外に4秒いると脱落。",
    shape: "square",
    shapeLabel: "ワイドデッキ",
    hazards: ["移動する安全地帯", "区域外で脱落"],
    color: 0x71c9c5,
  },
  {
    id: "chaos",
    name: "カオス・カーニバル",
    subtitle: "ぜんぶ重なる、お祭り騒ぎ。",
    description: "回転棒、ハンマー、コンベア、開閉床、隕石が重なる複合アリーナ。",
    shape: "octagon",
    shapeLabel: "ミックス",
    hazards: ["複合ギミック", "隕石", "開閉する床"],
    color: 0xd59ede,
  },
];

export function getStageDefinition(id: StageId): StageDefinition {
  return STAGES.find((stage) => stage.id === id) ?? STAGES[0]!;
}

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  let rng = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((rng / 0x100000000) * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** The opening tour teaches one idea at a time. Later bags avoid immediate repeats. */
export function stageIdForRound(options: GameOptions, round: number): StageId {
  if (options.stage !== "shuffle") return options.stage;
  if (options.mode === "single")
    return shuffled(
      STAGES.map((s) => s.id),
      options.seed,
    )[0]!;
  const opening: StageId[] = [
    "sky",
    ...shuffled<StageId>(["twin", "hammers", "conveyor"], options.seed),
    ...shuffled<StageId>(["holes", "meteors", "safezone"], options.seed ^ 0x4b1d),
    "chaos",
  ];
  if (round <= opening.length) return opening[Math.max(0, round - 1)]!;
  const bagIndex = Math.floor((round - opening.length - 1) / STAGES.length);
  const offset = (round - opening.length - 1) % STAGES.length;
  let previous: StageId = "chaos";
  let bag: StageId[] = [];
  for (let index = 0; index <= bagIndex; index++) {
    bag = shuffled(
      STAGES.map((s) => s.id),
      options.seed ^ Math.imul(index + 1, 0x9e3779b1),
    );
    if (bag[0] === previous) [bag[0], bag[1]] = [bag[1]!, bag[0]!];
    previous = bag[bag.length - 1]!;
  }
  return bag[offset]!;
}

export function stageStateForRound(options: GameOptions, round: number): StageState {
  const id = stageIdForRound(options, round);
  const progress = options.mode === "first-to-three" ? Math.max(0, Math.min(6, round - 1)) : 0;
  const level = (progress >= 4 ? 3 : progress >= 2 ? 2 : 1) as 1 | 2 | 3;
  const speedMultiplier = 1 + progress * 0.07;
  const hasMeteors = id === "meteors" || id === "chaos" || level === 3;
  return {
    id,
    gridRadius: id === "safezone" ? 7 : GRID_RADIUS,
    groundMode: id === "safezone" ? "safe-zone" : "collapse",
    level,
    speedMultiplier,
    firstCollapse: 30 - progress,
    collapseInterval: 25 - progress * 0.75,
    collapseWarning: 5,
    projectileInterval: 5.8 / speedMultiplier,
    trapCycle: 14 - (level - 1),
    trapOpenDuration: 3.2,
    trapWarningDuration: 2.4,
    conveyorPeriod: 10 - (level - 1),
    meteor: hasMeteors
      ? {
          interval: (id === "meteors" ? 9 : 12) / speedMultiplier,
          warningTime: 2.8,
          radius: 2.4,
          count: level,
        }
      : null,
    modifier:
      level === 1
        ? "仕掛けを読んで、リズムをつかもう"
        : level === 2
          ? id === "safezone"
            ? "ハンマー追加 / 安全地帯の移動が加速"
            : "ギミック追加・加速 / 崩落が少し早まる"
          : "複合ギミック + 隕石 / 危険度はここで上限",
  };
}

export function getRoundPreview(options: GameOptions, round: number) {
  const state = stageStateForRound(options, round);
  return { definition: getStageDefinition(state.id), ...state };
}

export function containsStageTile(
  shape: StageShape,
  col: number,
  row: number,
  gridRadius = GRID_RADIUS,
): boolean {
  if (Math.max(Math.abs(col), Math.abs(row)) > gridRadius) return false;
  switch (shape) {
    case "square":
      return true;
    case "octagon":
      return Math.abs(col) + Math.abs(row) <= 8;
    case "cross":
      return Math.abs(col) <= 2 || Math.abs(row) <= 2;
    case "rectangle":
      return Math.abs(row) <= 3;
    case "ring":
      return col * col + row * row <= 30 && Math.max(Math.abs(col), Math.abs(row)) >= 2;
    case "diamond":
      return Math.abs(col) + Math.abs(row) <= 6;
  }
}

export interface StagePlan {
  stage: StageState;
  safeZone: SafeZone | null;
  tiles: Tile[];
  spinners: Spinner[];
  hammers: Hammer[];
  bumpers: Bumper[];
  pickups: Pickup[];
  spawns: Vec3[];
}

function spinner(
  id: number,
  x: number,
  z: number,
  radius: number,
  speed: number,
  y = 0.52,
  angle = 0.3,
): Spinner {
  return {
    id,
    x,
    z,
    y,
    radius,
    maxRadius: radius,
    angle,
    speed,
    baseSpeed: speed,
    color: id % 2 ? 0x79d7c1 : 0xf2a0b9,
  };
}
function hammer(
  id: number,
  x: number,
  z: number,
  axis: "x" | "z",
  speed: number,
  phase: number,
): Hammer {
  const pivot = { x, y: 4.2, z };
  const length = 3.5;
  const amplitude = 1.0;
  const angle = Math.sin(phase) * amplitude;
  return {
    id,
    pivot,
    axis,
    length,
    amplitude,
    phase,
    speed,
    angle,
    radius: 0.7,
    x: x + (axis === "x" ? Math.sin(angle) * length : 0),
    y: pivot.y - Math.cos(angle) * length,
    z: z + (axis === "z" ? Math.sin(angle) * length : 0),
  };
}

/** Mutable runtime state is always fresh; presets never retain round state. */
export function createStagePlan(options: GameOptions, round: number): StagePlan {
  const stage = stageStateForRound(options, round);
  const definition = getStageDefinition(stage.id);
  const tiles: Tile[] = [];
  const hasBelts =
    stage.id === "conveyor" || stage.id === "chaos" || (stage.level >= 2 && stage.id === "meteors");
  const hasTraps =
    stage.id === "holes" || stage.id === "chaos" || (stage.level >= 2 && stage.id === "hammers");
  const gridRadius = stage.gridRadius;
  for (let row = -gridRadius; row <= gridRadius; row++) {
    for (let col = -gridRadius; col <= gridRadius; col++) {
      if (!containsStageTile(definition.shape, col, row, gridRadius)) continue;
      const tile: Tile = {
        id: (row + gridRadius) * (gridRadius * 2 + 1) + col + gridRadius,
        col,
        row,
        x: col * TILE_SIZE,
        z: row * TILE_SIZE,
        ring: Math.max(Math.abs(col), Math.abs(row)),
        state: "solid",
        fallTime: 0,
        kind: (col === -2 || col === 2) && row === 0 && stage.id !== "holes" ? "spring" : "normal",
      };
      if (hasBelts && tile.kind === "normal" && (row === -2 || row === 2) && Math.abs(col) <= 4) {
        const direction = row < 0 ? 1 : -1;
        tile.conveyor = {
          baseX: direction,
          baseZ: 0,
          x: direction,
          z: 0,
          speed: 1.25 * stage.speedMultiplier,
          reversing: false,
        };
      }
      // Checkerboard-like groups leave permanent routes around every temporary opening.
      if (
        hasTraps &&
        tile.kind === "normal" &&
        !tile.conveyor &&
        Math.abs(col) % 2 === 0 &&
        Math.abs(row) % 2 === 0 &&
        tile.ring >= 2 &&
        tile.ring <= 4
      ) {
        tile.trap = {
          group: (Math.abs(col) + Math.abs(row)) % 3,
          phase: "closed",
          remaining: 8,
          openness: 0,
        };
      }
      tiles.push(tile);
    }
  }
  const spinners: Spinner[] = [];
  const hammers: Hammer[] = [];
  const speed = stage.speedMultiplier;
  switch (stage.id) {
    case "sky":
      spinners.push(spinner(0, 0, 0, 6.8, 0.72 * speed));
      if (stage.level >= 2) spinners.push(spinner(1, 0, 0, 4.7, -1.08 * speed, 0.73, 1.4));
      break;
    case "twin":
      spinners.push(
        spinner(0, 0, 0, 7, 0.67 * speed),
        spinner(1, 0, 0, 4.8, -1.17 * speed, 0.78, 1.5),
      );
      if (stage.level >= 2) hammers.push(hammer(0, 0, -5.4, "x", 0.86 * speed, 1));
      break;
    case "hammers":
      hammers.push(
        hammer(0, -3.6, 0, "z", 0.93 * speed, 0.7),
        hammer(1, 3.6, 0, "z", 1.16 * speed, 2.1),
      );
      if (stage.level >= 2) spinners.push(spinner(0, 0, 0, 3.8, 0.75 * speed));
      break;
    case "conveyor":
      spinners.push(spinner(0, 0, 0, 4.7, 0.72 * speed));
      if (stage.level >= 2) hammers.push(hammer(0, -5.4, 0, "z", 1.0 * speed, 1.2));
      break;
    case "holes":
      hammers.push(
        hammer(0, -5.4, 0, "z", 0.85 * speed, 1),
        hammer(1, 5.4, 0, "z", 1.02 * speed, 2.4),
      );
      if (stage.level >= 2) spinners.push(spinner(0, 0, -5.4, 3.1, 0.82 * speed));
      break;
    case "meteors":
      if (stage.level >= 2) spinners.push(spinner(0, 0, 0, 4.2, 0.69 * speed));
      break;
    case "safezone":
      if (stage.level >= 2) hammers.push(hammer(0, 0, -5.4, "x", 0.9 * speed, 1));
      break;
    case "chaos":
      spinners.push(spinner(0, 0, 0, 6.1, 0.72 * speed));
      hammers.push(hammer(0, 0, -5.4, "x", 0.96 * speed, 1.4));
      if (stage.level >= 2) spinners.push(spinner(1, 0, 0, 4.4, -1.1 * speed, 0.76, 1.6));
      break;
  }
  const bumpers: Bumper[] =
    stage.id === "sky" || stage.id === "twin"
      ? [
          { id: 0, x: -3.6, z: -3.6, radius: 0.6, pulse: 0 },
          { id: 1, x: 3.6, z: 3.6, radius: 0.6, pulse: 0 },
        ]
      : [];
  const pickupCells =
    stage.id === "holes"
      ? [
          [0, -3],
          [0, 3],
        ]
      : [
          [0, -2],
          [0, 2],
        ];
  const pickups: Pickup[] = pickupCells.map(([col, row], id) => ({
    id,
    x: col! * TILE_SIZE,
    y: 0.65,
    z: row! * TILE_SIZE,
    active: true,
    respawn: 0,
  }));

  // Farthest-point placement spreads 24 bodies over actual floor, never over a hole.
  // Start the human on an inner supported tile; rotate tie-breaking each round.
  const candidates = shuffled(
    tiles.filter(
      (tile) =>
        tile.ring < gridRadius &&
        tile.kind === "normal" &&
        !tile.trap &&
        !tile.conveyor &&
        spinners.every((bar) => Math.hypot(tile.x - bar.x, tile.z - bar.z) > 1.5) &&
        bumpers.every((bumper) => Math.hypot(tile.x - bumper.x, tile.z - bumper.z) > 1.1) &&
        hammers.every((item) => Math.hypot(tile.x - item.pivot.x, tile.z - item.pivot.z) > 1.3),
    ),
    options.seed ^ Math.imul(round, 0x45d9f3b),
  );
  const fallback = tiles.filter((tile) => tile.kind === "normal");
  const pool =
    candidates.length >= options.playerCount
      ? candidates
      : [...candidates, ...fallback.filter((tile) => !candidates.includes(tile))];
  const first = pool.reduce((best, tile) => {
    const score = Math.abs(Math.hypot(tile.x, tile.z) - 4.2) + (tile.z < 0 ? 1 : 0);
    const old = Math.abs(Math.hypot(best.x, best.z) - 4.2) + (best.z < 0 ? 1 : 0);
    return score < old ? tile : best;
  }, pool[0]!);
  const chosen: Tile[] = [first];
  while (chosen.length < options.playerCount) {
    let best: Tile | undefined;
    let bestDistance = -1;
    for (const tile of pool) {
      if (chosen.includes(tile)) continue;
      const distance = Math.min(
        ...chosen.map((other) => (tile.x - other.x) ** 2 + (tile.z - other.z) ** 2),
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        best = tile;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  const spawns = chosen.map((tile) => ({ x: tile.x, y: 0, z: tile.z }));
  return {
    stage,
    safeZone: createSafeZone(stage),
    tiles,
    spinners,
    hammers,
    bumpers,
    pickups,
    spawns,
  };
}
