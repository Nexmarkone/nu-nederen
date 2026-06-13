// Global leaderboard ("verdensranglisten"): cumulative stats per player name.
//
// Two storage backends:
//   - GitHubBackend: commits stats.json to a side branch ("data") of the repo
//     via the GitHub API. Survives Render free-tier restarts/spin-downs. Used
//     when GITHUB_TOKEN + GITHUB_REPO are set. Commits land on a branch Render
//     does NOT watch, so they never trigger a redeploy loop.
//   - LocalFileBackend: a JSON file on disk. Used locally / on the NUC / before
//     a token is configured.

import { mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { GameState, ToplisteEntry } from "@nu/shared";

type Entries = Record<string, ToplisteEntry>;

// Names used only for development/testing — never shown on, nor recorded to,
// the public leaderboard. Keys are lowercased+trimmed, matching the entry keys.
const RESERVED_TEST_NAMES = new Set(["testspiller", "test"]);
const isReservedTestName = (key: string): boolean => RESERVED_TEST_NAMES.has(key);

interface Backend {
  load(): Promise<Entries>;
  save(entries: Entries): Promise<void>;
  readonly label: string;
  readonly kind: "github" | "local";
}

export interface StatsStatus {
  backend: "github" | "local";
  loaded: boolean;
  ok: boolean;
  players: number;
  lastSave: { ok: boolean; error: string | null; at: number | null };
}

// ---------------------------------------------------------------------------
// Local file backend (dev / NUC / fallback)
// ---------------------------------------------------------------------------

class LocalFileBackend implements Backend {
  readonly label: string;
  readonly kind = "local" as const;
  constructor(private readonly file: string) {
    this.label = `lokal fil (${file})`;
  }
  async load(): Promise<Entries> {
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as Entries;
    } catch {
      return {};
    }
  }
  async save(entries: Entries): Promise<void> {
    mkdirSync(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(entries, null, 2));
  }
}

// ---------------------------------------------------------------------------
// GitHub backend (persistent, free)
// ---------------------------------------------------------------------------

const GH_API = "https://api.github.com";

class GitHubBackend implements Backend {
  readonly label: string;
  readonly kind = "github" as const;
  private sha: string | null = null;
  private branchEnsured = false;

