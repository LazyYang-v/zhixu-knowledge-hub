import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { useLocalStorage } from "../../lib/storage";
import { seedMembers } from "./data";
import type { Member } from "./types";

export function usePermissions() {
  const [tab, setTab] = useState("权限策略");
  const [members, setMembers] = useLocalStorage<Member[]>(
    "members",
    seedMembers,
  );
  const [rules, setRules] = useLocalStorage<Record<string, boolean[]>>(
    "permission-rules",
    {},
  );
  const permissionsLoaded = useRef(false);
  useEffect(() => {
    if (permissionsLoaded.current) return;
    permissionsLoaded.current = true;
    apiFetch<{
      members: Member[];
      rules: Record<string, boolean[]>;
    }>("/api/permissions").then((data) => {
      if (data?.members.length) setMembers(data.members);
      if (data && Object.keys(data.rules).length) setRules(data.rules);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [memberDept, setMemberDept] = useState<string>("研发部");
  const [memberRole, setMemberRole] = useState<string>("普通成员");
  const [department, setDepartment] = useState("研发部");
  const [role, setRole] = useState("普通成员");
  const key = `${department}:${role}`;
  const getPermissions = (index: number) =>
    rules[`${key}:${index}`] ?? [
      index !== 2 || department === "研发部",
      role !== "普通成员",
      role === "知识库管理员",
      role === "知识库管理员",
    ];
  const togglePermission = (row: number, col: number) => {
    const vals = [...getPermissions(row)];
    vals[col] = !vals[col];
    apiFetch("/api/permissions/rules", {
      method: "PUT",
      body: JSON.stringify({ key: `${key}:${row}`, values: vals }),
    });
    setRules({ ...rules, [`${key}:${row}`]: vals });
  };
  const addMember = async (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    if (members.some((m) => m.email === email.trim())) return "duplicate" as const;
    const member: Member = {
      name: name.trim(),
      email: email.trim(),
      department: memberDept,
      role: memberRole,
    };
    const data = await apiFetch<{ member: Member }>(
      "/api/permissions/members",
      { method: "POST", body: JSON.stringify(member) },
    );
    setMembers((current) => [
      ...current,
      data?.member ?? { ...member, id: crypto.randomUUID() },
    ]);
    setAdding(false);
    setName("");
    setEmail("");
    return "added" as const;
  };
  const updateMemberRole = async (member: Member, role: string) => {
    apiFetch(`/api/permissions/members/${member.id ?? ""}`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    });
    setMembers((current) =>
      current.map((m) => (m.id === member.id ? { ...m, role } : m)),
    );
  };
  const removeMember = async (member: Member) => {
    apiFetch(`/api/permissions/members/${member.id ?? ""}`, {
      method: "DELETE",
    });
    setMembers((current) =>
      current.filter((m) => m.id !== member.id),
    );
  };
  return {
    tab,
    setTab,
    members,
    setMembers,
    rules,
    setRules,
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
