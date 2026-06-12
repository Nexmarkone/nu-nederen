import { z } from "zod";

export const HouseRulesSchema = z.object({
  targetScore: z.union([z.literal(50), z.literal(75), z.literal(100)]),
  memorizeSeconds: z.union([z.literal(5), z.literal(10), z.literal(15)]),
  jumpInWindowSeconds: z.union([z.literal(3), z.literal(5), z.literal(8)]),
  jumpInPenalty: z.enum(["card", "points5"]),
  turnTimerSeconds: z.union([z.literal(0), z.literal(30), z.literal(60)]),
  allowDrawFromDiscard: z.boolean(),
});

export type HouseRules = z.infer<typeof HouseRulesSchema>;

export const DEFAULT_RULES: HouseRules = {
  targetScore: 50,
  memorizeSeconds: 10,
  jumpInWindowSeconds: 5,
  jumpInPenalty: "card",
  turnTimerSeconds: 60,
  allowDrawFromDiscard: false,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const GRID_SIZE = 4;
/** Grid positions revealed to their owner during the memorize phase. */
export const MEMORIZE_POSITIONS = [2, 3] as const;
/** How long a private ability-peek is shown (ms). */
export const PEEK_TTL_MS = 5000;
/** Long-press duration for the baguette button (ms) — client-side UX constant. */
export const BAGUETTE_HOLD_MS = 700;
