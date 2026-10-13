// Runs once on first boot of the mongo container: turns the single node into a
// one-member replica set so multi-document transactions are available.
try {
  const status = rs.status();
  print('replica set already initiated: ' + status.set);
} catch (err) {
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] });
  print('replica set rs0 initiated');
}
