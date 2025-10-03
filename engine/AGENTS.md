# Repository Guidelines

## Project Structure & Module Organization
- Entry point lives in `index.ts`, wiring Hono middleware, the API routes, and service constructors.
- Game logic resides in `src/services/GameStateService.ts`, with supporting helpers in `src/utils` and static data in `src/constants`.
- XML serialization is handled by `src/context/ContextEngine.ts`; keep new formatters colocated.
- Add new runtime assets under `src/` and prefer mirroring the existing naming (e.g., `GameState*`, `Context*`).
- Place automated tests beside source files in `src/**/__tests__` using `.test.ts` suffixes for Jest discovery.

## Build, Test, and Development Commands
- `bun install` — install dependencies defined in `package.json`.
- `bun run index.ts` — start the Hono server locally (Bun executes the module directly).
- `bunx eslint . --ext .ts` — lint the TypeScript sources with the configured ESLint rules.
- `bun test` — execute the Jest suite via Bun; ensure snapshots and coverage targets pass before submitting.

## Coding Style & Naming Conventions
- Use TypeScript (`.ts`) with 2-space indentation, `const`/`let` over `var`, and explicit types when inference is unclear.
- Follow the existing descriptive naming: services end with `Service`, utilities are verb-driven, constants stay in SCREAMING_CASE.
- Keep inline XML compact (no extra whitespace) to match `ContextEngine` output expectations.
- Run ESLint before opening a PR; avoid committing fixes that rely solely on editor auto-formatting.

## Testing Guidelines
- Write Jest tests using `describe`/`it` blocks and deterministic fixtures; prefer unit tests for helpers and integration tests for service queries.
- Mock Torii SQL responses when testing `GameStateService` to avoid network dependencies.
- Target key mechanics: level math, combat preview calculations, context XML. Name tests after the behavior under test (e.g., `gameStateService.calculateCombatPreview.test.ts`).

## Commit & Pull Request Guidelines
- Use conventional, imperative commit messages (`feat: add combat preview edge cases`, `fix: guard empty market rows`); keep the subject under ~72 characters.
- Rebase or merge mainline changes before opening a PR; ensure CI (lint + tests) is green locally.
- PR descriptions should summarize motivation, list key changes, and link to any tracked issues or incidents; include sample XML or logs when behavior changes.

## Security & Configuration Tips
- Never commit `.env` files; rely on `TORII_URL`, `NAMESPACE`, and `PORT` environment variables for local overrides.
- Validate any new SQL queries against Torii rate limits and handle non-200 responses explicitly, mirroring the existing `sql()` helper pattern.
