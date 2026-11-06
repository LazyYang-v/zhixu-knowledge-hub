import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { ErrorState } from "./ui/ErrorState";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("页面渲染失败", error, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <ErrorState
        title="页面暂时无法显示"
        description="你的服务端数据不受影响，请重新加载页面。"
        action={
          <button
            className="btn btn-secondary"
            onClick={() => location.reload()}
          >
            重新加载
          </button>
        }
      />
    ) : (
      this.props.children
    );
  }
}
