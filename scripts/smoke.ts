import { runSmokeTests } from './smoke-tests.js';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

runSmokeTests(baseUrl)
  .then(() => {
    console.log(`Smoke tests passed against ${baseUrl}.`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Smoke tests failed against ${baseUrl}:\n${message}`);
    process.exit(1);
  });
