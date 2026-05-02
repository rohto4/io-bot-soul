# Adjust Tasks（調整・改善候補）

## リファクタリング候補

### experience-scan.ts の source_note_id
- **現在**: `tl_${options.at}_${saved}`（仮のIDを生成）
- **問題**: `experience_candidates.source_note_id` に実際の Misskey note ID を保存できていない
- **原因**: `runTlScanPassive()` が `summaries: string[]`（テキスト要約のみ）を返す構造
- **対応案**: 
  - 案A: `runTlScanPassive()` の戻り値を `{ summaries: string[], notes: Array<{ id, userId, text }> }` に拡張
  - 案B: 仮IDのままで運用し、`source_notes` テーブルと `experience_candidates` を `captured_at` で紐付ける
- **優先度**: 中（機能的には動くが、データ整合性の観点で要改善）

## 調整が必要な設定値・パラメータ

### analyzeTlVibe() の閾値
- **現在**: summaries の 30% 以上出現する単語を「支配的話題」と判定
- **調整方針**: 実運用で TL の内容を見ながら、以下を試行
  - 閾値 20% → 30% → 40% と変えて、どの程度で「偏りがある」と感じるか確認
  - 単語の長さによる重み付け（短い単語は出現しやすいので下げる）
- **確認方法**: ログで `tlScan.passive` の `dominantTopic` を抽出して傾向確認

### EXPERIENCE_MEMORY_PROMPT_WEIGHT（0-100）
- **現在**: 50（初期値）
- **調整方針**: 
  - 0 にして通常ノートとの差分を確認
  - 100 にして影響の大きさを確認
  - 25/50/75 で段階的に変えて、どの値が「自然に反映されている」か確認
- **確認方法**: 実際の投稿文を見て判断

### TL_VIBE_RATIO と TL_MENTION_RATIO
- **現在**: 75% / 25%
- **調整方針**:
  - 雰囲気言述と特定言述のバランスを投稿ログから確認
  - 雰囲気言述が多すぎて「何も言ってない」印象にならないか確認
- **確認方法**: `generated_reason = 'tl_vibe' | 'tl_mention'` の割合を数週間分確認

### beta-test1 モードの確率
- **現在**: 引用RN 40% / 通常ノート 60%
- **調整方針**:
  - 試運用で引用RNが頻繁すぎないか、通常ノートが減りすぎないか確認
  - 必要に応じて `QUOTE_RENOTE_PROBABILITY` を DB マスタで調整
- **確認方法**: `docker compose logs -f bot | grep "quoteRenote.posted"` で頻度カウント

## 未実装・将来対応

### action-flow.md と action-flow-v2.md の統合
- **現状**: v1（旧設計）と v2（新設計）が両方存在
- **対応**: v1 は「歴史的記録」として残し、v2 を正にするか、一本化する
- **優先度**: 低（設計書の整理のみ）

### tl_observation の扱い
- **現状**: `kind = 'tl_observation'` は既存レコードのため残しているが、新規投稿は `normal` に統合
- **確認事項**: 既存の `tl_observation` レコードがある場合、過去投稿参照時に `normal` と区別して扱う必要があるか
- **優先度**: 低（データ互換性の問題）

## 試運転チェックリスト

- [ ] `docker compose up -d --build` で起動
- [ ] ログで `postDraw.tick` が5分ごとに出ることを確認
- [ ] ログで `experienceScan.tick` が10分ごとに出ることを確認
- [ ] `beta-test1` 有効/無効で確率が変わることを確認
- [ ] 引用RNが実際に行われるか確認（許可済みユーザーが必要）
- [ ] TL参照（vibe/mention）が実際に行われるか確認
- [ ] 体験メモリがプロンプトに含まれているか確認（`generatePost.experienceMemory` ログ）
- [ ] `experience_candidates` にデータが蓄積されるか確認
