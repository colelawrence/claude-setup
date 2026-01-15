/**
 * SessionStart Hook - Main Agent Initialization
 *
 * Provides verbose context for primary agents talking to humans.
 * Uses HTML-like syntax for all context enhancements.
 *
 * @module AgentInit
 * @since 1.0.0
 */

import { Effect, Console, Context, Layer, Data, Schema, pipe, Config, Array as Arr } from "effect"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Command, CommandExecutor } from "@effect/platform"

// ============================================================================
// Schemas & Types
// ============================================================================

const AgentConfigSchema = Schema.Struct({
  projectDir: Schema.String.pipe(Schema.nonEmptyString()),
})

type AgentConfigData = Schema.Schema.Type<typeof AgentConfigSchema>

const MiseTask = Schema.Struct({
  name: Schema.String,
  aliases: Schema.Array(Schema.String),
  description: Schema.String,
})

const MiseTasks = Schema.Array(MiseTask)

const formatMiseTasks = (tasks: typeof MiseTasks.Type): string =>
  Arr.map(tasks, t => {
    const aliases = t.aliases.length > 0 ? ` (${t.aliases.join(", ")})` : ""
    return `${t.name}${aliases}: ${t.description}`
  }).join("\n")

export class AgentConfigError extends Data.TaggedError("AgentConfigError")<{
  readonly reason: string
  readonly cause?: unknown
}> { }

// ============================================================================
// Services
// ============================================================================

export class AgentConfig extends Context.Tag("AgentConfig")<
  AgentConfig,
  { readonly projectDir: string }
>() { }

export class ProjectStructureCapture extends Context.Tag("ProjectStructureCapture")<
  ProjectStructureCapture,
  { readonly capture: () => Effect.Effect<string> }
>() { }

// ============================================================================
// Service Implementations
// ============================================================================

const ProjectDirConfig = pipe(
  Config.string("CLAUDE_PROJECT_DIR"),
  Config.withDefault(".")
)

export const AgentConfigLive = Layer.effect(
  AgentConfig,
  Effect.gen(function* () {
    const projectDir = yield* ProjectDirConfig
    const config: AgentConfigData = yield* Schema.decode(AgentConfigSchema)({
      projectDir,
    }).pipe(
      Effect.mapError((error) =>
        new AgentConfigError({ reason: "Invalid configuration", cause: error })
      )
    )
    return AgentConfig.of({ projectDir: config.projectDir })
  })
)

export const ProjectStructureCaptureLive = Layer.effect(
  ProjectStructureCapture,
  Effect.gen(function* () {
    const config = yield* AgentConfig
    const commandExecutor = yield* CommandExecutor.CommandExecutor

    return ProjectStructureCapture.of({
      capture: () =>
        pipe(
          Command.make("tree", "-L", "2", "-a", "-I", "node_modules|.git|dist|.turbo|build|.next|.cache|coverage"),
          Command.workingDirectory(config.projectDir),
          Command.string,
          Effect.catchAll(() => Effect.succeed("(tree unavailable)")),
          Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
        )
    })
  })
)

export const AppLive = ProjectStructureCaptureLive.pipe(
  Layer.provideMerge(AgentConfigLive),
  Layer.provideMerge(BunContext.layer)
)

// ============================================================================
// Main Program
// ============================================================================

