# Guide Summary

- [Dockerローカル常駐ガイド](docker-local-run.md)
  - ユーザーPC上でbotを常駐させるため、Docker Composeを採用する。SQLite DB、ログ、画像素材はホスト側へマウントし、secretは `.env` で管理する。
