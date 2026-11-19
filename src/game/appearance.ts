import { DEFAULT_APPEARANCE } from "./types";
import type { Accessory, FighterAppearance, GameOptions } from "./types";

export const ACCESSORIES: readonly { id: Accessory; label: string }[] = [
  { id: "none", label: "なし" },
  { id: "glasses", label: "まるメガネ" },
  { id: "visor", label: "サンバイザー" },
  { id: "headband", label: "ヘッドバンド" },
  { id: "headphones", label: "ヘッドホン" },
  { id: "bow", label: "リボン" },
];
export const ACCENT_COLORS = [
  0xffd56b, 0xf8efff, 0x334456, 0xff6e8f, 0x5fe0cc, 0x7569c9, 0xff9e58, 0x68bdf1,
] as const;

/** Identity belongs to the fighter, not the round or transient spawn order. */
export function appearanceForFighter(id: number, options: GameOptions): FighterAppearance {
  if (id === 0) return { ...DEFAULT_APPEARANCE, ...options.playerAppearance };
  const seedOffset = (options.seed >>> 0) % ACCENT_COLORS.length;
  return {
    tailTipColor: ACCENT_COLORS[(id * 3 + seedOffset) % ACCENT_COLORS.length]!,
    shoeColor: ACCENT_COLORS[(id * 5 + seedOffset + 3) % ACCENT_COLORS.length]!,
    accessory: ACCESSORIES[1 + ((id - 1) % (ACCESSORIES.length - 1))]!.id,
    accessoryColor: ACCENT_COLORS[(id + seedOffset + 2) % ACCENT_COLORS.length]!,
  };
}

export function appearanceKey(appearance: FighterAppearance): string {
  return `${appearance.tailTipColor}/${appearance.shoeColor}/${appearance.accessory}/${appearance.accessoryColor}`;
}
