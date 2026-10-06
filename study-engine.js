// Auto-generated from 'Codename: Boothby/mise/src' by build-study.py.
// Do not edit here - edit there, rerun build-study.py, redeploy.
/* ---- mastery.js ---- */
// Mastery model. Per CONCEPT, never per card — that is what lets a question
// never repeat while review still lands on weakness.
//
// Selection targets the learning zone. The spec sets ~75-80% correct; the
// implementation is TARGET = 0.78 and "pick the concept whose predicted
// success is nearest it". That is the difficulty dial, actually implemented
// rather than asserted.

const TARGET = 0.78;
const PRIOR = 0.5;      // an unseen concept is a coin flip
const ALPHA = 0.3;      // EWMA weight on the newest answer
const HALFLIFE_DAYS = 10;

function blankConcept() {
  return { n: 0, right: 0, ewma: PRIOR, last: null };
}

// Decayed accuracy: old evidence fades toward the prior, so a concept you
// nailed two months ago comes back rather than being marked known forever.
function predict(c, now = Date.now()) {
  if (!c || !c.n) return PRIOR;
  if (!c.last) return c.ewma;
  const days = (now - c.last) / 86400000;
  const decay = Math.pow(0.5, days / HALFLIFE_DAYS);
  return PRIOR + (c.ewma - PRIOR) * decay;
}

function record(c, correct, now = Date.now()) {
  const next = c ? { ...c } : blankConcept();
  next.n += 1;
  next.right += correct ? 1 : 0;
  next.ewma = next.ewma * (1 - ALPHA) + (correct ? 1 : 0) * ALPHA;
  next.last = now;
  return next;
}

// Distance from the learning zone. Lower is a better next question.
function zoneDistance(c, now = Date.now()) {
  return Math.abs(predict(c, now) - TARGET);
}

// Pick the next concept. Nearest the target wins, with a little noise so the
// deck does not become deterministic, and unseen concepts get a mild nudge
// so breadth happens before depth.
function pickConcept(concepts, state, rng = Math.random, now = Date.now()) {
  if (!concepts.length) return null;
  let best = null, bestScore = Infinity;
  for (const id of concepts) {
    const c = state[id];
    let score = zoneDistance(c, now) + rng() * 0.12;
    if (!c || !c.n) score -= 0.05;
    if (score < bestScore) { bestScore = score; best = id; }
  }
  return best;
}

function summary(state, now = Date.now()) {
  const ids = Object.keys(state);
  const seen = ids.filter((i) => state[i].n > 0);
  const strong = seen.filter((i) => predict(state[i], now) >= 0.85);
  const weak = seen.filter((i) => predict(state[i], now) < 0.6);
  return { concepts: ids.length, seen: seen.length, strong: strong.length, weak: weak.length };
}

/* ---- generators.js ---- */
// Card generators. Templates over San Fermo's own data, NOT a question bank —
// that is what satisfies "not just repeating the same questions over and over".
// Mastery is tracked per concept, so the concept returns while the card does not.
//
// Every generator returns null rather than inventing anything when the corpus
// lacks the data. The deck never asks a question the house cannot answer.
//
// 2026-10-06 review of 100 drawn cards found three faults this file now guards:
//   1. The name answered the question ("Where is the Voliero BRUNELLO DI MONTALCINO
//      from?"). Place, grape and odd-one-out cards now name the PRODUCER only, and
//      drawCard rejects any card whose right answer shares a word with its stem.
//   2. Distractors from the wrong shape ("How full do you pour?" / "Checking the
//      guest likes it"). Somm items carry their own shape-matched wrong answers.
//   3. The same shape or subject too often. drawCard caps a shape at 2 per 12 cards
//      and will not reuse a subject within 12 cards.

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build a 4-choice card from one right answer and a pool of wrong ones.
function choices(right, pool, rng, n = 3) {
  const wrong = shuffle([...new Set(pool.filter((x) => x && x !== right))], rng).slice(0, n);
  if (wrong.length < n) return null;
  const all = shuffle([right, ...wrong], rng);
  return { choices: all, answer: all.indexOf(right) };
}

