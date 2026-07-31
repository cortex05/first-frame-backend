import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { beforeAll, afterAll } from 'vitest';

let mongoServer;

beforeAll(async () => {
	mongoServer = await MongoMemoryServer.create();
	const mongoUri = mongoServer.getUri();

	// Keep environment and connection URI aligned for app code under test.
	process.env.NODE_ENV = 'test';
	process.env.MONGODB_URI = mongoUri;

	await mongoose.connect(mongoUri);
});

afterAll(async () => {
	await mongoose.connection.dropDatabase();
	await mongoose.connection.close();

	if (mongoServer) {
		await mongoServer.stop();
	}
});
