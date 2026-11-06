import { expect, test, type Page } from "@playwright/test";
const password = "browser-fixture-password-2026";
async function login(
  page: Page,
  email = "admin@browser.test",
  name = email.startsWith("admin") ? "Browser Admin" : "Browser Reader",
  secret = password,
) {
  await expect(
    page.getByRole("heading", { name: "登录工作空间", exact: true }),
  ).toBeVisible();
  await page.getByLabel(/^邮箱/).fill(email);
  await page.getByLabel(/^密码/).fill(secret);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator(".profile-button")).toContainText(name);
}
test("requires login, keeps the requested page, survives reload and logs out with real session revocation", async ({
  page,
}) => {
  await page.goto("/#documents");
  await page.getByLabel(/^邮箱/).fill("admin@browser.test");
  await page.getByLabel(/^密码/).fill("wrong-browser-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("邮箱或密码无效");
  await expect(page.getByLabel(/^邮箱/)).toHaveValue("admin@browser.test");
  await login(page);
  await expect(page.locator("main > .page-content")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#documents");
  await page.reload();
  await expect(page.locator(".profile-button")).toContainText("Browser Admin");
  const cookies = await page.context().cookies();
  const session = cookies.find(
    (cookie) => cookie.name === "zhixu_session_local",
  )!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Lax");
  await page.locator(".profile-button").click();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "登录工作空间", exact: true }),
  ).toBeVisible();
  const denied = await page.request.get("/api/knowledge/documents", {
    headers: { Cookie: `${session.name}=${session.value}` },
  });
  expect(denied.status()).toBe(401);
});
test("creates an actual account and saves a library grant through the admin page", async ({
  page,
}) => {
  await page.goto("/#permissions");
  await login(page);
  await expect(
    page.getByRole("heading", { name: "账户与知识库授权", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "创建账户", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^姓名/).fill("Created Browser User");
  await dialog.getByLabel(/^邮箱/).fill("created@browser.test");
  await dialog.getByLabel(/^初始密码/).fill(password);
  await dialog.getByRole("button", { name: "创建账户", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("created@browser.test", { exact: true }),
  ).toBeVisible();
  const reading = page.getByRole("checkbox", {
    name: "Created Browser User 检索与阅读",
    exact: true,
  });
  await reading.check();
  await page.getByRole("button", { name: "保存授权", exact: true }).click();
  await expect(
    page.getByText("知识库授权已保存", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(reading).toBeChecked();
  if (process.env.ZHIXU_CAPTURE_ARTIFACTS === "true")
    await page.screenshot({
      path: "artifacts/p2-access-desktop.png",
      fullPage: true,
    });
  const matrix = page
    .locator(".panel")
    .filter({
      has: page.getByRole("heading", {
        name: "企业制度的成员授权",
        exact: true,
      }),
    });
  await matrix.scrollIntoViewIfNeeded();
  if (process.env.ZHIXU_CAPTURE_ARTIFACTS === "true")
    await matrix.screenshot({ path: "artifacts/p2-grants-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (process.env.ZHIXU_CAPTURE_ARTIFACTS === "true")
    await page.screenshot({
      path: "artifacts/p2-access-mobile.png",
      fullPage: true,
    });
});
test("limits the reader to granted documents and recovers from an expired session", async ({
  page,
}) => {
  await page.goto("/#documents");
  await login(page, "reader@browser.test");
  const documents = await page.request.get("/api/knowledge/documents");
  const body = await documents.json();
  expect(body.documents.length).toBeGreaterThan(0);
  expect(
    body.documents.every((doc: { baseId: string }) => doc.baseId === "b1"),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "上传文档", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "归档员工休假管理制度.pdf", exact: true }),
  ).toBeDisabled();
  expect((await page.request.get("/api/knowledge/documents/d3")).status()).toBe(
    404,
  );
  await page.context().clearCookies();
  await page.getByRole("button", { name: "知识库管理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "登录工作空间", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("会话已失效");
});
test("renders login in both themes and at 390px without horizontal overflow", async ({
  page,
}) => {
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#overview");
    await page.evaluate(
      (theme) => localStorage.setItem("knowledge-hub:theme", theme),
      theme,
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "登录工作空间", exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (process.env.ZHIXU_CAPTURE_ARTIFACTS === "true")
      await page.screenshot({
        path: `artifacts/p2-login-mobile-${theme}.png`,
        fullPage: true,
      });
  }
});
test("changes a local password through the profile dialog and requires the new password for login", async ({
  page,
}) => {
  await page.goto("/#overview");
  await login(page);
  const session = await (await page.request.get("/api/auth/me")).json();
  const created = await page.request.post("/api/auth/members", {
    headers: {
      Origin: "http://127.0.0.1:15174",
      "X-CSRF-Token": session.csrfToken,
    },
    data: {
      email: "password@browser.test",
      name: "Password Browser User",
      password,
      role: "viewer",
    },
  });
  expect(created.status()).toBe(201);
  await page.locator(".profile-button").click();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login(page, "password@browser.test", "Password Browser User");
  await page.locator(".profile-button").click();
  await page.getByRole("button", { name: "修改密码", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const secret = "new-browser-private-password-2026";
  await dialog.getByLabel(/^当前密码/).fill(password);
  await dialog.getByLabel(/^新密码/).fill(secret);
  await dialog.getByLabel(/^确认新密码/).fill(secret);
  await dialog
    .getByRole("button", { name: "更新密码并退出", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "登录工作空间", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("密码已更新");
  await login(page, "password@browser.test", "Password Browser User", secret);
});
