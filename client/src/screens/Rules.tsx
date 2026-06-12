// In-app rules — Danish rendition of the full spec (afsnit 3).

import { useStore } from "../store";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-3xl p-4">
      <h2 className="mb-2 font-display text-lg font-extrabold text-gold-bright">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-cream/85">{children}</div>
    </section>
  );
}

export function Rules() {
  const goto = useStore((s) => s.goto);
  const previous = useStore((s) => s.previousScreen);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+16px)]">
      <header className="flex items-center justify-between">
        <button
          className="text-sm font-bold text-cream/60"
          onClick={() => goto(previous === "rules" ? "home" : previous)}
        >
          ‹ Tilbage
        </button>
        <h1 className="font-display text-xl font-black">Regler 📖</h1>
        <span className="w-14" />
      </header>

      <Section title="Målet">
        <p>
          Nu Nederen er et hukommelses-kortspil. Du vil have <b>FÆRREST point</b>.{" "}
          <b>Først til 50 point taber</b> og er »Nederen« 🥖. Vinderen er den med færrest point,
          når spillet slutter.
        </p>
      </Section>

      <Section title="Kortværdier">
        <ul className="list-inside space-y-1">
          <li>🃏 Joker: <b>−3</b> (guld værd!)</li>
          <li>Es: 1 · 2–9: pålydende</li>
          <li>10 / Bonde / Dame: 10</li>
          <li>♥♦ Rød konge: <b>0</b> — behold den!</li>
          <li>♠♣ Sort konge: <b>25</b> — av.</li>
        </ul>
      </Section>

      <Section title="Sådan spiller du">
        <p>
          Alle får <b>4 kort med billedsiden nedad</b> i et 2×2-grid. Ved rundens start får du{" "}
          <b>10 sekunder</b> til at se dine <b>2 nederste kort</b> — derefter skal du HUSKE dem.
          De vises aldrig igen!
        </p>
        <p>
          På din tur: <b>træk</b> det øverste kort fra bunken og vælg:
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <b>Byt ind</b>: læg det trukne kort skjult på en af dine pladser — kortet der lå der
            ryger åbent på afkastbunken.
          </li>
          <li>
            <b>Smid</b>: læg det trukne kort åbent på afkastbunken.
          </li>
        </ul>
      </Section>

      <Section title="Special-evner">
        <p>
          Kun når kortet er <b>trukket fra bunken og smides direkte</b>:
        </p>
        <ul className="list-inside space-y-1">
          <li>
            <b>10 → »Kig«</b> 👁: se ét valgfrit kort på bordet (kun du ser det — i 5 sekunder).
          </li>
          <li>
            <b>Bonde → »Byt rundt«</b> 🔀: byt to valgfrie kort på bordet — blindt. Alle ser{" "}
            <i>hvilke</i> pladser, ingen ser billedsiderne.
          </li>
        </ul>
        <p>Evnen kan altid springes over.</p>
      </Section>

      <Section title="Jump-in ⚡">
        <p>
          Hver gang et kort lander åbent på afkastbunken, åbner et <b>jump-vindue (5 sek)</b>.{" "}
          <b>Alle</b> — også uden for tur — må tappe ét af deres egne kort:
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <b>Samme rang?</b> Kortet flyver på bunken — du har nu ét kort færre! Og et nyt vindue
            åbner (kæder!).
          </li>
          <li>
            <b>Forkert?</b> Du trækker et strafkort, som du IKKE må se.
          </li>
        </ul>
        <p>Hurtigste tap vinder. At jumpe sit sidste kort væk er tilladt: 0 kort = 0 point.</p>
      </Section>

      <Section title="Baguette 🥖">
        <p>
          Tror du, at du har færrest point? Kald <b>Baguette</b> som det allersidste i din tur
          (hold knappen inde). Alle andre får <b>præcis én tur mere</b> — så vendes alle kort:
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>Havde du (delt) lavest? <b>−3 bonus</b> 🎉</li>
          <li>Ellers: <b>+5 straf</b> 😬</li>
        </ul>
      </Section>

      <Section title="Rundeafslutning">
        <p>
          Kortene vendes dramatisk én efter én — Baguette-kalderen til sidst. Din rundesum lægges
          til din samlede score (minus er muligt!). Når mindst én spiller når{" "}
          <b>50 point</b>, slutter spillet: højeste score er <b>Nederen</b>, laveste vinder.
        </p>
        <p>
          Løber trækbunken tom, blandes afkastbunken (minus toppen) og bruges igen.
        </p>
      </Section>

      <Section title="Husregler">
        <p>
          Værten kan justere: mål (50/75/100), memorize-tid (5/10/15 s), jump-vindue (3/5/8 s),
          straf (kort eller +5), turtimer (fra/30/60 s) og om man må trække fra afkastbunken.
        </p>
      </Section>
    </div>
  );
}
