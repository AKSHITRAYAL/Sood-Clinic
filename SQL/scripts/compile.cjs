// The CLI compile command fetches remote sources even for a demo project.
// Use the same installed compiler without projectId to keep compilation local.
const path = require('node:path');
const { DataConnectEmulator } = require('firebase-tools/lib/emulator/dataconnectEmulator');

async function compile() {
  const configDir = path.resolve(__dirname, '../dataconnect');
  const result = await DataConnectEmulator.build({ configDir });
  if (result.errors?.length) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exitCode = 1;
    return;
  }
  await DataConnectEmulator.generate({ configDir });
  console.log('SQL schema, connectors and SDKs compiled locally.');
}

compile().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
