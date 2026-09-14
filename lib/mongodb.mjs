/* Shared MongoDB connection for the local server and the Vercel functions. */
import dns from 'node:dns';
import { MongoClient, ServerApiVersion } from 'mongodb';

// Serverless instances are reused between requests, so one client is cached per
// process instead of opening a new connection for every inquiry.
const cache = (globalThis.__athenaheatexMongo ??= { client: null, pending: null });

export const isDatabaseConfigured = () => Boolean(process.env.MONGODB_URI);

// Each Vercel environment points at its own database so test traffic from
// development and previews never lands in the production inquiry list.
export const databaseName = () => process.env.MONGODB_DB || 'athenaheatex';

// Some local routers do not resolve Atlas SRV records. An optional per-process
// resolver keeps that workaround scoped to this app instead of changing the
// computer's DNS settings. Hosted environments can leave this unset.
function dnsOptions() {
  const servers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!servers.length) return {};
  dns.setServers(servers);
  const resolver = new dns.Resolver();
  resolver.setServers(servers);
  const lookup = (hostname, options, callback) => resolver.resolve4(hostname, (error, addresses = []) => {
    if (error) return callback(error);
    const results = addresses.map(address => ({ address, family: 4 }));
    return options?.all ? callback(null, results) : callback(null, results[0]?.address, 4);
  });
  return { lookup };
}

export async function getClient() {
  if (cache.client) return cache.client;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  cache.pending ??= new MongoClient(process.env.MONGODB_URI, {
    serverApi: { version: ServerApiVersion.v1 },
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
    ...dnsOptions(),
  })
    .connect()
    .then(client => (cache.client = client))
    .catch(error => {
      cache.pending = null;
      throw error;
    });
  return cache.pending;
}

export async function getDb() {
  return (await getClient()).db(databaseName());
}

export async function pingDatabase() {
  await (await getClient()).db('admin').command({ ping: 1 });
  return true;
}

export async function closeDatabase() {
  const client = cache.client;
  cache.client = null;
  cache.pending = null;
  if (client) await client.close();
}
