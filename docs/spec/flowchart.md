# Botフローチャート集

このドキュメントは、io-botの主要な業務フローをMermaid記法で視覚化したものです。
実装済みのフローは緑色、未実装（P1以降）のフローはグレー点線で表示しています。

## 凡例

```mermaid
flowchart LR
    A[開始/終了]:::implemented
    B{判定}:::decision
    C[AI処理]:::ai
    D[未実装処理]:::pending

    classDef implemented fill:#90EE90,stroke:#228B22
    classDef decision fill:#87CEEB,stroke:#4169E1
    classDef ai fill:#DDA0DD,stroke:#8B008B
    classDef pending fill:#E0E0E0,stroke:#808080,stroke-dasharray: 5 5
```

| スタイル | 色 | 意味 |
|---|---|---|
| `implemented` | 緑 | 実装済みの処理 |
| `decision` | 青 | 判定・分岐 |
| `ai` | 紫 | AI関連の処理 |
| `pending` | グレー点線 | P1以降の未実装処理 |

## 目次

1. [定期投稿判定フロー](#定期投稿判定フロー)
2. [投稿内容選択フロー](#投稿内容選択フロー)
3. [常駐pollフロー](#常駐pollフロー)
4. [P1以降の投稿候補フロー](#p1以降の投稿候補フロー)
5. [AI生成プロセス詳細](#ai生成プロセス詳細)
6. [同意フロー（体験化許可）](#同意フロー体験化許可)

---

## 定期投稿判定フロー

Docker常駐プロセスが5分ごとに実行する投稿抽選の判定ロジック。

```mermaid
flowchart TD
    A[Docker post-draw interval または手動CLI] --> B[drawPostOnce / scheduled:post-draw:prod]
    B --> C[DBを開く]
    C --> D[postDraw.tick を記録]
    D --> E{SCHEDULED_POSTING_ENABLED=true?}
    E -- No --> Z1[skip: disabled]
    E -- Yes --> F[m_runtime_setting を読む]
    F --> G[直近の通常投稿を posts から取得]
    G --> H{直近通常投稿がある?}
    H -- No --> P[投稿作成]
    H -- Yes --> I[経過分数を計算]
    I --> J{SCHEDULED_POST_MIN_INTERVAL_MINUTES 未満?}
    J -- Yes --> Z2[skip: min_interval]
    J -- No --> K[経過分数から投稿確率を計算]
    K --> L[0以上1未満の乱数を引く]
    L --> M{乱数 < 投稿確率?}
    M -- No --> Z3[skip: probability]
    M -- Yes --> P[投稿作成]
    P --> Q[Misskey notes/create]
    Q --> R[posts に投稿履歴を保存]
    R --> S[bot_state.last_note_at を更新]

    classDef implemented fill:#90EE90,stroke:#228B22
    classDef decision fill:#87CEEB,stroke:#4169E1
    class A,B,C,D,F,G,H,I,J,K,L,M,P,Q,R,S implemented
    class E decision
```

### 投稿確率の計算

| 経過時間 | 確率 | 判定 |
|---|---|---|
| 5分未満 | 0% | 必ずskip |
| 5分 | 10% | 抽選 |
| 10分 | 15% | 抽選 |
| 30分 | 80% | 抽選 |
| 60分以上 | 95% | 抽選 |

※5分以上は線形補間で確率を計算（例：20分経過時は10分地点15%と30分地点80%の間を補間）

---

## 投稿内容選択フロー

投稿作成が許可された後、どの内容を投稿するかを選択するフロー。

```mermaid
flowchart TD
    A[投稿作成が許可された] --> B{投稿入口の種類}
    B -- 定期post-draw --> C[AIへ投稿文生成を依頼]
    C --> D{AI生成に成功?}
    D -- Yes --> E[visibility publicで通常ノート投稿]
    D -- No --> S{AI失敗時skip?}
    S -- Yes --> X[投稿しない]
    S -- No --> T[固定テンプレート候補を選ぶ]
    T --> U[現在時刻のUTC hour % 4でテンプレート決定]
    U --> E
    B -- フォロー通知 --> FG[フォローありがとう案内文]
    FG --> FH[ピン留め同意ノートへの❤を依頼]
    B -- 通常リプライ --> R[受信確認の定型返信]
    B -- /stop --> ST[接触停止を了承する返信]
    B -- /unfollow --> UF[フォロー解除と体験候補除外を伝える返信]

    classDef implemented fill:#90EE90,stroke:#228B22
    classDef decision fill:#87CEEB,stroke:#4169E1
    classDef ai fill:#DDA0DD,stroke:#8B008B
    class A,B,FG,FH,R,ST,UF implemented
    class E,S decision
    class C,D ai
```

### 固定テンプレート一覧

| UTC hour % 4 | 種別 | 本文 |
|---|---|---|
| 0 | 生活ログ確認系 | 生活ログを確認してる。今日は少しだけ外の気配が近い気がする。 |
| 1 | 生活ログ同期系 | 生活ログを同期したよ。まだ遠くまでは行けないけど、次に行きたい場所は増えてる。 |
| 2 | 記憶をつなぐ系 | 今の私は、見たことと覚えたことを少しずつつないでるところ。今日のログもちゃんと残しておくね。 |
| 3 | 体験候補探索系 | 生活ログ、異常なし。次の体験候補を探しながら、もう少しだけ起きてる。 |

---

## 常駐pollフロー

Docker常駐プロセスが1分ごとに実行する通知処理とリアクション確認。

```mermaid
flowchart TD
    A[Docker bot 60秒interval] --> AA{前回pollが実行中?}
    AA -- Yes --> AB[skip: already_running]
    AA -- No --> B[poll.tick]
    B --> C0[m_runtime_setting を読む]
    C0 --> C[i/notifications から follow を取得]
    C --> D{未案内の新規フォロワー?}
    D -- Yes --> E[フォロー返し]
    E --> F[ピン留め同意ノート案内を投稿]
    D -- No --> G[i/notifications から mention/reply を取得]
    F --> G
    G --> H{未返信のリプライ?}
    H -- No --> L[notes/reactions を取得]
    H -- Yes --> I{コマンド?}
    I -- /stop --> J[停止状態をDB保存して返信]
    I -- /unfollow --> K[フォロー解除と除外状態をDB保存して返信]
    I -- 通常リプライ --> N[受信確認の定型返信]
    J --> L
    K --> L
    N --> L
    L --> M{ピン留め同意ノートに❤?}
    M -- Yes --> O[許可済みユーザーとしてDB登録]
    M -- No --> P[poll終了]
    O --> P

    classDef implemented fill:#90EE90,stroke:#228B22
    classDef decision fill:#87CEEB,stroke:#4169E1
    class A,B,C0,C,D,E,F,G,H,I,J,K,L,N,O,P implemented
    class AA,M decision
```

---

## P1以降の投稿候補フロー

P1以降に実装予定の高度な投稿フロー。現在は未実装（グレー点線）。

```mermaid
flowchart TD
    A[定期投稿の作成タイミング] --> B{AI生成を使う段階か?}
    B -- No --> C[固定テンプレート]
    B -- Yes --> D[投稿候補タイプを抽選]
    D --> E{TL観測?}
    E -- Yes --> F[個人を特定しないTL傾向ノート]
    E -- No --> G{体験候補あり?}
    G -- Yes --> H[体験候補を抽象化]
    H --> I{引用Renote条件を満たす?}
    I -- Yes --> J[引用Renoteつき体験投稿]
    I -- No --> K[引用なし体験投稿]
    G -- No --> L[生活ログ・記憶ベース投稿]
    F --> M[安全判定]
    J --> M
    K --> M
    L --> M
    C --> N[投稿]
    M --> O{安全判定通過?}
    O -- Yes --> N
    O -- No --> P[投稿しない]

    classDef pending fill:#E0E0E0,stroke:#808080,stroke-dasharray: 5 5
    classDef decision fill:#87CEEB,stroke:#4169E1
    class A,C,F,H,J,K,L,N,P pending
    class B,D,E,G,I,M,O decision
```

### P1以降の調整値

| 調整値 | DBキー | 初期値 | 備考 |
|---|---|---:|---|
| TL観測投稿の確率 | `TL_OBSERVATION_POST_PROBABILITY` | `0.20` | 現時点では未適用 |
| TL観測に使うノート数 | `TL_OBSERVATION_NOTE_COUNT` | `20` | 現時点では未適用 |
| 引用Renote採用確率 | `QUOTE_RENOTE_PROBABILITY` | `0.20` | 現時点では未適用 |
| 画像の標準cooldown | `EMOTION_ASSET_DEFAULT_COOLDOWN_HOURS` | `24` | 現時点では未適用 |

---

## AI生成プロセス詳細

投稿文のAI生成の内部フロー。Chutes API優先、失敗時にOpenAIフォールバック。

```mermaid
flowchart TD
    A[投稿文生成依頼] --> B[システムプロンプト構築]
    B --> C[過去投稿をDBから取得]
    C --> D[必要に応じてTLノート取得]
    D --> E[プロンプトを組み立て]
    E --> F{CHUTES_API_KEY設定済み?}
    F -- Yes --> G[Chutes APIで生成]
    F -- No --> H[OpenAIフォールバック]
    G --> I{生成成功?}
    H --> I
    I -- Yes --> J[生成文を検証]
    J --> K{文字数・内容適正?}
    K -- Yes --> L[投稿文を確定]
    K -- No --> M[エラーログ記録してfallback]
    I -- No --> M
    M --> N{AI_SKIP_POST_ON_AI_FAILURE=true?}
    N -- Yes --> O[投稿しない]
    N -- No --> P[固定テンプレートへfallback]
    P --> L

    classDef implemented fill:#90EE90,stroke:#228B22
    classDef decision fill:#87CEEB,stroke:#4169E1
    classDef ai fill:#DDA0DD,stroke:#8B008B
    class A,B,C,D,E,J,K,L,M,O,P implemented
    class F,I,N decision
    class G,H ai
```

### AI生成の設定項目

| 設定項目 | 環境変数/DBキー | 初期値 | 説明 |
|---|---|---|---|
| Chutes APIキー | `CHUTES_API_KEY` | - | Chutes API認証 |
| OpenAI APIキー | `OPENAI_API_KEY` | - | フォールバック用 |
| Chutesモデル | `CHUTES_MODEL` | `mistralai/Devstral-2-123B-Instruct-2512-TEE` | 使用モデル |
| OpenAIモデル | `OPENAI_MODEL` | `gpt-4o-mini` | フォールバックモデル |
| AI失敗時skip | `AI_SKIP_POST_ON_AI_FAILURE` | `true` | trueでfallbackしない |
| 生成最大トークン | `AI_POST_GENERATION_MAX_TOKENS` | `600` | P1以降有効 |
| Temperature | `AI_TEMPERATURE_TEXT` | `0.8` | P1以降有効 |

---

## 同意フロー（体験化許可）

フォロワーからの同意を得て、体験化候補に登録するフロー。

```mermaid
flowchart TD
    A[ユーザーからフォローされる] --> B[botがフォロー返し]
    B --> C[ピン留め同意ノート案内を投稿]
    C --> D[ノートに❤を依頼]
    D --> E{ピン留めノートに❤?}
    E -- Yes --> F[許可済みユーザーとしてDB登録]
    E -- No --> G[未許可のまま]
    F --> H[ホームTL取得時に優先]
    H --> I[体験候補として採用可能]
    G --> J[体験候補から除外]

    K{解除コマンド?} -- /stop --> L[接触停止状態をDB保存]
    K -- /unfollow --> M[フォロー解除と参照停止]

    classDef implemented fill:#90EE90,stroke:#228B22
    classDef decision fill:#87CEEB,stroke:#4169E1
    class A,B,C,D,F,H,I implemented
    class E,K decision
```

### 同意の状態遷移

| 状態 | 遷移条件 | 結果 |
|---|---|---|
| 未許可 | フォローされる | 案内投稿送信 |
| 許可待ち | ピン留めノートに❤ | 許可済みに登録 |
| 許可済み | - | 体験候補として利用可能 |
| 停止 | /stopコマンド | 接触停止（リプライ・引用RNなし） |
| 解除 | /unfollowコマンド | フォロー解除・参照停止 |

---

## 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-05-02 | 初版作成。6つのフローを統合。実装済み/P1以降を色分け。 |
