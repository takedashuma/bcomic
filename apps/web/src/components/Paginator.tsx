import { Button } from "@/components/ui/button";

/**
 * ページネーター。
 * 表示: [Top] [前へ] [n-5] ... [n-1] [n / total] [n+1] ... [n+5] [次へ]
 * - Top: いつでも1ページ目に戻る
 * - 端のページでは存在しない番号は省略
 * - 現在ページは強調表示で "n / total" も同時に見える
 */
export function Paginator({
  page,
  pageSize,
  total,
  onChange,
  sideCount = 5,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (p: number) => void;
  sideCount?: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const before: number[] = [];
  for (let i = Math.max(1, page - sideCount); i < page; i++) before.push(i);
  const after: number[] = [];
  for (let i = page + 1; i <= Math.min(totalPages, page + sideCount); i++) after.push(i);

  const numBtn = (n: number) => (
    <Button
      key={n}
      variant="outline"
      size="sm"
      onClick={() => onChange(n)}
      className="px-2 min-w-[2.25rem] tabular-nums"
      aria-label={`${n}ページ`}
    >
      {n}
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 py-6">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(1)}
        aria-label="先頭ページへ"
      >
        Top
      </Button>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        前へ
      </Button>

      {before.map(numBtn)}

      {/* 現在ページ表示（X / Y） */}
      <span
        className="inline-flex items-center justify-center px-3 h-9 rounded-md text-sm font-medium tabular-nums bg-primary text-primary-foreground"
        aria-current="page"
        aria-label={`現在 ${page} / ${totalPages} ページ`}
      >
        {page} / {totalPages}
      </span>

      {after.map(numBtn)}

      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        次へ
      </Button>
    </div>
  );
}
