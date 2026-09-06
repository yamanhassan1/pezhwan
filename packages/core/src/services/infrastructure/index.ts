/**
 * PEZHWAN — infrastructure services barrel.
 */

export { RedisManager, createRedisManager, type RedisManagerOptions } from '../redisCache.ts';
export {
  EnhancedRedisManager,
  createEnhancedRedisManager,
  type EnhancedRedisManagerOptions,
  type SentinelConfig,
  type ClusterConfig,
  type ClusterHealth,
  type NodeHealth,
  type RedisTopology,
} from './redis-manager.ts';
export {
  DistributedLock,
  createDistributedLock,
  type LockOptions,
  type Lock,
} from './distributed-lock.ts';
export {
  ConnectionPool,
  createConnectionPool,
  type ConnectionPoolOptions,
  type ConnectionHealth,
} from './connection-pool.ts';
export {
  QueryOptimizer,
  createQueryOptimizer,
  type QueryOptimizerOptions,
  type SlowQueryEntry,
  type IndexSuggestion,
  type QueryStats,
} from './query-optimizer.ts';
export {
  KeyStoreService,
  createKeyStoreService,
  type KeyStoreServiceOptions,
  type KeyDoc,
  type KeyDocStatus,
} from './key-store.service.ts';
export {
  RegionManager,
  createRegionManager,
  LocalRegionEventTransport,
  unconfiguredProbe,
  type RegionManagerOptions,
  type RegionConfig,
  type RegionGeoPoint,
  type UserLocation,
  type RegionEvent,
  type RegionEventHandler,
  type RegionProbe,
  type RegionProbeResult,
  type RegionHealth,
  type RegionEventTransport,
  type RegionContext,
} from './region-manager.ts';
