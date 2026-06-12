// Global leaderboard ("verdensranglisten"): cumulative stats per player name,
// persisted as a small JSON file on disk. No accounts — identity is the
// display name, which is exactly right for a group of friends.

import { mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { GameState, ToplisteEntry } from "@nu/shared";

const STATS_PATH = process.env.STATS_PATH ?? path.resolve(process.cwd(), "data", "stats.json");

export class StatsStore {
  private entries: Record<string, ToplisteEntry> = {};
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file: string = STATS_PATH) {
    try {
      this.entries = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, ToplisteEntry>;
      console.log(`Topliste indlæst: ${Object.keys(this.entries).length} spillere (${this.file})`);
    } catch {
      this.entries = {};
    }
  }

  /** Record a finished game. Bots (and abandoned bot-controlled seats) are skipped. */
  record(state: GameState): void {
    const over = state.gameOver;
    if (!over) return;
    for (const p of state.players) {
      if (p.isBot) continue;
      const key = p.name.trim().toLowerCase();
      if (!key) continue;
      const e = (this.entries[key] ??= {
        name: p.name.trim(),
        avatar: p.avatar,
        games: 0,
        wins: 0,
        nederen: 0,
        jumpIns: 0,
        baguetteHits: 0,
        lastPlayed: 0,
      });
      e.name = p.name.trim();
      e.avatar = p.avatar;
      e.games += 1;
      if (over.winnerIds.includes(p.id)) e.wins += 1;
      if (over.loserIds.includes(p.id)) e.nederen += 1;
      e.jumpIns += p.stats.jumpIns;
      e.baguetteHits += p.stats.baguetteHits;
      e.lastPlayed = Date.now();
    }
    this.saveSoon();
  }

  top(n = 50): ToplisteEntry[] {
    return Object.values(this.entries)
      .sort((a, b) => b.wins - a.wins || a.nederen - b.nederen || b.games - a.games)
      .slice(0, n);
  }

  private saveSoon(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        mkdirSync(path.dirname(this.file), { recursive: true });
        void writeFile(this.file, JSON.stringify(this.entries, null, 2)).catch((e) => {
          console.error("Kunne ikke gemme topliste:", e);
        });
      } catch (e) {
        console.error("Kunne ikke gemme topliste:", e);
      }
    }, 500);
  }
}

export const statsStore = new StatsStore();
