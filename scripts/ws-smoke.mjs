// Fase 2-verifikation: spiller en hel runde via WS med 2 forbindelser.
// Starter serveren på port 8099, opretter et rum, joiner, spiller indtil
// reveal (via Baguette) og tjekker anti-snyd-redaction undervejs.
//
// Kørsel: node scripts/ws-smoke.mjs

import { spawn } from "node:child_process";
import process from "node:process";
import WebSocket from "ws";

const PORT = 8099;
const BASE = `http://localhost:${PORT}`;

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

class Client {
  constructor(name) {
    this.name = name;
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.inbox = [];
    this.waiters = [];
    this.state = null;
    this.playerId = null;
    this.peeks = [];
    this.events = [];
    this.errors = [];
    this.ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      if (msg.type === "gameState") this.state = msg.state;
      if (msg.type === "privatePeek") this.peeks.push(msg);
      if (msg.type === "event") this.events.push(msg.event);
      if (msg.type === "error") this.errors.push(msg);
      if (msg.type === "joined") this.playerId = msg.playerId;
      this.inbox.push(msg);
      for (const w of [...this.waiters]) w();
    });
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
    });
  }

  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }

  waitFor(pred, what, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const check = () => {
        const hit = pred(this);
        if (hit) {
          clearTimeout(timer);
          this.waiters = this.waiters.filter((w) => w !== check);
          resolve(hit);
        }
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== check);
        reject(new Error(`${this.name}: timeout mens vi ventede på ${what}`));
      }, timeoutMs);
      this.waiters.push(check);
      check();
    });
  }
}

function assertRedacted(client) {
  const s = client.state;
  if (!s || s.phase === "reveal" || s.phase === "gameOver") return;
  for (const p of s.players) {
    for (const c of p.grid) {
      if (c && (c.rank !== undefined || c.suit !== undefined)) {
        fail(`${client.name} kunne se rank/suit på et skjult kort!`);
      }
    }
  }
  if (s.drawnCard && s.drawnCard.rank !== undefined) {
    fail(`${client.name} kunne se det trukne korts rank i gameState!`);
  }
}

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail("Serveren kom aldrig op på /api/health");
}

