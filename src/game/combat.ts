import type { Action, Fighter } from "./types";

export interface AttackSpec {
  damage: number;
  power: number;
  radius: number;
  cost: number;
  windup: number;
  activeEnd: number;
  duration: number;
  cone: number;
}

export const ATTACKS: Record<"weak" | "strong" | "air", AttackSpec> = {
  weak: {
    damage: 7,
    power: 3.6,
    radius: 1.55,
    cost: 0,
    windup: 0.07,
    activeEnd: 0.16,
    duration: 0.32,
    cone: 0.15,
  },
  strong: {
    damage: 15,
    power: 5.1,
    radius: 2.2,
    cost: 25,
    windup: 0.19,
    activeEnd: 0.46,
    duration: 0.74,
    cone: -1,
  },
  air: {
    damage: 10,
    power: 4.2,
    radius: 1.8,
    cost: 10,
    windup: 0.07,
    activeEnd: 0.26,
    duration: 0.47,
    cone: -0.2,
  },
};

export const ROLL_COST = 28;
export const ROLL_DURATION = 0.52;
export const ROLL_IFRAMES = 0.25;

export function isAttack(action: Action): action is "weak" | "strong" | "air" {
  return action === "weak" || action === "strong" || action === "air";
}

export function attackIsActive(fighter: Fighter): boolean {
  if (!isAttack(fighter.action)) return false;
  const spec = ATTACKS[fighter.action];
  return fighter.actionTime >= spec.windup && fighter.actionTime <= spec.activeEnd;
}

/** Damage is accumulated percent; this curve controls velocity, never health. */
export function knockbackSpeed(basePower: number, accumulatedDamage: number): number {
  return basePower * (1 + Math.max(0, accumulatedDamage) / 110);
}

export function normalized(x: number, z: number): { x: number; z: number } {
  const length = Math.hypot(x, z);
  return length > 0.00001 ? { x: x / length, z: z / length } : { x: 0, z: 1 };
}
