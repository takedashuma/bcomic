-- 閲覧進捗テーブル（新規）
-- 既存 tb_bok / tb_bkm / tb_usr は変更しない

CREATE TABLE IF NOT EXISTS `tb_red` (
  `red_mid`   INT NOT NULL AUTO_INCREMENT,
  `red_uid`   INT NOT NULL COMMENT 'UserID (tb_usr.usr_mid)',
  `red_bid`   INT NOT NULL COMMENT 'VolumeID (tb_bok.bok_mid)',
  `red_int0`  INT NOT NULL DEFAULT 0 COMMENT 'LastPage 0-origin',
  `red_inday` DATETIME NULL,
  `red_upday` DATETIME NULL,
  PRIMARY KEY (`red_mid`),
  UNIQUE KEY `uq_red_user_volume` (`red_uid`, `red_bid`),
  KEY `ix_red_uid` (`red_uid`),
  KEY `ix_red_bid` (`red_bid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
