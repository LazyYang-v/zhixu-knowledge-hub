import { useAuth } from "../providers/AuthProvider";
export function useAuthorization() {
  const { mode, user } = useAuth();
  return {
    secured: mode === "local",
    can: (permission: string) =>
      mode !== "local" || !!user?.capabilities.includes(permission),
    canBase: (baseId: string | undefined, permission: string) =>
      mode !== "local" ||
      !!(
        baseId &&
        user?.capabilities.includes(permission) &&
        Array.isArray(user.grants[baseId]) &&
        user.grants[baseId].includes(permission)
      ),
  };
}
