# LS2 ENGINE + AGENT CONTEXT ORCHESTRATION

## ***`/AGENT`***
```bash
bun run index.ts <NAME> <GAME ID> "<PROMPT>"
```
- `NAME` is arbitrary - solely for agent to remember you by - not linked to controller address
- `GAME ID` is the game number that you are asking about
- `"PROMPT"` is the prompt to send the agent, this is additional to the composed context state.

EXAMPLE: 
```bash
bun run index.ts boat 21603 "Describe the current situation in 1 sentence."
```
```bash
=== Agent Response ===
You're in the exploration phase of game 21603 with 116/130 HP and 6 gold, equipped with a Ghost Wand and mixed-tier gear (several tier-5 pieces), carrying a Short Sword, and the market offers 1g healing potions (10 HP) plus a few low-cost hide/cloth items.
```
ENV: `OPENROUTER_API_KEY`

## ***`/ENGINE`***
```bash
bun run index.ts
```
- `GET /` - Health check
- `GET /game/:id/context` - XML context for LLM agents.

EXAMPLE:
```bash
curl http://localhost:3000/game/21603/context
```
```xml
<context><phase>combat</phase><adventurer health="99" level="4" gold="4" xp="19"/><stats str="4" dex="3" vit="2" int="1" wis="1" cha="4"/><equipment weapon="Ghost Wand:L3:T1" chest="Shirt:L3:T5" head="Helm:L3:T5" waist="Linen Sash:L3:T4" foot="Divine Slippers:L3:T1" hand="Leather Gloves:L3:T5" neck="None" ring="None"/><beast name="Wolf" health="21" level="12" tier="5"/><damage player="4" critical="7" beast="15"/><collectable shiny="false" animated="false" eligible="false"/><flee chance="75"/><estimate>Win in 6 rounds, take 40 damage</estimate></context>
```
