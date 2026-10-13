/* eslint-disable no-console */
/**
 * Makes sure a MongoDB instance is reachable before the suite runs.
 *
 *  1. Use MONGODB_URI if it already answers (local mongod, Docker, or Atlas).
 *  2. Otherwise, if MONGOD_BIN points at a mongod executable, start a temporary
 *     single-node replica set so multi-document transactions can be tested too.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { MongoClient } from 'mongodb';

const DEFAULT_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';

function parseUri(uri: string) {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const [hosts] = withoutScheme.split('/');
  const [host, port] = hosts.split(',')[0].split(':');
  return { host: host || '127.0.0.1', port: Number(port ?? 27017) };
}

async function canConnect(uri: string): Promise<boolean> {
  const { host, port } = parseUri(uri);
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function startLocalMongod(): Promise<void> {
  const bin = process.env.MONGOD_BIN;
  if (!bin || !fs.existsSync(bin)) {
    throw new Error(
      `MongoDB is not reachable at ${DEFAULT_URI}.\n` +
        'Start a local MongoDB (mongod, Docker, or MongoDB Atlas) or set MONGOD_BIN to a mongod executable.\n' +
        'Example: MONGOD_BIN=/usr/bin/mongod npm test'
    );
  }

  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'showroom-mongo-'));
  const logFile = path.join(dbPath, 'mongod.log');
  const { port } = parseUri(DEFAULT_URI);

  const child = spawn(
    bin,
    ['--dbpath', dbPath, '--port', String(port), '--bind_ip', '127.0.0.1', '--replSet', 'rs0', '--logpath', logFile, '--fork'],
    { stdio: 'ignore', detached: true }
  );
  child.unref();

  for (let i = 0; i < 60; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await canConnect(DEFAULT_URI)) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 500));
  }

  const client = new MongoClient(DEFAULT_URI, { directConnection: true });
  await client.connect();
  try {
    await client.db('admin').command({ replSetInitiate: {} });
  } catch (err) {
    if (!/already initialized|NotYetInitialized/.test(String((err as Error).message))) {
      // ignore - already a replica set
    }
  }
  for (let i = 0; i < 60; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const hello = await client.db('admin').command({ hello: 1 });
      if (hello.isWritablePrimary) break;
    } catch {
      /* not primary yet */
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 500));
  }
  await client.close();

  process.env.MONGO_DB_PATH = dbPath;
  console.log(`Started a temporary MongoDB replica set at ${DEFAULT_URI} (dbpath ${dbPath})`);
}

export default async function globalSetup() {
  if (await canConnect(DEFAULT_URI)) {
    console.log(`Using MongoDB at ${DEFAULT_URI}`);
    return;
  }
  await startLocalMongod();
}
