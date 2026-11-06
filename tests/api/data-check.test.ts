// @vitest-environment node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
  lstat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { inspectData, checkDataFile } from "../../server/services/data-check";
import { inspectFile } from "../../server/services/files";
import { scheduleText } from "../../server/jobs/queue";
import { createSeedDb } from "../../server/data/seed";
import { checkDataCommand } from "../../scripts/check-data";
import type { Db } from "../../server/types";

const secret = "sk-private-fixture-value";
function snapshot(): Db {
  return {
    bases: [
      {
        id: "base-1",
        name: secret,
        description: secret,
        color: "purple",
        owner: secret,
        access: "全体员工",
        revision: 1,
      },
    ],
    documents: [
      {
        id: "doc-1",
        baseId: "base-1",
        name: secret,
        category: secret,
        status: "草稿",
        type: "TXT",
        size: "1 KB",
        owner: secret,
        date: "2026-11-06",
        chunks: [secret],
        versions: [
          {
            id: "version-1",
            version: "v1.0",
            date: "2026-11-06",
            note: secret,
            chunks: [secret],
            chunkIds: ["chunk-1"],
          },
        ],
        department: "全体员工",
        level: "内部",
        strategy: "固定长度",
        stage: 3,
        task: "done",
        revision: 1,
      },
    ],
    tasks: [],
    members: [],
    conversations: [],
    auditLogs: [],
    evaluations: [],
    rules: {},
    settings: { ...createSeedDb().settings },
  };
}
async function fixture(
  run: (context: {
    directory: string;
    input: string;
    files: string;
    data: Db;
    digest: string;
  }) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-preflight-"));
  const input = join(directory, "copy.json"),
    files = join(directory, "files");
  const data = snapshot();
  const bytes = Buffer.from(secret);
  const artifact = {
    ...inspectFile("private-original.txt", bytes),
    createdAt: "2026-11-06T00:00:00.000Z",
  };
  data.files = { [artifact.id]: artifact };
  data.documents[0].sourceArtifactId = artifact.id;
  data.documents[0].versions[0].sourceArtifactId = artifact.id;
  await mkdir(files);
  await writeFile(join(files, artifact.sha256), bytes);
  await writeFile(input, JSON.stringify(data));
  try {
    await run({ directory, input, files, data, digest: artifact.sha256 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it("checks a supplied snapshot and original bytes without modifying or disclosing their contents", () =>
  fixture(async ({ input, files }) => {
    const before = await readFile(input),
      info = await lstat(input, { bigint: true });
    const entries = await readdir(files);
    const report = await checkDataFile({ input, filesDirectory: files });
    expect(report.status).toBe("passed");
    expect(report.fileVerification).toBe("passed");
    expect(report.sourceSha256).toBe(
      createHash("sha256").update(before).digest("hex"),
    );
    expect(report.migrationReady).toBe("not_assessed");
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(JSON.stringify(report)).not.toContain("private-original.txt");
    expect(await readFile(input)).toEqual(before);
    expect((await lstat(input, { bigint: true })).mtimeNs).toBe(info.mtimeNs);
    expect(await readdir(files)).toEqual(entries);
  }));

it("reports duplicate identifiers, names, content/version relationships and case-insensitive emails with original array positions", () => {
  const data = snapshot();
  const input = {
    ...data,
    bases: [
      ...data.bases,
      {
        ...data.bases[0],
        id: "base-2",
        name: data.bases[0].name.toUpperCase(),
      },
    ],
    documents: [
      null,
      ...data.documents,
      { ...data.documents[0], chunks: ["different"] },
    ],
    members: [
      {
        id: "m1",
        name: secret,
        email: "PRIVATE@example.com",
        department: "研发部",
        role: "普通成员",
      },
      {
        id: "m2",
        name: secret,
        email: "private@example.com",
        department: "研发部",
        role: "普通成员",
      },
    ],
  };
  const before = JSON.stringify(input);
  const report = inspectData(input);
  expect(report.status).toBe("failed");
  for (const code of [
    "DUPLICATE_ID",
    "DUPLICATE_BASE_NAME",
    "DUPLICATE_MEMBER_EMAIL",
    "DUPLICATE_VERSION_ID",
    "DUPLICATE_CHUNK_ID",
    "CURRENT_VERSION_CONTENT_MISMATCH",
  ])
    expect(report.issueCounts[code]).toBeGreaterThan(0);
  expect(
    report.issues.find(
      (issue) => issue.code === "CURRENT_VERSION_CONTENT_MISMATCH",
    )?.location,
  ).toBe("documents[2].versions[0]");
  expect(JSON.stringify(input)).toBe(before);
  expect(JSON.stringify(report)).not.toMatch(
    /sk-private-fixture-value|PRIVATE@example.com|private@example.com/,
  );
});

it("checks durable job references, leases, active duplicates, checkpoints and ordered events", () => {
  const data = snapshot();
  const task = scheduleText(
    data,
    data.documents[0],
    secret,
    new Date("2026-11-06T00:00:00.000Z"),
  );
  task.job!.state = "running";
  task.job!.attempts = 1;
  task.job!.leaseToken = secret;
  task.job!.leaseUntil = "2026-11-06T00:00:01.000Z";
  task.job!.version = "v9.9";
  task.job!.checkpoint = { stage: "chunked", chunks: [] };
  task.job!.events.push({
    sequence: 1,
    time: "2026-11-06T00:00:00.000Z",
    type: "duplicate",
    message: secret,
  });
  data.tasks.push({ ...structuredClone(task), id: "other-task" });
  const report = inspectData(data, new Date("2026-11-06T00:00:02.000Z"));
  for (const code of [
    "JOB_VERSION_MISSING",
    "STALE_ACTIVE_JOB",
    "EXPIRED_RECOVERABLE_LEASE",
    "DUPLICATE_ACTIVE_JOB",
    "INVALID_CHECKPOINT",
    "INVALID_JOB_EVENT",
  ])
    expect(report.issueCounts[code]).toBeGreaterThan(0);
  expect(JSON.stringify(report)).not.toContain(secret);
});

it("detects missing/cyclic task successors and distinguishes legacy records from verified migration state", () => {
  const data = snapshot();
  data.tasks = [
    {
      id: "t1",
      docId: "doc-1",
      docName: secret,
      stage: 0,
      status: "error",
      updatedAt: "2026-11-06T00:00:00Z",
      supersededBy: "t2",
    },
    {
      id: "t2",
      docId: "missing-doc",
      docName: secret,
      stage: 0,
      status: "error",
      updatedAt: "2026-11-06T00:00:00Z",
      supersededBy: "t1",
    },
    {
      id: "t3",
      docId: "doc-1",
      docName: secret,
      stage: 0,
      status: "error",
      updatedAt: "2026-11-06T00:00:00Z",
      supersededBy: "missing-task",
    },
  ];
  const report = inspectData(data);
  for (const code of [
    "TASK_SUCCESSOR_CYCLE",
    "TASK_SUCCESSOR_DOCUMENT_MISMATCH",
    "TASK_SUCCESSOR_MISSING",
    "TASK_DOCUMENT_MISSING",
    "LEGACY_TASK_WITHOUT_JOB",
    "LEGACY_ORIGINAL_FILE_UNAVAILABLE",
  ])
    expect(report.issueCounts[code]).toBeGreaterThan(0);
  expect(report.migrationReady).toBe("not_assessed");
});

it("does not report unverified or corrupted file bytes as passed", () =>
  fixture(async ({ input, files, digest }) => {
    const incomplete = await checkDataFile({ input });
    expect(incomplete.status).toBe("incomplete");
    expect(incomplete.issueCounts.FILE_BYTES_NOT_CHECKED).toBe(1);
    await writeFile(join(files, digest), "x".repeat(Buffer.byteLength(secret)));
    const corrupted = await checkDataFile({ input, filesDirectory: files });
    expect(corrupted.status).toBe("failed");
    expect(corrupted.fileVerification).toBe("failed");
    expect(corrupted.issueCounts.BLOB_INTEGRITY_ERROR).toBe(1);
    await rm(join(files, digest));
    const missing = await checkDataFile({ input, filesDirectory: files });
    expect(missing.issueCounts.BLOB_MISSING_UNSAFE_OR_CHANGED).toBe(1);
  }));

it("refuses symlinked inputs, original files and directories without following or repairing them", () =>
  fixture(async ({ directory, input, files, digest }) => {
    const inputLink = join(directory, "input-link.json");
    await symlink(input, inputLink);
    expect((await checkDataFile({ input: inputLink })).status).toBe(
      "incomplete",
    );
    const outside = join(directory, "outside-private.txt");
    await writeFile(outside, secret);
    const before = await lstat(outside, { bigint: true });
    await rm(join(files, digest));
    await symlink(outside, join(files, digest));
    const report = await checkDataFile({ input, filesDirectory: files });
    expect(report.fileVerification).toBe("failed");
    expect(report.issueCounts.BLOB_MISSING_UNSAFE_OR_CHANGED).toBe(1);
    expect((await lstat(outside, { bigint: true })).atimeNs).toBe(
      before.atimeNs,
    );
    const directoryLink = join(directory, "directory-link");
    await symlink(files, directoryLink);
    expect(
      (await checkDataFile({ input, filesDirectory: directoryLink })).status,
    ).toBe("incomplete");
  }));

it("lists orphan/temporary entries as diagnostics and never deletes them", () =>
  fixture(async ({ input, files }) => {
    await writeFile(join(files, "a".repeat(64)), secret);
    await writeFile(join(files, "incomplete-private.tmp"), secret);
    await mkdir(join(files, "nested-private"));
    const before = (await readdir(files)).sort();
    const report = await checkDataFile({ input, filesDirectory: files });
    expect(report.status).toBe("warnings");
    expect(report.counts.unreferencedBlobs).toBe(1);
    expect(report.issueCounts.UNRECOGNIZED_FILE_ENTRY).toBe(1);
    expect(report.issueCounts.IGNORED_NON_FILE_ENTRY).toBe(1);
    expect((await readdir(files)).sort()).toEqual(before);
    expect(JSON.stringify(report)).not.toContain("incomplete-private");
  }));

it("bounds diagnostic output while retaining error locations after many legacy warnings", () => {
  const data = snapshot();
  data.documents = Array.from({ length: 300 }, (_, index) => ({
    ...structuredClone(data.documents[0]),
    id: `doc-${index}`,
    baseId: undefined,
    versions: [
      { ...data.documents[0].versions[0], id: undefined, chunkIds: undefined },
    ],
  }));
  data.documents[299].chunks = ["mismatch"];
  const report = inspectData(data);
  expect(report.issuesTruncated).toBe(true);
  expect(report.issues.length).toBeLessThanOrEqual(200);
  expect(report.totals.warning).toBeGreaterThan(200);
  expect(
    report.issues.some(
      (issue) =>
        issue.code === "CURRENT_VERSION_CONTENT_MISMATCH" &&
        issue.location === "documents[299].versions[0]",
    ),
  ).toBe(true);
});

it("does not initialize missing inputs and hides parser errors or private filenames", () =>
  fixture(async ({ directory, input }) => {
    const before = (await readdir(directory)).sort();
    const missing = await checkDataFile({
      input: join(directory, "missing.json"),
    });
    expect(missing.status).toBe("incomplete");
    expect(missing.issueCounts).toEqual({ UNREADABLE_INPUT: 1 });
    expect((await readdir(directory)).sort()).toEqual(before);
    expect(
      (await checkDataFile({ input, maxBytes: 1 })).issueCounts.SIZE_LIMIT,
    ).toBe(1);
    await writeFile(input, `{"private":"${secret}`);
    const malformed = await checkDataFile({ input });
    expect(malformed.status).toBe("failed");
    expect(malformed.issueCounts).toEqual({ INVALID_JSON_OR_ENCODING: 1 });
    expect(JSON.stringify(malformed)).not.toContain(secret);
  }));

it("reports malformed retained collections and unknown fields without echoing private values or treating them as safe migration input", () => {
  const data = snapshot();
  const input = {
    ...data,
    [secret]: { credential: secret },
    settings: { ...data.settings, revision: secret },
    rulesRevision: secret,
    auditLogs: [
      {
        id: "a1",
        time: "not-a-date",
        user: secret,
        department: secret,
        action: secret,
        content: secret,
        source: secret,
        status: secret,
        docs: secret,
        schemaVersion: 1,
      },
    ],
    evaluations: [
      {
        id: "e1",
        name: secret,
        dataset: secret,
        status: "已完成",
        createdAt: "2026-11-06T00:00:00Z",
        metrics: { hitRate: null },
        records: [null],
      },
    ],
    rules: { [secret]: [true] },
  };
  const report = inspectData(input);
  for (const code of [
    "UNKNOWN_ROOT_FIELDS",
    "INVALID_AUDIT_RESOURCES",
    "UNVERIFIED_AUDIT_TIME",
    "INVALID_EVALUATION_METRICS",
    "INVALID_EVALUATION_SAMPLE",
    "INVALID_RULE_VALUES",
    "INVALID_SETTINGS_REVISION",
    "INVALID_RULES_REVISION",
  ])
    expect(report.issueCounts[code]).toBeGreaterThan(0);
  expect(report.status).toBe("failed");
  expect(report.migrationReady).toBe("not_assessed");
  expect(JSON.stringify(report)).not.toContain(secret);
});

it("returns explicit CLI exit codes and executes as a real standalone read-only command", () =>
  fixture(async ({ input, files }) => {
    const stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(await checkDataCommand([])).toBe(2);
    expect(
      await checkDataCommand(["--input", input, "--unknown", secret]),
    ).toBe(2);
    expect(JSON.stringify(stderr.mock.calls)).not.toContain(secret);
    expect(await checkDataCommand(["--input", input])).toBe(2);
    expect(
      await checkDataCommand(["--input", input, "--files-dir", files]),
    ).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls.at(-1)![0])).status).toBe(
      "passed",
    );
    const result = await promisify(execFile)(
      process.execPath,
      [
        "node_modules/tsx/dist/cli.mjs",
        "scripts/check-data.ts",
        "--input",
        input,
        "--files-dir",
        files,
      ],
      { cwd: process.cwd() },
    );
    expect(JSON.parse(result.stdout).fileVerification).toBe("passed");
    expect(result.stderr).toBe("");
    await writeFile(input, "{");
    expect(await checkDataCommand(["--input", input])).toBe(1);
    expect(JSON.parse(String(stdout.mock.calls.at(-1)![0])).status).toBe(
      "failed",
    );
  }));