async function main() {
  console.log("Starter server på port", PORT);
  const child = spawn(process.execPath, ["--import", "tsx", "server/src/index.ts"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  try {
    await waitForHealth();
    console.log("✅ Server svarer på health");

    const anna = new Client("Anna");
    const bo = new Client("Bo");
    await Promise.all([anna.open(), bo.open()]);

    anna.send({ type: "createRoom", name: "Anna", avatar: "🦊" });
    const joined = await anna.waitFor(
      (c) => c.inbox.find((m) => m.type === "joined"),
      "joined (Anna)",
    );
    const code = joined.code;
    console.log("✅ Rum oprettet:", code);
    if (!/^[A-HJ-NP-Z]{4}$/.test(code)) fail(`Rumkode ${code} indeholder forbudte tegn`);

    bo.send({ type: "joinRoom", code, name: "Bo", avatar: "🐻" });
    await bo.waitFor((c) => c.inbox.find((m) => m.type === "joined"), "joined (Bo)");
    await anna.waitFor(
      (c) => c.inbox.find((m) => m.type === "roomState" && m.room.players.length === 2),
      "roomState med 2 spillere",
    );
    console.log("✅ Bo joinede rummet");

    anna.send({
      type: "updateRules",
      rules: {
        targetScore: 50,
        memorizeSeconds: 5,
        jumpInWindowSeconds: 3,
        jumpInPenalty: "card",
        turnTimerSeconds: 0,
        allowDrawFromDiscard: false,
      },
    });
    anna.send({ type: "startGame" });

    for (const c of [anna, bo]) {
      const peek = await c.waitFor(
        (x) => x.peeks.find((p) => p.context === "memorize"),
        `memorize-peek (${c.name})`,
      );
      if (peek.cards.length !== 2) fail(`${c.name} fik ${peek.cards.length} memorize-kort, ikke 2`);
      if (!peek.cards[0].card.rank) fail("memorize-peek mangler rank");
    }
    console.log("✅ Begge fik privat memorize-peek med 2 kort");

    assertRedacted(anna);
    assertRedacted(bo);
    console.log("✅ Redaction: ingen skjulte ranks i gameState");

    // Begge klienter spiller deres tur når den kommer; første spiller kalder Baguette.
    const playLoop = (client) => {
      let drew = false;
      let discarded = false;
      let calledBaguette = false;
      const tick = () => {
        const s = client.state;
        if (!s || s.phase !== "playing") return null;
        const me = s.players[s.currentPlayerIndex];
        if (me.id !== client.playerId) return null;
        if (s.turnStage === "draw" && !drew) {
          drew = true;
          client.send({ type: "action", action: { type: "draw" } });
        } else if (s.turnStage === "decide" && !discarded) {
          discarded = true;
          client.send({ type: "action", action: { type: "discardDrawn", useAbility: false } });
        } else if (
          s.turnStage === "window" &&
          s.baguette.callerId === null &&
          !calledBaguette
        ) {
          calledBaguette = true;
          client.send({ type: "action", action: { type: "baguette" } });
        }
        return null;
      };
      client.waiters.push(tick);
      return tick;
    };
    playLoop(anna);
    playLoop(bo);

    const reveal = await anna.waitFor(
      (c) => c.events.find((e) => e.type === "revealStarted"),
      "revealStarted",
      40000,
    );
    console.log("✅ Runden blev spillet færdig: reveal nået");

    const entries = reveal.reveal.entries;
    if (entries.length !== 2) fail("Reveal mangler spillere");
    for (const e of entries) {
      if (typeof e.rawSum !== "number" || typeof e.newTotal !== "number") {
        fail("Reveal-entry mangler scorer");
      }
    }
    const caller = reveal.reveal.baguetteCallerId;
    if (!caller) fail("Ingen baguette-kalder i reveal");
    const callerEntry = entries.find((e) => e.playerId === caller);
    if (callerEntry.adjustment !== -3 && callerEntry.adjustment !== 5) {
      fail(`Baguette-justering er ${callerEntry.adjustment}, forventede -3 eller +5`);
    }
    console.log(
      `✅ Scorer beregnet. Baguette-kalder fik ${callerEntry.adjustment > 0 ? "+" : ""}${callerEntry.adjustment}`,
    );

    await anna.waitFor((c) => c.state?.phase === "reveal", "reveal-fase i state");
    const annaSeesCards = anna.state.players.every((p) =>
      p.grid.every((c) => c === null || c.rank !== undefined),
    );
    if (!annaSeesCards) fail("Kortene blev ikke afsløret i reveal-fasen");
    console.log("✅ Alle kort synlige i reveal");

    // Reconnect-tjek: Bo "mister" forbindelsen og kommer tilbage med sin token.
    const boToken = bo.inbox.find((m) => m.type === "joined").token;
    bo.ws.close();
    await new Promise((r) => setTimeout(r, 500));
    const bo2 = new Client("Bo2");
    await bo2.open();
    bo2.send({ type: "joinRoom", code, name: "Bo", avatar: "🐻" , token: boToken });
    const rejoined = await bo2.waitFor(
      (c) => c.inbox.find((m) => m.type === "joined"),
      "reconnect (Bo)",
    );
    if (rejoined.playerId !== bo.playerId) fail("Reconnect gav ikke samme sæde");
    await bo2.waitFor((c) => c.state !== null, "state efter reconnect");
    console.log("✅ Reconnect med token gav samme sæde + frisk state");

    if (anna.errors.length > 0 || bo.errors.length > 0) {
      console.log("⚠️ Fejlbeskeder undervejs:", [...anna.errors, ...bo.errors]);
    }

    console.log("\n🥖 ALT GRØNT — en hel runde spillet via WS med 2 forbindelser.");
  } finally {
    child.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
