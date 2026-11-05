export interface SearchDoc {
  id?: string;
  title: string;
  scope: string;
  section: string;
  content: string;
  tags: string[];
  bm25: number;
  dense: number;
  rerank: number;
  page: string;
  [scoreKey: string]: number | string | string[] | undefined;
  score?: number;
}

export const searchDocs: SearchDoc[] = [
  {
    title: "员工休假管理制度.pdf",
    scope: "企业制度",
    section: "第三章 · 年休假标准",
    content:
      "员工可按累计工作年限享受带薪年休假：满 1 年不满 10 年享受 5 天，满 10 年不满 20 年享受 10 天，满 20 年以上享受 15 天。年休假按自然年计算。",
    tags: ["年假", "休假", "请假", "工作年限", "员工"],
    bm25: 0.93,
    dense: 0.96,
    rerank: 0.98,
    page: "第 3 页",
  },
  {
    title: "人力资源管理手册.docx",
    scope: "企业制度",
    section: "第二节 · 员工考勤与假期",
    content:
      "年休假应在当年统筹安排，确因工作需要跨年使用的，须经部门负责人审批。试用期员工满足累计工作年限条件的，可按制度申请年休假。",
    tags: ["年假", "休假", "试用期", "考勤", "员工", "跨年"],
    bm25: 0.87,
    dense: 0.92,
    rerank: 0.94,
    page: "第 7–8 页",
  },
  {
    title: "费用报销管理办法.pdf",
    scope: "企业制度",
    section: "第四章 · 费用报销流程",
    content:
      "报销申请需提交有效发票、费用明细与业务说明，经直属负责人及财务审核后付款。差旅报销须同时提供出差审批记录。",
    tags: ["报销", "发票", "费用", "财务", "差旅"],
    bm25: 0.89,
    dense: 0.91,
    rerank: 0.95,
    page: "第 5 页",
  },
  {
    title: "新员工入职指引.docx",
    scope: "企业制度",
    section: "第一章 · 入职准备",
    content:
      "入职前请准备身份证、学历证明、离职证明与银行卡信息。入职当日完成人事登记、设备领取与信息安全培训。",
    tags: ["入职", "新人", "准备", "材料", "员工"],
    bm25: 0.9,
    dense: 0.94,
    rerank: 0.96,
    page: "第 2 页",
  },
  {
    title: "项目文档管理规范.md",
    scope: "项目资料",
    section: "归档与版本管理",
    content:
      "项目文档应按项目编码建立目录，在结项后五个工作日内完成归档。重要文档必须保留版本号、负责人和变更记录。",
    tags: ["项目", "归档", "文档", "版本"],
    bm25: 0.88,
    dense: 0.93,
    rerank: 0.94,
    page: "分块 12",
  },
];
