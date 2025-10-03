/**
 * Loot Survivor Daydreams Agent
 *
 * This entry point wires together the loader-driven contexts defined under `src/contexts`.
 * The session context acts as the orchestrator, composing battle, exploration, market,
 * stat upgrade, and strategic planning contexts based on the player\'s current phase.
 */

import { createDreams, input, LogLevel, type Agent } from '@daydreamsai/core';
import { openrouter } from '@openrouter/ai-sdk-provider';
import * as z from 'zod';

import { sessionContext } from './src/contexts';

const DEFAULT_GAME_ID = Number.parseInt(process.env.DEFAULT_GAME_ID ?? '21603', 10);

// Simple free-form text input so the caller can describe what guidance they need.
const textInput = input({
  description: 'Narrative prompt or command for the Loot Survivor agent to respond to.',
  schema: z.string(),
});

// Basic text output configuration. The composed contexts will ensure all data is pre-loaded
// before the LLM generates a response.
const textOutput = {
  description: 'Primary textual response generated for the player.',
  schema: z.object({
    content: z.string(),
  }),
  handler: async (data: { content: string }) => ({
    content: data.content,
  }),
};

export const agent: Agent<typeof sessionContext> = createDreams({
  logLevel: LogLevel.INFO,
  model: openrouter('openai/gpt-5'),
  contexts: [sessionContext],
  inputs: {
    text: textInput,
  },
  outputs: {
    text: textOutput,
  },
});

// Lightweight CLI runner for manual testing. Usage:
//   bun run agent/index.ts <playerId> [gameId]
if (import.meta.main) {
  const playerId = process.argv[2] ?? 'player-1';
  const gameIdArg = process.argv[3];
  const gameId = gameIdArg ? Number.parseInt(gameIdArg, 10) : DEFAULT_GAME_ID;

  if (Number.isNaN(gameId)) {
    throw new Error(`Invalid gameId provided: ${gameIdArg}`);
  }

  const prompt = process.argv.slice(4).join(' ') || 'Summarize the current situation concisely.';

  const run = async () => {
    await agent.start();

    const result = await agent.send({
      context: sessionContext,
      args: { playerId, gameId },
      input: { type: 'text', data: prompt },
    });

    const output = result.find((ref) => ref.ref === 'output');
    if (output && 'data' in output) {
      const content =
        typeof output.data === 'object' && output.data?.content
          ? output.data.content
          : output.data;
      console.log('\n=== Agent Response ===');
      console.log(content);
    }
  };

  run().catch((error) => {
    console.error('Agent run failed:', error);
    process.exit(1);
  });
}
