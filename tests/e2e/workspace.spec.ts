import { expect, test } from "@playwright/test";
const pages = [
  "overview",
  "chat",
  "knowledge",
  "documents",
  "tasks",
  "retrieval",
  "evaluation",
  "permissions",
  "audit",
  "settings",
];
test("all ten pages render in both themes and on mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const theme of ["light", "dark"]) {
    await page.goto("/#overview");
    await page.getByLabel("外观主题").selectOption(theme);
    for (const name of pages) {
      await page.goto(`/#${name}`);
      await expect(
        page.locator("main > .page-content,main > .chat-workspace"),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "页面暂时无法显示" }),
      ).toHaveCount(0);
      await expect(page.locator('[aria-label="正在加载数据"]')).toHaveCount(0);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of pages) {
    await page.goto(`/#${name}`);
    await expect(
      page.locator("main > .page-content,main > .chat-workspace"),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
test("persists a real knowledge base and text record across reload", async ({
  page,
}) => {
  await page.goto("/#knowledge");
  await expect(page.locator('[aria-label="正在加载数据"]')).toHaveCount(0);
  const name = `P1验证-${Date.now()}`;
  await page.getByRole("button", { name: "新建知识库" }).click();
  await page.getByLabel("知识库名称").fill(name);
  await page.getByRole("button", { name: "创建知识库" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.goto("/#documents");
  await page.getByRole("button", { name: "上传文档" }).click();
  await page.getByRole("button", { name: "粘贴文本", exact: true }).click();
  await page.getByLabel("文档名称", { exact: true }).fill(name);
  await page
    .getByLabel("知识内容")
    .fill("这是通过真实接口保存的 P1 验证文本。");
  await page.getByRole("button", { name: "导入文档", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(".kp-document-name").filter({ hasText: name + ".md" }),
  ).toBeVisible();
});
test("server errors preserve the form and never show success", async ({
  page,
}) => {
  await page.goto("/#knowledge");
  await page.route("**/api/knowledge/bases", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({ status: 403, json: { error: "禁止创建测试" } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "新建知识库" }).click();
  await page.getByLabel("知识库名称").fill("失败记录");
  await page.getByRole("button", { name: "创建知识库" }).click();
  await expect(page.getByRole("alert")).toContainText("禁止创建测试");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("知识库名称")).toHaveValue("失败记录");
});
test("explicit demo never sends server mutations and does not become live data", async ({
  page,
}) => {
  await page.goto("/#knowledge");
  await page.getByLabel("数据源", { exact: true }).selectOption("demo");
  await expect(page.getByLabel("数据源", { exact: true })).toHaveValue("demo");
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/") && request.method() !== "GET")
      mutations.push(request.url());
  });
  const name = `本地演示-${Date.now()}`;
  await page.getByRole("button", { name: "新建知识库" }).click();
  await page.getByLabel("知识库名称").fill(name);
  await page.getByRole("button", { name: "创建知识库" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  expect(mutations).toEqual([]);
  await page.getByLabel("数据源", { exact: true }).selectOption("server");
  await expect(page.getByLabel("数据源", { exact: true })).toHaveValue(
    "server",
  );
  await expect(page.getByRole("heading", { name })).toHaveCount(0);
});
test("warns before discarding settings and uses actual server conversation responses", async ({
  page,
}) => {
  await page.goto("/#settings");
  await expect(page.locator('[aria-label="正在加载数据"]')).toHaveCount(0);
  await page.locator("input").first().fill("未保存工作空间");
  await page.locator(".nav-item").filter({ hasText: "文档中心" }).click();
  await expect(
    page.getByRole("dialog", { name: "离开未保存的设置？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page).toHaveURL(/#settings$/);
  await page.locator(".nav-item").filter({ hasText: "AI 知识助手" }).click();
  await page.getByRole("button", { name: "放弃修改并离开" }).click();
  await page.getByRole("button", { name: "新建会话", exact: true }).click();
  await page.getByLabel("向知识助手提问").fill("P1测试：报销需要什么");
  await page.locator('.composer button[type="submit"]').click();
  await expect(
    page.getByText("P1测试：报销需要什么", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("预置答案 · 未调用模型").first()).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("P1测试：报销需要什么", { exact: true }).first(),
  ).toBeVisible();
});

test("partial conversation deletion keeps failed records available for retry", async ({
  page,
  request,
}) => {
  const prefix = `删除验证-${Date.now()}`;
  const first = (
    await (
      await request.post("/api/conversations", {
        data: { title: prefix + "-1" },
      })
    ).json()
  ).conversation;
  const second = (
    await (
      await request.post("/api/conversations", {
        data: { title: prefix + "-2" },
      })
    ).json()
  ).conversation;
  await page.route("**/api/conversations", async (route) => {
    if (route.request().method() === "GET") {
      const original = await route.fetch();
      const body = await original.json();
      await route.fulfill({
        response: original,
        json: {
          conversations: body.conversations.filter((item: { title: string }) =>
            item.title.startsWith(prefix),
          ),
        },
      });
    } else await route.continue();
  });
  await page.route(`**/api/conversations/${second.id}`, (route) =>
    route.fulfill({ status: 503, json: { error: "删除暂时失败" } }),
  );
  await page.goto("/#chat");
  await expect(page.locator(".conversation-item")).toHaveCount(2);
  await page.getByRole("button", { name: "清空历史记录" }).click();
  await expect(page.getByRole("dialog")).toContainText("服务端");
  await page.getByRole("button", { name: "确认删除会话" }).click();
  await expect(page.getByRole("alert")).toContainText("1 条会话未删除");
  await expect(page.locator(".conversation-item")).toHaveCount(1);
  await expect(page.locator(".conversation-item")).toContainText(prefix + "-2");
  expect((await request.get(`/api/conversations/${first.id}`)).status()).toBe(
    404,
  );
  await page.unroute(`**/api/conversations/${second.id}`);
  await page.getByRole("button", { name: "确认删除会话" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".conversation-item")).toHaveCount(0);
});
test("batch file import retries only failed items and preserves original bytes", async ({
  page,
  request,
}) => {
  const prefix = `batch-${Date.now()}`;
  const calls: Record<string, number> = {};
  let fail = true;
  let uploads = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/knowledge/files" &&
      request.method() === "POST"
    )
      uploads++;
  });
  await page.route("**/api/knowledge/documents/import", async (route) => {
    const body = route.request().postDataJSON();
    calls[body.name] = (calls[body.name] ?? 0) + 1;
    if (body.name === prefix + "-2.txt" && fail)
      await route.fulfill({ status: 503, json: { error: "第二项登记失败" } });
    else await route.continue();
  });
  await page.goto("/#documents");
  await page.getByRole("button", { name: "上传文档" }).click();
  await page.getByLabel("选择本地文档").setInputFiles([
    {
      name: prefix + "-1.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("one"),
    },
    {
      name: prefix + "-2.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("two"),
    },
  ]);
  await page.getByRole("button", { name: "导入 2 份文档" }).click();
  await expect(page.getByRole("alert")).toContainText("第二项登记失败");
  await expect(page.getByRole("dialog")).toContainText("已登记 1 / 2");
  fail = false;
  await page.getByRole("button", { name: "导入 2 份文档" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls[prefix + "-1.txt"]).toBe(1);
  expect(calls[prefix + "-2.txt"]).toBe(2);
  expect(uploads).toBe(2);
  await expect(
    page.locator(".kp-document-name").filter({ hasText: prefix }),
  ).toHaveCount(2);
  const docs = (await (await request.get("/api/knowledge/documents")).json())
    .documents;
  const first = docs.find(
    (doc: { name: string }) => doc.name === prefix + "-1.txt",
  );
  const original = await request.get(
    `/api/knowledge/files/${first.sourceArtifactId}/download`,
  );
  expect(await original.text()).toBe("one");
});

test("a failed file transfer preserves the selection and never imports metadata as success", async ({
  page,
}) => {
  const name = `failed-transfer-${Date.now()}.txt`;
  let imports = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/knowledge/documents/import")) imports++;
  });
  await page.route("**/api/knowledge/files", (route) =>
    route.fulfill({ status: 503, json: { error: "原文件保存失败" } }),
  );
  await page.goto("/#documents");
  await page.getByRole("button", { name: "上传文档" }).click();
  await page.getByLabel("选择本地文档").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from("retry real bytes"),
  });
  await page.getByRole("button", { name: "导入 1 份文档" }).click();
  await expect(page.getByRole("alert")).toContainText("原文件保存失败");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(imports).toBe(0);
  await page.unroute("**/api/knowledge/files");
  await page.getByRole("button", { name: "导入 1 份文档" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(imports).toBe(1);
  await page.locator(".kp-document-name").filter({ hasText: name }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载原文件" }).click();
  expect((await download).suggestedFilename()).toBe(name);
  await page.route("**/api/knowledge/files/*/download", (route) =>
    route.fulfill({
      status: 409,
      json: { error: "原文件缺失，请检查备份", code: "SOURCE_UNAVAILABLE" },
    }),
  );
  await page.getByRole("button", { name: "下载原文件" }).click();
  await expect(page.getByRole("alert")).toContainText("原文件缺失");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("cancels an unfinished transfer without creating a document and permits retry", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/knowledge/files", async (route) => {
    await held;
    await route.abort().catch(() => undefined);
  });
  let imports = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/knowledge/documents/import")) imports++;
  });
  await page.goto("/#documents");
  await page.getByRole("button", { name: "上传文档" }).click();
  await page.getByLabel("选择本地文档").setInputFiles({
    name: `cancel-${Date.now()}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from("cancel source"),
  });
  await page.getByRole("button", { name: "导入 1 份文档" }).click();
  await page.getByRole("button", { name: "停止上传" }).click();
  await expect(page.getByRole("alert")).toContainText("上传已取消");
  expect(imports).toBe(0);
  release();
  await page.unroute("**/api/knowledge/files");
  await page.getByRole("button", { name: "导入 1 份文档" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(imports).toBe(1);
});
test("feedback persists across reload and can be cleared", async ({
  page,
  request,
}) => {
  const conv = (
    await (
      await request.post("/api/conversations", {
        data: { title: `feedback-${Date.now()}` },
      })
    ).json()
  ).conversation;
  await request.post(`/api/conversations/${conv.id}/messages`, {
    data: { content: "报销需要哪些材料" },
  });
  await page.goto("/#chat");
  await expect(
    page.getByRole("button", { name: "回答有帮助" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "回答有帮助" }).first().click();
  await expect(
    page.getByRole("button", { name: "回答有帮助" }).first(),
  ).toHaveClass(/feedback-active/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "回答有帮助" }).first(),
  ).toHaveClass(/feedback-active/);
  await page.getByRole("button", { name: "回答有帮助" }).first().click();
  await expect(
    page.getByRole("button", { name: "回答有帮助" }).first(),
  ).not.toHaveClass(/feedback-active/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "回答有帮助" }).first(),
  ).not.toHaveClass(/feedback-active/);
});
test("text preparation continues without the document page and exposes persisted events", async ({
  page,
  request,
}) => {
  const name = `worker-${Date.now()}.md`;
  const response = await request.post("/api/knowledge/documents/import", {
    data: {
      mode: "text",
      name,
      category: "企业制度",
      text: "后台处理验证😀。".repeat(300),
    },
  });
  expect(response.status()).toBe(201);
  const document = (await response.json()).document;
  const task = (
    await (await request.get("/api/knowledge/tasks")).json()
  ).tasks.find((item: { docId: string }) => item.docId === document.id);
  expect(["queued", "running", "succeeded"]).toContain(task.job.state);
  await page.goto("/#overview");
  await expect
    .poll(async () => {
      const tasks = (await (await request.get("/api/knowledge/tasks")).json())
        .tasks;
      return tasks.find((item: { id: string }) => item.id === task.id)?.job
        ?.state;
    })
    .toBe("succeeded");
  const prepared = (
    await (await request.get(`/api/knowledge/documents/${document.id}`)).json()
  ).document;
  expect(prepared.chunks.length).toBeGreaterThan(1);
  expect(prepared.revision).toBeGreaterThan(document.revision);
  const events = (
    await (await request.get(`/api/knowledge/tasks/${task.id}/events`)).json()
  ).events;
  expect(events.at(-1).type).toBe("succeeded");
  expect(events.at(-1).message).toContain("尚未接入");
  await page.goto("/#tasks");
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "任务详情" })).toContainText(
    "文本处理完成",
  );
});

test("saves all edited chunks atomically, keeps drafts on failure, and recovers from external revision conflicts", async ({
  page,
  request,
}) => {
  const name = `atomic-editor-${Date.now()}.md`;
  const imported = await request.post("/api/knowledge/documents/import", {
    data: {
      mode: "text",
      name,
      text: "用于验证编辑的一段原始知识。".repeat(100),
      category: "企业制度",
    },
  });
  const id = (await imported.json()).document.id;
  const read = async () =>
    (await (await request.get(`/api/knowledge/documents/${id}`)).json())
      .document;
  await expect.poll(async () => (await read()).task).toBe("done");
  const original = await read();
  expect(original.chunks.length).toBeGreaterThan(1);
  const endpoint = `**/api/knowledge/documents/${id}/chunks`;
  let fail = true;
  let saves = 0;
  await page.route(endpoint, async (route) => {
    saves++;
    expect(route.request().postDataJSON().chunks).toHaveLength(
      original.chunks.length,
    );
    if (fail)
      await route.fulfill({ status: 503, json: { error: "整批保存失败" } });
    else await route.continue();
  });
  await page.goto("/#documents");
  await page.locator(".kp-document-name").filter({ hasText: name }).click();
  await page.getByRole("button", { name: "编辑第1个分块" }).click();
  await page.getByLabel("第1个分块内容").fill("    第一个编辑块\n");
  await page.getByRole("button", { name: "编辑第2个分块" }).click();
  await page.getByLabel("第2个分块内容").fill("第二个编辑块");
  await page.getByRole("button", { name: "保存分块", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("整批保存失败");
  await expect(page.getByLabel("第2个分块内容")).toHaveValue("第二个编辑块");
  expect((await read()).chunks).toEqual(original.chunks);
  expect(saves).toBe(1);
  fail = false;
  await page.getByRole("button", { name: "保存分块", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已保存为" }),
  ).toBeVisible();
  await expect.poll(async () => (await read()).task).toBe("done");
  const saved = await read();
  expect(saved.chunks).toEqual([
    "    第一个编辑块\n",
    "第二个编辑块",
    ...original.chunks.slice(2),
  ]);
  expect(saved.versions).toHaveLength(original.versions.length + 1);
  expect(saves).toBe(2);
  await page.getByRole("button", { name: "检查最新版本" }).click();
  await expect(
    page.getByText(
      "文档已更新，已保留当前编辑内容。请比较后重新载入最新版本。",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "重新载入最新分块" }).click();
  await page.getByRole("button", { name: "编辑第1个分块" }).click();
  await page.getByLabel("第1个分块内容").fill("需要保留的未提交内容");
  await page.evaluate(() => {
    location.hash = "settings";
  });
  const leave = page.getByRole("dialog", { name: "离开未保存的内容？" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page).toHaveURL(/#documents$/);
  await expect(page.getByLabel("第1个分块内容")).toHaveValue(
    "需要保留的未提交内容",
  );
  const external = await read();
  const externalSave = await request.put(
    `/api/knowledge/documents/${id}/chunks`,
    {
      data: {
        chunks: ["外部更新", ...external.chunks.slice(1)],
        revision: external.revision,
      },
    },
  );
  expect(externalSave.status()).toBe(200);
  await expect.poll(async () => (await read()).task).toBe("done");
  await page.getByRole("button", { name: "检查最新版本" }).click();
  await expect(
    page.getByText(
      "文档已更新，已保留当前编辑内容。请比较后重新载入最新版本。",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("第1个分块内容")).toHaveValue(
    "需要保留的未提交内容",
  );
  await expect(
    page.getByRole("button", { name: "保存分块", exact: true }),
  ).toBeDisabled();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "重新载入最新分块" }).click();
  await expect(page.getByLabel("第1个分块内容")).toHaveValue(
    "需要保留的未提交内容",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "重新载入最新分块" }).click();
  await page.getByRole("button", { name: "编辑第1个分块" }).click();
  await expect(page.getByLabel("第1个分块内容")).toHaveValue("外部更新");
  await page.getByLabel("第1个分块内容").fill("离开时仍需保留的修改");
  await page.getByRole("button", { name: "权限元数据", exact: true }).click();
  await page.getByRole("button", { name: "管理组织与权限" }).click();
  const permissionLeave = page.getByRole("dialog", {
    name: "离开未保存的内容？",
  });
  await expect(permissionLeave).toBeVisible();
  await permissionLeave
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await page.getByRole("button", { name: "内容分块", exact: true }).click();
  await expect(page.getByLabel("第1个分块内容")).toHaveValue(
    "离开时仍需保留的修改",
  );
});

test("shows actual request/resource audit links and marks the caller as unverified", async ({
  page,
  request,
}) => {
  const name = `private-audit-name-${Date.now()}`;
  const created = await request.post("/api/knowledge/bases", {
    data: { name },
  });
  expect(created.status()).toBe(201);
  const base = (await created.json()).base;
  const requestId = created.headers()["x-request-id"];
  const logs = (await (await request.get(`/api/audit?query=${base.id}`)).json())
    .logs;
  expect(logs).toHaveLength(1);
  await page.goto("/#audit");
  await page.getByLabel("搜索审计日志").fill(requestId);
  await page.getByRole("button", { name: "查看", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "操作记录详情" });
  await expect(detail).toContainText(requestId);
  await expect(detail).toContainText(base.id);
  await expect(detail).toContainText("未认证请求");
  await expect(detail).not.toContainText(name);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
