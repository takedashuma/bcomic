import { cn } from "@/lib/utils";

export interface JobResultLike {
  ok: boolean;
  message: string;
  elapsedSec: number;
  logs: string[];
  outputs: string[];
}

export function JobResultPanel({ result }: { result: JobResultLike | null }) {
  if (!result) return null;
  return (
    <div
      className={cn(
        "rounded-md border p-3 mt-3 text-sm space-y-2",
        result.ok
          ? "border-emerald-300 bg-emerald-50"
          : "border-red-300 bg-red-50"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("font-semibold", result.ok ? "text-emerald-700" : "text-red-700")}>
          {result.ok ? "OK" : "NG"}
        </span>
        <span>{result.message}</span>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {result.elapsedSec.toFixed(2)}s
        </span>
      </div>
      {result.outputs.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground">Outputs</div>
          <ul className="text-xs font-mono break-all">
            {result.outputs.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">ログ ({result.logs.length}行)</summary>
        <pre className="mt-1 max-h-64 overflow-auto bg-background border rounded p-2 text-xs whitespace-pre-wrap">
          {result.logs.join("\n")}
        </pre>
      </details>
    </div>
  );
}
