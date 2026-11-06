import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "zhixu-p1-e2e-"));
const child = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "server/index.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, PORT: process.env.PORT ?? "18787", DATA_DIR: dir },
  },
);
let closing = false;
const close = () => {
  if (!closing) {
    closing = true;
    child.kill("SIGTERM");
  }
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
child.on("exit", async (code) => {
  await rm(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
