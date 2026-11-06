import type {
  Db,
  KnowledgeBase,
  KnowledgeDocument,
  Member,
  Settings,
} from "../types.js";

const now = new Date();
const iso = (daysAgo: number, hour = 9, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const policyChunks = [
  "第三章 年休假标准\n员工可按照累计工作年限享受带薪年休假：满 1 年不满 10 年的，年休假 5 天；满 10 年不满 20 年的，年休假 10 天；满 20 年及以上的，年休假 15 天。",
  "第四章 申请与使用\n年休假按自然年计算，一般应在当年内安排使用。因工作需要确需跨年使用的，须经部门负责人批准。员工应提前 3 个工作日通过 OA 系统提交申请。",
  "第五章 附则\n本制度适用于公司正式员工，由人力资源部负责解释。员工休假期间工资正常发放。具体执行细则以最新发布版本为准。",
];

const genericChunks: Record<string, string[]> = {
  d2: [
    "人力资源管理手册\n员工入职需携带身份证、学历证明、离职证明及银行卡复印件。人力资源部统一办理入职登记。",
    "员工福利\n正式员工享受带薪年休假、年度体检、节日福利和学习发展计划。年休假标准参照《员工休假管理制度》。",
  ],
  d3: [
    "微服务架构设计规范\n服务按业务域划分，使用 REST API 进行同步通信。服务间调用必须携带链路追踪标识。",
    "服务治理\n所有接口通过统一网关鉴权。支持限流、熔断与降级，日志以结构化 JSON 格式输出。",
  ],
  d4: [
    "2026 Q4 产品规划\n第一阶段完成知识入库与混合检索；第二阶段完善权限控制和审计；第三阶段建立质量评测闭环。",
  ],
  d5: [
    "报销申请流程\n员工在 OA 系统填写报销单，上传有效发票和费用明细。差旅报销需同时提交出差审批单。",
    "审批与支付\n直属主管审核后，由财务核对票据。通过审批的报销款于下个付款周期支付。",
  ],
  d6: [
    "新员工入职常见问题\n请在入职当天 9:30 到达公司前台，联系 HR 办理入职。办公设备由 IT 部门提前准备。",
  ],
  d7: [
    "项目交付清单\n需求文档、设计方案、接口文档、测试报告及操作手册均需归档到项目知识库。",
  ],
  d8: ["旧版接口规范\n本版本已归档，请查阅最新发布的接口文档。"],
};

const seedInfo: Array<
  [string, string, string, string, string, string, string]
> = [
  [
    "d1",
    "员工休假管理制度.pdf",
    "企业制度",
    "PDF",
    "2.4 MB",
    "王小雨",
    "已发布",
  ],
  [
    "d2",
    "人力资源管理手册.docx",
    "企业制度",
    "DOCX",
    "5.8 MB",
    "王小雨",
    "已发布",
  ],
  ["d3", "微服务架构设计规范.md", "技术文档", "MD", "128 KB", "李明", "已发布"],
  [
    "d4",
    "2026 Q4 产品路线图.pptx",
    "项目资料",
    "PPTX",
    "8.2 MB",
    "陈晨",
    "草稿",
  ],
  [
    "d5",
    "报销流程与费用标准.pdf",
    "企业制度",
    "PDF",
    "1.6 MB",
    "赵敏",
    "已发布",
  ],
  ["d6", "新员工入职常见问题.md", "FAQ", "MD", "42 KB", "王小雨", "已发布"],
  [
    "d7",
    "知识库项目交付清单.xlsx",
    "项目资料",
    "XLSX",
    "356 KB",
    "张三",
    "已发布",
  ],
  ["d8", "接口规范 v1.0.pdf", "技术文档", "PDF", "940 KB", "李明", "已归档"],
];

export const seedDocuments: KnowledgeDocument[] = seedInfo.map(
  ([id, name, category, type, size, owner, status], i) => {
    const chunks = id === "d1" ? policyChunks : genericChunks[id];
    return {
      id,
      name,
      category,
      status: status as KnowledgeDocument["status"],
      type,
      size,
      owner,
      date: `2026-11-${String(5 - Math.min(i, 4)).padStart(2, "0")}`,
      chunks,
      versions:
        id === "d1"
          ? [
              {
                version: "v3.0",
                date: "2026-11-05",
                note: "更新跨年休假审批规则与申请时间",
                chunks,
              },
              {
                version: "v2.0",
                date: "2026-09-12",
                note: "调整年休假申请流程",
                chunks: [
                  chunks[0],
                  "第四章 申请与使用\n年休假原则上应在当年内使用。员工应提前 5 个工作日提交书面休假申请。",
                  chunks[2],
                ],
              },
              {
                version: "v1.0",
                date: "2026-06-01",
                note: "首次发布",
                chunks: [
                  chunks[0],
                  "第四章 申请与使用\n休假应事先取得部门主管批准。",
                  chunks[2],
                ],
              },
            ]
          : [{ version: "v1.0", date: "2026-11-01", note: "首次发布", chunks }],
      department: category === "技术文档" ? "研发部" : "全体员工",
      level: "内部",
      strategy: "语义分块",
      stage: id === "d5" ? 1 : 4,
      task: id === "d5" ? "error" : "done",
    };
  },
);

export const seedBases: KnowledgeBase[] = [
  {
    id: "b1",
    name: "企业制度",
    description: "让每一项制度有据可依。汇集人事、财务与行政管理规范。",
    color: "purple",
    owner: "人力资源部",
    access: "全体员工",
  },
  {
    id: "b2",
    name: "技术文档",
    description: "沉淀团队工程经验，连接架构设计、开发规范与技术实践。",
    color: "blue",
    owner: "研发部",
    access: "研发部",
  },
  {
    id: "b3",
    name: "项目资料",
    description: "从需求到交付，保存每个项目的重要决策与协作成果。",
    color: "orange",
    owner: "产品部",
    access: "项目成员",
  },
  {
    id: "b4",
    name: "FAQ",
    description: "把反复被问到的问题变成共享答案，让经验触手可及。",
    color: "green",
    owner: "运营部",
    access: "全体员工",
  },
];

const seedMembers: Member[] = [
  {
    id: "m1",
    name: "张三",
    email: "zhangsan@company.com",
    department: "研发部",
    role: "知识库管理员",
  },
  {
    id: "m2",
    name: "李悦",
    email: "liyue@company.com",
    department: "人力资源部",
    role: "内容编辑者",
  },
  {
    id: "m3",
    name: "王晨",
    email: "wangchen@company.com",
    department: "研发部",
    role: "普通成员",
  },
  {
    id: "m4",
    name: "陈佳",
    email: "chenjia@company.com",
    department: "产品部",
    role: "普通成员",
  },
];

export const seedSettings: Settings = {
  workspace: "企业知识工作空间",
  tenant: "enterprise-001",
  embedding: "bge-m3",
  vector: "pgvector",
  chunkSize: "512",
  overlap: "64",
  strategy: "父子分块",
  topK: "5",
  rerank: true,
  citations: true,
  multiTurn: true,
  audit: true,
};

export function createSeedDb(): Db {
  return {
    conversations: [
      {
        id: "annual-leave",
        title: "公司的员工年假制度是什么？",
        createdAt: iso(0, 14, 28),
        updatedAt: iso(0, 14, 28),
        messages: [
          {
            id: "q1",
            role: "user",
            content: "公司的员工年假制度是什么？",
            time: "14:28",
          },
          {
            id: "a1",
            role: "assistant",
            kind: "leave",
            citations: true,
            time: "14:28",
            content:
              "根据《员工休假管理制度》，员工可按**累计工作年限**享受带薪年休假，具体标准如下：\n\n| 累计工作年限 | 年休假天数 |\n| :--- | :--- |\n| 满 1 年不满 10 年 | **5 天** |\n| 满 10 年不满 20 年 | **10 天** |\n| 满 20 年及以上 | **15 天** |",
          },
        ],
      },
      {
        id: "expense",
        title: "报销流程和所需材料？",
        createdAt: iso(0, 11, 12),
        updatedAt: iso(0, 11, 12),
        messages: [
          {
            id: "q2",
            role: "user",
            content: "报销流程和所需材料？",
            time: "11:12",
          },
          {
            id: "a2",
            role: "assistant",
            kind: "expense",
            citations: true,
            time: "11:12",
            content:
              "根据《费用报销管理办法》，报销前请准备以下材料：\n\n| 材料 | 提交要求 |\n| :--- | :--- |\n| 费用报销单 | 填写费用类别、金额和项目编号 |\n| 合规发票 | 发票抬头、税号应与公司信息一致 |\n| 支付凭证 | 订单截图或交易流水 |\n| 审批记录 | 差旅或采购事项的事前审批 |\n\n资料齐全后，在财务系统发起申请，依次由部门负责人和财务审核。",
          },
        ],
      },
      {
        id: "onboarding",
        title: "新人入职需要准备什么？",
        createdAt: iso(1, 16, 40),
        updatedAt: iso(1, 16, 40),
        messages: [
          {
            id: "q3",
            role: "user",
            content: "新人入职需要准备什么？",
            time: "16:40",
          },
          {
            id: "a3",
            role: "assistant",
            kind: "onboarding",
            citations: true,
            time: "16:40",
            content:
              "根据《人力资源管理手册》，入职前建议准备好以下材料：\n\n- **身份资料**：身份证、学历及学位证明。\n- **劳动关系资料**：前单位离职证明。\n- **薪酬资料**：本人银行卡信息。\n- **其他资料**：近期证件照及岗位要求的资质证明。\n\n入职当天请先到人力资源部报到，再领取设备并完成账号开通。",
          },
        ],
      },
      {
        id: "archive",
        title: "项目文档的归档规范？",
        createdAt: iso(2, 10, 5),
        updatedAt: iso(2, 10, 5),
        messages: [
          {
            id: "q4",
            role: "user",
            content: "项目文档的归档规范？",
            time: "10:05",
          },
          {
            id: "a4",
            role: "assistant",
            kind: "archive",
            citations: true,
            time: "10:05",
            content:
              "根据《项目文档归档规范》，项目资料应在结项后 **5 个工作日内**完成归档。\n\n1. 按「项目名称 / 阶段 / 文档类型」整理目录。\n2. 确认需求、设计、测试报告和交付记录齐全。\n3. 由项目负责人确认最终版本及访问权限。\n4. 提交归档审批，归档后保留版本历史。\n\n> 含客户信息的资料应标注密级，并限定项目成员访问。",
          },
        ],
      },
    ],
    bases: structuredClone(seedBases),
    documents: structuredClone(seedDocuments),
    tasks: [
      {
        id: "t1",
        docId: "d2",
        docName: "人力资源管理手册.docx",
        status: "running",
        stage: 2,
        updatedAt: iso(0, 10, 30),
      },
      {
        id: "t2",
        docId: "d5",
        docName: "报销流程与费用标准.pdf",
        status: "error",
        stage: 1,
        updatedAt: iso(0, 9, 45),
        error: "OCR 识别失败：扫描件分辨率过低，请重试或更换源文件",
      },
      {
        id: "t3",
        docId: "d3",
        docName: "微服务架构设计规范.md",
        status: "done",
        stage: 4,
        updatedAt: iso(1, 17, 20),
      },
    ],
    members: structuredClone(seedMembers),
    rules: {},
    auditLogs: [
      {
        id: "log-1",
        time: iso(0, 14, 28),
        user: "王小雨",
        department: "人力资源部",
        action: "智能问答",
        content: "公司的员工年假制度是什么？",
        source: "AI 知识助手",
        status: "正常",
        docs: ["员工休假管理制度.pdf"],
      },
      {
        id: "log-2",
        time: iso(0, 11, 12),
        user: "赵敏",
        department: "财务部",
        action: "智能问答",
        content: "报销流程和所需材料？",
        source: "AI 知识助手",
        status: "正常",
        docs: ["费用报销管理办法.pdf"],
      },
      {
        id: "log-3",
        time: iso(1, 15, 2),
        user: "李明",
        department: "研发部",
        action: "文档发布",
        content: "发布《微服务架构设计规范》最新版本",
        source: "文档中心",
        status: "正常",
        docs: ["微服务架构设计规范.md"],
      },
    ],
    evaluations: [
      {
        id: "eval-1",
        name: "企业制度问答质量评测",
        dataset: "内置评测集 v1（20 题）",
        status: "已完成",
        createdAt: iso(1, 10, 0),
        finishedAt: iso(1, 10, 6),
        metrics: {
          hitRate: 0.92,
          accuracy: 0.88,
          latency: 1240,
          coverage: 0.95,
        },
        records: [],
      },
    ],
    settings: structuredClone(seedSettings),
  };
}
