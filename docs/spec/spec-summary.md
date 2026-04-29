# Spec Summary

## 確定方針

- 実行環境は、初期はローカルPC常駐を第一候補にする。
- 投稿は30分間隔を基本にする。
- 通知・リプライ・リアクション確認は、10秒間隔pollingまたはMisskey Streaming APIで行う。
- 初期DBはSQLiteを使う。
- タイムライン由来の材料は、`tl_observations`、`experience_candidates`、`experience_logs` に分ける。
- `tl_observations` は、個人を特定しないTL観測として扱う。許可は不要だが、安全判定は必須。
- `experience_candidates` は、許可済みユーザーの投稿から作る体験候補。まだ体験として記憶しない。
- `experience_logs` は、botが実際にノートした後だけ保存する体験記憶。
- フォロワー投稿を体験候補にする場合は、❤リアクションによる明示同意を取る。
- プロフィールとピン留めノートに、botの仕組み、参考にする範囲、オプトアウト方法を書く。

## 仕様ファイル

- `teck-stack.md`: misskey.io botの実行環境、常駐方式、スケジューリング、Misskey API / Streaming APIに関する判断資料。
- `memory-db.md`: 疑似生活ログ、記憶、処理済みID、投稿履歴を保存するDB方針。
- `consent-experience-strategy.md`: フォロワー同意に基づいて投稿を疑似生活体験へ変換する戦略。
  - TL観測として個人を特定せず「何々をしている人がいた、いいなー」と扱う場合は許可不要。ただし安全判定は必須。
