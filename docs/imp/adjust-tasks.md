# Adjust Tasks（調整・改善候補）

## リファクタリング候補

### generate-tl-post.ts が未使用
- **現在**: `src/ai/generate-tl-post.ts` が存在するが、action-flow-v2 以降どこからもimportされていない
- **原因**: v2でtl_observationポストを廃止し、通常ノートに統合したため
- **対応**: 削除する（ただし `docs/spec/spec-summary.md` の実装ファイル対応表も合わせて更新）
- **優先度**: 低（未使用コードの整理）

### runTlScan と runTlScanPassive の重複コード
- **現在**: `src/tl-scan.ts` に `runTlScan`（旧・フル）と `runTlScanPassive` がほぼ同じコードで2つ存在する
  - フィルタ条件、`source_notes` へのINSERT、`bot_state.last_timeline_scan_at` 更新が重複
- **問題**: どちらかを変更したとき片方だけ変わるリスク
- **対応案**: 内部共通関数 `_runTlScanCore()` を切り出して両関数から呼ぶ
- **優先度**: 中（機能的には動くが、次にtl-scan.tsを触る際に対応する）

### experience-scan.ts の source_note_id
- **現在**: `tl_${options.at}_${saved}`（仮のIDを生成）
- **問題**: `experience_candidates.source_note_id` に実際の Misskey note ID を保存できていない
- **原因**: `runTlScanPassive()` が `summaries: string[]`（テキスト要約のみ）を返す構造
- **対応案**:
  - 案A: `runTlScanPassive()` の戻り値を `{ summaries: string[], notes: Array<{ id, userId, text }> }` に拡張
  - 案B: 仮IDのままで運用し、`source_notes` テーブルと `experience_candidates` を `captured_at` で紐付ける
- **優先度**: 中（機能的には動くが、データ整合性の観点で要改善）

---

## 調整が必要な設定値・パラメータ

### QUOTE_RENOTE_PROBABILITY（0.20）
- **現在**: 通常モード 20%
- **問題**: 許可済みユーザーが少ない（または0人の）期間は、引用RNガチャに当たっても毎回skipになる
  - skip率が高いと実質的に「引用RN分のtickが全部無駄」になり、投稿頻度が下がる
- **調整方針**:
  - 許可済みユーザーが0人の間は 0.05〜0.10 に下げておく
  - ユーザーが増えてきたら 0.20 に戻す
- **確認方法**: `docker compose logs -f bot | grep "quotePick.skip"` でskip頻度確認

### TL_REFERENCE_PROBABILITY（0.50）
- **現在**: 通常ノートの50%がTL参照
- **調整方針**:
  - 実際の投稿を見て「TLに引っ張られすぎていないか」確認
  - TLが薄い時間帯にtl_vibeが多発してskipになる場合は下げる
- **確認方法**: `generated_reason = 'no_tl' | 'tl_vibe' | 'tl_mention'` の割合をSQLで確認
  ```sql
  SELECT generated_reason, COUNT(*) FROM posts WHERE kind='normal' GROUP BY generated_reason;
  ```

### analyzeTlVibe() の閾値
- **現在**: summaries の 30% 以上出現する単語を「支配的話題」と判定
- **調整方針**: 実運用でTLの内容を見ながら以下を試行
  - 閾値 20% → 30% → 40% と変えて、どの程度で「偏りがある」と感じるか確認
  - 短い単語（2文字）は出現しやすいので重み付けを下げる改善も候補
- **確認方法**: ログで `tlScan.passive` の `dominantTopic` を抽出して傾向確認

### TL_VIBE_RATIO と TL_MENTION_RATIO（0.75 / 0.25）
- **現在**: TL参照内での雰囲気言及75% / 特定言及25%
- **調整方針**:
  - 雰囲気言及が多すぎて「何も言ってない」印象にならないか確認
  - 特定言及が多すぎてTLの内容を直接参照しすぎないか確認
- **確認方法**: `generated_reason = 'tl_vibe' | 'tl_mention'` の割合を数週間分確認

### TL_OBSERVATION_MIN_POSTS（3）
- **現在**: summaries が 3件未満のときTL参照をskip
- **問題**: 深夜・早朝などTLが薄い時間帯では skip が多発し、通常ノートも確率テーブルで弾かれると長時間無投稿になりうる
- **調整方針**:
  - ログで `skip reason=too_few_summaries` が頻発する時間帯を確認
  - 必要に応じて 2 または 1 に下げる
