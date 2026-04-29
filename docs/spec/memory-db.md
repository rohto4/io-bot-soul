# Memory DB

## 目的

このPJではDBを使う。

理由は、キャラクターの性格や投稿設定だけではなく、キャラクターが疑似的に生活を体験し、その体験を後続投稿に反映するため。

タイムラインでも設定ファイルでもない場所に、体験したことのログを蓄積する。

## 基本方針

- 初期DBはSQLiteを推奨する。
- ローカルPC常駐botから単一プロセスで使う。
- 将来クラウド常駐や複数workerが必要になった場合はPostgreSQL系へ移行する。
- DBアクセス層は薄く分け、SQLite固定の書き方をbot全体に散らさない。

## 疑似生活バッチ

30分間隔を目安に、投稿処理とは別の候補収集バッチを走らせる。

流れ:

1. タイムラインから候補noteを取得する。
2. ランダムまたは別途定める法則で元noteを選ぶ。
3. 元noteを「体験候補」として抽象化する。
4. `experience_candidates` に保存する。
5. この時点では、まだキャラクターが実際に体験したこととして記憶しない。

5分ごとの投稿抽選で体験投稿が選ばれた時に、候補の中から実行する体験を選ぶ。

1. `experience_candidates` から未使用候補を選ぶ。
2. botが「今日はこれをした」とノートする。
3. 投稿に成功した場合だけ、抽象的に体験済みとして `experience_logs` に保存する。
4. `experience_candidates` は `executed` または `rejected` に更新する。

## 保存する情報

### `tl_observations`

TLに「何かをしている人がいた」「こういう雰囲気があった」と観測した記録。

これはキャラクター自身の体験ではない。投稿に使う場合も、個人名や元noteを特定できる情報を出さない。

候補カラム:

- `id`
- `observed_at`
- `source_note_id`
- `source_user_id`
- `topic`
- `summary`
- `emotion`
- `safety_class`
- `used_in_post_id`
- `created_at`

### `experience_logs`

キャラクターが疑似的に体験し、かつ実際にノートした出来事。

重要: ここに入るのは「投稿済みの体験」だけ。候補段階のものは入れない。

候補カラム:

- `id`
- `occurred_at`
- `source_note_id`
- `source_user_id`
- `experience_type`
- `summary`
- `emotion`
- `importance`
- `visibility`
- `used_in_post_at`
- `created_at`

### `experience_candidates`

タイムラインから拾った、将来体験に変換できる候補。

候補カラム:

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
- `status`
- `rejected_reason`
- `executed_post_id`
- `executed_experience_log_id`

### `source_notes`

疑似体験の元にしたnoteの最小限メタデータ。

候補カラム:

- `note_id`
- `user_id`
- `created_at`
- `visibility`
- `cw`
- `text_summary`
- `url`
- `captured_at`

注意: 他者の投稿本文を丸ごと長期保存しない。必要なら短い要約や分類に留める。

### `notes_seen`

取得済み・処理済みnote。

候補カラム:

- `note_id`
- `seen_at`
- `purpose`

### `notifications_seen`

処理済みnotification。

候補カラム:

- `notification_id`
- `seen_at`
- `handled_at`
- `action`

### `posts`

bot自身の投稿履歴。

候補カラム:

- `note_id`
- `posted_at`
- `kind`
- `text`
- `source_experience_log_id`
- `visibility`

### `reply_logs`

bot自身の返信履歴。

候補カラム:

- `id`
- `target_note_id`
- `reply_note_id`
- `replied_at`
- `reason`

### `memory_atoms`

継続的に参照する短い記憶単位。

候補カラム:

- `id`
- `kind`
- `content`
- `weight`
- `created_at`
- `last_used_at`

### `experience_source_consents`

ユーザーが、自分の投稿をbotの疑似体験の参考にしてよいと許可した状態。

同意の正本はピン留めノートへの❤リアクションとする。

候補カラム:

- `user_id`
- `username`
- `host`
- `consent_status`
- `request_note_id`
- `pinned_consent_note_id`
- `consented_reaction`
- `consented_at`
- `revoked_at`
- `stopped_at`
- `unfollowed_at`
- `last_checked_at`

### `consent_requests`

フォロー時に送った、ピン留めノートへの案内記録。

候補カラム:

- `id`
- `user_id`
- `username`
- `guide_note_id`
- `pinned_consent_note_id`
- `requested_at`
- `status`

### `note_exp_history`

自分のノート、ノートの元になった体験、ノートしていない体験を同じ系列で扱うための統合履歴案。

既存の `tl_observations`、`experience_candidates`、`experience_logs` と統合するかは未決。

候補カラム:

- `id`
- `kind`
- `note_id`
- `source_note_id`
- `source_user_id`
- `content_summary`
- `exp_summary`
- `status`
- `created_at`
- `posted_at`

`kind` 候補:

- `note`: 自分がノートした内容。
- `note-exp`: ノート内容の元になった体験。
- `exp`: ノートしていない体験。

### `experience_sources`

疑似体験の元候補として抽出したnoteと、その採用判断。

候補カラム:

- `id`
- `note_id`
- `user_id`
- `picked_at`
- `selection_reason`
- `rejected_reason`
- `experience_log_id`

注: `experience_candidates` を主テーブルにする場合、`experience_sources` は統合または省略してよい。

## 安全方針

- 元noteの本文をそのまま再投稿しない。
- 個人情報、センシティブ情報、炎上話題を体験ログに取り込まない。
- 削除済み投稿や非公開に近い文脈を再利用しない。
- 他者の体験をキャラクター自身の体験として過度に横取りしない。
- 抽象化された出来事、感情、印象として扱う。
- 明示的に許可したユーザーの公開投稿を優先する。
- 許可の取り消し導線を用意し、取り消し後は新規参照しない。
- `/stop` は接触停止として扱い、リプライや引用RNを止める。
- `/unfollow` はノート参照対象からの除外として扱う。
- TL観測として扱う場合は、個人名、引用、元noteの文面再利用を避ける。
- TL観測は「誰かがしていたこと」ではなく、「TLにそういう雰囲気があった」として抽象化する。
