import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../src/components/ui";
import { KnowledgePage } from "../../src/pages/KnowledgePage";
import { Drawer } from "../../src/components/ui/Drawer";
import { Tabs } from "../../src/components/ui/Tabs";
import { useResource } from "../../src/hooks/useResource";
import { useState } from "react";
it("does not claim a failed knowledge-base creation succeeded", async () => {
  const fetch = vi.fn(
    async (_url: unknown, init?: RequestInit) =>
      new Response(
        JSON.stringify(
          init?.method === "POST"
            ? { error: "创建被拒绝" }
            : { bases: [], documents: [] },
        ),
        { status: init?.method === "POST" ? 403 : 200 },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  render(
    <ToastProvider>
      <KnowledgePage />
    </ToastProvider>,
  );
  await waitFor(() =>
    expect(screen.queryByLabelText("正在加载数据")).toBeNull(),
  );
  await userEvent.click(screen.getByRole("button", { name: "新建知识库" }));
  await userEvent.type(screen.getByLabelText(/知识库名称/), "失败用例");
  await userEvent.click(screen.getByRole("button", { name: "创建知识库" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("创建被拒绝"),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.queryByText("知识库已创建")).toBeNull();
});
it("traps drawer focus and restores the trigger", async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>打开</button>
        <Drawer open={open} title="详情" onClose={() => setOpen(false)}>
          <button>最后一个操作</button>
        </Drawer>
      </>
    );
  }
  render(<Example />);
  await userEvent.click(screen.getByText("打开"));
  await userEvent.tab({ shift: true });
  expect(document.activeElement).toBe(screen.getByText("最后一个操作"));
  await userEvent.keyboard("{Escape}");
  expect(document.activeElement).toBe(screen.getByText("打开"));
});
it("switches tabs with arrow keys", async () => {
  function Example() {
    const [value, setValue] = useState("a");
    return (
      <Tabs
        value={value}
        onChange={setValue}
        tabs={[
          { id: "a", label: "甲" },
          { id: "b", label: "乙" },
        ]}
      />
    );
  }
  render(<Example />);
  screen.getByText("甲").focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByText("乙").getAttribute("aria-selected")).toBe("true");
});
it("ignores obsolete resource responses after a query change", async () => {
  const resolve: Record<string, (value: Response) => void> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise<Response>((done) => {
          resolve[url] = done;
        }),
    ),
  );
  function Example() {
    const [path, setPath] = useState("/old");
    const resource = useResource<{ value: string }>(path, { value: "demo" });
    return (
      <>
        <button onClick={() => setPath("/new")}>新查询</button>
        <span>{resource.data?.value}</span>
      </>
    );
  }
  render(<Example />);
  fireEvent.click(screen.getByText("新查询"));
  resolve["/new"](new Response('{"value":"new result"}'));
  await screen.findByText("new result");
  resolve["/old"](new Response('{"value":"old result"}'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByText("old result")).toBeNull();
});
it("keeps a successful settings save successful when browser preferences cannot be stored", async () => {
  const { useSettings, defaultSettings } =
    await import("../../src/features/settings/useSettings");
  const { renderHook, act } = await import("@testing-library/react");
  let storedRevision = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: unknown, init?: RequestInit) => {
      if (init?.method === "PUT") storedRevision = 2;
      return new Response(
        JSON.stringify({
          settings: { ...defaultSettings, revision: storedRevision },
        }),
      );
    }),
  );
  const hook = renderHook(() => useSettings());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage disabled");
  });
  let outcome = "";
  await act(async () => {
    outcome = await hook.result.current.save();
  });
  expect(outcome).toBe("server-preferences-unavailable");
  expect(hook.result.current.dirty).toBe(false);
  expect(hook.result.current.form.revision).toBe(2);
});
