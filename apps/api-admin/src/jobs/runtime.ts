import { spawn } from "node:child_process";

/**
 * 子プロセス実行ヘルパ。stdout/stderr を JobResult.logs に集約。
 */
export function runCmd(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {}
): Promise<{ code: number; logs: string[] }> {
  return new Promise((resolve) => {
    const logs: string[] = [];
    logs.push(`$ ${cmd} ${args.join(" ")}`);
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } });
    p.stdout.on("data", (b) => {
      const s = b.toString();
      logs.push(...s.split("\n").filter((x: string) => x.length > 0));
    });
    p.stderr.on("data", (b) => {
      const s = b.toString();
      logs.push(...s.split("\n").map((x: string) => `[stderr] ${x}`).filter((x: string) => x.length > "[stderr] ".length));
    });
    p.on("close", (code) => {
      resolve({ code: code ?? -1, logs });
    });
    p.on("error", (err) => {
      logs.push(`[spawn-error] ${err.message}`);
      resolve({ code: -1, logs });
    });
  });
}

/** 経過秒数を測定するためのヘルパ */
export function elapsed(start: number): number {
  return Math.round((Date.now() - start) / 10) / 100; // 0.01s 精度
}
