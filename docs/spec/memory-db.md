# Memory DB

## 目的

このPJではDBを使う。

理由は、キャラクターの性格や投稿設定だけではなく、キャラクターが疑似的に生活を体験し、その体験を後続投稿に反映するため。

タイムラインでも設定ファイルでもない場所に、体験したことのログを蓄積する。

## 基本方針

- 初期DBはSQLiteを推奨する（テスト・開発用）。
- ローカルPC常駐botから単一プロセスで使う。
- 実運用ではNeon/Postgresを使用（`DATABASE_PROVIDER=postgres`）。
- DBアクセス層は薄く分け、SQLite固定の書き方をbot全体に散らさない。

## 行動ガチャとデータフロー（実装済み）

```
5分ごとのpost-draw tick
├── TL観測ガチャ（20% / beta-test1時80%）
│   ├── 引用RNガチャ（20% / beta-test1時25%）
│   │   ├── 許可済みユーザーのノート取得（quote-pick.ts）
│   │   ├── AI安全判定（classify-quote-safety.ts）
│   │   └── 引用RN投稿（quote_renote）→ experience_logs に記録
│   └── TL観測テキスト生成 → tl_observation 投稿
│
└── 通常ノート抽選（80% / beta-test1時20%）
    ├── 最短間隔チェック（5分）
    ├── 経過時間に応じた確率テーブル
    └── AI通常投稿生成 → normal 投稿
```

### データフローのポイント

- `source_notes`: TLスキャン時に取得したノートの要約を保存（`tl-scan.ts`）
- `posts`: 実際に投稿した内容を保存（kind: normal/tl_observation/quote_renote/reply）
- `experience_logs`: 引用RN成功時に記録（source_note_id, source_user_id を保持）
- `experience_candidates`: **未実装**（Phase 4で体験候補蓄積フローとして実装予定）

## 実装済みテーブル

### `tl_observations`

TLに「何かをしている人がいた」「こういう雰囲気があった」と観測した記録。

これはキャラクター自身の体験ではない。投稿に使う場合も、個人名や元noteを特定できる情報を出さない。

**実装状況**: Phase 3で基本実装済み。AI分類結果の詳細保存はPhase 4以降。

カラム:
- `id`
- `observed_at`
- `source_note_id`
- `source_user_id`
- `timeline`
- `topic`
- `summary`
- `emotion`
- `safety_class`
- `status` ('pending', 'used', 'expired')
- `used_in_post_id`
- `created_at`

### `experience_logs`

キャラクターが疑似的に体験し、かつ実際にノートした出来事。

重要: ここに入るのは「投稿済みの体験」だけ。候補段階のものは入れない。

**実装状況**: Phase 3で引用RN記録として実装済み。

カラム:
- `id`
- `occurred_at`
- `source_note_id`
- `source_user_id`
- `experience_candidate_id`（未使用、将来拡張用）
- `experience_type`（'quote_renote' など）
- `summary`
- `emotion`
- `importance`
- `posted_note_id`
- `created_at`

### `experience_candidates`

タイムラインから拾った、将来体験に変換できる候補。

**実装状況**: テーブル定義のみ。Phase 4で候補収集フローを実装予定。

カラム:
- `id`
- `source_note_id`
- `source_user_id`
- `picked_at`
- `candidate_type`
- `summary`
- `emotion_hint`
- `place_hint`
- `action_hint`
- `selection_reason`
- `safety_class`
- `quote_allowed`
- `status` ('pending', 'executed', 'rejected', 'expired')
- `rejected_reason`
- `executed_post_id`
- `executed_experience_log_id`
- `expires_at`
- `created_at`

### `source_notes`

疑似体験の元にしたnoteの最小限メタデータ。

**実装状況**: Phase 3で実装済み（`tl-scan.ts`）。

カラム:
- `note_id`
- `user_id`
- `username`
- `host`
- `note_created_at`
- `visibility`
- `cw`
- `sensitive`
- `reply_id`
- `renote_id`
- `url`
- `text_summary`（先頭80字程度）
- `captured_at`
- `deleted_or_unavailable`

注意: 他者の投稿本文を丸ごと長期保存しない。短い要約に留める。

### `posts`

bot自身の投稿履歴。

**実装状況**: Phase 3で実装済み。

