import test from 'node:test';
import assert from 'node:assert/strict';
import { pagesOwner, webappDataConfig } from '../src/deployment.js';

test('sync and Journal use the Pages account that serves Folio', () => {
  assert.equal(pagesOwner({ hostname: 'portable-owner.github.io' }), 'portable-owner');
  assert.equal(webappDataConfig('token', { hostname: 'portable-owner.github.io' }).owner, 'portable-owner');
});

test('a custom domain cannot silently select a repository owner', () => {
  assert.throws(() => webappDataConfig('token', { hostname: 'folio.example' }), { code: 'PAGES_OWNER_UNRESOLVED' });
});
