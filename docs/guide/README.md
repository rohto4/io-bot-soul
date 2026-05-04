# Guide

`docs/guide/` は、採用済みの**運用手順・復旧手順・作業ガイド**を置く。

## 置くもの

- ローカル実行、Docker、ログ監視、DB確認などの手順。
- 日常運用、緊急停止、復旧、デプロイ手順。
- ツール設定の配置手順や、PJで採用済みの運用補助。

## 置かないもの

- 実装が従う確定仕様 → `docs/spec/`
- 候補案、比較中の案、未採用案 → `docs/candi-ref/`
- 実装待ち、完了記録、ユーザー判断待ち → `docs/imp/`
- セッション記録 → `docs/diary/`

## ファイル構成

- [運用設計ガイド](operations.md)
- [Dockerローカル常駐ガイド](docker-local-run.md)
- [スクリプト概要](script-overview.md)
- [ガイド概要](guide-summary.md)
- [OpenCode設定配置手順](opencode/oc-active-init.md)

## 運用

- `docs/guide/` 直下は最大10ファイル程度に収める。
- コマンド断片だけのファイルを増やさず、関連する運用ガイドへ統合する。
- 仕様そのものを変える内容は `docs/spec/` に移す。

