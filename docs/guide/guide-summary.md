# Guide Summary

- [Dockerローカル常駐ガイド](docker-local-run.md)
  - ユーザーPC上でbotを常駐させるため、Docker Composeを採用する。常駐プロセスは毎分pollingで返信、フォロー案内、同意確認を担当する。
- [スクリプト概要](script-overview.md)
  - Docker常駐、GitHub Actionsの5分投稿抽選、DB migration、将来の設定変更用スクリプトの役割分担を整理する。
