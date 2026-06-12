// Zod schemas for ALL WebSocket messages in both directions.
// The server validates every inbound client message (anti-cheat); the client
// validates inbound server messages defensively.

import { z } from "zod";
import { HouseRulesSchema } from "./rules.js";

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export const SuitSchema = z.enum(["hearts", "diamonds", "spades", "clubs"]);
export const RankSchema = z.enum([
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "JOKER",
]);

export const CardSchema = z.object({
  id: z.string(),
  rank: RankSchema,
  suit: SuitSchema.nullable(),
});

export const GridRefSchema = z.object({
  playerId: z.string(),
  gridIndex: z.number().int().min(0).max(15),
});

export const BotDifficultySchema = z.enum(["easy", "medium", "hard"]);

/** Emoji-reaktioner — whitelisted så klienter ikke kan sende vilkårlig tekst. */
export const REACTION_EMOJIS = ["😂", "🔥", "😱", "👏", "🥖", "😭", "😈", "❤️"] as const;
export const ReactionEmojiSchema = z.enum(REACTION_EMOJIS);
export type ReactionEmoji = z.infer<typeof ReactionEmojiSchema>;

export const PlayerNameSchema = z.string().trim().min(1).max(16);
export const AvatarSchema = z.string().min(1).max(12);

const GridIndexSchema = z.number().int().min(0).max(15);

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export const PlayerActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draw"), from: z.enum(["pile", "discard"]).optional() }),
  z.object({ type: z.literal("swapInto"), gridIndex: GridIndexSchema }),
  z.object({ type: z.literal("discardDrawn"), useAbility: z.boolean() }),
  z.object({ type: z.literal("abilityPeek"), target: GridRefSchema }),
  z.object({ type: z.literal("abilitySwap"), a: GridRefSchema, b: GridRefSchema }),
  z.object({ type: z.literal("skipAbility") }),
  z.object({
    type: z.literal("jumpIn"),
    gridIndex: GridIndexSchema,
    windowId: z.number().int().min(0),
  }),
  z.object({ type: z.literal("baguette") }),
  z.object({ type: z.literal("nextRound") }),
]);

export type PlayerAction = z.infer<typeof PlayerActionSchema>;

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("createRoom"),
    name: PlayerNameSchema,
    avatar: AvatarSchema,
  }),
  z.object({
    type: z.literal("joinRoom"),
    code: z.string().trim().toUpperCase().length(4),
    name: PlayerNameSchema,
    avatar: AvatarSchema,
    token: z.string().optional(),
  }),
  z.object({ type: z.literal("leaveRoom") }),
  z.object({ type: z.literal("addBot"), difficulty: BotDifficultySchema }),
  z.object({ type: z.literal("removeBot"), botId: z.string() }),
  z.object({ type: z.literal("updateRules"), rules: HouseRulesSchema }),
  z.object({ type: z.literal("startGame") }),
  z.object({ type: z.literal("rematch") }),
  z.object({ type: z.literal("action"), action: PlayerActionSchema }),
  z.object({ type: z.literal("requestState") }),
  z.object({ type: z.literal("kickPlayer"), playerId: z.string() }),
  z.object({ type: z.literal("react"), emoji: ReactionEmojiSchema }),
  z.object({ type: z.literal("chat"), text: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("ping"), t: z.number().optional() }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export const LobbyPlayerInfoSchema = z.object({
  id: z.string(),
  name: PlayerNameSchema,
  avatar: AvatarSchema,
  isBot: z.boolean(),
  botDifficulty: BotDifficultySchema.nullable(),
  connected: z.boolean(),
});
export type LobbyPlayerInfo = z.infer<typeof LobbyPlayerInfoSchema>;

export const RoomInfoSchema = z.object({
  code: z.string(),
  hostId: z.string(),
  inGame: z.boolean(),
  players: z.array(LobbyPlayerInfoSchema),
  rules: HouseRulesSchema,
});
export type RoomInfo = z.infer<typeof RoomInfoSchema>;

export const RedactedCardSchema = z.object({
  id: z.string(),
  faceUp: z.boolean(),
  rank: RankSchema.optional(),
  suit: SuitSchema.nullable().optional(),
});

export const RedactedPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
  isBot: z.boolean(),
  botDifficulty: BotDifficultySchema.nullable(),
  connected: z.boolean(),
  grid: z.array(RedactedCardSchema.nullable()),
  totalScore: z.number(),
  roundScore: z.number().nullable(),
  stats: z.object({
    jumpIns: z.number(),
    failedJumpIns: z.number(),
    baguettes: z.number(),
    baguetteHits: z.number(),
  }),
});

export const RevealEntrySchema = z.object({
  playerId: z.string(),
  cards: z.array(CardSchema.nullable()),
  rawSum: z.number(),
  adjustment: z.number(),
  roundScore: z.number(),
  newTotal: z.number(),
});

export const RevealDataSchema = z.object({
  order: z.array(z.string()),
  entries: z.array(RevealEntrySchema),
  baguetteCallerId: z.string().nullable(),
  targetReached: z.boolean(),
});

export const GameOverDataSchema = z.object({
  loserIds: z.array(z.string()),
  winnerIds: z.array(z.string()),
  finalScores: z.array(z.object({ playerId: z.string(), total: z.number() })),
});

