import { Hono } from "hono";
import type { StateRepository } from "../repositories/state.js";
import { AppError } from "../http/errors.js";
import { FileStore, inspectFile, MAX_FILE_BYTES } from "../services/files.js";
import { appendRequestAudit } from "../services/audit.js";

export function fileRoutes(repository: StateRepository, files: FileStore) {
  const app = new Hono();
  app.post("/", async (c) => {
    // Recheck repository policy before parsing bytes or creating a blob.
    // update below still rechecks current authorization before committing metadata.
    await repository.load();
    if (!c.req.header("Content-Type")?.startsWith("multipart/form-data"))
      throw new AppError(
        415,
        "UNSUPPORTED_MEDIA",
        "请使用 multipart/form-data 上传文件",
      );
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      throw new AppError(400, "INVALID_MULTIPART", "文件请求格式无效");
    }
    const entries = [...form.entries()];
    const file = form.get("file");
    if (
      entries.length !== 1 ||
      entries[0][0] !== "file" ||
      !(file instanceof File)
    )
      throw new AppError(
        400,
        "FILE_REQUIRED",
        "每次请求必须且只能包含一个 file 文件字段",
      );
    if (file.size > MAX_FILE_BYTES)
      throw new AppError(413, "FILE_TOO_LARGE", "单个文件不能超过 20 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const principal = c.get("principal");
    const inspected = inspectFile(
      file.name,
      bytes,
      principal ? `${principal.tenantId}:${principal.memberId}` : undefined,
    );
    const artifact = {
      ...inspected,
      ...(principal ? { uploaderMembershipId: principal.memberId } : {}),
      createdAt: new Date().toISOString(),
    };
    // A crash here can leave an unreferenced blob, never a successful record pointing to unwritten bytes.
    await files.put(artifact, bytes);
    const saved = await repository.update((db) => {
      const artifacts = (db.files ??= {});
      if (artifacts[artifact.id]) return artifacts[artifact.id];
      artifacts[artifact.id] = artifact;
      appendRequestAudit(db, c, artifact);
      return artifact;
    });
    return c.json({ artifact: saved }, 201);
  });
  app.get("/:id/download", async (c) => {
    const db = await repository.load();
    const id = c.req.param("id");
    const artifact = db.files?.[id];
    if (
      !artifact ||
      !db.documents.some(
        (doc) =>
          doc.sourceArtifactId === id ||
          doc.versions.some((v) => v.sourceArtifactId === id),
      )
    )
      throw new AppError(404, "NOT_FOUND", "没有可下载的文档原文件");
    const bytes = await files.read(artifact);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(artifact.name).replace(/'/g, "%27")}`,
        "Content-Length": String(bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "no-store",
      },
    });
  });
  return app;
}
