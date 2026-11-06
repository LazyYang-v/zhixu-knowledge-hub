import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const exec = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), "zhixu-postgres-"));
const password = randomBytes(32).toString("hex");
const browser = process.argv.length === 3 && process.argv[2] === "--e2e";
if (process.argv.length > 2 && !browser) throw new Error("INVALID_TEST_MODE");
let container, child;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    interrupted = true;
    child?.kill(signal);
  });
try {
  const envFile = join(directory, "postgres.env");
  await writeFile(
    envFile,
    `POSTGRES_USER=zhixu_test\nPOSTGRES_DB=zhixu_test\nPOSTGRES_PASSWORD=${password}\n`,
    { mode: 0o600 },
  );
  container = (
    await exec("docker", [
      "run",
      "--detach",
      "--rm",
      "--label",
      "zhixu.scope=isolated-p2-tests",
      "-p",
      "127.0.0.1::5432",
      "--env-file",
      envFile,
      "postgres:18-alpine",
    ])
  ).stdout.trim();
  if (!/^[a-f0-9]{64}$/.test(container))
    throw new Error("UNEXPECTED_CONTAINER_ID");
  for (let attempts = 0; ; attempts++) {
    if (interrupted) throw new Error("INTERRUPTED");
    try {
      await exec("docker", [
        "exec",
        container,
        "pg_isready",
        "-U",
        "zhixu_test",
        "-d",
        "zhixu_test",
      ]);
      break;
    } catch {
      if (attempts >= 60) throw new Error("TEST_DATABASE_START_TIMEOUT");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const address = (
    await exec("docker", ["port", container, "5432/tcp"])
  ).stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(address))
    throw new Error("UNEXPECTED_DATABASE_BINDING");
  const status = await new Promise((resolve, reject) => {
    child = spawn(
      process.execPath,
      browser
        ? [
            "node_modules/@playwright/test/cli.js",
            "test",
            "--config",
            "playwright.auth.config.ts",
          ]
        : [
            "node_modules/vitest/vitest.mjs",
            "run",
            "--config",
            "vitest.postgres.config.ts",
          ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          ZHIXU_TEST_DATABASE_URL: `postgres://zhixu_test:${password}@${address}/zhixu_test`,
        },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = status;
} catch {
  console.error(
    "隔离 PostgreSQL 验证失败；未使用运行环境数据库连接。请确认 Docker 可用。",
  );
  process.exitCode = 1;
} finally {
  if (container && /^[a-f0-9]{64}$/.test(container))
    await exec("docker", ["rm", "--force", container]).catch(() => {
      console.error(
        "临时测试容器清理失败，请按 zhixu.scope=isolated-p2-tests 标签检查。",
      );
      process.exitCode = 1;
    });
  await rm(directory, { recursive: true, force: true });
}
