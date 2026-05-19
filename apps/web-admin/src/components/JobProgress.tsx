import { useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { JOB_STATUS } from "@/gql/operations";
import { cn } from "@/lib/utils";

export interface JobLite {
  id: string;
  status: string;
  message: string;
  logs?: string[];
  outputs?: string[];
  elapsedSec?: number;
}

/**
 * 起動済みジョブ (id を渡す) を 1〜2秒間隔で polling して、
 * 完了したら停止し、画面にメッセージを表示する。
 */
export function JobProgress({ jobId, onDone }: { jobId: string | null; onDone?: (j: JobLite) => void }) {
  const client = useApolloClient();
  const [job, setJob] = useState<JobLite | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await client.query({
          query: JOB_STATUS,
          variables: { id: jobId },
          fetchPolicy: "network-only",
        });
        const j: JobLite | null = (r.data as any)?.jobStatus;
        if (j) {
          setJob(j);
          if (j.status === "success" || j.status === "failed") {
            onDone?.(j);
            return; // polling 停止
          }
        }
      } catch {
        /* 一時的エラーは無視して次の poll を待つ */
      }
      setTimeout(poll, 2000);
    };
    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (!jobId || !job) return null;

  const done = job.status === "success" || job.status === "failed";

  return (
    <div
      className={cn(
        "rounded-md border p-3 mt-3 text-sm space-y-2",
        job.status === "success"
          ? "border-emerald-300 bg-emerald-50"
          : job.status === "failed"
            ? "border-red-300 bg-red-50"
            : "border-blue-300 bg-blue-50"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "font-semibold",
            job.status === "success"
              ? "text-emerald-700"
              : job.status === "failed"
                ? "text-red-700"
                : "text-blue-700"
          )}
        >
          {job.status === "running" || job.status === "pending" ? "実行中…" : job.status === "success" ? "OK" : "NG"}
        </span>
        <span>{job.message}</span>
        {typeof job.elapsedSec === "number" && (
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            {job.elapsedSec.toFixed(2)}s
          </span>
        )}
      </div>
      {done && job.outputs && job.outputs.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground">Outputs</div>
          <ul className="text-xs font-mono break-all max-h-32 overflow-auto">
            {job.outputs.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      {done && job.logs && job.logs.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            ログ ({job.logs.length}行)
          </summary>
          <pre className="mt-1 max-h-64 overflow-auto bg-background border rounded p-2 text-xs whitespace-pre-wrap">
            {job.logs.join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}
