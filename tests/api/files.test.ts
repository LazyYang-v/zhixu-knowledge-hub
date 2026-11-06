// @vitest-environment node
import {
  mkdtemp,
  rm,
  writeFile,
  readdir,
  readFile,
  symlink,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApp } from "../../server/app";
import { Store } from "../../server/lib/store";
import { createSeedDb } from "../../server/data/seed";
import {
  FileStore,
  inspectFile,
  type FileArtifact,
} from "../../server/services/files";
import { JobQueue } from "../../server/jobs/queue";
import { runOne } from "../../server/jobs/worker";

async function fixture(
  run: (context: {
    app: ReturnType<typeof createApp>;
    repository: Store;
    dir: string;
  }) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "zhixu-files-"));
  const repository = new Store(createSeedDb(), join(dir, "db.json"));
  try {
    await run({
      app: createApp(repository, new FileStore(join(dir, "files"))),
      repository,
      dir,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
function multipart(
  name: string,
  content: string | Uint8Array,
  type = "application/octet-stream",
) {
  const form = new FormData();
  form.append(
    "file",
    new File(
      [typeof content === "string" ? content : new Uint8Array(content)],
      name,
      { type },
    ),
  );
  return { method: "POST", body: form };
}
const json = (body: unknown, key?: string) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(key ? { "Idempotency-Key": key } : {}),
  },
  body: JSON.stringify(body),
});

it("returns failure when metadata cannot commit and recovers an unreferenced blob on retry", () =>
  fixture(async ({ repository, dir }) => {
    const files = new FileStore(join(dir, "files"));
    const failing = createApp(
      {
        load: () => repository.load(),
        update: async () => {
          throw new Error("disk write failed");
        },
      },
      files,
    );
    const response = await failing.request(
      "/api/knowledge/files",
      multipart("retry.txt", "recoverable source"),
    );
    expect(response.status).toBe(500);
    expect(Object.keys((await repository.load()).files ?? {})).toHaveLength(0);
    const healthy = createApp(repository, files);
    expect(
      (
        await healthy.request(
          "/api/knowledge/files",
          multipart("retry.txt", "recoverable source"),
        )
      ).status,
    ).toBe(201);
    expect(Object.keys((await repository.load()).files ?? {})).toHaveLength(1);
    expect(await readdir(join(dir, "files"))).toHaveLength(1);
  }));

it("refuses invalid persisted file metadata without replacing the user's data", () =>
  fixture(async ({ repository, dir }) => {
    await repository.load();
    const file = join(dir, "db.json");
    const saved = JSON.parse(await readFile(file, "utf8"));
    saved.files = [];
    const original = JSON.stringify(saved);
    await writeFile(file, original);
    const restarted = new Store(createSeedDb(), file);
    await expect(restarted.load()).rejects.toThrow("原文件元数据无效");
    expect(await readFile(file, "utf8")).toBe(original);
  }));

it("persists original bytes and metadata, deduplicates upload retries, and resumes text preparation after restart", () =>
  fixture(async ({ app, dir }) => {
    const original = "# 上传原文\n\n中文😀内容。".repeat(150);
    const uploads = await Promise.all([
      app.request("/api/knowledge/files", multipart("原文.md", original)),
      app.request("/api/knowledge/files", multipart("原文.md", original)),
    ]);
    expect(uploads.map((response) => response.status)).toEqual([201, 201]);
    const artifacts = await Promise.all(
      uploads.map(
        async (response) => (await response.json()).artifact as FileArtifact,
      ),
    );
    expect(artifacts[0]).toEqual(artifacts[1]);
    const artifact = artifacts[0];
    expect(
      (await app.request(`/api/knowledge/files/${artifact.id}/download`))
        .status,
    ).toBe(404);
    const input = {
      mode: "file",
      name: "原文.md",
      artifactId: artifact.id,
      category: "企业制度",
    };
    const imported = await app.request(
      "/api/knowledge/documents/import",
      json(input, "file-import-key-12345"),
    );
    expect(imported.status).toBe(201);
    const doc = (await imported.json()).document;
    expect(doc.chunks).toEqual([]);
    expect(doc.versions[0].sourceArtifactId).toBe(artifact.id);
    const repository = new Store(createSeedDb(), join(dir, "db.json"));
    const restarted = createApp(repository, new FileStore(join(dir, "files")));
    expect(await runOne(new JobQueue(repository))).toBe(true);
    const replay = await restarted.request(
      "/api/knowledge/documents/import",
      json(input, "file-import-key-12345"),
    );
    expect((await replay.json()).document.id).toBe(doc.id);
    const saved = (
      await (
        await restarted.request(`/api/knowledge/documents/${doc.id}`)
      ).json()
    ).document;
    expect(saved.task).toBe("done");
    expect(saved.chunks.length).toBeGreaterThan(1);
    const download = await restarted.request(
      `/api/knowledge/files/${artifact.id}/download`,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Disposition")).toContain(
      "attachment;",
    );
    expect(download.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await download.text()).toBe(original);
    expect(Object.keys((await repository.load()).files!)).toHaveLength(1);
    expect(await readdir(join(dir, "files"))).toHaveLength(1);
    expect(
      (await repository.load()).tasks.filter((task) => task.docId === doc.id),
    ).toHaveLength(1);
    await rm(join(dir, "files", artifact.sha256));
    const committed = await restarted.request(
      "/api/knowledge/documents/import",
      json(input, "file-import-key-12345"),
    );
    expect(committed.status).toBe(201);
    expect((await committed.json()).document.id).toBe(doc.id);
  }));

