# Læg Nu Nederen gratis på Render.com 🥖

Render kører spillet i skyen, gratis, uden at du skal installere noget hjemme.
Det tager ~10 minutter, og du skal bruge to gratis konti: **GitHub** (hvor koden
ligger) og **Render** (som kører den).

> **Vigtigt om gratis-planen:** Serveren "sover" efter 15 min uden spillere — den
> første ven der åbner linket venter ~1 minut på at den vågner. Derefter kører
> det fint.
>
> **Permanent topliste (gratis):** Toplisten gemmes tilbage på GitHub (en
> `data`-branch i dit repo), så den HUSKER på tværs af aftener — også når
> serveren har sovet. Det kræver, at du laver en GitHub-"nøgle" (token) én gang
> — se afsnittet "Trin 4" nedenfor.

---

## Trin 1 — Læg koden på GitHub

**Nemmest:** lad mig gøre det for dig. Jeg installerer GitHub-værktøjet, du
logger ind én gang i browseren, og så uploader jeg hele projektet automatisk.
Sig bare til.

**Selv (manuelt):**

1. Opret en gratis konto på <https://github.com>.
2. Klik **New repository** → navn fx `nu-nederen` → **Private** → **Create**.
3. Følg GitHubs "…or push an existing repository" — eller bed mig om de præcise
   kommandoer, når repo'et er oprettet.

---

## Trin 2 — Forbind Render

1. Opret en gratis konto på <https://render.com> (log ind med din GitHub-konto —
   så hænger de sammen med det samme).
2. Klik **New +** → **Blueprint**.
3. Vælg dit `nu-nederen`-repo. Render finder selv `render.yaml` og foreslår en
   web-service på gratis-planen.
4. Klik **Apply** / **Create**. Render bygger Dockerfilen (~3-5 min).
5. Når den er grøn, får du en adresse som `https://nu-nederen.onrender.com`.

Den adresse er dit spil! SMS den til vennerne — den virker fra hele verden, på
iPhone, iPad, Android og computer. HTTPS er med, så "Føj til hjemmeskærm"
(install som app) virker også.

---

## Trin 3 — Test

Åbn adressen, lav et rum, og del koden. Færdig 🥖

Opdateringer senere: hver gang koden skubbes til GitHub, bygger Render automatisk
den nye version (`autoDeployTrigger: commit`).

---

## Trin 4 — Permanent topliste (GitHub-token)

Så toplisten husker for evigt. Du laver en "nøgle", som lader serveren skrive
resultaterne tilbage til dit GitHub-repo.

### A. Lav nøglen (token)

1. Gå til <https://github.com/settings/personal-access-tokens/new>
   (GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new)
2. **Token name:** fx `nu-nederen topliste`
3. **Expiration:** vælg en lang dato (fx 1 år) eller "No expiration"
4. **Repository access:** vælg **Only select repositories** → vælg **nu-nederen**
5. **Permissions:** klik **Repository permissions** → find **Contents** → vælg
   **Read and write** *(det er den eneste tilladelse, der skal bruges)*
6. Klik **Generate token** nederst → **kopiér** nøglen (starter med `github_pat_…`)
   — du kan kun se den én gang!

### B. Giv Render nøglen

1. På Render: åbn din **nu-nederen**-service → klik **Environment** i venstre menu
2. Find (eller tilføj) en variabel med navn **`GITHUB_TOKEN`**
3. Sæt værdien til den nøgle, du kopierede → **Save changes**
4. Render genstarter automatisk. Færdig!

Toplisten gemmes nu på `data`-branchen i dit repo og overlever alt. 🥖

> 🔒 **Hold nøglen hemmelig** — indsæt den kun i Renders Environment (den er
> krypteret der). Del den aldrig. Mister du den, laver du bare en ny.
