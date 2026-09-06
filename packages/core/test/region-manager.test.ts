import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRegionManager,
  unconfiguredProbe,
  type RegionConfig,
  type RegionProbe,
} from '@pezhwan/core';

function makeRegions(): RegionConfig[] {
  return [
    {
      id: 'us-east-1',
      name: 'US East (N. Virginia)',
      mongodbUri: 'mongodb://us-east-1/pezhwan',
      redisUrl: 'redis://us-east-1:6379',
      primary: true,
      location: { lat: 39.0438, long: -77.4874 },
    },
    {
      id: 'eu-central-1',
      name: 'EU (Frankfurt)',
      mongodbUri: 'mongodb://eu-central-1/pezhwan',
      redisUrl: 'redis://eu-central-1:6379',
      primary: false,
      location: { lat: 50.102, long: 8.7768 },
    },
    {
      id: 'ap-southeast-1',
      name: 'Asia Pacific (Singapore)',
      mongodbUri: 'mongodb://ap-southeast-1/pezhwan',
      redisUrl: 'redis://ap-southeast-1:6379',
      primary: false,
      location: { lat: 1.2903, long: 103.8515 },
    },
  ];
}

test('region: requires at least one region', () => {
  assert.throws(() => createRegionManager({ regions: [] }));
});

test('region: rejects duplicate region ids', () => {
  const regions = makeRegions();
  regions.push({ ...regions[0]! });
  assert.throws(() => createRegionManager({ regions }));
});

test('region: promotes first region when no primary is flagged', () => {
  const regions = makeRegions().map(({ primary: _primary, ...rest }) => rest);
  const manager = createRegionManager({ regions });
  assert.equal(manager.getPrimaryId(), regions[0]!.id);
  assert.equal(manager.getPrimary().primary, true);
});

test('region: nearest region follows explicit hint first', () => {
  const manager = createRegionManager({ regions: makeRegions() });
  const region = manager.getNearestRegion({ regionId: 'eu-central-1' });
  assert.equal(region.id, 'eu-central-1');
});

test('region: nearest region uses geoResolver before geodesic', () => {
  const manager = createRegionManager({
    regions: makeRegions(),
    geoResolver: (location) =>
      location.countryCode === 'DE' ? 'eu-central-1' : undefined,
  });
  const region = manager.getNearestRegion({ countryCode: 'DE' });
  assert.equal(region.id, 'eu-central-1');
});

test('region: nearest region uses geodesic distance when coordinates given', () => {
  const manager = createRegionManager({ regions: makeRegions() });
  // Central Jakarta — closest to Singapore, far from both the US and Germany.
  const region = manager.getNearestRegion({ lat: -6.2088, long: 106.8456 });
  assert.equal(region.id, 'ap-southeast-1');
});

test('region: unknown locations fall back to the primary region', () => {
  const manager = createRegionManager({ regions: makeRegions() });
  assert.equal(manager.getNearestRegion().id, 'us-east-1');
});

test('region: getClient returns config and health without connecting', async () => {
  const manager = createRegionManager({ regions: makeRegions() });
  const client = manager.getClient('eu-central-1');
  assert.equal(client.config.id, 'eu-central-1');
  assert.equal(client.isPrimary, false);

  const health = await client.health();
  assert.equal(health.status, 'unknown'); // default probe reports unprobed
  assert.equal(health.probed, false);
  assert.throws(() => manager.getClient('nope'));
});

test('region: pickBestRegion prefers the lowest-RTT probed region', async () => {
  const probe: RegionProbe = async (region) => ({
    mongo: true,
    redis: true,
    probed: true,
    rttMs: region.id === 'ap-southeast-1' ? 12 : 210,
  });
  const manager = createRegionManager({ regions: makeRegions(), probe });
  const best = await manager.pickBestRegion();
  assert.equal(best.id, 'ap-southeast-1');
  await manager.disconnect();
});

