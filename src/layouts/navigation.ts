import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ChartNoAxesCombined,
  Database,
  FileText,
  House,
  MessageSquareText,
  Search,
  Settings2,
  ShieldCheck,
  Workflow,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

export const navigation: NavItem[] = [
  { id: "overview", label: "工作台总览", icon: House },
  { id: "chat", label: "AI 知识助手", icon: MessageSquareText, badge: "AI" },
  { id: "knowledge", label: "知识库管理", icon: Database },
  { id: "documents", label: "文档中心", icon: FileText },
  { id: "retrieval", label: "检索实验室", icon: Search },
  { id: "tasks", label: "知识处理任务", icon: Workflow, badge: "3" },
  { id: "evaluation", label: "质量评测", icon: ChartNoAxesCombined },
  { id: "permissions", label: "权限与组织", icon: ShieldCheck },
  { id: "audit", label: "审计中心", icon: Activity },
  { id: "settings", label: "系统设置", icon: Settings2 },
];

export const descriptions: Record<string, string> = {
  chat: "连接企业知识，让每一个答案都有依据",
  overview: "让知识成为团队持续成长的力量",
  knowledge: "有序沉淀知识，连接每一个业务场景",
  documents: "从一份文档开始，构建可信的企业知识",
  retrieval: "让每一次检索都可解释、可调优",
  tasks: "从原始文档到可检索知识，全程清晰可见",
  evaluation: "用数据衡量知识的价值，让答案持续变好",
  permissions: "让合适的人，在合适的范围内获取知识",
  audit: "每一次访问与操作，都有迹可循",
  settings: "为你的团队配置更合适的知识工作空间",
};
