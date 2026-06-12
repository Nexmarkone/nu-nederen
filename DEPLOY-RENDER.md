# Læg Nu Nederen gratis på Render.com 🥖

Render kører spillet i skyen, gratis, uden at du skal installere noget hjemme.
Det tager ~10 minutter, og du skal bruge to gratis konti: **GitHub** (hvor koden
ligger) og **Render** (som kører den).

> **Vigtigt om gratis-planen:** Serveren "sover" efter 15 min uden spillere — den
> første ven der åbner linket venter ~1 minut på at den vågner. Derefter kører
> det fint. Toplisten nulstilles når serveren sover (gratis-planen har ingen
> permanent disk). Vil du have en topliste der ALDRIG nulstilles, kræver det
> NUC'en eller Renders disk-tilvalg (~7 kr/md).

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
