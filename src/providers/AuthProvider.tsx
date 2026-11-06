import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authSessionResponse, type AuthUser } from "../../shared/auth";
import { getDataMode, setDataMode } from "../lib/data-mode";
import { getCsrfToken, setCsrfToken } from "../lib/auth-session";
import { ThemeProvider } from "./ThemeProvider";
import { Field } from "../components/ui/Field";
import "../pages/auth.css";

type Mode = "loading" | "local" | "legacy" | "demo";
const AuthContext = createContext<{
  mode: Mode;
  user: AuthUser | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  passwordChanged: () => void;
}>({
  mode: "legacy",
  user: null,
  logout: async () => {},
  refresh: async () => {},
  passwordChanged: () => {},
});
export const useAuth = () => useContext(AuthContext);
class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function authRequest(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new AuthError(
      value?.error ?? "身份服务请求失败，请重试",
      response.status,
    );
  if (!value || typeof value !== "object")
    throw new Error("身份服务返回无效响应");
  if (["/api/auth/me", "/api/auth/login"].includes(path)) {
    const parsed = authSessionResponse.safeParse(value);
    if (!parsed.success) throw new Error("身份服务返回无效会话");
    return parsed.data;
  }
  return value;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(
    getDataMode() === "demo" ? "demo" : "loading",
  );
  const [user, setUser] = useState<AuthUser | null>(null),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [pending, setPending] = useState(false);
  const generation = useRef(0),
    alive = useRef(true),
    initializing = useRef(true);
  function clear() {
    generation.current++;
    setCsrfToken();
    setUser(null);
  }
  async function refresh() {
    const id = ++generation.current;
    try {
      const result = await authRequest("/api/auth/me");
      if (id !== generation.current || !alive.current) return;
      setUser(result.user);
      setCsrfToken(result.csrfToken);
      setError("");
    } catch (reason) {
      if (id !== generation.current || !alive.current) return;
      setUser(null);
      setCsrfToken();
      if (!(reason instanceof AuthError && reason.status === 401))
        setError(reason instanceof Error ? reason.message : "会话检查失败");
    }
  }
  async function initialize() {
    const id = ++generation.current;
    setError("");
    initializing.current = true;
    try {
      const config = await authRequest("/api/auth/config");
      if (id !== generation.current || !alive.current) return;
      if (config.mode === "local") {
        setMode("local");
        await refresh();
      } else if (config.mode === "legacy_unsecured") setMode("legacy");
      else throw new Error("身份服务模式无法识别");
    } catch (reason) {
      if (id === generation.current && alive.current)
        setError(reason instanceof Error ? reason.message : "身份服务连接失败");
    } finally {
      initializing.current = false;
    }
  }
  useEffect(() => {
    alive.current = true;
    if (getDataMode() !== "demo") void initialize();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (mode !== "local") return;
    const expired = () => {
      clear();
      setError("会话已失效，请重新登录。");
    };
    const revalidate = () => {
      if (!initializing.current && user) void refresh();
    };
    window.addEventListener("zhixu-auth-expired", expired);
    window.addEventListener("focus", revalidate);
    window.addEventListener("knowledge-hub:changed", revalidate);
    return () => {
      window.removeEventListener("zhixu-auth-expired", expired);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("knowledge-hub:changed", revalidate);
    };
  }, [mode, !!user]);
  async function logout() {
    const leaving = new Event("knowledge-hub:before-navigate", {
      cancelable: true,
    });
    if (
      !window.dispatchEvent(leaving) &&
      !window.confirm("退出登录会放弃未保存的修改，是否继续？")
    )
      return;
    try {
      await authRequest("/api/auth/logout", "POST", {});
      clear();
    } catch (reason) {
      if (reason instanceof AuthError && reason.status === 401) clear();
      else throw reason;
    }
  }
  if (mode === "loading" || (mode === "local" && !user))
    return (
      <ThemeProvider>
        <main className="auth-screen">
          <section className="auth-card" aria-labelledby="auth-title">
            <span className="auth-wordmark">
              知序 <small>ZHIXU</small>
            </span>
            <h1 id="auth-title">
              {mode === "loading" ? "连接工作空间" : "登录工作空间"}
            </h1>
            <p>
              {mode === "loading"
                ? "正在核对身份服务。"
                : "使用管理员为你开通的账户，访问获授权的知识与任务。"}
            </p>
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <p className="auth-notice" role="status">
                {notice}
              </p>
            )}
            {mode === "loading" ? (
              <button
                className="btn btn-secondary"
                onClick={() => void initialize()}
              >
                {error ? "重试连接" : "重新检查"}
              </button>
            ) : (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (pending) return;
                  setPending(true);
                  setError("");
                  const id = ++generation.current;
                  try {
                    const result = await authRequest(
                      "/api/auth/login",
                      "POST",
                      { email, password },
                    );
                    if (id !== generation.current || !alive.current) return;
                    setUser(result.user);
                    setCsrfToken(result.csrfToken);
                    setPassword("");
                  } catch (reason) {
                    if (id === generation.current)
                      setError(
                        reason instanceof Error ? reason.message : "登录失败",
                      );
                  } finally {
                    setPending(false);
                  }
                }}
              >
                <Field label="邮箱" required>
                  <input
                    className="input"
                    type="email"
                    autoComplete="username"
                    required
                    maxLength={254}
                    value={email}
                    disabled={pending}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <Field label="密码" required>
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                    value={password}
                    disabled={pending}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                <button
                  className="btn btn-primary"
                  disabled={pending}
                  aria-busy={pending}
                >
                  {pending ? "正在登录…" : "登录"}
                </button>
              </form>
            )}
            <div className="auth-footer">
              <span>账户由工作空间管理员开通。</span>
              <button
                className="text-button"
                onClick={() => setDataMode("demo")}
              >
                浏览本地演示
              </button>
            </div>
          </section>
        </main>
      </ThemeProvider>
    );
  return (
    <AuthContext.Provider
      value={{
        mode,
        user,
        logout,
        refresh,
        passwordChanged: () => {
          clear();
          setPassword("");
          setError("");
          setNotice("密码已更新，原有会话已退出，请使用新密码重新登录。");
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
