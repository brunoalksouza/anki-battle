import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const { buildApp } = await import("./app");
const { app } = await buildApp({ logger: true });
await app.listen({
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3100),
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
