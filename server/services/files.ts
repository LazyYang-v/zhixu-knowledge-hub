import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, writeFile, rename, rm, lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { AppError } from "../http/errors.js";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export interface FileArtifact {
  uploaderMembershipId?: string;
  id: string;
  name: string;
  size: number;
  mediaType: string;
  sha256: string;
  createdAt: string;
}
const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

export function textFile(bytes: Uint8Array) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AppError(
      415,
      "INVALID_TEXT_ENCODING",
      "文本文件必须使用 UTF-8 编码",
    );
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text))
    throw new AppError(
      415,
      "INVALID_TEXT_CONTENT",
      "文本文件包含二进制控制字符",
    );
  if (!text.trim()) throw new AppError(400, "EMPTY_TEXT", "文本文件不能为空");
  if (text.length > 2_000_000)
    throw new AppError(413, "TEXT_TOO_LARGE", "文本内容不能超过 200 万字符");
  return text;
}

/** Type checks are lightweight signatures, not malware scanning or complete format validation. */
export function inspectFile(
  name: string,
  bytes: Uint8Array,
  namespace?: string,
): Omit<FileArtifact, "createdAt"> {
  if (!name || name.length > 160 || /[\/\\\u0000-\u001F\u007F]/.test(name))
    throw new AppError(
      400,
      "INVALID_FILE_NAME",
      "文件名不允许包含路径或控制字符，且不能超过 160 字符",
    );
  if (!bytes.length) throw new AppError(400, "EMPTY_FILE", "不能上传空文件");
  if (bytes.length > MAX_FILE_BYTES)
    throw new AppError(413, "FILE_TOO_LARGE", "单个文件不能超过 20 MB");
  const extension = name.split(".").at(-1)?.toLowerCase();
  const starts = (...signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);
  let mediaType: string;
  if (extension === "txt" || extension === "md") {
    textFile(bytes);
    mediaType = extension === "md" ? "text/markdown" : "text/plain";
  } else {
    const formats: Record<string, [string, () => boolean]> = {
      pdf: ["application/pdf", () => starts(0x25, 0x50, 0x44, 0x46, 0x2d)],
      png: [
        "image/png",
        () => starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      ],
      jpg: ["image/jpeg", () => starts(0xff, 0xd8, 0xff)],
      jpeg: ["image/jpeg", () => starts(0xff, 0xd8, 0xff)],
      webp: [
        "image/webp",
        () =>
          starts(0x52, 0x49, 0x46, 0x46) &&
          Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP",
      ],
      doc: [
        "application/msword",
        () => starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1),
      ],
      xls: [
        "application/vnd.ms-excel",
        () => starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1),
      ],
      ppt: [
        "application/vnd.ms-powerpoint",
        () => starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1),
      ],
      docx: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        () => starts(0x50, 0x4b, 0x03, 0x04),
      ],
      xlsx: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        () => starts(0x50, 0x4b, 0x03, 0x04),
      ],
      pptx: [
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        () => starts(0x50, 0x4b, 0x03, 0x04),
      ],
    };
    const format = extension ? formats[extension] : undefined;
    if (!format)
      throw new AppError(415, "UNSUPPORTED_FILE_TYPE", "不支持此文件格式");
    if (!format[1]())
      throw new AppError(415, "FILE_TYPE_MISMATCH", "文件内容与扩展名不符");
    mediaType = format[0];
  }
  const digest = sha256(bytes);
  return {
    id: `file_${sha256(`${name}\0${digest}${namespace ? `\0${namespace}` : ""}`)}`,
    name,
    size: bytes.length,
    sha256: digest,
    mediaType,
  };
}

/** Immutable, content-addressed originals, outside public assets. No automatic data deletion. */
export class FileStore {
  constructor(
    private readonly directory = join(process.env.DATA_DIR ?? "data", "files"),
  ) {}
  private path(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest))
      throw new AppError(400, "INVALID_FILE_ID", "文件标识无效");
    return join(this.directory, digest);
  }
  private unsafeStorage() {
    return new AppError(
      409,
      "FILE_STORAGE_UNSAFE",
      "原文件存储路径不是普通文件或目录，请检查存储配置",
    );
  }
  private integrityError() {
    return new AppError(
      409,
      "FILE_INTEGRITY_ERROR",
      "原文件完整性校验失败，请检查备份",
    );
  }
  private async checkDirectory() {
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw this.unsafeStorage();
  }
  async put(artifact: FileArtifact, bytes: Uint8Array) {
    const target = this.path(artifact.sha256);
    if (
      !Number.isSafeInteger(artifact.size) ||
      artifact.size < 1 ||
      artifact.size > MAX_FILE_BYTES ||
      bytes.length !== artifact.size ||
      sha256(bytes) !== artifact.sha256
    )
      throw this.integrityError();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.checkDirectory();
    // Identical bytes may safely replace the same digest; no mutable filename is used as a path.
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async read(artifact: FileArtifact) {
    try {
      if (
        !Number.isSafeInteger(artifact.size) ||
        artifact.size < 1 ||
        artifact.size > MAX_FILE_BYTES
      )
        throw this.integrityError();
      await this.checkDirectory();
      if (typeof constants.O_NOFOLLOW !== "number") throw this.unsafeStorage();
      // NONBLOCK prevents a substituted FIFO from hanging before fstat can reject it.
      const handle = await open(
        this.path(artifact.sha256),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const before = await handle.stat({ bigint: true });
        if (!before.isFile()) throw this.unsafeStorage();
        if (before.size !== BigInt(artifact.size)) throw this.integrityError();
        // Never let a file growing after fstat cause an unbounded readFile allocation.
        const bytes = Buffer.alloc(artifact.size);
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesRead } = await handle.read(
            bytes,
            offset,
            bytes.length - offset,
            offset,
          );
          if (!bytesRead) throw this.integrityError();
          offset += bytesRead;
        }
        const after = await handle.stat({ bigint: true });
        if (
          before.size !== after.size ||
          before.mtimeNs !== after.mtimeNs ||
          before.ctimeNs !== after.ctimeNs ||
          sha256(bytes) !== artifact.sha256
        )
          throw this.integrityError();
        return bytes;
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new AppError(
          409,
          "SOURCE_UNAVAILABLE",
          "原文件缺失，请检查数据备份或重新上传",
        );
      if (
        ["ELOOP", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw this.unsafeStorage();
      throw error;
    }
  }
}
