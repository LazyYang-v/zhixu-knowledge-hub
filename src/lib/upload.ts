import type { FileArtifact } from "../../server/services/files";
import { ApiError } from "./api";
import { getDataMode } from "./data-mode";
import { fileArtifact } from "../../shared/contracts";
import { getCsrfToken, authenticationExpired } from "./auth-session";

export function uploadFile(
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
) {
  if (getDataMode() === "demo") return Promise.resolve(null);
  return new Promise<FileArtifact>((resolve, reject) => {
    if (signal.aborted) {
      reject(new ApiError("上传已取消", 0, "ABORTED"));
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("POST", "/api/knowledge/files");
    if (getCsrfToken()) xhr.setRequestHeader("X-CSRF-Token", getCsrfToken()!);
    xhr.timeout = 60_000;
    xhr.upload.onprogress = (event) =>
      onProgress(event.loaded, event.lengthComputable ? event.total : 0);
    xhr.onload = () => {
      cleanup();
      let body;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(
          new ApiError("上传服务返回无效响应", xhr.status, "INVALID_RESPONSE"),
        );
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        if (xhr.status === 401) authenticationExpired();
        reject(
          new ApiError(
            body.error ?? `上传失败（${xhr.status}）`,
            xhr.status,
            body.code,
            body.requestId,
          ),
        );
        return;
      }
      const parsed = fileArtifact.safeParse(body?.artifact);
      if (!parsed.success) {
        reject(
          new ApiError("上传响应缺少文件标识", xhr.status, "INVALID_RESPONSE"),
        );
        return;
      }
      onProgress(file.size, file.size);
      resolve(parsed.data);
    };
    xhr.onerror = () => {
      cleanup();
      reject(new ApiError("文件上传连接失败，请重试"));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new ApiError("文件上传超时，请重试", 0, "TIMEOUT"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new ApiError("上传已取消", 0, "ABORTED"));
    };
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export async function downloadOriginal(id: string) {
  if (getDataMode() !== "server")
    throw new ApiError("请切换到服务端数据后下载原文件");
  const response = await fetch(
    `/api/knowledge/files/${encodeURIComponent(id)}/download`,
    { signal: AbortSignal.timeout(60_000) },
  ).catch(() => {
    throw new ApiError("原文件下载失败，请检查连接后重试");
  });
  if (!response.ok) {
    if (response.status === 401) authenticationExpired();
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body?.error ?? "原文件下载失败",
      response.status,
      body?.code,
      body?.requestId,
    );
  }
  const match = /filename\*=UTF-8''([^;]+)/i.exec(
    response.headers.get("Content-Disposition") ?? "",
  );
  const name = match ? decodeURIComponent(match[1]) : "download";
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
