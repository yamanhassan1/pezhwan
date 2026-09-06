import assert from 'node:assert/strict';
import { test } from 'node:test';

import { run, ApiError } from '@pezhwan/cli';
import { parseFlags } from '@pezhwan/cli';

test('help returns exit code 0', async () => {
  assert.equal(await run(['--help']), 0);
});

test('unknown command returns exit code 1', async () => {
  assert.equal(await run(['definitely-not-a-command']), 1);
});

test('parseFlags handles --key value, --key=value and boolean flags', () => {
  const { positional, flags } = parseFlags(['login', '--email', 'a@b.c', '--password=x', '--json']);
  assert.deepEqual(positional, ['login']);
  assert.equal(flags.email, 'a@b.c');
  assert.equal(flags.password, 'x');
  assert.equal(flags.json, true);
});

test('ApiError carries the status code', () => {
  const error = new ApiError('nope', 503);
  assert.equal(error.message, 'nope');
  assert.equal(error.status, 503);
});