カラム:
- `note_id`
- `posted_at`
- `kind` ('normal', 'tl_observation', 'quote_renote', 'reply', 'morning', 'night', 'sleep_talk', 'reaction_note')
- `text`
- `visibility`
- `quote_source_note_id`
- `source_experience_candidate_id`（未使用）
- `source_experience_log_id`
- `source_tl_observation_id`
- `generated_reason`
- `created_at`

### `experience_source_consents`

ユーザーが、自分の投稿をbotの疑似体験の参考にしてよいと許可した状態。

**実装状況**: Phase 2で実装済み。

同意の正本はピン留めノートへの❤リアクションとする。

カラム:
- `user_id`
- `username`
- `host`
- `consent_status` ('pending', 'consented', 'stopped', 'unfollowed', 'revoked')
- `pinned_consent_note_id`
- `consented_reaction`
- `consented_at`
- `revoked_at`
- `stopped_at`
- `unfollowed_at`
- `last_checked_at`
- `created_at`
- `updated_at`

### `consent_guides`

フォロー時に送った、ピン留めノートへの案内記録。

**実装状況**: Phase 2で実装済み（旧名`consent_requests`から変更）。

カラム:
- `id`
- `user_id`
- `guide_note_id`
- `pinned_consent_note_id`
- `requested_at`
- `status`

### `notes_seen`

取得済み・処理済みnote。

**実装状況**: 実装済み。

カラム:
- `note_id`
- `seen_at`
- `purpose`

### `notifications_seen`

処理済みnotification。

**実装状況**: 実装済み。

カラム:
- `notification_id`
- `notification_type`
- `user_id`
- `note_id`
- `seen_at`
- `handled_at`
- `action`

### `reply_logs`

bot自身の返信履歴。

**実装状況**: 実装済み。

カラム:
- `id`
- `target_note_id`
- `target_user_id`
- `reply_note_id`
- `replied_at`
- `reason`
- `status`

### `bot_state`

単一のbot状態。

**実装状況**: 実装済み。

カラム:
- `id`（常に1）
- `sleeping`
- `current_rhythm_date`
- `wake_at`
- `sleep_at`
- `last_note_at`
- `last_timeline_scan_at`
- `created_at`
- `updated_at`

### `rate_limit_events`

投稿や引用RNのskip理由を残す。

**実装状況**: 実装済み。

カラム:
- `id`
- `event_at`
- `event_type`
- `decision`
- `reason`
- `related_user_id`
- `related_note_id`

## Phase 4以降の検討テーブル

以下は将来的な拡張候補として定義しているが、現時点では未実装。

### `memory_atoms`（未実装）

継続的に参照する短い記憶単位。

カラム:
- `id`
- `kind`
- `content`
- `weight`
- `created_at`
- `last_used_at`

### `note_exp_history`（未実装）

自分のノート、ノートの元になった体験、ノートしていない体験を同じ系列で扱うための統合履歴案。

既存の `tl_observations`、`experience_candidates`、`experience_logs` と統合するかは未決。

カラム:
- `id`
- `kind` ('note', 'note-exp', 'exp')
- `note_id`
- `source_note_id`
- `source_user_id`
- `content_summary`
- `exp_summary`
- `status`
- `created_at`
- `posted_at`

### `experience_sources`（未実装）

疑似体験の元候補として抽出したnoteと、その採用判断。

注: `experience_candidates` を主テーブルにする場合、`experience_sources` は統合または省略してよい。

カラム:
- `id`
- `note_id`
- `user_id`
- `picked_at`
- `selection_reason`
- `rejected_reason`
- `experience_log_id`

## 安全方針

- 元noteの本文をそのまま再投稿しない。
- 個人情報、センシティブ情報、炎上話題を体験ログに取り込まない。
- 削除済み投稿や非公開に近い文脈を再利用しない。
- 他者の体験をキャラクター自身の体験として過度に横取りしない。
- 抽象化された出来事、感情、印象として扱う。
- 明示的に許可したユーザーの公開投稿を優先する。
- 許可の取り消し導線を用意し、取り消し後は新規参照しない。
- `/stop` は接触停止として扱い、リプライや引用RNを止める。
- `/unfollow` はbot側から実際にフォロー解除し、ノート参照対象からも除外する。
- TL観測として扱う場合は、個人名、引用、元noteの文面再利用を避ける。
- TL観測は「誰かがしていたこと」ではなく、「TLにそういう雰囲気があった」として抽象化する。
