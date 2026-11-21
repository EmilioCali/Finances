import { loadEnv } from "./config/env.js";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const settings = loadEnv();
  const app = await buildApp({ settings, logger: true });
  await app.listen({ port: settings.agentPort, host: "0.0.0.0" });
  console.log(`scenariolab-agent listening on ${settings.agentPort}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
