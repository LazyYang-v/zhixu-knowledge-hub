export type AnswerKind =
  | "leave"
  | "carry"
  | "probation"
  | "apply"
  | "expense"
  | "onboarding"
  | "archive"
  | "technical"
  | "unknown";
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind?: AnswerKind;
  citations?: boolean;
  time?: string;
  sources?: Citation[];
  retrieval?: RetrievalTrace;
  permission?: {
    checked: string[];
    result: string;
  };
  feedback?: {
    rating: "up" | "down";
    comment?: string;
  };
}
export interface Citation {
  id: string;
  title: string;
  type: string;
  version: string;
  page: number;
  pages: number;
  category: string;
  library: string;
}
export interface RetrievalStage {
  name: string;
  detail: string;
  ms: number;
}
export interface RetrievalHit {
  id: string;
  title: string;
  scope: string;
  section: string;
  content: string;
  page: string;
  bm25: number;
  dense: number;
  rerank: number;
  score: number;
}
export interface RetrievalTrace {
  query: string;
  mode: "bm25" | "dense" | "rerank";
  topK: number;
  threshold: number;
  scope: string;
  stages: RetrievalStage[];
  hits: RetrievalHit[];
}
export interface Conversation {
  id: string;
  title: string;
  time: string;
  group: string;
  messages: Message[];
}
export const answers: Record<AnswerKind, string> = {
  leave:
    "根据《员工休假管理制度》，员工可按**累计工作年限**享受带薪年休假，具体标准如下：\n\n| 累计工作年限 | 年休假天数 |\n| :--- | :--- |\n| 满 1 年不满 10 年 | **5 天** |\n| 满 10 年不满 20 年 | **10 天** |\n| 满 20 年及以上 | **15 天** |",
  carry:
    "根据《员工休假管理制度》第十一条，年休假**原则上在当年内安排使用**。\n\n如因工作需要确需跨年使用，应提前提交申请，并经**部门负责人批准**。建议在年底前与直属主管确认剩余额度及使用安排。\n\n> 是否批准以部门负责人审核结果为准。",
  probation:
    "根据《人力资源管理手册》第二章，试用期员工是否享有年休假，应按**累计工作年限**判断。\n\n- 累计工作满 1 年的员工，可按制度享有年休假。\n- 入职当年的额度按剩余日历天数折算。\n- 请在人事系统核对已确认的工龄和可用额度。",
  apply:
    "申请年休假可按照以下步骤操作：\n\n1. 在人事系统中查看剩余年假天数。\n2. 新建请假申请，选择「年休假」并填写起止日期。\n3. 指定工作交接人，提交直属主管审批。\n4. 审批通过后，按计划休假。\n\n```mermaid\nflowchart LR\n A[查看年假额度] --> B[提交休假申请]\n B --> C[主管审批]\n C --> D[完成工作交接]\n D --> E[休假]\n```",
  expense:
    "根据《费用报销管理办法》，报销前请准备以下材料：\n\n| 材料 | 提交要求 |\n| :--- | :--- |\n| 费用报销单 | 填写费用类别、金额和项目编号 |\n| 合规发票 | 发票抬头、税号应与公司信息一致 |\n| 支付凭证 | 订单截图或交易流水 |\n| 审批记录 | 差旅或采购事项的事前审批 |\n\n资料齐全后，在财务系统发起申请，依次由部门负责人和财务审核。",
  onboarding:
    "根据《人力资源管理手册》，入职前建议准备好以下材料：\n\n- **身份资料**：身份证、学历及学位证明。\n- **劳动关系资料**：前单位离职证明。\n- **薪酬资料**：本人银行卡信息。\n- **其他资料**：近期证件照及岗位要求的资质证明。\n\n入职当天请先到人力资源部报到，再领取设备并完成账号开通。",
  archive:
    "根据《项目文档归档规范》，项目资料应在结项后 **5 个工作日内**完成归档。\n\n1. 按「项目名称 / 阶段 / 文档类型」整理目录。\n2. 确认需求、设计、测试报告和交付记录齐全。\n3. 由项目负责人确认最终版本及访问权限。\n4. 提交归档审批，归档后保留版本历史。\n\n> 含客户信息的资料应标注密级，并限定项目成员访问。",
  technical:
    '根据《研发 API 接入指南》，请求应携带用户身份，并按以下顺序执行检索：\n\n1. **权限预过滤**：按租户、部门和角色缩小候选范围。\n2. **混合召回**：合并关键词与语义检索结果。\n3. **重排序与复核**：检查最新权限后再构造回答上下文。\n\n```typescript\nconst response = await knowledge.search({\n  query: "如何接入知识库",\n  scope: "engineering",\n  topK: 5,\n});\n```\n\n以上为接口使用示例，请以研发知识库中的项目规范为准。',
  unknown:
    "当前演示知识库中没有找到足够的相关依据，暂时无法给出可靠回答。\n\n你可以换一种描述方式，或选择相应知识库后重新提问。当前可体验的主题包括：**员工年假、费用报销、新人入职、项目归档和 API 接入**。",
};
export function identifyAnswer(
  question: string,
  scope: string,
  previous?: AnswerKind,
): AnswerKind {
  let kind: AnswerKind = "unknown";
  if (/跨年|明年|过期/.test(question)) kind = "carry";
  else if (/试用/.test(question)) kind = "probation";
  else if (
    /申请|怎么请|流程图/.test(question) &&
    (/假/.test(question) ||
      (previous && ["leave", "carry", "probation", "apply"].includes(previous)))
  )
    kind = "apply";
  else if (/年假|休假|工龄/.test(question)) kind = "leave";
  else if (/报销|发票|差旅/.test(question)) kind = "expense";
  else if (/入职|新人/.test(question)) kind = "onboarding";
  else if (/归档|结项/.test(question)) kind = "archive";
  else if (/API|接口|代码|检索|接入/i.test(question)) kind = "technical";
  const domain =
    kind === "technical"
      ? "技术文档"
      : kind === "archive"
        ? "项目资料"
        : "企业制度";
  return scope !== "全部知识库" && scope !== domain ? "unknown" : kind;
}
export const initialConversations: Conversation[] = [
  {
    id: "annual-leave",
    title: "公司的员工年假制度是什么？",
    time: "14:28",
    group: "今天",
    messages: [
      { id: "q1", role: "user", content: "公司的员工年假制度是什么？" },
      {
        id: "a1",
        role: "assistant",
        kind: "leave",
        content: answers.leave,
        citations: true,
      },
    ],
  },
  {
    id: "expense",
    title: "报销流程和所需材料？",
    time: "11:12",
    group: "今天",
    messages: [
      { id: "q2", role: "user", content: "报销流程和所需材料？" },
      {
        id: "a2",
        role: "assistant",
        kind: "expense",
        content: answers.expense,
        citations: true,
      },
    ],
  },
  {
    id: "onboarding",
    title: "新人入职需要准备什么？",
    time: "16:40",
    group: "昨天",
    messages: [
      { id: "q3", role: "user", content: "新人入职需要准备什么？" },
      {
        id: "a3",
        role: "assistant",
        kind: "onboarding",
        content: answers.onboarding,
        citations: true,
      },
    ],
  },
  {
    id: "archive",
    title: "项目文档的归档规范？",
    time: "10:05",
    group: "过去 7 天",
    messages: [
      { id: "q4", role: "user", content: "项目文档的归档规范？" },
      {
        id: "a4",
        role: "assistant",
        kind: "archive",
        content: answers.archive,
        citations: true,
      },
    ],
  },
];
export const sourceFor = (kind: AnswerKind = "leave", second = false) => {
  if (second || kind === "onboarding" || kind === "probation")
    return {
      title: "人力资源管理手册.docx",
      type: "docx",
      version: "v2.1",
      page: 7,
      pages: 28,
      category: "人事管理",
      library: "企业制度库",
    };
  if (kind === "expense")
    return {
      title: "费用报销管理办法.pdf",
      type: "pdf",
      version: "v2.0",
      page: 4,
      pages: 16,
      category: "财务管理",
      library: "企业制度库",
    };
  if (kind === "archive")
    return {
      title: "项目文档归档规范.pdf",
      type: "pdf",
      version: "v1.4",
      page: 2,
      pages: 8,
      category: "项目管理",
      library: "项目资料库",
    };
  if (kind === "technical")
    return {
      title: "研发 API 接入指南.md",
      type: "md",
      version: "v3.2",
      page: 1,
      pages: 6,
      category: "研发规范",
      library: "技术文档库",
    };
  return {
    title: "员工休假管理制度.pdf",
    type: "pdf",
    version: "v3.0",
    page: 3,
    pages: 12,
    category: "人事管理",
    library: "企业制度库",
  };
};
