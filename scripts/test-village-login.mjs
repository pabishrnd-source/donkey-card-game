import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const app = fileURLToPath(new URL('../artifacts/card-game/', import.meta.url));
const output = fileURLToPath(new URL('../artifacts/api-server/.local/profile-tests/village-login.cjs', import.meta.url));
await build({
  stdin: {
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { AccountProvider } from './src/components/AccountHub';
      export function render(user, connected) {
        const socket = { connected, social: { user, incoming: [], invitations: [] } };
        return renderToStaticMarkup(<AccountProvider socket={socket} onLocal={() => {}}>
          <p>Private game menu</p>
        </AccountProvider>);
      }`,
    resolveDir: app, loader: 'tsx',
  },
  outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  tsconfig: `${app}/tsconfig.json`, loader: { '.css': 'empty' },
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', VITE_API_URL: 'http://localhost:3001', VITE_WS_URL: 'ws://localhost:3001/ws' }) },
});
const { render } = require(output);
for (const username of ['pabish', 'abcdefghijklmnopqrst', 'A<B']) {
  const html = render({ username }, true);
  assert.match(html, /donkey-village-login-panel.png/);
  assert.match(html, /Welcome back/);
  assert.match(html, /Use another account/);
  assert.match(html, /Offline \/ Wi-Fi/);
  assert.equal((html.match(/<button /g) ?? []).length, 3);
  assert.doesNotMatch(html, /Private game menu|disabled=""/);
  assert.ok(html.includes(`Login as ${username.replace('<', '&lt;')}`));
}
const disconnected = render({ username: 'pabish' }, false);
assert.match(disconnected, /disabled=""/);
assert.match(disconnected, /Reconnecting to server/);
assert.equal((disconnected.match(/disabled=""/g) ?? []).length, 1, 'Offline and account switching remain available');
const signedOut = render(null, true);
assert.match(signedOut, /Sign in/);
assert.match(signedOut, /Create account/);
assert.match(signedOut, /Offline \/ Wi-Fi/);
assert.doesNotMatch(signedOut, /donkey-village-login-panel.png|Private game menu/);
console.log('PASS village login: dynamic escaped names, three actions, reconnect state, signed-out forms, private menu gate');