  constructor(
    private readonly token: string,
    private readonly repo: string, // "owner/name"
    private readonly branch: string,
    private readonly filePath: string,
  ) {
    this.label = `GitHub (${repo}@${branch}/${filePath})`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "nu-nederen",
    };
  }

  private contentsUrl(): string {
    return `${GH_API}/repos/${this.repo}/contents/${this.filePath}?ref=${encodeURIComponent(this.branch)}`;
  }

  async load(): Promise<Entries> {
    const res = await fetch(this.contentsUrl(), { headers: this.headers() });
    if (res.status === 200) {
      const json = (await res.json()) as { content: string; sha: string };
      this.sha = json.sha;
      const decoded = Buffer.from(json.content.replace(/\n/g, ""), "base64").toString("utf8");
      return JSON.parse(decoded) as Entries;
    }
    if (res.status === 404) {
      this.sha = null; // file (or branch) not there yet — fresh start
      return {};
    }
    throw new Error(`GitHub load fejlede: ${res.status} ${await res.text()}`);
  }

  async save(entries: Entries): Promise<void> {
    await this.ensureBranch();
    const ok = await this.put(entries);
    if (!ok) {
      // sha conflict — refetch and retry once
      await this.load();
      await this.put(entries);
    }
  }

  private async put(entries: Entries): Promise<boolean> {
    const body: Record<string, unknown> = {
      message: "Opdater topliste",
      content: Buffer.from(JSON.stringify(entries, null, 2)).toString("base64"),
      branch: this.branch,
    };
    if (this.sha) body.sha = this.sha;

    const res = await fetch(`${GH_API}/repos/${this.repo}/contents/${this.filePath}`, {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 200 || res.status === 201) {
      const json = (await res.json()) as { content: { sha: string } };
      this.sha = json.content.sha;
      return true;
    }
    if (res.status === 409 || res.status === 422) {
      return false; // stale sha — caller retries after a fresh load
    }
    throw new Error(`GitHub save fejlede: ${res.status} ${await res.text()}`);
  }

  /** Create the side branch from the repo's default branch if it doesn't exist. */
  private async ensureBranch(): Promise<void> {
    if (this.branchEnsured) return;
    const refRes = await fetch(
      `${GH_API}/repos/${this.repo}/git/ref/heads/${encodeURIComponent(this.branch)}`,
      { headers: this.headers() },
    );
    if (refRes.status === 200) {
      this.branchEnsured = true;
      return;
    }
    // Look up the default branch's tip and branch off it.
    const repoRes = await fetch(`${GH_API}/repos/${this.repo}`, { headers: this.headers() });
    if (!repoRes.ok) throw new Error(`GitHub repo-opslag fejlede: ${repoRes.status}`);
    const repoJson = (await repoRes.json()) as { default_branch: string };
    const headRes = await fetch(
      `${GH_API}/repos/${this.repo}/git/ref/heads/${repoJson.default_branch}`,
      { headers: this.headers() },
    );
    const headJson = (await headRes.json()) as { object: { sha: string } };
    const createRes = await fetch(`${GH_API}/repos/${this.repo}/git/refs`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${this.branch}`, sha: headJson.object.sha }),
    });
    // 201 created, or 422 if it raced into existence — both are fine.
    if (createRes.status !== 201 && createRes.status !== 422) {
      throw new Error(`Kunne ikke oprette data-branch: ${createRes.status}`);
    }
    this.branchEnsured = true;
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function chooseBackend(): Backend {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (token && repo) {
    return new GitHubBackend(
      token,
      repo,
      process.env.STATS_BRANCH ?? "data",
      process.env.STATS_FILE ?? "stats.json",
    );
  }
  const file = process.env.STATS_PATH ?? path.resolve(process.cwd(), "data", "stats.json");
  return new LocalFileBackend(file);
}

export class StatsStore {
  private entries: Entries = {};
  private readonly backend: Backend;
  private readonly ready: Promise<void>;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving = false;
  private dirty = false;
  private loaded = false;
  private loadOk = false;
  private lastSaveOk = false;
  private lastSaveError: string | null = null;
  private lastSaveAt: number | null = null;

  constructor(backend: Backend = chooseBackend()) {
    this.backend = backend;
    this.ready = this.backend
      .load()
      .then((e) => {
        // Purge any stray test entries so they vanish from memory and from the
        // next save — the leaderboard self-cleans on the first boot after this.
        for (const key of Object.keys(e)) {
          if (isReservedTestName(key)) delete e[key];
        }
        this.entries = e;
        this.loaded = true;
        this.loadOk = true;
        console.log(
          `Topliste indlæst: ${Object.keys(e).length} spillere — backend: ${this.backend.label}`,
        );
      })
      .catch((err) => {
        this.loaded = true;
        this.loadOk = false;
        console.error(`Kunne ikke indlæse topliste (${this.backend.label}):`, err);
      });
  }

  status(): StatsStatus {
    return {
      backend: this.backend.kind,
      loaded: this.loaded,
      ok: this.loadOk,
      players: Object.keys(this.entries).length,
      lastSave: { ok: this.lastSaveOk, error: this.lastSaveError, at: this.lastSaveAt },
    };
  }

  /** Record a finished game. Deferred until the initial load completes. */
  record(state: GameState): void {
    void this.ready.then(() => this.apply(state));
  }

  private apply(state: GameState): void {
    const over = state.gameOver;
    if (!over) return;
    for (const p of state.players) {
      if (p.isBot) continue;
      const key = p.name.trim().toLowerCase();
      if (!key || isReservedTestName(key)) continue;
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
    this.saveTimer = setTimeout(() => void this.flush(), 1500);
  }

  private async flush(): Promise<void> {
    if (this.saving) {
      this.dirty = true; // coalesce: re-run after the current save finishes
      return;
    }
    this.saving = true;
    try {
      // Snapshot so concurrent record() calls during the await are not lost.
      const snapshot = JSON.parse(JSON.stringify(this.entries)) as Entries;
      await this.backend.save(snapshot);
      this.lastSaveOk = true;
      this.lastSaveError = null;
      this.lastSaveAt = Date.now();
    } catch (err) {
      this.lastSaveOk = false;
      this.lastSaveError = String(err instanceof Error ? err.message : err).slice(0, 300);
      this.lastSaveAt = Date.now();
      console.error(`Kunne ikke gemme topliste (${this.backend.label}):`, err);
    } finally {
      this.saving = false;
      if (this.dirty) {
        this.dirty = false;
        this.saveSoon();
      }
    }
  }
}

export const statsStore = new StatsStore();
