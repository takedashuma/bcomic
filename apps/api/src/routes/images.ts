import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { prisma } from "../db.js";
import { readAuthCookie } from "../auth.js";
import { resolveVolumeFolder, listVolumePages } from "../util/path.js";

const router: Router = Router();

/**
 * 認証チェックミドルウェア
 */
router.use((req, res, next) => {
  const payload = readAuthCookie(req);
  if (!payload?.uid) {
    res.status(401).end();
    return;
  }
  next();
});

/**
 * GET /img/cover/:volumeId
 *   指定巻の1ページ目を、最大幅 width(=400) にリサイズして配信。
 *   一覧/詳細のサムネ用。
 */
router.get("/cover/:volumeId", async (req, res) => {
  const volumeId = Number(req.params.volumeId);
  const width = Math.min(Number(req.query.w ?? 400), 800);
  if (!Number.isFinite(volumeId)) {
    res.status(400).end();
    return;
  }
  const volume = await prisma.volume.findUnique({ where: { id: volumeId } });
  const abs = resolveVolumeFolder(volume?.folderPath);
  if (!abs) {
    res.status(404).end();
    return;
  }
  const pages = await listVolumePages(abs);
  if (pages.length === 0) {
    res.status(404).end();
    return;
  }
  const file = path.join(abs, pages[0]);
  try {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    sharp(file)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .pipe(res);
  } catch {
    res.status(500).end();
  }
});

/**
 * GET /img/page/:volumeId/:pageIndex
 *   ビューワー用の本ページ画像。pageIndex は 0 始まり。
 *   Range request 対応（大きい画像でも軽量配信）。
 */
router.get("/page/:volumeId/:pageIndex", async (req, res) => {
  const volumeId = Number(req.params.volumeId);
  const pageIndex = Number(req.params.pageIndex);
  if (!Number.isFinite(volumeId) || !Number.isFinite(pageIndex) || pageIndex < 0) {
    res.status(400).end();
    return;
  }
  const volume = await prisma.volume.findUnique({ where: { id: volumeId } });
  const abs = resolveVolumeFolder(volume?.folderPath);
  if (!abs) {
    res.status(404).end();
    return;
  }
  const pages = await listVolumePages(abs);
  if (pageIndex >= pages.length) {
    res.status(404).end();
    return;
  }
  const file = path.join(abs, pages[pageIndex]);
  const ext = path.extname(file).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".avif"
          ? "image/avif"
          : "image/jpeg";
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("Accept-Ranges", "bytes");

  // Range request 対応で送出
  const stat = fs.statSync(file);
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : stat.size - 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.setHeader("Content-Length", String(end - start + 1));
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
  }
  res.setHeader("Content-Length", String(stat.size));
  fs.createReadStream(file).pipe(res);
});

export default router;
