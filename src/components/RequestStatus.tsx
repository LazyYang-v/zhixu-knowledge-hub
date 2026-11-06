import { Button } from "./ui/Button";
import { ErrorState } from "./ui/ErrorState";
import { Skeleton } from "./ui/Skeleton";
export function RequestStatus({
  loading,
  error,
  reload,
}: {
  loading?: boolean;
  error?: string | null;
  reload: () => void;
}) {
  if (error)
    return (
      <ErrorState
        description={error}
        action={
          <Button variant="secondary" onClick={reload}>
            重新加载
          </Button>
        }
      />
    );
  if (loading)
    return (
      <div className="resource-loading" role="status" aria-label="正在加载数据">
        <Skeleton height={20} width="32%" />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  return null;
}