it("retains binary originals while explicitly reporting a missing parser and refusing publication", () =>
  fixture(async ({ app }) => {
    const original = "%PDF-1.7\nopaque source bytes";
    const upload = await app.request(
      "/api/knowledge/files",
      multipart("report.pdf", original),
    );
    const artifact = (await upload.json()).artifact;
    const imported = await app.request(
      "/api/knowledge/documents/import",
      json({
        mode: "file",
        name: "report.pdf",
        artifactId: artifact.id,
        category: "企业制度",
      }),
    );
    const doc = (await imported.json()).document;
    expect(doc.task).toBe("error");
    const tasks = (await (await app.request("/api/knowledge/tasks")).json())
      .tasks;
    expect(
      tasks.find((task: { docId: string }) => task.docId === doc.id).error,
    ).toContain("PARSER_UNAVAILABLE");
    expect(
      (
        await app.request(
          `/api/knowledge/documents/${doc.id}/publish`,
          json({ revision: doc.revision }),
        )
      ).status,
    ).toBe(409);
    expect(
      await (
        await app.request(`/api/knowledge/files/${artifact.id}/download`)
      ).text(),
    ).toBe(original);
  }));

it("rejects unsafe names, unsupported or mismatched types, invalid text, and imports without saved bytes", () =>
  fixture(async ({ app, repository }) => {
    expect(() =>
      inspectFile("../x.txt", new TextEncoder().encode("x")),
    ).toThrow();
    expect(() =>
      inspectFile("x\\y.txt", new TextEncoder().encode("x")),
    ).toThrow();
    const before = (await repository.load()).documents.length;
    for (const [name, content] of [
      ["attack.html", "<script>x</script>"],
      ["pretend.pdf", "not pdf"],
      ["empty.txt", ""],
      ["binary.txt", new Uint8Array([0, 1, 2])],
      ["broken.md", new Uint8Array([0xff, 0xfe])],
    ] as const) {
      const response = await app.request(
        "/api/knowledge/files",
        multipart(name, content),
      );
      expect([400, 415]).toContain(response.status);
      expect((await response.json()).requestId).toBeTruthy();
    }
    expect(
      (
        await app.request(
          "/api/knowledge/documents/import",
          json({ mode: "file", name: "missing.txt", category: "企业制度" }),
        )
      ).status,
    ).toBe(400);
    expect((await repository.load()).documents).toHaveLength(before);
    expect(Object.keys((await repository.load()).files ?? {})).toHaveLength(0);
  }));

it("rejects oversized files and invalid multipart shapes without saving records", () =>
  fixture(async ({ app, repository }) => {
    const oversized = await app.request(
      "/api/knowledge/files",
      multipart("large.txt", new Uint8Array(20 * 1024 * 1024 + 1)),
    );
    expect(oversized.status).toBe(413);
    expect((await oversized.json()).code).toBe("FILE_TOO_LARGE");
    const form = new FormData();
    form.append("file", new File(["one"], "one.txt"));
    form.append("file", new File(["two"], "two.txt"));
    expect(
      (
        await app.request("/api/knowledge/files", {
          method: "POST",
          body: form,
        })
      ).status,
    ).toBe(400);
    expect(
      (await app.request("/api/knowledge/files", json({ file: "pretend.txt" })))
        .status,
    ).toBe(415);
    expect(Object.keys((await repository.load()).files ?? {})).toHaveLength(0);
  }));

