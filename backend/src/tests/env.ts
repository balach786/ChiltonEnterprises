/** Runs before the test framework is installed - must set env before config is loaded. */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-value-long-enough';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
process.env.MONGODB_DB = 'showroom_test';
process.env.LOG_LEVEL = 'silent';
process.env.BCRYPT_ROUNDS = '4';
