# Spec Summary

## 確定方針

- 実行環境は、初期はローカルPC常駐を第一候補にする。
- 投稿判定は5分間隔を基本にする。
- 直前ノートからの経過時間に応じて投稿確率を上げる。
- 30分周期の処理は、体験候補収集やTL観測の材料収集として扱う。
- 通知・リプライ・リアクション確認は、MVPでは1分pollingで行う。
- Misskey Streaming APIは、polling実装が安定した後の改善候補にする。
- 初期DBはSQLiteを使う。
- ローカルDocker常駐で状態を安定して保持するため、Neon/Postgresを採用する。
- タイムライン由来の材料は、`tl_observations`、`experience_candidates`、`experience_logs` に分ける。
- `tl_observations` は、個人を特定しないTL観測として扱う。許可は不要だが、安全判定は必須。
- `experience_candidates` は、許可済みユーザーの投稿から作る体験候補。まだ体験として記憶しない。
- `experience_logs` は、botが実際にノートした後だけ保存する体験記憶。
- 同意説明の正本はピン留めノートに置く。
- フォロワー投稿を引用RNや体験候補に使う場合は、ピン留めノートへの❤リアクションによる明示同意を取る。
- プロフィールとピン留めノートに、botの仕組み、参考にする範囲、`/stop`、`/unfollow` を書く。
- `/stop` はリプライや引用RNなどの接触停止、`/unfollow` はbot側からのフォロー解除とノート参照対象からの除外として扱う。
- 容姿の基本画像は `images/CoffeeBean_V1_2_2026-04-30-23-42-08.png` を正とし、容姿解釈・画像生成・添付判断で参照する。
- 定期ノート投稿は `SCHEDULED_POSTING_ENABLED=true` の時だけ行い、現行実装は `public` visibilityで投稿する。
- 定期ノートは直近通常投稿から5分未満なら必ずskipし、5分以上なら確率抽選に入る。
- 投稿確率の目安は5分後10%、10分後15%、30分後80%、1時間超95%。
- 投稿実行ルールと投稿内容ルールは、Mermaidフロー付きの専用仕様に分離する。
- AI生成・分類はChutesをprimary、OpenAIをfallbackとして扱う。
- 現行の定期投稿本文はAI生成を優先し、AI失敗時は設定に従ってskipまたは固定テンプレートfallbackにする。
- AI API keyはsecretとして扱い、投稿確率、最短投稿間隔、provider設定やtoken上限などの非secret設定はDBマスタ `m_runtime_setting` で管理する。
- ChutesのKimi系モデルは内部推論で `reasoning_tokens` を消費するため、短文分類でもtoken上限を小さくしすぎない。

## 仕様ファイル

- `base-personal.md`: ノートの性格・口調・距離感に関する採用仕様。
- `teck-stack.md`: misskey.io botの実行環境、常駐方式、スケジューリング、Misskey API / Streaming APIに関する判断資料。
- `memory-db.md`: 疑似生活ログ、記憶、処理済みID、投稿履歴を保存するDB方針。
- `db-schema.md`: SQLiteの初期schema案。rate limit、同意、TL観測、体験候補、体験記憶、投稿履歴を定義。
- `emotion-assets.md`: `images/` 配下のエモーション画像を投稿に添付するP1/P2仕様。
- `posting-runtime-rules.md`: 投稿できる時間、skip条件、安全スイッチ、DB調整値を定義。
- `posting-content-rules.md`: 投稿される内容タイプ、現行テンプレート、将来候補、確率を定義。
- `consent-experience-strategy.md`: フォロワー同意に基づいて投稿を疑似生活体験へ変換する戦略。
  - TL観測として個人を特定せず「何々をしている人がいた、いいなー」と扱う場合は許可不要。ただし安全判定は必須。
- `release-readiness.md`: 公開運用前の必須ゲートとリリース可否判断。
