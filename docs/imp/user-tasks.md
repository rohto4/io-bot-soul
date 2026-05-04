# User Tasks

このファイルは、ユーザーが実際に確認・操作する作業だけを置く。

- 判断待ちは `user-judge.md` に置く。
- 実装状況は `imp-tasks.md` に置く。
- 完了した実装作業の記録は `imp-comp.md` に置く。

**最終更新**: 2026-05-04

---

## 直近の実機確認

### 5分ごとの投稿抽選を見る

毎5分tickと投稿・skip理由を見る:

```bash
docker compose logs -f bot | grep -E '"message":"(postDraw\.tick|scheduledPost\.skip|scheduledPost\.action|scheduledPost\.posted|quoteRenote\.posted|scheduledPost\.experienceCandidate)"'
```

当たり投稿だけを見る:

```bash
docker compose logs -f bot | grep -E '"message":"(scheduledPost\.posted|quoteRenote\.posted|scheduledPost\.experienceCandidate|scheduledPost\.ohayou|scheduledPost\.oyasumi|scheduledPost\.murmur)"'
```

### 体験候補スキャンを見る

```bash
docker compose logs -f bot | grep -E '"message":"(experienceScan\.tick|experienceScan\.saved|experienceScan\.skip|experienceCandidate\.classified)"'
```

### エラーだけを見る

```bash
docker compose logs -f bot | grep -E '"level":"error"|error|Error|FAILED'
```

---

## DB確認

実稼働DBは `DATABASE_PROVIDER=postgres` のため、SQLiteではなくPostgres側を見る。

### 現在の投稿上限

```sql
SELECT setting_key, setting_value
FROM m_runtime_setting
WHERE setting_key IN ('NOTES_PER_DAY','NOTES_PER_HOUR','QUOTE_RENOTES_PER_DAY')
ORDER BY setting_key;
```

### 直近24時間の投稿数

```sql
SELECT
  COUNT(*) FILTER (WHERE posted_at::timestamptz > now() - interval '1 hour') AS notes_1h,
  COUNT(*) FILTER (WHERE posted_at::timestamptz > now() - interval '24 hours') AS notes_24h,
  COUNT(*) FILTER (WHERE kind = 'quote_renote' AND posted_at::timestamptz > now() - interval '24 hours') AS quote_24h
FROM posts;
```

### 投稿種別の分布

```sql
SELECT kind, generated_reason, COUNT(*) AS cnt
FROM posts
WHERE posted_at::timestamptz > now() - interval '24 hours'
GROUP BY kind, generated_reason
ORDER BY cnt DESC;
```

### 直近投稿

```sql
SELECT note_id, posted_at, kind, generated_reason
FROM posts
ORDER BY posted_at DESC
LIMIT 10;
```

### bot状態

```sql
SELECT last_note_at, sleeping, sleep_at, wake_at, ai_failure_streak, ai_backoff_until, updated_at
FROM bot_state
WHERE id = 1;
```

### 体験候補の蓄積状況

```sql
SELECT candidate_type, status, COUNT(*) AS cnt
FROM experience_candidates
GROUP BY candidate_type, status;
```

### 引用RN体験ログ

```sql
SELECT experience_type, summary, occurred_at
FROM experience_logs
ORDER BY occurred_at DESC
LIMIT 10;
```

---

## 設定変更

DBマスタの変更は再起動不要。最大5分、次のtickから反映される。

### beta-test1

```sql
-- 有効化
UPDATE m_runtime_setting
SET setting_value = 'true', updated_at = now()
WHERE setting_key = 'BETA_TEST1_ENABLED';

-- 無効化
UPDATE m_runtime_setting
SET setting_value = 'false', updated_at = now()
WHERE setting_key = 'BETA_TEST1_ENABLED';
```

確認:

```bash
docker compose logs -f bot | grep betaTest1
```

### 確率の一時調整

```sql
-- 引用RN確率を上げる
UPDATE m_runtime_setting
SET setting_value = '0.50', updated_at = now()
WHERE setting_key = 'QUOTE_RENOTE_PROBABILITY';

-- TL参照確率を上げる
UPDATE m_runtime_setting
SET setting_value = '0.80', updated_at = now()
WHERE setting_key = 'TL_REFERENCE_PROBABILITY';

-- 通常値へ戻す
UPDATE m_runtime_setting
SET setting_value = '0.20', updated_at = now()
WHERE setting_key = 'QUOTE_RENOTE_PROBABILITY';

UPDATE m_runtime_setting
SET setting_value = '0.50', updated_at = now()
WHERE setting_key = 'TL_REFERENCE_PROBABILITY';
```

### 投稿上限の一時調整

```sql
UPDATE m_runtime_setting
SET setting_value = '100', updated_at = now()
WHERE setting_key = 'NOTES_PER_DAY';
```

---

## 実機チェックリスト

- [ ] `poll.tick` が毎分継続している。
- [ ] `postDraw.tick` が5分ごとに出ている。
- [ ] `experienceScan.tick` が設定間隔ごとに出ている。
- [ ] `scheduledPost.posted` / `quoteRenote.posted` / `scheduledPost.experienceCandidate` のいずれか、または妥当なskip理由が出ている。
- [ ] `generated_reason` に `no_tl` / `tl_vibe` / `tl_mention` / `quote_renote` が混在している。
- [ ] `generatePost.memoryDepth` で記憶深度分布を確認できる。
- [ ] `generatePost.experienceMemory` が出て、体験ログがプロンプトに含まれている。
- [ ] `experience_candidates` にpendingまたはexecutedのデータが蓄積される。
- [ ] `scheduledPost.oyasumi` / `scheduledPost.ohayou` / `scheduledPost.murmur` が睡眠スケジュールに沿って出る。
- [ ] リプライ、`/stop`、`/unfollow` の実機挙動が維持されている。
- [ ] ❤リアクションが `experience_source_consents` に反映される。

---

## 注意

- secret、token、Cookie、未公開の認証情報をログやドキュメントに残さない。
- 公開投稿の確認では、misskey.io の規約、API制限、公開SNSでの誤解・迷惑行為・個人情報・権利侵害のリスクを優先して見る。