it("reports missing or corrupted originals instead of creating or serving a successful document", () =>
  fixture(async ({ app, repository, dir }) => {
    const response = await app.request(
      "/api/knowledge/files",
      multipart("saved.txt", "original bytes"),
    );
    const artifact: FileArtifact = (await response.json()).artifact;
    const input = {
      mode: "file",
      name: "saved.txt",
      artifactId: artifact.id,
      category: "企业制度",
    };
    expect(
      (await app.request("/api/knowledge/documents/import", json(input)))
        .status,
    ).toBe(201);
    await writeFile(join(dir, "files", artifact.sha256), "corrupted bytes");
    const download = await app.request(
      `/api/knowledge/files/${artifact.id}/download`,
    );
    expect(download.status).toBe(409);
    expect((await download.json()).code).toBe("FILE_INTEGRITY_ERROR");
    const before = (await repository.load()).documents.length;
    expect(
      (await app.request("/api/knowledge/documents/import", json(input)))
        .status,
    ).toBe(409);
    expect((await repository.load()).documents).toHaveLength(before);
    await rm(join(dir, "files", artifact.sha256));
    const missing = await app.request(
      `/api/knowledge/files/${artifact.id}/download`,
    );
    expect((await missing.json()).code).toBe("SOURCE_UNAVAILABLE");
  }));

it("refuses a symbolic link in place of a stored original even when the target has identical bytes", () =>
  fixture(async ({ app, dir }) => {
    const content = "isolated original bytes";
    const uploaded = await app.request(
      "/api/knowledge/files",
      multipart("linked.txt", content),
    );
    const artifact: FileArtifact = (await uploaded.json()).artifact;
    const input = {
      mode: "file",
      name: artifact.name,
      artifactId: artifact.id,
      category: "企业制度",
    };
    expect(
      (await app.request("/api/knowledge/documents/import", json(input)))
        .status,
    ).toBe(201);
    const target = join(dir, "outside-original.txt");
    await writeFile(target, content);
    const blob = join(dir, "files", artifact.sha256);
    await rm(blob);
    await symlink(target, blob);
    const response = await app.request(
      `/api/knowledge/files/${artifact.id}/download`,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("FILE_STORAGE_UNSAFE");
    expect(
      (await app.request("/api/knowledge/documents/import", json(input)))
        .status,
    ).toBe(409);
    expect(await readFile(target, "utf8")).toBe(content);
  }));

it("refuses a symbolic link as the originals root for both download and upload", () =>
  fixture(async ({ app, dir }) => {
    const uploaded = await app.request(
      "/api/knowledge/files",
      multipart("root.txt", "root original"),
    );
    const artifact: FileArtifact = (await uploaded.json()).artifact;
    expect(
      (
        await app.request(
          "/api/knowledge/documents/import",
          json({
            mode: "file",
            name: artifact.name,
            artifactId: artifact.id,
            category: "企业制度",
          }),
        )
      ).status,
    ).toBe(201);
    const displaced = join(dir, "displaced-files");
    await rename(join(dir, "files"), displaced);
    await symlink(displaced, join(dir, "files"));
    const response = await app.request(
      `/api/knowledge/files/${artifact.id}/download`,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("FILE_STORAGE_UNSAFE");
    const upload = await app.request(
      "/api/knowledge/files",
      multipart("other.txt", "new bytes"),
    );
    expect(upload.status).toBe(409);
    expect((await upload.json()).code).toBe("FILE_STORAGE_UNSAFE");
    expect(await readdir(displaced)).toEqual([artifact.sha256]);
  }));

it("never overwrites an original with mismatched bytes and rejects out-of-budget metadata", () =>
  fixture(async ({ dir }) => {
    const files = new FileStore(join(dir, "files"));
    const bytes = new TextEncoder().encode("original");
    const artifact = {
      ...inspectFile("immutable.txt", bytes),
      createdAt: new Date().toISOString(),
    };
    await files.put(artifact, bytes);
    await expect(
      files.put(artifact, new TextEncoder().encode("modified")),
    ).rejects.toMatchObject({ code: "FILE_INTEGRITY_ERROR" });
    expect(await files.read(artifact)).toEqual(Buffer.from(bytes));
    await expect(
      files.read({ ...artifact, size: 20 * 1024 * 1024 + 1 }),
    ).rejects.toMatchObject({ code: "FILE_INTEGRITY_ERROR" });
    expect(await readdir(join(dir, "files"))).toEqual([artifact.sha256]);
  }));
