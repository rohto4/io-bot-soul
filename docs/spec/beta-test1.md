# Beta-Test1 モード仕様

## 概要

beta-test1 は、bot の行動パターンを通常モードから変更する運用モードです。

- TL観測ノートを頻発させ、友人との双方向交流の感覚を出す
- 通常ノートの投稿間隔を広げ、生活ログ的な発信は少なめにする
- 引用Renote の頻度も増やして、TL上での存在感を高める

DBマスタ `m_runtime_setting` の `BETA_TEST1_ENABLED` だけで切り替え可能です。
再起動不要・即時反映です。

## 振る舞いの差異

### 1. 行動ガチャ確率

| モード | TL観測確率 | 引用RN確率 | 通常ノート確率（残り） |
|---|---|---|---|
| 通常 | 20% | 20% | 80% |
| beta-test1 | **80%** | **25%** | 20% |

※ 引用RNは「TL観測に当たった場合」のさらなる抽選なので、全体の出現確率は：
- 通常: 4% (= 20% × 20%)
- beta-test1: **20%** (= 80% × 25%)

### 2. 通常ノートの投稿間隔

| モード | 経過時間倍率 | 効果 |
|---|---|---|
| 通常 | 1.0 | 5分→10% / 30分→80% / 60分→95% |
| beta-test1 | **5.0** | 上記の5倍の経過時間として判定。つまり1時間で30分相当の確率にしか到達しない |

これにより、beta-test1 では通常ノートが出にくくなります。

### 3. TL観測の派生パターン

beta-test1 では TL観測が当たった場合の流れ：

```
TL観測 80% 当たり
  └─ 引用RN 25% 当たり → quote_renote 投稿 (全体 20%)
  └─ 引用RN外れ or 候補なし → tl_observation 投稿 (全体 60%)

TL観測 20% 外れ
  └─ 通常ノート 抽選 (経過時間×5で判定、効率よくskip)
```

## 切り替え方法

### DBマスタの一括更新スクリプト

```sql
-- beta-test1 有効化
UPDATE m_runtime_setting
SET setting_value = 'true', updated_at = NOW()
WHERE setting_key = 'BETA_TEST1_ENABLED';
```

```sql
-- beta-test1 無効化（通常モードへ）
UPDATE m_runtime_setting
SET setting_value = 'false', updated_at = NOW()
WHERE setting_key = 'BETA_TEST1_ENABLED';
```

### Dockerログでの確認

```powershell
docker compose logs -f bot | grep -E "betaTest1|scheduledPost|tlObservation|quoteRenote|postDraw"
```

有効時に `betaTest1.active` が出力されます。

## 運用判断基準

| 状況 | 推奨モード | 理由 |
|---|---|---|
| 新規ユーザーのフォロワー獲得期 | **beta-test1** | 双方向交流が目立ち、フォローバック率が高い |
| 定着後、生活ログブランド確立期 | **通常** | 個性のある独自投稿が残り、ブーストされやすい |
| イベント・コンテスト期間中 | **beta-test1** | TL内での存在感が必要 |
| bot投稿が増えすぎていると感じた時 | **通常** | 通常ノート間隔が短く、自然なテンポに戻る |

## 補足

- beta-test1 は「TL観測頻発 + 通常ノート抑制」の組み合わせです。個別の確率は `m_runtime_setting` でも調整可能です。
- 切り替えてから反映されるまで最大5分（post-draw interval）かかります。
- `SCHEDULED_POSTING_ENABLED=false` の場合、いずれのモードでも投稿は行われません。
