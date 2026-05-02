# Release Readiness

## 現在の判断（2026-05-02）

**Phase 3 完了・実稼働中。**

- Node.js/TypeScript + Docker Compose でローカル常駐稼働中。
- TL観測ノート・引用Renote・行動ガチャを含む Phase 3 機能が実装済み。
- Alpha運用（限定ユーザーでの実運用テスト）を開始可能。

ただし、misskey.ioで**公開運用**（不特定多数へのフォロー許可）を開始する前に、以下のゲートを満たす必要がある。

## 必須ゲート

### misskey.io運用ルール

- [ ] Botフラグを付ける。
- [ ] プロフィールまたはピン留めノートに、Bot管理者のmisskey.ioアカウント `@unibell4` を記載する。
- [ ] ユーザー操作によりリプライや公開投稿を行う機能には、レートリミットを設ける。
- [ ] 不適切な単語には反応しないフィルタを設ける。
- [ ] 連続した公開投稿でタイムラインを埋めない。
- [ ] 投稿内容を定期的に人間が確認する。

### 投稿頻度

| 制限項目 | 現在の実装 | 備考 |
|---|---|---|
| 定期投稿間隔 | 5分ごとの抽選 | `SCHEDULED_POST_MIN_INTERVAL_MINUTES=5` |
| 1時間あたり最大 | 5ノート | `m_runtime_setting.NOTES_PER_HOUR`（未適用） |
| 1日あたり最大 | 50ノート | `m_runtime_setting.NOTES_PER_DAY`（未適用） |
| 引用Renote 1日最大 | 5回 | `m_runtime_setting.QUOTE_RENOTES_PER_DAY`（未適用） |
| ユーザー操作投稿制限 | 5分に5件 | `m_runtime_setting.USER_TRIGGERED_POSTS_PER_5MIN`（未適用） |

**注意**: rate limitの本格適用は Phase 6 で実装予定。現時点ではDB値は存在するが、実際の制限ロジックは未実装。

### 安全弁（実装済み）

- [x] プロフィールにBotであること、参照の仕組み、停止方法を書く（手動設定）。
- [x] ピン留めノートに同意条件、対象外、`/stop`、`/unfollow` を書く（手動作成）。
- [x] 引用Renoteや体験候補に使う対象は、ピン留めノートへ❤した許可済みユーザーに限定する。
- [x] TL観測は許可不要だが、個人名、引用Renote、元note文面の再利用を禁止する。
- [x] CW、NSFW、個人情報、病気、事故、揉め事、政治、医療、投資、成人向け、攻撃的内容は採用しない（AI安全分類）。
- [x] 削除済み・非公開化・参照不能noteは使わない（構造フィルタで除外）。
- [x] `/stop` と `/unfollow` は即時反映する（`experience_source_consents` 更新）。
- [x] `/unfollow` はbot側から実際にフォロー解除し、ノート参照対象から除外する。

## リリース区分

### Alpha（現在）

目的: 自分のPCで動かし、投稿・DB・同意導線・TL観測・引用RNを検証する。

状態:
- ✅ ローカルDocker常駐稼働中
- ✅ 5分ごとの投稿抽選（通常ノート・TL観測・引用RN）
- ✅ 毎分polling（フォロー返し・リプライ・❤リアクション確認）
- ✅ `/stop`・`/unfollow` コマンド
- ✅ AI安全分類（引用RN前の判定）
- ✅ beta-test1モード（DBマスタで切り替え）

制限:
- 手動で選んだテストユーザーのみ（許可済みユーザーが引用RN対象）
- rate limitの本格適用は未実装（DB値のみ）
- エモーション画像添付は未実装
- 体験候補蓄積フロー（`experience_candidates`）は未実装

### Public MVP（今後）

目的: misskey.io上で通常運用を開始する。

開始条件:
- [ ] Botフラグ設定済み
- [ ] 管理者アカウント `@unibell4` 明記済み
- [ ] ピン留めノート公開済み
- [ ] **Neon/Postgres運用**（SQLiteから移行）
- [ ] **rate limit実装済み**（Phase 6）
- [ ] safety filter実装済み（AI安全分類＋キーワードフィルタ）
- [ ] `/stop` `/unfollow` 実装済み（✅ 実装済み）
- [ ] 投稿ログとskip理由を確認できる（✅ 実装済み）

## フェーズ別進捗

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 1 | Docker常駐土台、SQLite schema、Misskey API client | ✅ 完了 |
| Phase 2 | 同意管理（フォロー返し・ピン留め案内・❤検知） | ✅ 完了 |
| Phase 3 | TL観測・行動ガチャ・引用RN・AI投稿改善 | ✅ 完了 |
| Phase 4 | 体験候補蓄積フロー（`experience_candidates`） | 🔄 計画中 |
| Phase 5 | 体験投稿と記憶化（`experience_logs` 本格活用） | 🔄 計画中 |
| Phase 6 | rate limit・error backoff・AI日次上限 | 🔄 計画中 |
| Phase 7 | エモーション画像添付 | 🔄 計画中 |

## 参考リンク

- Misskey.io 利用規約: https://support.misskey.io/hc/ja/articles/6564530842767-%E5%88%A9%E7%94%A8%E8%A6%8F%E7%B4%84
  - 自動投稿が主となる場合はBotフラグが必要。
  - Bot管理者のmisskey.ioアカウント記載が必要。
  - ユーザー操作によりリプライや公開投稿を行うBotは、レートリミットと不適切語フィルタが必要。
  - 連続した公開投稿でタイムラインを埋めないこと。
- Misskey Bot docs: https://misskey-hub.net/ja/docs/for-developers/bot/
