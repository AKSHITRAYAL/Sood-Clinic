const http = require('http');
const mongoose = require('mongoose');
const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { port } = require('./src/config/env');

async function start() {
  await connectDatabase();
  const server = http.createServer(app);
  server.listen(port, '127.0.0.1', () => console.log(`Careflow Clinic API listening on http://127.0.0.1:${port}`));
  const stop = async () => { server.close(); await mongoose.connection.close(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

start().catch((error) => { console.error('Unable to start API', error); process.exit(1); });
