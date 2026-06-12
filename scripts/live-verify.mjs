// Plays a full game to game-over against the LIVE server, so the leaderboard
// records a result. Used to verify GitHub persistence end-to-end.
//
//   node scripts/live-verify.mjs
//
// The human auto-plays draw -> discard every turn (no swap/jump/baguette) and,
// as host, advances each round. Three hard bots make the game end fast.

import process from "node:process";
import WebSocket from "ws";

const HOST = process.env.NU_HOST ?? "nu-nederen.onrender.com";
const URL = `wss://${HOST}/ws`;
const DEADLINE_MS = 14 * 60 * 1000;

const ws = new WebSocket(URL);
let myId = null;
let hostId = null;
const acted = new Set(); // dedupe by turnCount:stage
const advanced = new Set(); // dedupe nextRound by roundNumber
let finished = false;
let lastRound = 0;
let lastPhase = "";

function send(msg) {
  ws.send(JSON.stringify(msg));
}

const started = Date.now();
const watchdog = setInterval(() => {
  if (Date.now() - started > DEADLINE_MS) {
    console.error("⏱️  Timeout — spillet blev ikke færdigt i tide");
    ws.close();
    process.exitCode = 1;
    clearInterval(watchdog);
  }
}, 5000);

ws.on("open", () => {
  console.log("Forbundet til", URL);
  send({ type: "createRoom", name: "Testspiller", avatar: "🦊" });
});

ws.on("message", (data) => {
  const msg = JSON.parse(String(data));

  if (msg.type === "joined") {
    myId = msg.playerId;
    console.log("Rum oprettet:", msg.code);
    send({
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
    // One medium bot = a fast 2-player game that reaches 50 in a few rounds.
    send({ type: "addBot", difficulty: "medium" });
    setTimeout(() => send({ type: "startGame" }), 600);
    return;
  }

  if (msg.type === "roomState") {
    hostId = msg.room.hostId;
    return;
  }

  if (msg.type === "event" && msg.event.type === "gameOver") {
    finished = true;
    const winners = msg.event.data.winnerIds;
    const losers = msg.event.data.loserIds;
    console.log(`🏁 Spillet er slut efter ${msg.event.rounds} runder.`);
    console.log(`   Vinder(e): ${winners.join(", ")}`);
    console.log(`   Nederen: ${losers.join(", ")}`);
    // Give the server a moment to commit stats to GitHub, then leave.
    setTimeout(() => {
      send({ type: "leaveRoom" });
      ws.close();
      clearInterval(watchdog);
    }, 4000);
    return;
  }

  if (msg.type !== "gameState") return;
  const g = msg.state;
  if (finished || g.phase === "gameOver") return;

  if (g.phase !== lastPhase || g.roundNumber !== lastRound) {
    lastPhase = g.phase;
    lastRound = g.roundNumber;
    const scores = g.players.map((p) => `${p.name}:${p.totalScore}`).join("  ");
    console.log(`[${Math.round((Date.now() - started) / 1000)}s] runde ${g.roundNumber} ${g.phase} — ${scores}`);
  }

  if (g.phase === "reveal") {
    if (myId === hostId && !advanced.has(g.roundNumber)) {
      advanced.add(g.roundNumber);
      setTimeout(() => send({ type: "action", action: { type: "nextRound" } }), 800);
    }
    return;
  }

  if (g.phase === "playing") {
    const cur = g.players[g.currentPlayerIndex];
    if (!cur || cur.id !== myId) return;
    const key = `${g.turnCount}:${g.turnStage}`;
    if (acted.has(key)) return;
    if (g.turnStage === "draw") {
      acted.add(key);
      send({ type: "action", action: { type: "draw" } });
    } else if (g.turnStage === "decide") {
      acted.add(key);
      send({ type: "action", action: { type: "discardDrawn", useAbility: false } });
    }
  }
});

ws.on("close", () => {
  clearInterval(watchdog);
  if (finished) {
    console.log("✅ Færdigt spil registreret — toplisten burde nu være gemt.");
  } else {
    console.log("Forbindelse lukket uden game-over.");
  }
});

ws.on("error", (e) => {
  console.error("WS-fejl:", e.message);
  process.exitCode = 1;
});
