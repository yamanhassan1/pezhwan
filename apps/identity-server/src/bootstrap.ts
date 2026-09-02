/**
 * PEZHWAN — bootstrap.
 *
 * Runtime-side startup: ensure the signer keystore is initialized (generate +
 * persist) and the tenant/bootstrap application exists so the reference server
 * can operate out of the box.
 */

import mongoose from 'mongoose';
import { config } from './config/index.ts';

/**
 * Ensure the MongoDB connection is up before other modules import models.
 * Called as a side effect by server.ts early import chain.
 *
 * Uses the centralized config module — never reads process.env directly.
 */
export async function initBootstrap(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(config.database.mongodbUri);
  }
}
