import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const app = fileURLToPath(new URL('../artifacts/card-game/', import.meta.url));
const output = fileURLToPath(new URL('../artifacts/api-server/.local/profile-tests/village-menu.cjs', import.meta.url));
await build({
  stdin: {
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { StartScreen } from './src/components/StartScreen';
      export function render(connected, savedSession, musicOn = false) {
        return renderToStaticMarkup(<StartScreen connected={connected} savedSession={savedSession}
          musicOn={musicOn} error={null} onLocal={()=>{}} onPlay={()=>{}} onResume={()=>{}}
          onToggleMusic={()=>{}} onClearError={()=>{}} />);
      }`,
    resolveDir: app, loader: 'tsx',
  },
  outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  tsconfig: `${app}/tsconfig.json`, loader: { '.css': 'empty' },
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', VITE_API_URL: 'http://localhost:3001', VITE_WS_URL: 'ws://localhost:3001/ws' }) },
});
const { render } = require(output);
globalThis.window = { innerWidth: 800, innerHeight: 360 };
for (const connected of [true, false]) {
  for (const saved of [null, { gameId: 'ABC123' }]) {
    const html = render(connected, saved);
    assert.match(html, /village-menu/);
    for (const label of ['Offline / Wi-Fi', 'Resume', 'Settings', 'Rules']) assert.ok(html.includes(`<span>${label}</span>`));
    assert.match(html, connected ? /Play Now/ : /Connecting\.\.\./);
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g);
    const play = buttons.find(button => button.includes('donkey-play-button'));
    const resume = buttons.find(button => button.includes('<span>Resume</span>'));
    assert.equal(play.includes('disabled=""'), !connected);
    assert.equal(resume.includes('disabled=""'), !connected || !saved);
    assert.match(html, /courtyard-action-letter/);
    assert.match(html, /village-status-content/);
    assert.match(html, /52 cards/);
    assert.match(html, connected ? /Connected to server/ : /Connecting to server/);
    assert.match(html, /role="status"/);
  }
}
for (const musicOn of [true, false]) {
  const html = render(true, null, musicOn);
  const toolbar = html.match(/<div class="royal-toolbar"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(toolbar, 'Toolbar is present');
  assert.equal((toolbar.match(/<button\b/g) || []).length, 3);
  assert.match(toolbar, /aria-label="Toggle fullscreen"/);
  assert.match(toolbar, /aria-label="Settings"/);
  assert.ok(toolbar.includes(`aria-label="${musicOn ? 'Mute music' : 'Enable music'}"`));
  assert.ok(toolbar.includes(`aria-pressed="${musicOn}"`));
}
console.log('PASS village menu: live labels, connection guards, logo animations and three accessible toolbar controls');
