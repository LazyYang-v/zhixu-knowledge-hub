import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkDataFile } from "../server/services/data-check.js";

const usage =
  "npm run data:check -- --input <snapshot-copy.json> [--files-dir <copied-files>] [--max-bytes <1..268435456>]";
export async function checkDataCommand(args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage);
    return 0;
  }
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index],
      value = args[index + 1];
    if (
      !["--input", "--files-dir", "--max-bytes"].includes(key) ||
      values.has(key) ||
      !value ||
      value.startsWith("--")
    ) {
      console.error(usage);
      return 2;
    }
    values.set(key, value);
  }
  if (!values.has("--input")) {
    console.error(usage);
    return 2;
  }
  const max = values.get("--max-bytes");
  if (
    max &&
    (!/^\d+$/.test(max) || Number(max) < 1 || Number(max) > 256 * 1024 * 1024)
  ) {
    console.error(usage);
    return 2;
  }
  try {
    const report = await checkDataFile({
      input: values.get("--input")!,
      filesDirectory: values.get("--files-dir"),
      maxBytes: max ? Number(max) : undefined,
    });
    console.log(JSON.stringify(report, null, 2));
    return report.status === "failed"
      ? 1
      : report.status === "incomplete"
        ? 2
        : 0;
  } catch {
    console.error("数据预检无法完成；未执行初始化、修复或迁移。");
    return 2;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = await checkDataCommand(process.argv.slice(2));
}
