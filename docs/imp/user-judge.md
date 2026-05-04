# User Judgement Board

このファイルは、ユーザーが判断する項目だけを置く。

- 実装作業そのものは `imp-tasks.md` に置く。
- 実機確認や運用コマンドは `user-tasks.md` に置く。
- 判断が確定したら、必要に応じて `docs/spec/` または `docs/guide/` に移し、実装が必要なものだけ `imp-tasks.md` に反映する。

**最終更新**: 2026-05-04

---

## 次に判断するとよいもの

### UJ-1: 次の実装優先度

候補:

- AI日次上限
- エモーション画像添付
- NoteHint / 管理画面
- TL観測・体験候補の精度改善
- リファクタリング整理

判断後、対象を `imp-tasks.md` の現在優先候補に反映する。

### UJ-2: `public` visibility を継続するか

現在は通常ノート・引用RNともに `public` 投稿。

判断観点:

- misskey.io 公開TL上での見え方
- bot投稿としての頻度・内容の安全性
- `home` に戻した場合の拡散抑制

決定したら `docs/candi-ref/visibility-policy.md` または `docs/spec/` に記録する。

### UJ-3: 引用RN確率の運用値

現在:

- 通常モード: `QUOTE_RENOTE_PROBABILITY=0.20`
- beta-test1: 40%
- `QUOTE_RENOTES_PER_DAY` は引用RNだけを止める実装に修正済み

判断観点:

- 許可済みユーザーが少ない時期は、引用RNガチャに当たっても候補なしskipが増える
- 引用RNが多すぎると接触感が強くなる

### UJ-4: TL参照の強さ

現在:

- `TL_REFERENCE_PROBABILITY=0.50`
- `TL_VIBE_RATIO=0.75`
- `TL_OBSERVATION_MIN_POSTS=3`

判断観点:

- TLに引っ張られすぎていないか
- `tl_vibe` が曖昧すぎないか
- `tl_mention` が具体的すぎないか
- 深夜・早朝にTL不足skipが多くないか

### UJ-5: 体験メモリの効き方

現在:

- `EXPERIENCE_MEMORY_ENABLED=true`
- `EXPERIENCE_MEMORY_PROMPT_WEIGHT=50`
- `EXPERIENCE_MEMORY_SAMPLE_COUNT=50`

判断観点:

- 過去体験の参照が自然か
- 同じ記憶に寄りすぎないか
- weightを 25 / 50 / 75 / 100 のどこに置くか

### UJ-6: AI出力の文体・人格

判断観点:

- `base-personal.md` の人格・口調が出ているか
- BOT自認が通常ノートに出すぎていないか
- 「人間っぽい」ふるまいとして不自然でないか
- temperatureや表現ジャンルの調整が必要か

実装が必要になったら `character-spec.ts` やAI設定変更タスクへ落とす。

### UJ-7: モデル比較を実施するか

候補:

- Chutesモデル比較
- OpenAI fallbackモデル比較
- 同一promptでの出力多様性比較

実施する場合、実装タスクは `imp-tasks.md` の `AI-IMPL-1`。

### UJ-8: 許可依頼文・体験投稿文のトーン

確認対象:

- フォローお礼文
- 許可依頼文
- 体験候補からの投稿文
- 引用RN文

公開SNSでの誤解、過度な接触感、個人情報・権利侵害のリスクを優先して判断する。

### UJ-9: 容姿概要の裏設定

`docs/spec/base-personal.md` の Q.010「謎」の内容を決める。

決定後、キャラクター設定として `docs/spec/` に反映する。

---

## 後で判断してよいもの

- beta-test1 をテスター募集前に使うか
- AI設定GUIをどの範囲まで作るか
- エモーション画像の添付頻度
- 画像emotionラベルの粒度
- `analyzeTlVibe()` の偏り判定閾値
- 非許可ユーザーのノートを体験候補探索に使うか

