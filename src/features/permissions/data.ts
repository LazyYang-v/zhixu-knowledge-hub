import type { Member } from "./types";

export const departments = [
  "研发部",
  "人力资源部",
  "产品部",
  "财务部",
] as const;
export const roles = [
  "知识库管理员",
  "内容编辑者",
  "普通成员",
] as const;
export const resources = [
  "企业制度知识库",
  "技术文档知识库",
  "项目资料知识库",
  "常见问题知识库",
] as const;
export const seedMembers: Member[] = [
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
