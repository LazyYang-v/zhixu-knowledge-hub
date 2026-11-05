import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

let diagramId = 0;
function Diagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            primaryColor: "#f0ebff",
            primaryTextColor: "#493689",
            primaryBorderColor: "#c5b6f5",
            lineColor: "#9d8bc9",
            fontFamily: "sans-serif",
          },
        });
        const { svg } = await mermaid.render(
          `knowledge-diagram-${++diagramId}`,
          code,
        );
        if (active && ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [code]);
  return failed ? (
    <code>{code}</code>
  ) : (
    <div ref={ref} className="mermaid-diagram" aria-label="休假申请流程图" />
  );
}
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const code = String(children).trim();
            return className === "language-mermaid" ? (
              <Diagram code={code} />
            ) : (
              <code className={className}>{children}</code>
            );
          },
          a({ children, href }) {
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
