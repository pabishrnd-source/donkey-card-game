import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const app = fileURLToPath(new URL('../artifacts/card-game/', import.meta.url));
const output = fileURLToPath(new URL('../artifacts/api-server/.local/profile-tests/hidden-counts.cjs', import.meta.url));
await build({
  stdin: {
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { PlayerArea } from './src/components/PlayerArea';
      import { GameOverScreen } from './src/components/GameOverScreen';
      export function renderResults(gameState, myPlayerId) {
        return renderToStaticMarkup(<GameOverScreen gameState={gameState} myPlayerId={myPlayerId}
          onNextGame={() => {}} onRestartTournament={() => {}} onLeave={() => {}} />);
      }
      export function render(player, isMe) {
        const gameState = { phase: 'playing', players: [player], currentTurn: 'other',
          activePlayerIds: [player.id], roundNumber: 2, roundCards: [], leadSuit: null };
        return renderToStaticMarkup(<PlayerArea player={player} isMe={isMe}
          isCurrentTurn={false} gameState={gameState} />);
      }`,
    resolveDir: app,
    loader: 'tsx',
  },
  outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  tsconfig: `${app}/tsconfig.json`,
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"' },
  plugins: [{ name: 'avatar-stub', setup(builder) {
    builder.onResolve({ filter: /\/ProfileButton$|^\.\/ProfileButton$/ }, () => ({ path: 'avatar', namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export function PlayerAvatar() { return null; }',
    }));
  }}],
});
globalThis.window = { innerWidth: 800 };
const { render, renderResults } = require(output);
const player = {
  id: 'opponent', name: 'Opponent', hand: [], penaltyCards: [],
  finished: false, finishOrder: null,
};
let opponentMarkup;
for (const count of [1, 2, 6, 7, 22, 26]) {
  player.hand = Array.from({ length: count }, () => ({ suit: 'hearts', rank: 'A' }));
  const other = render(player, false);
  assert.doesNotMatch(other, /player-card-count|playable/);
  assert.match(other, /Hidden opponent hand/);
  if (opponentMarkup) assert.equal(other, opponentMarkup, 'Opponent appearance must not reveal hand size');
  opponentMarkup = other;
  const own = render(player, true);
  assert.match(own, /player-card-count/);
  assert.match(own, new RegExp(`>${count}</span> playable`));
}
assert.doesNotMatch(render({ ...player, finished: true, hand: [] }, false), /Hidden opponent hand|player-card-count/);
console.log('PASS opponent counts hidden, own counts visible, fixed card fan for 1-26 cards, finished state preserved');
const resultState = {
  phase: 'game_over', dealNumber: 3, hostId: 'self', dealerId: 'opponent',
  currentGameWinnerId: 'self', gameOverLoserId: 'opponent',
  penaltyCard: { suit: 'spades', rank: 'A' }, nextPenaltyCard: { suit: 'spades', rank: 'K' },
  players: [
    { ...player, id: 'self', name: 'Host', hand: [], finished: true, finishOrder: 1 },
    { ...player, hand: Array(4).fill({ suit: 'hearts', rank: '2' }), penaltyCards: [{ suit: 'spades', rank: 'A' }] },
  ],
};
const hostResult = renderResults(resultState, 'self');
assert.doesNotMatch(hostResult, /Winner|result-winner|standing-winner|4 playable/);
assert.match(hostResult, /Final loser/);
assert.match(hostResult, /Opponent is Donkey/);
assert.match(hostResult, /Round 3 Complete/);
assert.match(hostResult, /Next dealer: Opponent/);
assert.match(hostResult, /Next Game/);
assert.match(hostResult, /Restart Tournament/);
assert.match(hostResult, /donkey-tropical-results-mascot.png/);
const guestResult = renderResults(resultState, 'opponent');
assert.match(guestResult, /4 playable/);
assert.match(guestResult, /Waiting for host/);
assert.doesNotMatch(guestResult, /Next Game|Restart Tournament/);
console.log('PASS loser-only results, dynamic round/dealer/penalties, own count only, host-only game controls');
// Aggregate hand sizes also reveal an opponent's count in a two-player game.
const matchSource = await readFile(`${app}/src/pages/Game.tsx`, 'utf8');
assert.doesNotMatch(matchSource, /Playable cards left/);
assert.match(matchSource, /Your playable cards/);
assert.match(matchSource, /players\.find\(player => player\.id === myPlayerId\)\?\.hand\.length/);
console.log('PASS match status exposes only the local player card count');
