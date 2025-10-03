# Loot Survivor Agent (Daydreams)

Daydreams-powered orchestration layer that prepares Loot Survivor game state via loader-driven contexts before handing control to the language model. The agent focuses on curating data; the LLM stays responsible for planning and decisions.

## Context Architecture

- `session` — entry point; inspects the player/game phase and composes the rest of the contexts.
- `startGame` — onboarding snapshot with leaderboard/tips when no active run exists.
- `battle` — current combat state, including adventurer stats, beast info, and combat preview.
- `exploration` — non-combat readiness plus bag contents.
- `market` — market inventory with the subset that is currently affordable.
- `statUpgrade` — available stat points and current attribute spread.

Each context defines a `loader` that pulls fresh data before the model generates a response, eliminating the need for explicit fetch actions such as “get_state” or “get_player_status”.

## Data Flow

```mermaid
digraph AgentContexts {
  node [shape=rectangle, style=rounded];

  subgraph cluster_session {
    label = "Session Context";
    session_loader [label="Loader: hydrate game snapshot\n(determine phase)"];
    session_composer [label="Compose contexts\nby phase"];
  }

  start [label="Start Game\nleaderboard snapshot"];
  battle [label="Battle\ncombat snapshot"];
  exploration [label="Exploration\nadventurer + bag"];
  market [label="Market\nmarket inventory"];
  stat [label="Stat Upgrade\nattributes + points"];

  session_loader -> session_composer;
  session_composer -> start [label="no active game"];
  session_composer -> battle [label="phase = combat"];
  session_composer -> exploration [label="phase = exploration"];
  session_composer -> market [label="exploration"];
  session_composer -> stat [label="phase = level_up"];

  exploration -> market;
  {start battle exploration market stat} -> agent_output [label="render prompt" shape=parallelogram];
}
```

## Dependencies & Shared Services

- `@daydreamsai/core`, `@daydreamsai/ai-sdk-provider`, `@daydreamsai/chromadb` (installed via `bun install`).
- Shared game-state wrapper in `agent/src/services/gameState.ts`, which reuses `engine/src/services/GameStateService.ts` for Torii queries.
- Optional environment overrides:
  - `TORII_URL` — Torii endpoint (defaults to `http://localhost:3000`).
  - `NAMESPACE` — database namespace (defaults to `ls_0_0_6`).
  - `DEFAULT_GAME_ID` — preferred adventurer id for loader hydration (defaults to `21603`).

## Running Locally

```bash
bun install

# From repo root; provide a player id, optional game id, and optional prompt
#   (game id defaults to 21603 if omitted)
bun run agent/index.ts player-123 42 "Summarize current state"
```

The CLI boots the agent, lets each loader prefetch state, then prints the model output. Ensure the `engine` module (sharing `GameStateService`) has access to the same Torii endpoint or mocked data so loaders can hydrate successfully.