test('region: health aggregates and reflects a degraded region', async () => {
  const probe: RegionProbe = async (region) =>
    region.id === 'eu-central-1'
      ? { mongo: true, redis: false, probed: true, rttMs: 40 } // redis down → degraded
      : { mongo: true, redis: true, probed: true, rttMs: 20 };
  const manager = createRegionManager({ regions: makeRegions(), probe });
  const health = await manager.health();
  assert.equal(health.length, 3);
  const eu = health.find((entry) => entry.regionId === 'eu-central-1')!;
  const us = health.find((entry) => entry.regionId === 'us-east-1')!;
  assert.equal(eu.status, 'degraded');
  assert.equal(eu.mongo, true);
  assert.equal(eu.redis, false);
  assert.equal(us.status, 'healthy');
  await manager.disconnect();
});

test('region: a failing probe degrades to down instead of throwing', async () => {
  const probe: RegionProbe = async () => {
    throw new Error('probe timeout');
  };
  const manager = createRegionManager({ regions: makeRegions(), probe });
  const health = await manager.health();
  assert.ok(health.every((entry) => entry.status === 'down'));
  await manager.disconnect();
});

test('region: broadcast delivers once to subscribers', async () => {
  const manager = createRegionManager({ regions: makeRegions() });
  await manager.start();
  const received: string[] = [];
  await manager.subscribe((event) => {
    received.push(`${event.type}:${event.sessionId}`);
  });

  await manager.revokeSession('us-east-1', 'sess-1');
  assert.deepEqual(received, ['SESSION_REVOKED:sess-1']);
  await manager.disconnect();
});

test('region: broadcast stamps id/source/issuedAt', async () => {
  const manager = createRegionManager({ regions: makeRegions() });
  await manager.start();
  const event = await manager.broadcastEvent({
    type: 'MFA_CHANGED',
    userId: 'user-1',
    data: { method: 'totp' },
  });
  assert.ok(event.id);
  assert.equal(event.sourceRegion, 'us-east-1');
  assert.equal(typeof event.issuedAt, 'number');
  assert.equal(event.type, 'MFA_CHANGED');
  assert.equal(event.data.method, 'totp');
  await manager.disconnect();
});

test('region: duplicate event id is delivered exactly once', async () => {
  const manager = createRegionManager({ regions: makeRegions() });
  await manager.start();
  let deliveries = 0;
  await manager.subscribe(() => {
    deliveries += 1;
  });

  await manager.broadcastEvent({ type: 'PASSWORD_CHANGED', id: 'fixed-id', userId: 'u' });
  await manager.broadcastEvent({ type: 'PASSWORD_CHANGED', id: 'fixed-id', userId: 'u' });
  assert.equal(deliveries, 1);
  await manager.disconnect();
});

test('region: switchPrimary flips flags and broadcasts PRIMARY_CHANGED', async () => {
  const manager = createRegionManager({ regions: makeRegions() });
  await manager.start();
  const received: string[] = [];
  await manager.subscribe((event) => received.push(`${event.type}:${event.data.regionId}`));

  const promoted = await manager.switchPrimary('eu-central-1');
  assert.equal(promoted.primary, true);
  assert.equal(manager.getPrimaryId(), 'eu-central-1');
  assert.equal(manager.getRegion('us-east-1')!.primary, false);
  assert.ok(received.includes('PRIMARY_CHANGED:eu-central-1'));
  await manager.disconnect();
});

test('region: single-node deployment still routes local traffic to its region', async () => {
  const single: RegionConfig[] = [
    {
      id: 'local-dev',
      name: 'Local development',
      mongodbUri: 'mongodb://localhost/pezhwan',
      redisUrl: 'redis://localhost:6379',
      primary: true,
    },
  ];
  const manager = createRegionManager({ regions: single });
  assert.equal(manager.getNearestRegion({ lat: 40.7, long: -74.0 }).id, 'local-dev');
  assert.equal((await manager.getClient('local-dev').health()).status, 'unknown');
  const probeResult = await unconfiguredProbe(single[0]!);
  assert.equal(probeResult.probed, false);
  await manager.disconnect();
});