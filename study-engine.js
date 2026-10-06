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
  const wrong = shuffle(pool.filter((x) => x !== right), rng).slice(0, n);
  if (wrong.length < n) return null;
  const all = shuffle([right, ...wrong], rng);
  return { choices: all, answer: all.indexOf(right) };
}

const keepers = (c) => c.wines.filter((w) => w.status.startsWith("core"));
const region = (w) => w.region.split(",").pop().trim();

// WEIGHT governs how often a generator is drawn. The thin list-facts — is it on
// the list, by the glass, which costs more — are worth knowing and cheap to answer,
// which is exactly why they must not dominate. Measured 2026-10-06: they were 42%
// of the deck. Weight 1 is the baseline; the shallow ones sit below it.
const GENERATORS = [
  {
    id: "wine.place", weight: 3,
    make(c, rng) {
      const w = pick(keepers(c), rng);
      const regions = [...new Set(c.wines.map(region))];
      const ch = choices(region(w), regions, rng);
      if (!ch) return null;
      return {
        key: `wine.place|${w.id}`, ref: { type: "wine", name: w.name }, concept: `wine.place.${slug(region(w))}`,
        form: "choice", stem: `Where is the ${w.name} from?`, ...ch,
        why: `${w.name} — ${w.region}, ${w.country}.`,
      };
    },
  },
  {
    id: "wine.grape", weight: 3,
    make(c, rng) {
      const w = pick(keepers(c).filter((x) => x.grapes.length === 1), rng);
      if (!w) return null;
      const grapes = [...new Set(c.wines.flatMap((x) => x.grapes))];
      const ch = choices(w.grapes[0], grapes, rng);
      if (!ch) return null;
      return {
        key: `wine.grape|${w.id}`, ref: { type: "wine", name: w.name }, concept: `wine.grape.${slug(w.grapes[0])}`,
        form: "choice", stem: `What grape is the ${w.name}?`, ...ch,
        why: `100% ${w.grapes[0]}.`,
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
      const b = pick(pool.filter((w) => w.bottle !== a.bottle), rng);
      if (!b) return null;
      const dearer = a.bottle > b.bottle ? a : b;
      const all = shuffle([a, b], rng);
      return {
        key: `wine.price|${[a.id, b.id].sort().join("|")}`, concept: "wine.econ.price",
        form: "choice", stem: "Which of these is the more expensive bottle?",
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
      const wrong = pool.filter((w) => w.bottle > cap && w.id !== right.id).map((w) => w.name);
      const ch = choices(right.name, wrong, rng);
      if (!ch) return null;
      return {
        key: `wine.substitute|${target.id}`, ref: { type: "wine", name: right.name }, concept: "wine.floor.substitution",
        form: "choice",
        stem: `A guest likes the look of the ${target.name} at $${target.bottle} but wants to spend about half that. What do you pour?`,
        ...ch,
        why: `${right.name} at $${right.bottle} is the closest ${right.type} under $${cap}.`,
      };
    },
  },
  {
    id: "wine.cost", weight: 2,
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
    id: "amaro.flight", weight: 2,
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
    id: "dish.allergen", weight: 3,
    make(c, rng) {
      const d = pick(c.dishes.filter((x) => x.allergens && x.allergens.length), rng);
      if (!d) return null;
      const all = [...new Set(c.dishes.flatMap((x) => x.allergens || []))];
      const right = pick(d.allergens, rng);
      const ch = choices(right, all.filter((a) => !d.allergens.includes(a)), rng);
      if (!ch) return null;
      return {
        key: `dish.allergen|${d.id}|${slug(right)}`, ref: { type: "dish", name: d.name }, concept: `food.allergen.${slug(right)}`,
        form: "choice", stem: `Which of these is in the ${d.name}?`, ...ch,
        why: `${d.name} contains: ${d.allergens.join(", ")}. When the card is silent, ask the chef — never guess.`,
      };
    },
  },
  {
    id: "service.step", weight: 3,
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
    // Reverse of wine.grape: tests the SET rather than one bottle.
    id: "wine.grape.set", weight: 3,
    make(c, rng) {
      const byGrape = {};
      for (const w of keepers(c)) for (const g of w.grapes) (byGrape[g] ||= []).push(w);
      const multi = Object.keys(byGrape).filter((g) => byGrape[g].length >= 1);
      const g = pick(multi, rng);
      const right = pick(byGrape[g], rng);
      const wrong = keepers(c).filter((w) => !w.grapes.includes(g)).map((w) => w.name);
      const ch = choices(right.name, wrong, rng);
      if (!ch) return null;
      return {
        key: `wine.grape.set|${slug(g)}|${right.id}`, ref: { type: "wine", name: right.name }, concept: `wine.grape.${slug(g)}`,
        form: "choice", stem: `Which of these is made from ${g}?`, ...ch,
        why: `${right.name} — ${right.grapes.join(", ")}, ${right.region}.`,
      };
    },
  },
  {
    // One producer, more than one wine on the list. Brigaldara (Soave + Valpolicella),
    // Ruggeri Corsini (Matot + Armujan), La Spinetta, Terre Nere.
    id: "wine.producer", weight: 2,
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
      const note = x.note.replace(new RegExp(x.name.split(" ")[0], "gi"), "—");
      return {
        key: `amaro.note|${x.id}`, ref: { type: "amaro", name: x.name }, concept: `amaro.note.${slug(x.group || "other")}`,
        form: "choice", stem: `Which one is this? "${note}"`, ...ch,
        why: `${x.name}${x.price ? ` — $${x.price}` : ""}. ${x.group || ""}`.trim(),
      };
    },
  },
  {
    // The odd one out. Forces the whole set into view rather than one fact.
    id: "wine.region.odd", weight: 3,
    make(c, rng) {
      const byRegion = {};
      for (const w of keepers(c)) (byRegion[region(w)] ||= []).push(w);
      const big = Object.keys(byRegion).filter((r) => byRegion[r].length >= 3);
      if (!big.length) return null;
      const r = pick(big, rng);
      const odd = pick(keepers(c).filter((w) => region(w) !== r), rng);
      const three = shuffle(byRegion[r], rng).slice(0, 3).map((w) => w.name);
      if (three.length < 3 || !odd) return null;
      const all = shuffle([...three, odd.name], rng);
      return {
        key: `wine.region.odd|${slug(r)}|${odd.id}`, ref: { type: "wine", name: odd.name }, concept: `wine.place.${slug(r)}`,
        form: "choice", stem: `Three of these are from ${r}. Which is not?`,
        choices: all, answer: all.indexOf(odd.name),
        why: `${odd.name} is ${odd.region}. The others are ${r}.`,
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
      const body = s.body.length > 180 ? s.body.slice(0, 180) + "…" : s.body;
      return {
        key: `service.standard|${slug(s.title)}`, ref: { type: "standards", name: "service" }, concept: "service.standards",
        form: "choice", stem: `Which standard is this? "${body}"`, ...ch,
        why: `${s.title}. ${s.body}`,
      };
    },
  },
  {
    // The researched craft layer: faults, temperature, decanting, bottle mechanics,
    // the luxury standards, Washington law, floor sales. Distractors come from
    // sibling facts in the same set, so a wrong answer is always a real fact about
    // the same subject rather than a throwaway.
    id: "somm.fact", weight: 6,
    make(c, rng) {
      const sets = c.somm?.sets || [];
      if (!sets.length) return null;
      const set = pick(sets, rng);
      const item = pick(set.items, rng);
      const pool = set.choices_from || set.items.map((i) => i.v);
      const ch = choices(item.v, pool, rng, Math.min(3, pool.length - 1));
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
    id: "somm.econ", weight: 2,
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

// Draw a card for a concept if we can, otherwise any card. Honours a cooldown
// on card identity so the concept returns while the question does not.
const BAG = GENERATORS.flatMap((g) => Array(g.weight ?? 1).fill(g));

// Generate, then select. Draw a weighted batch of candidates and keep the one whose
// concept is wanted. The previous version filtered generators BEFORE drawing, by
// probing each with a random card and comparing concepts — which almost never matched
// for a generator whose concept depends on the wine it happened to pick, so targeting
// quietly collapsed to uniform random and the single-concept generators won.
function drawCard(corpus, { concept = null, recent = [], rng = Math.random, tries = 40 } = {}) {
  let fallback = null;
  for (let i = 0; i < tries; i++) {
    const g = BAG[Math.floor(rng() * BAG.length)];
    const card = g.make(corpus, rng);
    if (!card || recent.includes(card.key)) continue;
    const out = { ...card, gen: g.id };
    if (!concept || card.concept === concept) return out;
    fallback ||= out;
  }
  return fallback;
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
