import { useState } from "react";
import { useLazyQuery, useMutation } from "@apollo/client";
import {
  COMPARE_NORMAL,
  COMPARE_ERO,
  REGISTER_NORMAL,
  REGISTER_ERO,
} from "@/gql/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

/**
 * 比較画面の共通ビュー。 normal / ero どちらでも使う。
 *   1. 比較取得: folderPath を入力 → DB と突合
 *   2. 登録: パース結果を編集可能にして tb_bok に INSERT
 */
export function CompareView({ kind, title }: { kind: "normal" | "ero"; title: string }) {
  const [folderPath, setFolderPath] = useState("");
  const [edit, setEdit] = useState({
    authorEn: "",
    titleEn: "",
    authorJa: "",
    titleJa: "",
    no: "",
  });
  const [registered, setRegistered] = useState<any | null>(null);

  const [doCompare, compareState] = useLazyQuery(kind === "normal" ? COMPARE_NORMAL : COMPARE_ERO, {
    fetchPolicy: "network-only",
  });
  const [doRegister, registerState] = useMutation(
    kind === "normal" ? REGISTER_NORMAL : REGISTER_ERO
  );

  const cmp =
    kind === "normal"
      ? (compareState.data as any)?.compareNormal
      : (compareState.data as any)?.compareEro;

  const onCompare = async () => {
    setRegistered(null);
    const { data } = await doCompare({ variables: { folderPath } });
    const c =
      kind === "normal" ? (data as any)?.compareNormal : (data as any)?.compareEro;
    if (c) {
      setEdit({
        authorEn: c.parsedAuthorEn ?? "",
        titleEn: c.parsedTitleEn ?? "",
        authorJa: c.parsedAuthorJa ?? "",
        titleJa: c.parsedTitleJa ?? "",
        no: c.parsedNo ?? "",
      });
    }
  };

  const onRegister = async () => {
    const { data } = await doRegister({
      variables: {
        input: {
          folderPath,
          authorEn: edit.authorEn,
          titleEn: edit.titleEn,
          authorJa: edit.authorJa,
          titleJa: edit.titleJa,
          no: edit.no,
          kind: kind === "normal" ? "comic" : "ercomic",
        },
      },
    });
    const r =
      kind === "normal"
        ? (data as any)?.registerNormalComic
        : (data as any)?.registerEroComic;
    setRegistered(r);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>

      <Card className="p-4 space-y-3">
        <div className="font-medium">比較取得</div>
        <div className="flex gap-2">
          <Input
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="フォルダパス (例: /J/[Author;著者] Title;タイトル/01)"
          />
          <Button
            variant={kind === "ero" ? "destructive" : "default"}
            onClick={onCompare}
            disabled={!folderPath || compareState.loading}
          >
            {compareState.loading ? "取得中…" : kind === "normal" ? "比較取得" : "比較取得Ero"}
          </Button>
        </div>
        {cmp && (
          <div className="text-sm space-y-2">
            <div>
              <span className="text-xs text-muted-foreground">既存DB: </span>
              {cmp.existingVolume ? (
                <span>
                  ID={cmp.existingVolume.id} {cmp.existingVolume.titleJa} ({cmp.existingVolume.no})
                </span>
              ) : (
                <span className="text-muted-foreground">未登録</span>
              )}
            </div>
            {cmp.differences.length > 0 && (
              <ul className="text-xs text-amber-700">
                {cmp.differences.map((d: string, i: number) => (
                  <li key={i}>• {d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {cmp && (
        <Card className="p-4 space-y-3">
          <div className="font-medium">
            {kind === "normal" ? "NormalComic登録" : "EroComic登録"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <div>authorEn</div>
              <Input value={edit.authorEn} onChange={(e) => setEdit({ ...edit, authorEn: e.target.value })} />
            </label>
            <label className="text-xs">
              <div>titleEn</div>
              <Input value={edit.titleEn} onChange={(e) => setEdit({ ...edit, titleEn: e.target.value })} />
            </label>
            <label className="text-xs">
              <div>authorJa</div>
              <Input value={edit.authorJa} onChange={(e) => setEdit({ ...edit, authorJa: e.target.value })} />
            </label>
            <label className="text-xs">
              <div>titleJa</div>
              <Input value={edit.titleJa} onChange={(e) => setEdit({ ...edit, titleJa: e.target.value })} />
            </label>
            <label className="text-xs">
              <div>no（巻数）</div>
              <Input value={edit.no} onChange={(e) => setEdit({ ...edit, no: e.target.value })} />
            </label>
          </div>
          <Button
            variant={kind === "ero" ? "destructive" : "default"}
            onClick={onRegister}
            disabled={!cmp.canRegister || registerState.loading}
          >
            {registerState.loading ? "登録中…" : kind === "normal" ? "NormalComic登録" : "EroComic登録"}
          </Button>
          {registered && (
            <div className="text-sm text-emerald-700">
              登録完了: ID={registered.id} {registered.titleJa} ({registered.no})
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
