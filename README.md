# Nu Nederen 🥖

**Online kortspil til iPhone (PWA) — først til 50 point taber og er "Nederen".**

Et hukommelses-kortspil i Cabo-familien: 4 skjulte kort foran dig, 10 sekunder til at
huske de to nederste — og derefter er det ren hukommelse, jump-ins og veltimede
Baguetter. Spil med venner via en 4-bogstavs rumkode eller mod bots i tre
sværhedsgrader.

- 📱 **iPhone-først PWA** — spilles i Safari, installeres på hjemmeskærmen
- ⚡ **Realtid** via WebSockets — ingen login, ingen app store
- 🤖 **Bots**: Bot-Bente (let), Bot-Ib (mellem), MPC-Mogens (tæller kort!)
- 🔒 **Server-autoritativ**: skjulte kort sendes ALDRIG til klienten
- 🇩🇰 Alt UI på dansk

---

## Hurtig start (lokalt)

Kræver Node 22+.

```bash
npm install
npm run dev
```

- Client (Vite): http://localhost:5173
- Server (WS + API): http://localhost:8080 (dev-clienten proxy'er selv `/ws` derhen)

### Vennetest på samme Wi-Fi 📶

```bash
npm run dev -- --host
```

Vite printer din lokale IP — iPhones på samme netværk åbner
`http://<din-lokale-ip>:5173`, joiner med rumkoden, og I spiller.

---

## Tests og kvalitet

```bash
npm test           # engine-testsuite (regler, scoring, redaction) + bot-simulering
npm run typecheck  # TS strict i shared, server og client
```

Spil-enginen er en pure reducer i `shared/` med deterministisk (seedbar) RNG, så
alle regler fra specifikationen er dækket af tests — inkl. jump-in-races,
Baguette-bonus/-straf og anti-snyd-redaction.

Et fuldt WS-integrationstjek (to forbindelser spiller en runde):

```bash
node --import tsx scripts/ws-smoke.mjs
```

---

## Produktion

### Direkte med Node

```bash
npm run build
npm start          # serverer spil + client-bundle på port 8080
```

Én proces, én port (8080, kan ændres med `PORT`). Ingen database — rum lever i
hukommelsen og udløber efter 30 min inaktivitet.

### Docker

```bash
docker build -t nu-nederen .
docker run -p 8080:8080 nu-nederen
```

Eller med compose (genstarter selv efter reboot/crash):

```bash
docker compose up -d
```

### Bag en reverse proxy

- **Nginx Proxy Manager**: slå **"WebSockets Support" TIL** på proxy-hosten —
  ellers dør `/ws`-forbindelsen.
- **Caddy**: `reverse_proxy localhost:8080` — WS proxy'es automatisk.
- **Cloudflare** (orange sky): håndterer WSS uden ekstra opsætning.

### Uden egen server: Railway / Fly.io

Begge bygger Dockerfilen i skyen og kører WebSockets fint:

```bash
# Railway
npm i -g @railway/cli
railway login
railway init && railway up

# Fly.io
fly launch --now
```

Husk at sætte en offentlig port/domæne til 8080 i tjenestens dashboard.

---

## Sådan spiller man (kort version)

1. Alle får 4 kort med billedsiden nedad (2×2). Ved rundestart ser du dine **2
   nederste kort i 10 sekunder** — husk dem!
2. På din tur: træk → **byt ind** (skjult) eller **smid** (åbent).
3. Smider du en **10** må du kigge på ét kort; en **Bonde** lader dig bytte to
   kort blindt.
4. Hver gang et kort lander åbent: **jump-in-vindue** — alle må smide et
   matchende kort fra eget grid. Forkert kort = strafkort!
5. Tror du, du er lavest? Kald **Baguette 🥖** — alle andre får én tur, så
   vendes kortene. Lavest: −3. Ellers: +5.
6. Joker = −3, rød konge = 0, sort konge = 25. **Først til 50 taber.**

Den fulde regelbog ligger i appen under "Regler".

---

## Arkitektur

```
shared/   typer, Zod-protokol og HELE spil-enginen som pure functions (Vitest)
server/   Node 22 + Hono + ws — rooms, timere, redaction, bots (én proces, port 8080)
client/   Vite + React 19 + Tailwind v4 + motion + zustand — PWA med SVG-kort og WebAudio
```

Anti-snyd: klienter modtager kun `{id, faceUp}` for skjulte kort. Private kig
(memorize, trukket kort, "Kig"-evnen) sendes som tidsbegrænsede
`privatePeek`-beskeder. Bots kører 100 % server-side på samme redacted viden
som mennesker.

Reconnect: klienten gemmer `{rumkode, token}` i localStorage og får sit sæde
tilbage ved genforbindelse (< 2 sek. via `visibilitychange`). Forsvinder en
spiller i 90+ sekunder, overtager en mellem-bot sædet — og spilleren kan altid
vende tilbage og kræve det igen.

---

## Fremtid (V2-idéer)

- Konti/statistik på tværs af aftener
- Emoji-reaktioner i spillet
- Tilskuer-tilstand og turneringsmodus
- Native App Store-version ved at wrappe kodebasen i **Capacitor**
- Flere temaer (lys "søndagsbrunch")
