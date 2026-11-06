import { useState } from "react";
import { useResource } from "../../hooks/useResource";
import { apiFetch } from "../../lib/api";
import { getDataMode } from "../../lib/data-mode";
import { useDataState } from "../../lib/storage";
import { seedMembers } from "./data";
import type { Member } from "./types";
export function usePermissions() {
  const [local, setLocal] = useDataState(
    "members",
    seedMembers,
    [] as Member[],
  );
  const [localRules, setLocalRules] = useDataState<Record<string, boolean[]>>(
    "permission-rules",
    {},
    {},
  );
  const state = useResource<{
    members: Member[];
    rules: Record<string, boolean[]>;
    revision?: number;
  }>("/api/permissions", { members: local, rules: localRules });
  const demo = getDataMode() === "demo";
  const members = demo ? local : (state.data?.members ?? []);
  const rules = demo ? localRules : (state.data?.rules ?? {});
  const [tab, setTab] = useState("权限策略");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [memberDept, setMemberDept] = useState("研发部");
  const [memberRole, setMemberRole] = useState("普通成员");
  const [department, setDepartment] = useState("研发部");
  const [role, setRole] = useState("普通成员");
  const update = (next: Member[]) => {
    if (demo) setLocal(next);
    else
      state.setData((current) => ({
        ...current,
        members: next,
        rules: current?.rules ?? {},
      }));
  };
  const getPermissions = (index: number) =>
    rules[`${department}:${role}:${index}`] ?? [false, false, false, false];
  const togglePermission = async (row: number, col: number) => {
    const key = `${department}:${role}:${row}`;
    const values = [...getPermissions(row)];
    values[col] = !values[col];
    const saved = await apiFetch<{ revision: number }>(
      "/api/permissions/rules",
      {
        method: "PUT",
        body: JSON.stringify({
          key,
          values,
          revision: state.data?.revision ?? 1,
        }),
      },
    );
    if (demo) setLocalRules((prev) => ({ ...prev, [key]: values }));
    else
      state.setData((current) => ({
        members: current?.members ?? [],
        revision: saved?.revision,
        rules: { ...current?.rules, [key]: values },
      }));
  };
  const addMember = async () => {
    if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("请填写姓名和有效邮箱");
    if (
      members.some((m) => m.email.toLowerCase() === email.trim().toLowerCase())
    )
      throw new Error("该邮箱已在工作空间中");
    const input = {
      name: name.trim(),
      email: email.trim(),
      department: memberDept,
      role: memberRole,
    };
    const data = await apiFetch<{ member: Member }>(
      "/api/permissions/members",
      { method: "POST", body: JSON.stringify(input) },
    );
    update([...members, data?.member ?? { ...input, id: crypto.randomUUID() }]);
    setAdding(false);
    setName("");
    setEmail("");
  };
  const updateMemberRole = async (member: Member, nextRole: string) => {
    const data = await apiFetch<{ member: Member }>(
      `/api/permissions/members/${member.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          role: nextRole,
          revision: member.revision ?? 1,
        }),
      },
    );
    update(
      members.map((item) =>
        item.id === member.id
          ? (data?.member ?? { ...member, role: nextRole })
          : item,
      ),
    );
  };
  const removeMember = async (member: Member) => {
    await apiFetch(`/api/permissions/members/${member.id}`, {
      method: "DELETE",
      headers: { "If-Match": String(member.revision ?? 1) },
    });
    update(members.filter((item) => item.id !== member.id));
  };
  return {
    ...state,
    tab,
    setTab,
    members,
    rules,
    adding,
    setAdding,
    name,
    setName,
    email,
    setEmail,
    memberDept,
    setMemberDept,
    memberRole,
    setMemberRole,
    department,
    setDepartment,
    role,
    setRole,
    getPermissions,
    togglePermission,
    addMember,
    updateMemberRole,
    removeMember,
  };
}
