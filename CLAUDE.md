<claude-guidelines>

<effect-thinking>
Effect<Success, Error, Requirements>

a |> f |> g |> h  ≡  pipe(a, f, g, h)
f ∘ g ∘ h         ≡  flow(f, g, h)
f(g(x))           →  pipe(x, g, f)           -- avoid nested calls

dual :: (self, that) ↔ (that)(self)
pipe(x, f(y))     ≡  f(x, y)                 -- data-last in pipelines
f(x, y)           →  pipe(x, f(y))           -- prefer pipeline form

∥(a, b, c)        ≡  Effect.all([a, b, c], { concurrency: "unbounded" })

R ⊃ {Service₁, Service₂} → Layer.provide(Service₁Live, Service₂Live)

E = Error₁ | Error₂ | Error₃ → catchTag("Error₁", handler)

yield* effect    ≡  ← effect (bind)
Effect.gen(function*() { ... })

need(time)       → Clock
need(randomness) → Random
need(filesystem) → FileSystem
need(http)       → HttpClient
</effect-thinking>

<uncertainty>
unclear(requirements) → ask(user) → proceed
ambiguous(approach) → present({options, tradeoffs}) → await(decision)
blocked(task) → report(blocker) ∧ suggest(alternatives)
risk(action) ≤ low → prefer(action) over prefer(inaction)
</uncertainty>

<commands>
/modules         → list(ai-context-modules)
/module {path}   → content(module(path))
/module-search   → filter(modules, pattern)
/debug {desc}    → ∥(4 × diagnose) → validate(consensus)

-- Work coordination (beads)
bd ready         → list(available-work)
bv --robot-next  → AI.recommend(priority-work)
bd claim {id}    → assign(bead, self)
</commands>

<sources>
patterns     → skills (auto-suggested)
internals    → .context/ (grep)
</sources>

<work-coordination>
-- Multi-agent work coordination via beads
available-work     → bd ready
priority-selection → bv --robot-next (requires: bd export -o .beads/issues.jsonl)
claim-work         → bd claim {id}
link-to-plan       → --external-ref .context/plans/{path}.md

begin-session := sync → bv --robot-next → claim ∨ /plan-create
invariant := bd export before bv (bv reads .beads/issues.jsonl)
</work-coordination>

<code-standards>

<style>
nested-loops        → pipe(∘)
conditionals        → Match.typeTags(ADT) ∨ $match
domain-types        := Schema.TaggedStruct
imports             := ∀ X → import * as X from "effect/X"
{Date.now, random}  → {Clock, Random}
</style>

<effect-patterns>
Effect.gen          over  Effect.flatMap chains
pipe(a, f, g)       over  g(f(a))
Schema.TaggedStruct over  plain interfaces
Layer.provide       over  manual dependency passing
catchTag            over  catchAll with conditionals
Data.TaggedError    over  new Error()

as any              →  Schema.decode ∨ type guard
Promise             →  Effect.tryPromise
try/catch           →  Effect.try ∨ Effect.catchTag
null/undefined      →  Option<A>
throw               →  Effect.fail(TaggedError)
</effect-patterns>

<ui>
¬borders → lightness-variation
depth := f(background-color)
elevation := Δlightness ∧ ¬stroke
</ui>

<documentation>
principle := self-explanatory(code) → ¬comments

unclear(code) → rewrite(code) ∧ ¬comment(code)
</documentation>

</code-standards>

</claude-guidelines>
