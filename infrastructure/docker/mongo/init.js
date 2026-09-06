// MongoDB replica set initialization script.
//
// This script runs automatically when the first mongod starts with an empty
// data directory. It configures a 3-node replica set for the PEZHWAN stack.

try {
  const status = rs.status();

  // Already initialized.
  if (status.ok === 1) {
    print('Replica set already initialized.');
  }
} catch {
  // Not yet initialized — configure it.
  print('Initializing replica set...');

  rs.initiate({
    _id: 'pezhwan-rs',
    members: [
      { _id: 0, host: 'mongo1:27017', priority: 2 },
      { _id: 1, host: 'mongo2:27017', priority: 1 },
      { _id: 2, host: 'mongo3:27017', priority: 1 },
    ],
    settings: {
      chainingAllowed: true,
      heartbeatTimeoutSecs: 10,
      electionTimeoutMillis: 10000,
      catchUpTimeoutMillis: 2000,
    },
  });

  print('Replica set initialized successfully.');
}

// Wait for the primary to be elected, then create the application database.
try {
  // The primary election happens asynchronously. Use a simple loop.
  let attempts = 0;
  while (attempts < 30) {
    const info = rs.isMaster();
    if (info.ismaster) {
      print('Primary elected — creating application database.');

      // Create the application database and collections.
      const db = db.getSiblingDB('pezhwan');

      // Create collections with schema validation.
      db.createCollection('users', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['tenantId', 'createdAt'],
            properties: {
              tenantId: { bsonType: 'string' },
              email: { bsonType: 'string' },
              phone: { bsonType: 'string' },
              createdAt: { bsonType: 'date' },
            },
          },
        },
      });

      db.createCollection('sessions', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['userId', 'applicationId', 'createdAt'],
            properties: {
              userId: { bsonType: 'string' },
              applicationId: { bsonType: 'string' },
              status: { bsonType: 'string' },
              createdAt: { bsonType: 'date' },
            },
          },
        },
      });

      // Create indexes.
      db.users.createIndex({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
      db.users.createIndex({ tenantId: 1, phone: 1 }, { unique: true, sparse: true });
      db.sessions.createIndex({ userId: 1, applicationId: 1, status: 1 });
      db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

      print('Database and collections created.');
      break;
    }

    print(`Waiting for primary election (attempt ${++attempts})...`);
    sleep(2000);
  }
} catch (e) {
  print(`Error during database setup: ${e}`);
}
