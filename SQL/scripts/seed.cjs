const { seed } = require('./local.cjs');

seed().then(() => console.log('Local SQL public reference fixtures seeded.')).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
