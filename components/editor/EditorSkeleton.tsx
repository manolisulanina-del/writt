import { Skeleton } from "@/components/ui/EmptyState";

export function EditorSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 pt-6 sm:px-6" aria-busy="true" aria-label="Loading editor">
      <div className="flex-1 space-y-4">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-12" />
        <Skeleton className="h-[60vh]" />
      </div>
      <div className="hidden w-72 space-y-3 lg:block">
        <Skeleton className="h-40" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
