import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { beforeAll, afterAll } from 'vitest';

let mongoServer;

beforeAll(async () => {
	// A single-node replica set rather than a standalone server: archiving and
	// registration run inside transactions, which a standalone mongod rejects.
	mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
	const mongoUri = mongoServer.getUri();

	// Keep environment and connection URI aligned for app code under test.
	process.env.NODE_ENV = 'test';
	process.env.MONGODB_URI = mongoUri;
	process.env.JWT_SECRET = 'test-secret';
	process.env.JWT_EXPIRATION = '1h';

	await mongoose.connect(mongoUri);
});

afterAll(async () => {
	await mongoose.connection.dropDatabase();
	await mongoose.connection.close();

	if (mongoServer) {
		await mongoServer.stop();
	}
});