const keepers = (c) => c.wines.filter((w) => w.status.startsWith("core"));
// "Friuli" and "Friuli-Venezia Giulia" are one place; the data spells it both ways.
const region = (w) => { const r = w.region.split(",").pop().trim(); return r === "Friuli" ? "Friuli-Venezia Giulia" : r; };
const clip = (s, n) => (s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

// ---- teaching notes ------------------------------------------------------------
// corpus.teach carries a one-line note per grape and per place (sources/teach.json).
// A card's "why" ends with the note for its subject, so the answer connects to the
// grape's structure or the place's logic rather than restating the label. Sam,
// 2026-10-06: "understand wine from the ground up, with our bottles as examples."
function teach(c, kind, name) {
  const n = c.teach && c.teach[kind] && c.teach[kind][name];
  return n && n.note ? " " + n.note : "";
}
const spec = (w, label) => { const s = (w.specs || []).find((x) => x.label === label); return s ? s.rating : null; };

// ---- words -------------------------------------------------------------------
// Tokens that carry no information about the answer. Everything else in a stem
// or an answer counts when checking for a giveaway.
const STOP = new Set(("di de del della delle dell the house white red rosé rose orange vino bianco rosso " +
  "docg doc igt igp dop nv unfiltered " +
  "which these this that from what where when with does into onto your their guest guests table " +
  "wine wines glass bottle list pour pours sits sit after dinner flight flights step steps service " +
  "standard standards made make makes more most less than about half yes only none ever never " +
  "right wrong three four first next last some have has had been being were they them then " +
  "would could should will shall must just like look looks want wants spend spends pour pours").split(/\s+/));
function words(s) {
  return String(s || "").toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9àèéìòùäöü]+/)
    .filter((t) => t.length > 3 && !STOP.has(t) && !/^\d+$/.test(t));
}
// short words compare on four letters ("amaro"/"amari", "porto"/"port"), longer ones on
// five, so "months" does not collide with "Montalcino" or "Nere" with "Nerello"
const stem4 = (t) => t.slice(0, t.length <= 5 ? 4 : 5);
// A word in the answer that also appears in the stem (or shares a 5-letter stem:
// "porto"/"port", "amaretto"/"amaro") gives the card away.
function leaks(stem, answer) {
  const s = new Set(words(stem).map(stem4));
  return words(answer).some((t) => s.has(stem4(t)));
}
// Blank every distinctive word of `names` out of `text`, so a note can describe a
// wine without naming it, its grape or its region.
function redact(text, names) {
  let out = String(text || "");
  const toks = new Set(names.flatMap((n) => words(n)));
  // tokens come apostrophe-free ("dalba"), the text may not ("d'Alba"): allow one between letters
  for (const t of toks) out = out.replace(new RegExp("\\b" + t.split("").map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\u2019']?") + "\\w*", "gi"), "—");
  // "— del —", "— di —": the little words between two blanks say nothing, drop them too
  out = out.replace(/—(\s+(di|del|della|delle|dei|de|d|la|le|il|lo|dal|dalla|degli|the|of)\s+—)+/gi, "—");
  return out.replace(/(—\s*){2,}/g, "— ").replace(/—\s*:/g, "—").replace(/—\s*[\u2019']s\b/g, "—");
}

// ---- producer names ------------------------------------------------------------
// Italian labels spell out the appellation and often the grape, so a question that
// prints the whole name is answered by reading it. Strip to the house: everything
// before the first quoted fantasy name or the first appellation/grape word.
const APPELLATION = new Set(("langhe barolo barbaresco chianti brunello rosso montalcino soave valpolicella " +
  "prosecco champagne etna collio fiano avellino amarone lagrein carmignano lambrusco sorbara " +
  "montepulciano abruzzo vermentino orange vino bianco arneis sauvignon blanc premier cru riserva " +
  "classico nebbiolo barbera superiore alba brut rosato negroamaro copertino sassella timorasso " +
  "derthona colli tortonesi terlaner primo grande cuvée rosé casanova doc docg igt nv unfiltered " +
  "roero dolcetto chardonnay pinot bianco nero grigio franciacorta valtellina alto adige").split(/\s+/));
// Memoised per corpus: label() asks for every wine's producer for every card, and the
// grape/region word set is the same every time (the test suite went to 90 s without this).
const PROD_CACHE = new WeakMap();
function producer(w, c) {
  let cache = c && PROD_CACHE.get(c);
  if (c && !cache) { cache = { extra: null, by: new Map() }; PROD_CACHE.set(c, cache); }
  if (cache && cache.by.has(w.id)) return cache.by.get(w.id);
  const extra = cache
    ? (cache.extra ||= new Set(c.wines.flatMap((x) => [...x.grapes, region(x)]).flatMap((s) => words(s))))
    : new Set();
  let name = w.name.replace(/^house (white|red|prosecco|rosé|rose|sparkling):\s*/i, "");
  const out = [];
  for (const tok of name.split(/\s+/)) {
    if (/^["“‘']/.test(tok)) break;
    const low = tok.toLowerCase().replace(/[^a-zà-ü.]/g, "");
    if (APPELLATION.has(low) || extra.has(low)) break;
    out.push(tok.replace(/,$/, ""));
    if (/,$/.test(tok)) break;
  }
  const p = out.join(" ").trim();
  // a producer that IS the whole name tells nothing extra; a one-letter stub is junk
  const result = (!p || p.length < 4 || p.length >= name.trim().length) ? null : p;
  if (cache) cache.by.set(w.id, result);
  return result;
}
// Several wines from one house -> say which. "Brigaldara, the white".
function label(w, c) {
  const p = producer(w, c);
  if (!p) return null;
  const siblings = c.wines.filter((x) => x.id !== w.id && producer(x, c) === p);
  if (!siblings.length) return p;
  const sameType = siblings.some((x) => x.type === w.type);
  return sameType ? `${p} (${w.name.match(/"([^"]+)"/)?.[1] || w.type})` : `${p}, the ${w.type}`;
}

// Obvious allergens: the name says it. Never ask those.
const OBVIOUS = { almond: "nuts", burrata: "dairy", cheese: "dairy", baguette: "gluten", bread: "gluten",
  pasta: "gluten", farfalle: "gluten", mafaldine: "gluten", carbonara: "egg", salmon: "fish", egg: "egg",
  gelato: "dairy", tiramisu: "dairy" };
function obvious(dish, allergen) {
  return words(dish.name).some((t) => Object.keys(OBVIOUS).some((k) => t.startsWith(k) && OBVIOUS[k] === allergen));
}

// WEIGHT governs how often a generator is drawn. The thin list-facts — is it on
// the list, by the glass, which costs more — are worth knowing and cheap to answer,
// which is exactly why they must not dominate. Weight 1 is the baseline; the
// shallow ones sit at it, the floor scenarios and the house's own notes sit above.
const GENERATORS = [
  {
    id: "wine.place", weight: 2,
    make(c, rng) {
      const w = pick(keepers(c).filter((x) => label(x, c)), rng);
      if (!w) return null;
      const regions = [...new Set(c.wines.map(region))];
      const ch = choices(region(w), regions, rng);
      if (!ch) return null;
      return {
        key: `wine.place|${w.id}`, ref: { type: "wine", name: w.name }, concept: `wine.place.${slug(region(w))}`,
        form: "choice", stem: `${label(w, c)} — where is it from?`, ...ch,
        why: `${w.name} — ${w.region}, ${w.country}.` + teach(c, "places", region(w)),
      };
    },
  },
  {
    id: "wine.grape", weight: 2,
    make(c, rng) {
      const w = pick(keepers(c).filter((x) => x.grapes.length === 1 && label(x, c)), rng);
      if (!w) return null;
      const grapes = [...new Set(c.wines.flatMap((x) => x.grapes))];
      const ch = choices(w.grapes[0], grapes, rng);
      if (!ch) return null;
      return {
        key: `wine.grape|${w.id}`, ref: { type: "wine", name: w.name }, concept: `wine.grape.${slug(w.grapes[0])}`,
        form: "choice", stem: `What grape is ${label(w, c)} made from?`, ...ch,
        why: `${w.name} — 100% ${w.grapes[0]}.` + teach(c, "grapes", w.grapes[0]),
      };
    },
  },
  {
    id: "wine.onlist", weight: 1,
    make(c, rng) {
      // Distractors are wines that WERE in the building and are not now —
      // plausible and genuinely wrong, which is what a good distractor is.
      const onList = rng() < 0.5;
      const w = onList ? pick(keepers(c), rng) : pick(c.distractors, rng);
      if (!w) return null;
      return {
        key: `wine.onlist|${slug(w.name)}`, ref: onList ? { type: "wine", name: w.name } : null, concept: "wine.list.recognition",
        form: "choice", stem: `Is the ${w.name} on our list right now?`,
        choices: ["Yes", "No"], answer: onList ? 0 : 1,
        why: onList
          ? `Yes — it is on the printed list.`
          : `No. It was on the list once and is kept in the inventory sheet for price tracking, but it is not in the building.`,
      };
    },
  },
  {
    id: "wine.btg", weight: 1,
    make(c, rng) {
      const w = pick(keepers(c), rng);
      const byGlass = w.status === "core-glass";
      return {
        key: `wine.btg|${w.id}`, ref: { type: "wine", name: w.name }, concept: "wine.list.btg",
        form: "choice", stem: `Can a guest get the ${w.name} by the glass?`,
        choices: ["Yes", "No — bottle only"], answer: byGlass ? 0 : 1,
        why: byGlass ? `Yes — $${w.glass} a glass, $${w.bottle} a bottle.` : `Bottle only, $${w.bottle}.`,
      };
    },
  },
  {
    id: "wine.price", weight: 1,
    make(c, rng) {
      const pool = keepers(c).filter((w) => w.bottle);
      const a = pick(pool, rng);
      const b = pick(pool.filter((w) => w.bottle !== a.bottle && w.type === a.type), rng);
      if (!b) return null;
      const dearer = a.bottle > b.bottle ? a : b;
      const all = shuffle([a, b], rng);
      return {
        key: `wine.price|${[a.id, b.id].sort().join("|")}`, concept: "wine.econ.price",
        form: "choice", stem: `Two ${a.type}s. Which is the more expensive bottle?`,
        choices: all.map((w) => w.name), answer: all.indexOf(dearer),
        why: `${a.name} $${a.bottle}; ${b.name} $${b.bottle}.`,
      };
    },
  },
  {
    id: "wine.substitute", weight: 3,
    make(c, rng) {
      const pool = keepers(c).filter((w) => w.bottle);
      const target = pick(pool.filter((w) => w.bottle >= 90), rng);
      if (!target) return null;
      const cap = Math.round(target.bottle / 2);
      const same = pool.filter((w) => w.type === target.type && w.bottle <= cap && w.id !== target.id);
      if (!same.length) return null;
      const right = same.reduce((x, y) => (x.bottle > y.bottle ? x : y));
      // wrong answers are over the cap AND never the wine the guest was looking at
      const wrong = pool.filter((w) => w.bottle > cap && w.id !== right.id && w.id !== target.id).map((w) => w.name);
      const ch = choices(right.name, wrong, rng);
      if (!ch) return null;
      return {
        key: `wine.substitute|${target.id}`, ref: { type: "wine", name: right.name }, concept: "wine.floor.substitution",
        form: "choice",
        stem: `A guest likes the look of the ${target.name} at $${target.bottle} but wants to spend about half that. What do you pour?`,
        ...ch,
        why: `${right.name} at $${right.bottle} is the closest ${right.type} under $${cap}.` + teach(c, "grapes", right.grapes[0]),
      };
    },
  },
  {
    id: "wine.cost", weight: 1,
    make(c, rng) {
      // Only wines whose cost is markable. The 9 with no cost and the 2 with a
      // cost belonging to a different bottling are taught, never marked.
      const pool = keepers(c).filter((w) => w.cost_markable && w.bottle_cost_pct);
      const a = pick(pool, rng);
      const b = pick(pool.filter((w) => w.bottle_cost_pct !== a.bottle_cost_pct), rng);
      if (!a || !b) return null;
      const better = a.bottle_cost_pct < b.bottle_cost_pct ? a : b;
      const all = shuffle([a, b], rng);
      return {
        key: `wine.cost|${[a.id, b.id].sort().join("|")}`, concept: "wine.econ.cost",
        form: "choice", stem: "Which of these two makes us more margin, as a share of the bottle price?",
        choices: all.map((w) => w.name), answer: all.indexOf(better),
        why: `${a.name} runs ${a.bottle_cost_pct}% cost; ${b.name} runs ${b.bottle_cost_pct}%. Lower is better.`,
      };
    },
  },
  {
    id: "wine.phaseout", weight: 1,
    make(c, rng) {
      const w = pick(c.wines, rng);
      const going = w.status === "phase-out";
      return {
        key: `wine.phaseout|${w.id}`, ref: { type: "wine", name: w.name }, concept: "wine.list.phaseout",
        form: "choice", stem: `Are we reordering the ${w.name}?`,
        choices: ["Yes — it stays", "No — selling through"], answer: going ? 1 : 0,
        why: going ? `Phasing out. Sell it, do not promise it.` : `Staying on the list.`,
      };
    },
  },
  {
    // The house's own pour note, producer story or winemaking — the words the
    // floor sells from — with the wine, its grape and its place blanked out.
    id: "wine.note", weight: 4,
    make(c, rng) {
      const pool = keepers(c).filter((w) => w.pour || w.producer_note || w.winemaking);
      const w = pick(pool, rng);
      if (!w) return null;
      const fields = [["pour", "Which wine is this pour note for?"], ["producer_note", "Whose story is this?"],
                      ["winemaking", "Which wine is made this way?"]].filter(([f]) => w[f] && w[f].length > 60);
      const [field, stem] = pick(fields, rng);
      const hide = [w.name, ...w.grapes, w.region, producer(w, c) || ""];
      const text = clip(redact(w[field], hide), 230);
      // same colour as the subject, so the colour words in the note do not decide it
      const wrong = keepers(c).filter((x) => x.type === w.type && x.id !== w.id).map((x) => x.name);
      const ch = choices(w.name, wrong.length >= 3 ? wrong : keepers(c).filter((x) => x.id !== w.id).map((x) => x.name), rng);
      if (!ch) return null;
      return {
        key: `wine.note|${w.id}|${field}`, ref: { type: "wine", name: w.name }, concept: `wine.note.${w.id.replace(/^wine:/, "")}`,
        form: "choice", stem: `${stem} "${text}"`, ...ch,
        why: `${w.name}. ${clip(w[field], 220)}` + teach(c, "grapes", w.grapes[0]),
      };
    },
  },
  {
    // The other direction: given the wine, pick its own pour note from among
    // three other wines' notes of the same colour.
    id: "wine.note.rev", weight: 2,
    make(c, rng) {
      const pool = keepers(c).filter((w) => w.pour && w.pour.length > 60);
      const w = pick(pool, rng);
      if (!w) return null;
      const peers = pool.filter((x) => x.type === w.type && x.id !== w.id);
      const src = peers.length >= 3 ? peers : pool.filter((x) => x.id !== w.id);
      const line = (x) => clip(redact(x.pour, [x.name, ...x.grapes, x.region, producer(x, c) || ""]), 150);
      const ch = choices(line(w), src.map(line), rng);
      if (!ch) return null;
      return {
        key: `wine.note.rev|${w.id}`, ref: { type: "wine", name: w.name }, concept: `wine.note.${w.id.replace(/^wine:/, "")}`,
        form: "choice", stem: `A guest asks what the ${w.name} is like. Which is our pour note?`, ...ch,
        why: `${w.name}: ${clip(w.pour, 260)}`,
      };
    },
  },
  {
    id: "wine.pron", weight: 2,
    make(c, rng) {
      const pool = keepers(c).filter((w) => w.pron && w.pron.length);
      const w = pick(pool, rng);
      if (!w) return null;
      const p = pick(w.pron, rng);
      const others = pool.filter((x) => x.id !== w.id).flatMap((x) => x.pron).filter((q) => q.term !== p.term).map((q) => q.pron);
      const ch = choices(p.pron, others, rng);
      if (!ch) return null;
      return {
        key: `wine.pron|${w.id}|${slug(p.term)}`, ref: { type: "wine", name: w.name }, concept: "wine.pronunciation",
        form: "choice", stem: `How do you say "${p.term}"?`, ...ch,
        why: `${p.term}: ${p.pron} (${w.name}).`,
      };
    },
  },
  {
    // Floor question that ties the list, the price and the pour together.
    id: "wine.pairing", weight: 3,
    make(c, rng) {
      const btg = keepers(c).filter((w) => w.status === "core-glass" && w.glass);
      const types = [...new Set(btg.map((w) => w.type))].filter((t) => btg.filter((w) => w.type === t).length >= 2);
      const t = pick(types, rng);
      if (!t) return null;
      const ofType = btg.filter((w) => w.type === t).sort((a, b) => a.glass - b.glass);
      const right = pick(ofType, rng);
      const cap = right.glass + (rng() < 0.5 ? 0 : 1);
      // wrong: same colour but over the cap or bottle-only, then other colours by the glass
      const over = ofType.filter((w) => w.glass > cap).map((w) => w.name);
      const bottleOnly = keepers(c).filter((w) => w.type === t && w.status === "core-bottle").map((w) => w.name);
      const other = btg.filter((w) => w.type !== t).map((w) => w.name);
      const wrongPool = [...over, ...shuffle(bottleOnly, rng).slice(0, 2), ...shuffle(other, rng).slice(0, 1)];
      // every under-cap pour of this colour would also be right, so keep them out
      const under = new Set(ofType.filter((w) => w.glass <= cap && w.id !== right.id).map((w) => w.name));
      const ch = choices(right.name, wrongPool.filter((n) => !under.has(n)), rng);
      if (!ch) return null;
      const d = pick(c.dishes.filter((x) => x.section !== "Dessert"), rng);
      return {
        key: `wine.pairing|${right.id}|${cap}`, ref: { type: "wine", name: right.name }, concept: "wine.floor.btg",
        form: "choice",
        stem: `Table has the ${d ? d.name : "pasta"} and wants a ${t} by the glass, $${cap} or under. What do you pour?`, ...ch,
        why: `${right.name} is $${right.glass} a glass.${over.length ? ` Over the line: ${ofType.filter((w) => w.glass > cap).map((w) => `${w.name} $${w.glass}`).join(", ")}.` : ""}`,
      };
    },
  },
  {
    // Reasoning from structure: the portal's scorecards (body, acidity, tannin). A card
    // you can get right by thinking about the grape rather than remembering the bottle.
    id: "wine.structure", weight: 3,
    make(c, rng) {
      const axis = pick(["Acidity", "Tannins", "Body"], rng);
      const pool = keepers(c).filter((w) => spec(w, axis) !== null);
      const a = pick(pool, rng);
      if (!a) return null;
      const b = pick(pool.filter((w) => w.type === a.type && w.id !== a.id && Math.abs(spec(w, axis) - spec(a, axis)) >= 1), rng);
      if (!b) return null;
      const right = spec(a, axis) > spec(b, axis) ? a : b, other = right === a ? b : a;
      const all = shuffle([a, b], rng);
      const word = axis === "Tannins" ? "more tannic" : axis === "Acidity" ? "higher in acid" : "fuller-bodied";
      return {
        key: `wine.structure|${right.id}|${slug(axis)}|${other.id}`, ref: { type: "wine", name: right.name },
        concept: `wine.structure.${slug(axis)}`, form: "choice",
        stem: `Two ${a.type}s. Which is ${word}, and what in the grape tells you?`,
        choices: all.map((w) => w.name), answer: all.indexOf(right),
        why: `${right.name} (${right.grapes[0]}) scores ${spec(right, axis)}/5 on ${axis.toLowerCase()}; ${other.name} (${other.grapes[0]}) ${spec(other, axis)}/5.` + teach(c, "grapes", right.grapes[0]),
      };
    },
  },
  {
    // "Same family, lighter": the substitution a sommelier actually makes.
    id: "wine.lighter", weight: 2,
    make(c, rng) {
      const pool = keepers(c).filter((w) => spec(w, "Body") !== null);
      const target = pick(pool.filter((w) => spec(w, "Body") >= 4), rng);
      if (!target) return null;
      const shares = (w) => w.grapes.some((g) => target.grapes.includes(g));
      const lighter = pool.filter((w) => w.id !== target.id && w.type === target.type && shares(w) && spec(w, "Body") < spec(target, "Body"));
      const right = pick(lighter, rng);
      if (!right) return null;
      const g = right.grapes.find((x) => target.grapes.includes(x));
      const wrong = pool.filter((w) => w.id !== target.id && w.id !== right.id && !shares(w)).map((w) => w.name);
      const ch = choices(right.name, wrong, rng);
      if (!ch) return null;
      return {
        key: `wine.lighter|${target.id}|${right.id}`, ref: { type: "wine", name: right.name }, concept: `wine.grape.${slug(g)}`,
        form: "choice",
        stem: `A guest loved the ${target.name} and wants the same family, but lighter. What do you pour?`, ...ch,
        why: `Same grape — ${g}. ${right.name} is body ${spec(right, "Body")}/5 against ${spec(target, "Body")}/5, and $${right.bottle} against $${target.bottle}.` + teach(c, "grapes", g),
      };
    },
  },
  {
    id: "amaro.group", weight: 2,
    make(c, rng) {
      const x = pick(c.after_dinner.filter((a) => a.group), rng);
      const groups = [...new Set(c.after_dinner.map((a) => a.group).filter(Boolean))];
      const ch = choices(x.group, groups, rng);
      if (!ch) return null;
      return {
        key: `amaro.group|${x.id}`, ref: { type: "amaro", name: x.name }, concept: `amaro.group.${slug(x.group)}`,
        form: "choice", stem: `Where does ${x.name} sit on the after-dinner list?`, ...ch,
        why: `${x.group}. ${x.note || ""}`.trim(),
      };
    },
  },
  {
    id: "amaro.flight", weight: 1,
    make(c, rng) {
      const f = pick(c.flights, rng);
      const p = pick(f.pours, rng);
      const ch = choices(f.name, c.flights.map((x) => x.name), rng, 2);
      if (!ch) return null;
      return {
        key: `amaro.flight|${slug(p.name)}`, ref: { type: "amaro", name: p.name }, concept: "amaro.flights",
        form: "choice", stem: `Which flight is ${p.name} in?`, ...ch,
        why: `"${f.name}" — ${p.origin || ""}. ${p.note || ""}`.trim(),
      };
    },
  },
  {
    id: "dish.allergen", weight: 1,
    make(c, rng) {
      const d = pick(c.dishes.filter((x) => x.allergens && x.allergens.length), rng);
      if (!d) return null;
      const all = [...new Set(c.dishes.flatMap((x) => x.allergens || []))];
      const askable = d.allergens.filter((a) => !obvious(d, a));
      if (!askable.length) return null;
      const right = pick(askable, rng);
      const ch = choices(right, all.filter((a) => !d.allergens.includes(a)), rng);
      if (!ch) return null;
      return {
        key: `dish.allergen|${d.id}|${slug(right)}`, ref: { type: "dish", name: d.name }, concept: `food.allergen.${slug(right)}`,
        form: "choice", stem: `Which of these is in the ${d.name}?`, ...ch,
        why: `${d.name} contains: ${d.allergens.join(", ")}. ${d.allergen_note || "When the card is silent, ask the chef — never guess."}`,
      };
    },
  },
  {
    // The question the floor actually gets: can this dish work for this guest?
    id: "dish.mod", weight: 4,
    make(c, rng) {
      const all = [...new Set(c.dishes.flatMap((x) => x.allergens || []))];
      const d = pick(c.dishes.filter((x) => x.allergens && x.allergen_note), rng);
      if (!d) return null;
      const a = pick(all, rng);
      const inDish = d.allergens.includes(a), mod = (d.can_modify || []).includes(a);
      if (inDish && obvious(d, a) && !mod) return null;
      const opts = ["Yes, as is — it isn't in the dish", "Yes — it comes off cleanly", "No — it's the dish"];
      const answer = !inDish ? 0 : mod ? 1 : 2;
      return {
        key: `dish.mod|${d.id}|${slug(a)}`, ref: { type: "dish", name: d.name }, concept: `food.mod.${slug(a)}`,
        form: "choice", stem: `A guest can't have ${a} and wants the ${d.name}. Can it work?`,
        choices: opts, answer,
        why: `${d.name}: ${d.allergens.join(", ")}${d.can_modify && d.can_modify.length ? ` (can drop: ${d.can_modify.join(", ")})` : ""}. ${d.allergen_note}`,
      };
    },
  },
  {
    // Which of these can a guest with X have as-is: three that contain it, one that does not.
    id: "dish.free", weight: 3,
    make(c, rng) {
      const dishes = c.dishes.filter((x) => x.allergens);
      const all = [...new Set(dishes.flatMap((x) => x.allergens))];
      const a = pick(all, rng);
      const withA = dishes.filter((x) => x.allergens.includes(a) && !obvious(x, a));
      // the safe dish must carry OTHER allergens, so its being free of this one is a real
      // fact and not "olives have nothing in them"; no dessert as the allium-free answer
      const without = dishes.filter((x) => !x.allergens.includes(a) && x.allergens.length >= 2 &&
        !(a === "allium" && x.section === "Dessert"));
      const right = pick(without, rng);
      if (!right || withA.length < 3) return null;
      const ch = choices(right.name, withA.map((x) => x.name), rng);
      if (!ch) return null;
      return {
        key: `dish.free|${right.id}|${slug(a)}`, ref: { type: "dish", name: right.name }, concept: `food.allergen.${slug(a)}`,
        form: "choice", stem: `A guest can't have ${a}. Which of these can they order as it comes?`, ...ch,
        why: `${right.name} has no ${a}. The others: ${ch.choices.filter((n) => n !== right.name).map((n) => { const x = dishes.find((y) => y.name === n); return `${n} (${x.allergens.join(", ")})`; }).join("; ")}.`,
      };
    },
  },
  {
    // The ingredient notes: what a thing on the plate actually is.
    id: "dish.ingredient", weight: 3,
    make(c, rng) {
      const items = c.dishes.flatMap((d) => (d.ingredients || []).filter((i) => i.term && i.note && i.note.length > 40).map((i) => ({ d, i })));
      const x = pick(items, rng);
      if (!x) return null;
      const line = (y) => clip(redact(y.i.note, [y.i.term]), 150);
      const wrong = items.filter((y) => y.i.term !== x.i.term).map(line);
      const ch = choices(line(x), wrong, rng);
      if (!ch) return null;
      return {
        key: `dish.ingredient|${x.d.id}|${slug(x.i.term)}`, ref: { type: "dish", name: x.d.name }, concept: "food.ingredients",
        form: "choice", stem: `On the ${x.d.name} — what is the ${x.i.term}?`, ...ch,
        why: `${x.i.term}${x.i.pronunciation ? ` (${x.i.pronunciation})` : ""}: ${clip(x.i.note, 260)}`,
      };
    },
  },
  {
    id: "service.step", weight: 1,
    make(c, rng) {
      const steps = c.service.steps;
      if (!steps || steps.length < 4) return null;
      const s = pick(steps, rng);
      const ch = choices(s.title, steps.map((x) => x.title), rng);
      if (!ch) return null;
      return {
        key: `service.step|${s.n}`, ref: { type: "standards", name: "service" }, concept: "service.steps",
        form: "choice", stem: `What is step ${s.n} of service?`, ...ch,
        why: s.detail,
      };
    },
  },
  {
    // Sequence as it happens on the floor, not as a numbered list.
    id: "service.next", weight: 3,
    make(c, rng) {
      const steps = (c.service.steps || []).slice().sort((a, b) => a.n - b.n);
      if (steps.length < 4) return null;
      const i = Math.floor(rng() * (steps.length - 1));
      const s = steps[i], next = steps[i + 1];
      const ch = choices(next.title, steps.filter((x) => x.n !== s.n).map((x) => x.title), rng);
      if (!ch) return null;
      return {
        key: `service.next|${s.n}`, ref: { type: "standards", name: "service" }, concept: "service.steps",
        form: "choice", stem: `"${s.title}" is done. What comes next?`, ...ch,
        why: `Step ${next.n}, ${next.title}: ${next.detail}`,
      };
    },
  },
  {
    // The step's own detail, which is where the standard actually lives.
    id: "service.detail", weight: 2,
    make(c, rng) {
      const steps = (c.service.steps || []).filter((s) => s.detail && s.detail.length > 60);
      if (steps.length < 4) return null;
      const s = pick(steps, rng);
      const ch = choices(s.title, steps.map((x) => x.title), rng);
      if (!ch) return null;
      const text = clip(redact(s.detail, [s.title]), 220);
      return {
        key: `service.detail|${s.n}`, ref: { type: "standards", name: "service" }, concept: "service.steps",
        form: "choice", stem: `Which step is this? "${text}"`, ...ch,
        why: `${s.title}: ${s.detail}`,
      };
    },
  },
  {
    // Reverse of wine.grape: tests the SET rather than one bottle. Producer names.
    id: "wine.grape.set", weight: 2,
    make(c, rng) {
      // wine first, then one of its grapes — picking the grape first let the five-grape
      // Etna Bianco answer a third of these cards (2026-10-06 sample)
      const pool = keepers(c).filter((w) => label(w, c) && w.grapes.length);
      const right = pick(pool, rng);
      const g = pick(right.grapes, rng);
      const wrong = pool.filter((w) => !w.grapes.includes(g)).map((w) => label(w, c));
      const ch = choices(label(right, c), wrong, rng);
      if (!ch) return null;
      return {
        key: `wine.grape.set|${right.id}|${slug(g)}`, ref: { type: "wine", name: right.name }, concept: `wine.grape.${slug(g)}`,
        form: "choice", stem: `Which of these is made from ${g}?`, ...ch,
        why: `${right.name} — ${right.grapes.join(", ")}, ${right.region}.` + teach(c, "grapes", g),
      };
    },
  },
  {
    // One producer, more than one wine on the list. Brigaldara (Soave + Valpolicella),
    // Ruggeri Corsini (Matot + Armujan), La Spinetta, Terre Nere.
    id: "wine.producer", weight: 1,
    make(c, rng) {
      const houses = ["Brigaldara","Ruggeri Corsini","La Spinetta","Terre Nere","Viberti"];
      const h = pick(houses, rng);
      const mine = c.wines.filter((w) => w.name.includes(h));
      if (mine.length < 2) return null;
      const a = pick(mine, rng);
      const b = pick(mine.filter((w) => w.id !== a.id), rng);
      if (!b) return null;
      const wrong = c.wines.filter((w) => !w.name.includes(h)).map((w) => w.name);
      const ch = choices(b.name, wrong, rng);
      if (!ch) return null;
      return {
        key: `wine.producer|${slug(h)}|${a.id}`, ref: { type: "wine", name: b.name }, concept: `wine.producer.${slug(h)}`,
        form: "choice",
        stem: `Which of these comes from the same producer as the ${a.name}?`, ...ch,
        why: `${h} makes both — ${mine.map((w) => w.name).join(" and ")}.`,
      };
    },
  },
  {
    // Recall from the house's own tasting note, which is where the sell comes from.
    id: "amaro.note", weight: 3,
    make(c, rng) {
      const x = pick(c.after_dinner.filter((a) => a.note && a.note.length > 40), rng);
      if (!x) return null;
      const ch = choices(x.name, c.after_dinner.map((a) => a.name), rng);
      if (!ch) return null;
      // blank the name, the category word and the style word ("amaretto", "fernet", "Islay")
      const note = clip(redact(x.note, [x.name, x.group || "", "amaretto fernet grappa calvados scotch islay bourbon rye port sherry vermouth"]), 230);
      return {
        key: `amaro.note|${x.id}`, ref: { type: "amaro", name: x.name }, concept: `amaro.note.${slug(x.group || "other")}`,
        form: "choice", stem: `Which one is this? "${note}"`, ...ch,
        why: `${x.name}${x.price ? ` — $${x.price}` : ""}. ${x.group || ""}`.trim(),
      };
    },
  },
  {
    // The odd one out, by producer. Forces the whole set into view rather than one fact.
    id: "wine.region.odd", weight: 2,
    make(c, rng) {
      const pool = keepers(c).filter((w) => label(w, c));
      const byRegion = {};
      for (const w of pool) (byRegion[region(w)] ||= []).push(w);
      const big = Object.keys(byRegion).filter((r) => byRegion[r].length >= 3);
      if (!big.length) return null;
      const r = pick(big, rng);
      const three = shuffle(byRegion[r], rng).slice(0, 3);
      // the odd one shares the country: a French house among three Italian ones is too easy
      const odd = pick(pool.filter((w) => region(w) !== r && w.country === three[0]?.country), rng);
      if (three.length < 3 || !odd) return null;
      const all = shuffle([...three, odd].map((w) => label(w, c)), rng);
      return {
        key: `wine.region.odd|${slug(r)}|${odd.id}`, ref: { type: "wine", name: odd.name }, concept: `wine.place.${slug(r)}`,
        form: "choice", stem: `Three of these houses are in ${r}. Which is not?`,
        choices: all, answer: all.indexOf(label(odd, c)),
        why: `${odd.name} is ${odd.region}. The others: ${three.map((w) => w.name).join("; ")}.` + teach(c, "places", region(odd)),
      };
    },
  },
  {
    // The house standards, in their own words.
    id: "service.standard", weight: 2,
    make(c, rng) {
      const st = (c.service.standards || []).filter((x) => x.title && x.body);
      if (st.length < 2) return null;
      const s = pick(st, rng);
      const ch = choices(s.title, st.map((x) => x.title), rng, Math.min(2, st.length - 1));
      if (!ch) return null;
      const body = clip(redact(s.body, [s.title]), 180);
      return {
        key: `service.standard|${slug(s.title)}`, ref: { type: "standards", name: "service" }, concept: "service.standards",
        form: "choice", stem: `Which standard is this? "${body}"`, ...ch,
        why: `${s.title}. ${s.body}`,
      };
    },
  },
  {
    // The researched craft layer: faults, temperature, decanting, bottle mechanics,
    // the luxury standards, Washington law, floor sales. An item that carries its own
    // `wrong` list uses it (shape-matched: numbers against numbers, yes/no against
    // yes/no); otherwise the distractors are sibling facts from the same set.
    id: "somm.fact", weight: 5,
    make(c, rng) {
      const sets = c.somm?.sets || [];
      if (!sets.length) return null;
      const set = pick(sets, rng);
      const item = pick(set.items, rng);
      const answer = set.choices_from ? item.a : item.v;
      if (!answer) return null;
      const pool = item.wrong || set.choices_from || set.items.map((i) => i.v);
      const ch = choices(answer, pool, rng, Math.min(3, pool.length - (pool.includes(answer) ? 1 : 0)));
      if (!ch) return null;
      return {
        key: `somm.fact|${set.id}|${slug(item.k).slice(0, 40)}`,
        concept: set.concept,
        form: "choice",
        stem: set.stem.replace("{k}", item.k),
        ...ch,
        why: set.why ? set.why.replace("{v}", item.v) : item.v,
        tier: set.tier, source: set.source,
      };
    },
  },
  {
    id: "somm.econ", weight: 1,
    make(c, rng) {
      const pool = c.somm?.economics || [];
      if (!pool.length) return null;
      const e = pick(pool, rng);
      const all = shuffle(e.choices, rng);
      return {
        key: `somm.econ|${slug(e.q).slice(0, 40)}`, concept: e.concept,
        form: "choice", stem: e.q, choices: all, answer: all.indexOf(e.a),
        why: e.why, tier: e.tier, source: e.source,
      };
    },
  },
];

const BAG = GENERATORS.flatMap((g) => Array(g.weight ?? 1).fill(g));

// ---- lessons -------------------------------------------------------------------
// A lesson is a card that asks nothing: one principle in a few lines, from the course
// units (corpus.lessons, built from Courses/<course>/units/*.md), followed by cards that
// apply it. Lessons are not drawn at random: the page calls pickLesson when it is time
// for one, and it returns the earliest unseen lesson that touches the concepts in play.
const prefixOf = (concept, prefix) => concept === prefix || concept.startsWith(prefix + ".") || concept.startsWith(prefix);
// The lesson whose FIRST concern is this concept wins over one that merely mentions it
// (an "I don't know" on Nebbiolo wants the Nebbiolo lesson, not the decanting one).
function lessonFor(corpus, concept, seen = {}) {
  let best = null, rank = Infinity;
  for (const l of corpus.lessons || []) {
    if (seen[l.id]) continue;
    const i = l.applies.findIndex((p) => prefixOf(concept, p));
    if (i >= 0 && i < rank) { rank = i; best = l; }
  }
  return best;
}
function pickLesson(corpus, { seen = {}, concepts = null } = {}) {
  const ls = (corpus.lessons || []).filter((l) => !seen[l.id]);
  if (!ls.length) return null;
  const fits = concepts ? ls.filter((l) => concepts.some((k) => l.applies.some((p) => prefixOf(k, p)))) : ls;
  return (fits.length ? fits : ls)[0];
}
function lessonCard(l) {
  return {
    key: `lesson|${l.id}`, concept: `lesson.${l.id}`, form: "lesson", gen: "lesson",
    stem: l.title, body: l.body, applies: l.applies, refs: l.refs || [], unit: l.unit,
    tier: l.tier, source: l.source,
  };
}
// Concepts a lesson's follow-up cards should target, out of the live pool.
function appliesTo(lesson, concepts) {
  return concepts.filter((k) => lesson.applies.some((p) => prefixOf(k, p)));
}

// Variety guards, read off the recent card keys so the portal needs no new state:
// key = "<shape>|<subject>|…". A shape may appear at most SHAPE_CAP times in the
// last WINDOW cards, and a subject not at all.
const WINDOW = 12, SHAPE_CAP = 2;
const shapeOf = (k) => String(k).split("|")[0];
const subjectOf = (k) => String(k).split("|").slice(0, 2).join("|");
function tooSoon(card, recent) {
  const win = recent.slice(-WINDOW);
  if (win.filter((k) => shapeOf(k) === shapeOf(card.key)).length >= SHAPE_CAP) return true;
  return win.some((k) => subjectOf(k) === subjectOf(card.key));
}

// Generate, then select. Draw a weighted batch of candidates and keep the one whose
// concept is wanted. The previous version filtered generators BEFORE drawing, by
// probing each with a random card and comparing concepts — which almost never matched
// for a generator whose concept depends on the wine it happened to pick, so targeting
// quietly collapsed to uniform random and the single-concept generators won.
// Which generators can produce a concept family. With a concept named, the first
// two-thirds of the tries draw from these only — a specific wine's note concept is a
// 1-in-23 draw from one generator, hopeless from the whole bag.
const FAMILY = [
  ["wine.note.", ["wine.note", "wine.note.rev"]],
  ["wine.place.", ["wine.place", "wine.region.odd"]],
  ["wine.grape.", ["wine.grape", "wine.grape.set", "wine.lighter"]],
  ["wine.structure.", ["wine.structure"]],
  ["wine.list.", ["wine.onlist", "wine.btg", "wine.phaseout"]],
  ["wine.econ.", ["wine.price", "wine.cost", "somm.econ"]],
  ["wine.floor.", ["wine.substitute", "wine.pairing"]],
  ["wine.producer.", ["wine.producer"]],
  ["wine.pronunciation", ["wine.pron"]],
  ["amaro.", ["amaro.group", "amaro.flight", "amaro.note"]],
  ["food.", ["dish.allergen", "dish.mod", "dish.free", "dish.ingredient"]],
  ["service.steps", ["service.step", "service.next", "service.detail"]],
  ["service.standards", ["service.standard"]],
  ["service.", ["somm.fact"]],
  ["somm.", ["somm.fact"]],
];
const byId = Object.fromEntries(GENERATORS.map((g) => [g.id, g]));
function familyBag(concept) {
  const f = FAMILY.find(([p]) => concept.startsWith(p));
  if (!f) return null;
  return f[1].map((id) => byId[id]).filter(Boolean).flatMap((g) => Array(g.weight ?? 1).fill(g));
}

function drawCard(corpus, { concept = null, recent = [], rng = Math.random, tries = null } = {}) {
  tries = tries || (concept ? 160 : 60);   // a named concept is worth looking harder for
  const fam = concept ? familyBag(concept) : null;
  let fallback = null, loose = null;
  for (let i = 0; i < tries; i++) {
    const bag = fam && fam.length && i < tries * 2 / 3 ? fam : BAG;
    const g = bag[Math.floor(rng() * bag.length)];
    const card = g.make(corpus, rng);
    if (!card || recent.includes(card.key)) continue;
    if (leaks(card.stem, card.choices[card.answer])) continue;   // the stem answers it
    const out = { ...card, gen: g.id };
    if (tooSoon(card, recent)) { loose ||= out; continue; }      // variety, unless nothing else
    if (!concept || card.concept === concept) return out;
    fallback ||= out;
  }
  return fallback || loose;
}

function allConcepts(corpus, samples = 600, rng = Math.random) {
  const seen = new Set();
  for (let i = 0; i < samples; i++) {
    for (const g of GENERATORS) {
      const c = g.make(corpus, rng);
      if (c) seen.add(c.concept);
    }
  }
  return [...seen];
}