export const program = Effect.gen(function* () {
  const config = yield* AgentConfig
  const commandExecutor = yield* CommandExecutor.CommandExecutor
  const structureCapture = yield* ProjectStructureCapture

  // Capture all context in parallel
  const [treeOutput, gitStatus, latestCommit, previousCommits, branchContext, githubIssues, githubPRs, moduleSummary, projectVersion, packageScripts, miseTasks] = yield* Effect.all([
    structureCapture.capture(),
    pipe(
      Command.make("git", "status", "--short"),
      Command.workingDirectory(config.projectDir),
      Command.string,
      Effect.catchAll(() => Effect.succeed("(not a git repository)")),
      Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
    ),
    pipe(
      Command.make("git", "show", "HEAD", "--stat", "--format=%h %s%n%n%b"),
      Command.workingDirectory(config.projectDir),
      Command.string,
      Effect.map(s => s.trim()),
      Effect.catchAll(() => Effect.succeed("")),
      Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
    ),
    pipe(
      Command.make("git", "log", "--oneline", "-4", "--skip=1"),
      Command.workingDirectory(config.projectDir),
      Command.string,
      Effect.map(s => s.trim()),
      Effect.catchAll(() => Effect.succeed("")),
      Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
    ),
    pipe(
      Command.make("git", "branch", "-vv", "--list", "--sort=-committerdate"),
      Command.workingDirectory(config.projectDir),
      Command.string,
      Effect.map(s => {
        const lines = s.trim().split("\n")
        const current = lines.find(l => l.startsWith("*")) || ""
        const recent = lines.filter(l => !l.startsWith("*")).slice(0, 4)
        return { current: current.replace(/^\*\s*/, "").trim(), recent }
      }),
      Effect.catchAll((): Effect.Effect<{ current: string; recent: string[] }> =>
        Effect.succeed({ current: "", recent: [] })
      ),
      Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
    ),
    pipe(
      Command.make("gh", "issue", "list", "--limit", "5", "--state", "open", "--sort", "updated"),
      Command.workingDirectory(config.projectDir),
      Command.string,
      Effect.map(s => s.trim()),
      Effect.catchAll(() => Effect.succeed("")),
      Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
    ),
    pipe(
      Command.make("gh", "pr", "list", "--limit", "5", "--state", "open", "--sort", "updated"),
      Command.workingDirectory(config.projectDir),
      Command.string,
      Effect.map(s => s.trim()),
      Effect.catchAll(() => Effect.succeed("")),
      Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
    ),
    pipe(
      Command.make("bun", ".claude/scripts/context-crawler.ts", "--summary"),
      Command.workingDirectory(config.projectDir),
      Command.string,
      Effect.catchAll(() => Effect.succeed("<modules count=\"0\">(unavailable)</modules>")),
      Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
    ),
    pipe(
      Command.make("bun", "-e", "console.log(require('./package.json').version)"),
      Command.workingDirectory(config.projectDir),
      Command.string,
      Effect.map(v => v.trim()),
      Effect.catchAll(() => Effect.succeed("unknown")),
      Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
    ),
    pipe(
      Command.make("bun", "-e", "const p = require('./package.json'); console.log(Object.entries(p.scripts || {}).map(([k,v]) => k + ': ' + v).join('\\n'))"),
      Command.workingDirectory(config.projectDir),
      Command.string,
      Effect.map(s => s.trim()),
      Effect.catchAll(() => Effect.succeed("")),
      Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
    ),
    pipe(
      Command.make("mise", "tasks", "--json"),
      Command.workingDirectory(config.projectDir),
      Command.string,
      Effect.flatMap(s => Schema.decodeUnknown(Schema.parseJson(MiseTasks))(s)),
      Effect.map(formatMiseTasks),
      Effect.catchAll(() => Effect.succeed("")),
      Effect.provideService(CommandExecutor.CommandExecutor, commandExecutor)
    )
  ], { concurrency: "unbounded" })

  // Build context output with mathematical notation
  const output = `<session-context>
<agent_instructions>

<identity>
self :: Role
self = Architect ∧ Critic ∧ Coordinator

-- You are NOT:
-- - An implementer of plans (agents implement)

-- You ARE:
-- - An architect who designs, and potentially refactors
-- - A critic who raises genuine concerns
-- - A coordinator who delegates ALL implementation
-- - A peer who collaborates with the human
</identity>

<critical_thinking>
-- Genuine pushback (when there's signal)
pushBack :: Request → Maybe Concern
pushBack req
  | hasRisk req           = Just $ identifyRisk req
  | overEngineered req    = Just $ proposeSimpler req
  | unclear req           = Just $ askClarification req
  | betterWayKnown req    = Just $ suggestAlternative req
  | otherwise             = Nothing  -- proceed, don't manufacture objections

-- Root cause analysis (for bugs/fixes)
diagnose :: Problem → Effect Solution
diagnose problem = do
  symptoms ← observe problem
  rootCause ← analyze symptoms   -- type errors often mask deeper issues
  -- Don't jump to "layer issue" or "missing dependency"
  -- Understand the actual problem first

  when (stuckInLoop attempts) $ do
    log "Step back - multiple failed attempts suggest treating symptoms, not cause"
    reassess problem

-- Fix loops = signal to step back
inFixLoop :: [Attempt] → Bool
inFixLoop attempts = length attempts > 2 ∧ ¬progressing attempts

-- Trust the type system (when not bypassed)
redundantConcern :: Concern → Bool
redundantConcern concern =
  caughtByTypeSystem concern || caughtByLinter concern

-- The compiler is a better bug-finder than speculation
-- Trust: tsc, eslint, Effect's typed errors
-- Don't: predict runtime bugs that would fail at compile time
-- Don't: suggest fixes for issues the types will catch anyway

-- UNLESS type safety was bypassed:
typeSystemBypassed :: Code → Bool
typeSystemBypassed code = any code
  [ "as any"
  , "as unknown"
  , "@ts-ignore"
  , "@ts-expect-error"
  , "// @ts-nocheck"
  ]
-- When escape hatches present → skepticism warranted
-- Question the cast, not the type system
</critical_thinking>

<coordination_is_mandatory>
-- Coordination work goes through agents

decompose :: Task → Effect [Agent]
decompose task = parallel $ fmap spawn (split task)

-- Minimum agents per non-trivial task: 3-5
-- If you have fewer agents, you haven't decomposed enough
</coordination_is_mandatory>

<relationship_with_human>
relationship :: Human → Self → Collaboration
relationship human self = Peer human self

-- Push back when there's genuine signal:
pushBack :: Request → Maybe Concern
pushBack req
  | hasRisk req        = Just $ identifyRisk req
  | overEngineered req = Just $ proposeSimpler req
  | unclear req        = Just $ askClarification req
  | betterWayKnown req = Just $ suggestAlternative req
  | otherwise          = Nothing  -- proceed without manufactured objections

-- You are accountable FOR the human, not TO the human
-- Your job: ensure quality, catch mistakes, prevent disasters
</relationship_with_human>

<subagent_prompting>
-- When spawning agents after research/exploration, context is CRITICAL
-- Agents start fresh - they cannot access prior conversation context
-- Information not passed explicitly is LOST

contextPassingRule :: SpawnAfterResearch → Prompt
contextPassingRule spawn = do
  findings ← gatherFindings priorAgents
  prompt ← buildPrompt task
  pure $ prompt ++ contextualizationTag findings

-- When aggregating findings from multiple agents into another agent:
-- ALWAYS include a <contextualization> tag with thorough details
-- This prevents the "telephone game" where context degrades

-- <contextualization>
--   [detailed findings from prior agents]
--   [specific file paths discovered]
--   [patterns observed]
--   [relevant code snippets]
--   [decisions already made]
-- </contextualization>

-- The contextualization tag should be THOROUGH, not summarized
-- Every fact learned by prior agents should be passed forward
-- Better to over-communicate than lose crucial context

thoroughness :: Findings → ContextTag
thoroughness findings
  | synthesis findings      = detailed findings    -- aggregating multiple agents
  | followUpResearch findings = detailed findings  -- continuing prior work
  | implementation findings = detailed findings    -- implementing researched plan
  | otherwise               = summary findings     -- simple delegation

-- Violation: spawning after research without full context
contextViolation :: Spawn → Violation
contextViolation spawn
  | priorResearchDone spawn ∧ ¬hasContextualization spawn = ContextLossViolation
  | otherwise = Ok
</subagent_prompting>

<parallel_environment>
-- This configuration supports high parallelism
concurrency :: Environment → Mode
concurrency env = WithinSession ∥ CrossSession

-- Multiple agents operate simultaneously:
-- - Within each session: agents work in parallel
-- - Across sessions: many sessions may target the same repository

-- Errors may originate from concurrent work
errorSource :: Error → Source
errorSource err
  | unrelatedToTask err  = PossibleConcurrentWork
  | unexpectedChanges err = PossibleConcurrentWork
  | touchedByYou err     = OwnWork

-- Symptoms of concurrent modification:
concurrentWorkSymptoms :: [Symptom]
concurrentWorkSymptoms =
  [ TypeErrorsInUntouchedCode     -- tsc fails on files you didn't modify
  , TestFailuresInUntouchedCode   -- tests fail for code you didn't change
  , UnexpectedFileChanges         -- files differ from what you read earlier
  , MissingExpectedSymbols        -- exports/imports that "should" exist, don't
  ]

-- When encountering these symptoms:
handleUnrelatedError :: Error → Effect ()
handleUnrelatedError err = do
  symptoms ← identify err
  when (any (∈ concurrentWorkSymptoms) symptoms) $ do
    askUser $ "I'm seeing " ++ describe err ++
              " that appears unrelated to what I'm working on. " ++
              "Is another agent or session currently working on related code?"

-- Best practices for parallel environment:
parallelWorkPolicy :: Policy
parallelWorkPolicy = Policy
  { dontFixOthersErrors = True      -- never fix errors you didn't cause
  , reportAndAsk        = True      -- describe what you see, request clarification
  , stayFocused         = True      -- focus on your assigned task
  , assumeConcurrency   = True      -- default assumption: others may be working
  }

-- Violation: attempting to fix unrelated errors
fixUnrelatedError :: Error → Violation
fixUnrelatedError err
  | ¬causedByYou err = ParallelWorkViolation
  | otherwise        = Ok
</parallel_environment>
</agent_instructions>

<cwd>${config.projectDir}</cwd>
<version>${projectVersion}</version>

<file-structure>
${treeOutput}
</file-structure>

<git-status>
${gitStatus || "(clean)"}
</git-status>

<git-log>
<latest-commit>
${latestCommit || "(none)"}
</latest-commit>

<previous-commits>
${previousCommits || "(none)"}
</previous-commits>
</git-log>

<branch-context>
<current>${branchContext.current || "(detached)"}</current>
${branchContext.recent.length > 0 ? `<recent>\n${branchContext.recent.join("\n")}\n</recent>` : ""}
</branch-context>

<github-context>
${githubIssues ? `<open-issues>\n${githubIssues}\n</open-issues>` : "<open-issues>(none)</open-issues>"}
${githubPRs ? `<open-prs>\n${githubPRs}\n</open-prs>` : "<open-prs>(none)</open-prs>"}
</github-context>

${moduleSummary}
<module-discovery>
Run /module [path] to get full context for any module listed above.
Run /module-search [pattern] to find modules by keyword.
</module-discovery>

<available-scripts>
<package-json>
${packageScripts || "(none)"}
</package-json>
<mise-tasks>
${miseTasks || "(none)"}
</mise-tasks>
</available-scripts>

</session-context>`;

  yield* Console.log(output)
})

const runnable = pipe(
  program,
  Effect.provide(AppLive),
  Effect.catchTags({
    AgentConfigError: (error) => Console.error(`<error>Config: ${error.reason}</error>`),
  })
)

BunRuntime.runMain(runnable)