- **確認方法**: `docker compose logs -f bot | grep "too_few_summaries"`

### AI_TEMPERATURE_TEXT（0.8）
- **現在**: 通常ノート生成の temperature
- **調整方針**:
  - 0.8 で投稿がランダムすぎる（支離滅裂・キャラクターから外れる）場合は 0.7 に下げる
  - 逆に単調な場合は 0.9〜1.0 を試す
- **確認方法**: 実際の投稿文を複数日分見て主観評価

### EXPERIENCE_MEMORY_PROMPT_WEIGHT（50）
- **現在**: 初期値 50
- **調整方針**:
  - 0 にして通常ノートとの差分を確認
  - 100 にして影響の大きさを確認
  - 25/50/75 で段階的に変えて、どの値が「自然に反映されている」か確認
- **注意**: 運用開始直後は `experience_logs` がほぼ空なのでどの値でも影響なし。数週間後から調整する
- **確認方法**: 実際の投稿文を見て判断

### EXPERIENCE_MEMORY_SAMPLE_COUNT（50）
- **現在**: `experience_logs` からランダムに最大50件取得
- **問題**: 運用開始直後はレコードが数件しかないため、50件取得しようとしても空振りになる
- **調整方針**: 問題なし（件数が少ない場合はそのまま全件返る。意図的な上限なので運用開始後は変更不要）
- **確認**: 一応1〜2週間後に `SELECT COUNT(*) FROM experience_logs;` で蓄積量を確認

### beta-test1 モードの確率
- **現在**: 引用RN 40% / 通常ノート 60%（経過時間5倍）
- **調整方針**:
  - 試運用で引用RNが頻繁すぎないか、通常ノートが減りすぎないか確認
  - 必要に応じて `QUOTE_RENOTE_PROBABILITY` を DB マスタで調整
- **確認方法**: `docker compose logs -f bot | grep "quoteRenote.posted"` で頻度カウント

---

## 未実装・将来対応

### source_notes テーブルのクリーンアップ
- **現状**: `runTlScanPassive()` が5分tick（TL参照時）と10分tick（experienceScan）で呼ばれ、`source_notes` に毎回保存される。削除ロジックがない
- **問題**: 長期運用でテーブルが肥大化する（`ON CONFLICT DO NOTHING` で重複は防ぐが、古いレコードは残り続ける）
- **対応案**: `captured_at` が30日以上前のレコードを定期削除するバッチを追加（Phase 6と合わせて実装）
- **優先度**: 中（すぐ問題にはならないが、1〜2ヶ月後には対応が必要）

### experience_candidates の古いレコードクリーンアップ
- **現状**: `status = 'pending'` のまま使われないレコードが蓄積し続ける
- **対応**: Phase 5実装時に `expires_at` または `created_at + N日` で自動削除する運用ルールを決める
- **優先度**: Phase 5着手時に対応

### action-flow.md と action-flow-v2.md の統合
- **現状**: v1（旧設計）と v2（新設計）が両方存在
- **対応**: v1 は「歴史的記録」として残し、v2 を正にするか、一本化する
- **優先度**: 低（設計書の整理のみ）

### tl_observation の扱い
- **現状**: `kind = 'tl_observation'` は既存レコードのために残しているが、新規投稿は `normal` に統合
- **確認事項**: 既存の `tl_observation` レコードがある場合、過去投稿参照時に `normal` と区別して扱う必要があるか
- **優先度**: 低（データ互換性の問題）

---

## 試運転チェックリスト

- [x] `docker compose up -d --build` で起動（2026-05-03 反映済み）
- [ ] ログで `postDraw.tick` が5分ごとに出ることを確認
- [ ] ログで `experienceScan.tick` が10分ごとに出ることを確認
- [ ] `beta-test1` 有効/無効で確率が変わることを確認
- [ ] 引用RNが実際に行われるか確認（許可済みユーザーが必要）
- [ ] TL参照（vibe/mention）が実際に行われるか確認
  ```
  docker compose logs -f bot | grep -E "tlVibe|tlMention|no_tl"
  ```
- [ ] 体験メモリがプロンプトに含まれているか確認（`generatePost.experienceMemory` ログ）
- [ ] `experience_candidates` にデータが蓄積されるか確認
  ```sql
  SELECT candidate_type, status, COUNT(*) FROM experience_candidates GROUP BY candidate_type, status;
  ```