export const RedactedGameStateSchema = z.object({
  roundNumber: z.number(),
  phase: z.enum(["memorize", "playing", "reveal", "gameOver"]),
  players: z.array(RedactedPlayerSchema),
  dealerIndex: z.number(),
  currentPlayerIndex: z.number(),
  turnStage: z.enum(["draw", "decide", "ability", "window"]),
  drawCount: z.number(),
  discardPile: z.array(CardSchema),
  drawnCard: z.object({ id: z.string(), byPlayerId: z.string() }).nullable(),
  pendingAbility: z.enum(["peek", "swap"]).nullable(),
  jumpWindow: z.object({ id: z.number(), open: z.boolean() }),
  baguette: z.object({ callerId: z.string().nullable(), remaining: z.array(z.string()) }),
  rules: HouseRulesSchema,
  reveal: RevealDataSchema.nullable(),
  gameOver: GameOverDataSchema.nullable(),
  turnCount: z.number(),
});

export const GameEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("roundStarted"),
    roundNumber: z.number(),
    dealerId: z.string(),
    startingPlayerId: z.string(),
  }),
  z.object({ type: z.literal("memorizeStarted"), seconds: z.number() }),
  z.object({ type: z.literal("memorizeEnded") }),
  z.object({
    type: z.literal("turnStarted"),
    playerId: z.string(),
    lastLap: z.boolean(),
    turnTimerSeconds: z.number(),
  }),
  z.object({
    type: z.literal("cardDrawn"),
    playerId: z.string(),
    cardId: z.string(),
    from: z.enum(["pile", "discard"]),
  }),
  z.object({
    type: z.literal("swappedIn"),
    playerId: z.string(),
    gridIndex: z.number(),
    discarded: CardSchema,
  }),
  z.object({
    type: z.literal("discarded"),
    playerId: z.string(),
    card: CardSchema,
    ability: z.enum(["peek", "swap"]).nullable(),
  }),
  z.object({ type: z.literal("abilityPeeked"), byPlayerId: z.string(), target: GridRefSchema }),
  z.object({
    type: z.literal("abilitySwapped"),
    byPlayerId: z.string(),
    a: GridRefSchema,
    b: GridRefSchema,
  }),
  z.object({ type: z.literal("abilitySkipped"), playerId: z.string() }),
  z.object({
    type: z.literal("jumpWindowOpened"),
    windowId: z.number(),
    durationMs: z.number(),
  }),
  z.object({ type: z.literal("jumpWindowClosed"), windowId: z.number() }),
  z.object({
    type: z.literal("jumpInSuccess"),
    playerId: z.string(),
    gridIndex: z.number(),
    card: CardSchema,
  }),
  z.object({
    type: z.literal("jumpInFailed"),
    playerId: z.string(),
    gridIndex: z.number(),
    penalty: z.enum(["card", "points5"]),
    penaltyCardId: z.string().nullable(),
    penaltyGridIndex: z.number().nullable(),
  }),
  z.object({ type: z.literal("baguetteCalled"), playerId: z.string() }),
  z.object({ type: z.literal("deckReshuffled"), drawCount: z.number() }),
  z.object({ type: z.literal("turnTimedOut"), playerId: z.string() }),
  z.object({ type: z.literal("revealStarted"), reveal: RevealDataSchema }),
  z.object({
    type: z.literal("gameOver"),
    data: GameOverDataSchema,
    rounds: z.number(),
  }),
  z.object({
    type: z.literal("seatChanged"),
    playerId: z.string(),
    isBot: z.boolean(),
    connected: z.boolean(),
  }),
]);

export const ChatMessageSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  avatar: z.string(),
  text: z.string(),
  ts: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** Én række i den globale topliste (HTTP: GET /api/topliste). */
export interface ToplisteEntry {
  name: string;
  avatar: string;
  games: number;
  wins: number;
  nederen: number;
  jumpIns: number;
  baguetteHits: number;
  lastPlayed: number;
}

export const PrivatePeekSchema = z.object({
  type: z.literal("privatePeek"),
  context: z.enum(["memorize", "drawn", "peek"]),
  cards: z.array(
    z.object({
      card: CardSchema,
      gridRef: GridRefSchema.optional(),
    }),
  ),
  ttlMs: z.number(),
});
export type PrivatePeek = z.infer<typeof PrivatePeekSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("joined"),
    playerId: z.string(),
    token: z.string(),
    code: z.string(),
  }),
  z.object({ type: z.literal("roomState"), room: RoomInfoSchema }),
  z.object({ type: z.literal("gameState"), state: RedactedGameStateSchema }),
  PrivatePeekSchema,
  z.object({ type: z.literal("event"), event: GameEventSchema }),
  z.object({ type: z.literal("reaction"), playerId: z.string(), emoji: ReactionEmojiSchema }),
  z.object({ type: z.literal("chat"), message: ChatMessageSchema }),
  z.object({ type: z.literal("chatHistory"), messages: z.array(ChatMessageSchema) }),
  z.object({ type: z.literal("kicked") }),
  z.object({ type: z.literal("leftRoom") }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
  z.object({ type: z.literal("pong"), t: z.number().optional() }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
