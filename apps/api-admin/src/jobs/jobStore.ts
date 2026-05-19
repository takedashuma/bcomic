/**
 * 非同期ジョブの状態管理（in-memory）。
 * - APIプロセスが再起動するとジョブ情報は消える（運用上問題なし／必要なら DB 化）
 * - 古い完了済ジョブは TTL でクリーンアップ
 */
import { randomUUID } from "node:crypto";

export type JobStatus = "pending" | "running" | "success" | "failed";

export interface JobState {
  id: string;
  kind: string; // 'extractAllArchives' | 'mergeAllChapters' | 'extractAllErArchives'
  status: JobStatus;
  message: string;
  logs: string[];
  outputs: string[];
  startedAt: number;
  finishedAt: number | null;
  elapsedSec: number;
}

const store = new Map<string, JobState>();
const TTL_MS = 60 * 60 * 1000; // 1時間

setInterval(() => {
  const now = Date.now();
  for (const [id, j] of store.entries()) {
    if (j.finishedAt && now - j.finishedAt > TTL_MS) store.delete(id);
  }
}, 5 * 60 * 1000).unref?.();

export function createJob(kind: string): JobState {
  const j: JobState = {
    id: randomUUID(),
    kind,
    status: "pending",
    message: "受付しました",
    logs: [],
    outputs: [],
    startedAt: Date.now(),
    finishedAt: null,
    elapsedSec: 0,
  };
  store.set(j.id, j);
  return j;
}

export function getJob(id: string): JobState | null {
  return store.get(id) ?? null;
}

export function updateJob(id: string, patch: Partial<JobState>) {
  const j = store.get(id);
  if (!j) return;
  Object.assign(j, patch);
  if (j.status === "success" || j.status === "failed") {
    if (!j.finishedAt) j.finishedAt = Date.now();
    j.elapsedSec = Math.round((j.finishedAt - j.startedAt) / 10) / 100;
  } else if (j.status === "running") {
    j.elapsedSec = Math.round((Date.now() - j.startedAt) / 10) / 100;
  }
}

export function appendLog(id: string, line: string) {
  const j = store.get(id);
  if (!j) return;
  j.logs.push(line);
  if (j.logs.length > 5000) j.logs.splice(0, j.logs.length - 5000);
}

/**
 * 非同期ジョブを起動する。
 * fn は内部で appendLog / updateJob を呼んで進捗を反映できる。
 * 失敗時は自動で status='failed' に。
 */
export function runJobAsync(
  kind: string,
  fn: (jobId: string) => Promise<{ message: string; outputs?: string[] }>
): JobState {
  const j = createJob(kind);
  // 即座にstatus更新
  updateJob(j.id, { status: "running", message: "実行中…" });
  // バックグラウンドで実行
  fn(j.id)
    .then((res) => {
      updateJob(j.id, {
        status: "success",
        message: res.message,
        outputs: res.outputs ?? [],
      });
    })
    .catch((err) => {
      appendLog(j.id, `[error] ${err?.message ?? String(err)}`);
      updateJob(j.id, {
        status: "failed",
        message: err?.message ?? "ジョブが失敗しました",
      });
    });
  return j;
}
