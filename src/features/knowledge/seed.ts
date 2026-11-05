import type { KnowledgeBase, KnowledgeDocument } from "./types";

const policyChunks = [
  "第三章 年休假标准\n员工可按照累计工作年限享受带薪年休假：满 1 年不满 10 年的，年休假 5 天；满 10 年不满 20 年的，年休假 10 天；满 20 年及以上的，年休假 15 天。",
  "第四章 申请与使用\n年休假按自然年计算，一般应在当年内安排使用。因工作需要确需跨年使用的，须经部门负责人批准。员工应提前 3 个工作日通过 OA 系统提交申请。",
  "第五章 附则\n本制度适用于公司正式员工，由人力资源部负责解释。员工休假期间工资正常发放。具体执行细则以最新发布版本为准。",
];

const seedInfo = [
  ["d1", "员工休假管理制度.pdf", "企业制度", "PDF", "2.4 MB", "王小雨", "已发布"],
  ["d2", "人力资源管理手册.docx", "企业制度", "DOCX", "5.8 MB", "王小雨", "已发布"],
  ["d3", "微服务架构设计规范.md", "技术文档", "MD", "128 KB", "李明", "已发布"],
  ["d4", "2026 Q4 产品路线图.pptx", "项目资料", "PPTX", "8.2 MB", "陈晨", "草稿"],
  ["d5", "报销流程与费用标准.pdf", "企业制度", "PDF", "1.6 MB", "赵敏", "已发布"],
  ["d6", "新员工入职常见问题.md", "FAQ", "MD", "42 KB", "王小雨", "已发布"],
  ["d7", "知识库项目交付清单.xlsx", "项目资料", "XLSX", "356 KB", "张三", "已发布"],
  ["d8", "接口规范 v1.0.pdf", "技术文档", "PDF", "940 KB", "李明", "已归档"],
] as const;

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

export const seedDocuments: KnowledgeDocument[] = seedInfo.map(
  ([id, name, category, type, size, owner, status], i) => {
    const chunks = id === "d1" ? policyChunks : (genericChunks[id] ?? []);
    return {
      id,
      name,
      category,
      type,
      size,
      owner,
      status: status as KnowledgeDocument["status"],
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
          : [
              {
                version: "v1.0",
                date: "2026-11-01",
                note: "首次发布",
                chunks,
              },
            ],
      department: category === "技术文档" ? "研发部" : "全体员工",
      level: "内部",
      strategy: "语义分块",
      stage: 4,
      task: "done",
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
