# Kør Nu Nederen på din NUC 🥖 (gratis, altid tændt)

Din NUC kan sagtens det samme som Railway: spillet kører 24/7 hjemme hos dig,
og vennerne spiller via et link — også når de IKKE er på dit Wi-Fi.

Det består af to dele:

1. **Kør serveren på NUC'en** (Docker eller Node)
2. **Gør den tilgængelig fra internettet** (Tailscale Funnel — gratis og uden
   at åbne porte i routeren)

---

## 1A. Med Docker (anbefalet — nemmest at holde kørende)

På NUC'en (Linux eller Windows med Docker Desktop):

```bash
# Kopiér hele Kortspil-mappen til NUC'en (USB, netværksdrev eller git), og:
cd Kortspil
docker compose up -d --build
```

Færdig. `restart: unless-stopped` betyder at spillet **starter selv igen**
efter strømsvigt, genstart og opdateringer — og toplisten ligger i et
Docker-volume, så den overlever alt.

Opdatering senere: kopiér de nye filer over og kør
`docker compose up -d --build` igen.

## 1B. Uden Docker (ren Node 22+)

```bash
cd Kortspil
npm install
npm run build
npm start        # kører på port 8080
```

**Autostart ved genstart:**

- **Windows**: Jobliste → Task Scheduler → "Opret simpel opgave" → Udløser:
  "Når computeren starter" → Handling: Start program →
  Program: `node`, Argumenter: `server/dist/index.js`, Start i: `C:\sti\til\Kortspil`
- **Linux** (systemd): læg dette i `/etc/systemd/system/nu-nederen.service`:

  ```ini
  [Unit]
  Description=Nu Nederen
  After=network.target

  [Service]
  WorkingDirectory=/home/DIG/Kortspil
  ExecStart=/usr/bin/node server/dist/index.js
  Restart=always
  User=DIG

  [Install]
  WantedBy=multi-user.target
  ```

  og kør `sudo systemctl enable --now nu-nederen`.

---

## 2. Adgang udefra: Tailscale Funnel (gratis, ingen port-åbning)

Uden dette kan kun folk på dit eget Wi-Fi spille. Tailscale Funnel giver dig en
offentlig **https://**-adresse, der peger på NUC'en — uden at røre routeren, og
HTTPS er påkrævet for at PWA'en ("Føj til hjemmeskærm") virker.

På NUC'en:

```bash
# 1. Installér Tailscale (tailscale.com/download) og log ind (gratis konto)
tailscale up

# 2. Tænd for Funnel på spillets port — kører i baggrunden:
tailscale funnel --bg 8080

# 3. Den printer din offentlige adresse, fx:
#    https://din-nuc.tail1234.ts.net
```

Den adresse kan du SMS'e til vennerne — den virker fra hele verden, WebSockets
og det hele. (Første gang beder kommandoen dig godkende Funnel i Tailscales
admin-side — følg linket den printer.)

**Alternativer:**

- **Port forwarding + DDNS** (DuckDNS): klassisk, men kræver router-adgang og
  giver kun http:// (så PWA-install ikke virker) — brug hellere Funnel.
- **Cloudflare Tunnel**: også gratis og glimrende, men kræver at du ejer et
  domæne.

---

## 3. Husk på NUC'en

- Slå **dvale/sleep fra** i strømindstillingerne (ellers "slukker serveren"
  når skærmen gør).
- Spillet bruger næsten ingen strøm/CPU — en NUC mærker det ikke.
- Tjek at det kører: åbn `http://localhost:8080/api/health` på NUC'en.

## Hjælp

Hvis du giver mig adgang til NUC'en (fx SSH: IP-adresse + brugernavn), kan jeg
sætte det hele op for dig.
