# 行動フロー全体図

## 5分 post-draw（行動ガチャ）

3フェーズ構成：**⑴ガチャ → ⑵取得 → ⑶AI生成・投稿**

- **⑴ガチャ** : `random()` 呼び出しと DB 読み取りによる行動決定。外部APIは呼ばない。
- **⑵取得** : 決定した行動に必要な Misskey API 読み取りと AI 安全分類。
- **⑶AI生成・投稿** : AI によるテキスト生成と Misskey への投稿書き込み。

TL観測ガチャが当たった場合は通常ノートパスへは**絶対に落ちない**。

```mermaid
flowchart TD
    START([5分tick]) --> EN{posting\nenabled?}
    EN -- No --> SK0[skip: disabled]
    EN -- Yes --> P1

    subgraph P1["⑴ ガチャ：行動を決める（random / DB読み取りのみ）"]
        G1{"TL観測ガチャ\nrandom &lt; 0.20?"}
        G1 -- "当たり 20%" --> G2{"引用RNガチャ\nrandom &lt; 0.20?"}
        G2 -- "当たり 20%" --> ACT_Q(["action = quote_rn"])
        G2 -- "外れ 80%" --> ACT_T(["action = tl_obs"])
        G1 -- "外れ 80%" --> GN1["DB: 直近 normal 投稿\n経過時間を算出"]
        GN1 --> GN2{最短間隔\n経過?}
        GN2 -- No --> SK1[skip: min_interval]
        GN2 -- Yes --> GN3{"確率テーブル\n5分:10% 10分:15%\n30分:80% 60分:95%\nrandom &lt; prob?"}
        GN3 -- 外れ --> SK2[skip: probability]
        GN3 -- 当たり --> ACT_N(["action = normal"])
    end

    subgraph P2["⑵ 取得：action に応じた Misskey API 読み取り ＋ AI 安全分類"]
        ACT_Q --> FQ1["Misskey: notes/timeline 20件\nCW / renote / 空テキスト 除外\n→ summaries を保持"]
        FQ1 --> FQ2["DB: 許可済みユーザー取得\nMisskey: users/notes 20件 × 最大5人\n構造フィルタ ＋ 1週間フィルタ"]
        FQ2 --> FQ3["AI 安全分類\nclassify-quote-safety\nOK / NG"]
        FQ3 --> FQ4{安全な候補\nあり?}
        FQ4 -- Yes --> RQ(["result: candidate + summaries"])
        FQ4 -- No --> FQ5{summaries\n≥ 3件?}
        FQ5 -- No --> SK3[skip: too_few_summaries]
        FQ5 -- Yes --> RT1(["result: summaries のみ"])

        ACT_T --> FT1["Misskey: notes/timeline 20件\nCW / renote / 空テキスト 除外"]
        FT1 --> FT2{summaries\n≥ 3件?}
        FT2 -- No --> SK4[skip: too_few_summaries]
        FT2 -- Yes --> RT2(["result: summaries"])

        ACT_N --> FN1["DB: 過去投稿 60日\ntiered SQL（直近7日全量 / 〜30日3件おき / 〜60日10件おき）\nDB: source_notes 10件"]
        FN1 --> RN(["result: pastPosts + tlNotes"])
    end

    subgraph P3["⑶ AI生成・投稿（AI テキスト生成 ＋ Misskey 書き込み）"]
        RQ --> GQ["AI: 引用コメント生成\ngenerate-quote-post\n1〜2文"]
        GQ -- 成功 --> PQ[["投稿: quote_renote\nkind = 'quote_renote'"]]
        GQ -- 失敗 --> GT

        RT1 --> GT["AI: TL観測テキスト生成\ngenerate-tl-post"]
        RT2 --> GT
        GT -- 成功 --> PT[["投稿: tl_observation\nkind = 'tl_observation'"]]
        GT -- 失敗 --> SK5[skip: ai_failure\n※通常ノートへは落ちない]

        RN --> GN["AI: 通常ノート生成\ngenerate-post\nAI 失敗 → fallback テンプレート"]
        GN --> PN[["投稿: normal\nkind = 'normal'\nlast_note_at 更新"]]
    end
```

### 確率サマリー（5分 tick あたり）

| 行動 | 確率 | 条件 |
|---|---|---|
| quote_renote 投稿 | 最大 4% | TL obs 20% × 引用RN 20% × 候補あり × 安全OK |
| tl_observation 投稿 | 最大 16% | TL obs 20% × 引用RN 外れ（またはフォールバック） × summaries ≥ 3 × AI 成功 |
| normal 投稿 | 経過時間依存 | TL obs 外れ 80% × min_interval 経過 × 確率テーブル当たり |
| skip | 上記以外 | disabled / min_interval / probability / too_few / ai_failure |

> TL 観測ガチャが当たった場合、通常ノートパスへは**絶対に落ちない**。
> quote_rn で候補が見つからない場合は tl_obs テキストへフォールバックする。
> tl_obs テキストの AI 失敗は skip であり、通常ノートへは落ちない。

---

## 1分 polling

```mermaid
flowchart TD
    PTICK([1分tick]) --> PF

    PF["フォロー通知確認\ni/notifications type=follow"]
    PF --> PFCHK{"未処理フォローあり?\n（consent_guides 未記録）"}
    PFCHK -- No --> PR
    PFCHK -- Yes --> PFACT["フォロー返し\n同意案内ノート投稿\nconsent_guides 記録\nexperience_source_consents 更新"]
    PFACT --> PR

    PR["リプライ/メンション確認\ni/notifications type=reply,mention"]
    PR --> PRCHK{"未処理あり?\n（reply_logs 未記録）"}
    PRCHK -- No --> PC
    PRCHK -- Yes --> PRCMD{"/stop or /unfollow?"}
    PRCMD -- /stop --> PRSTOP["consent_status = 'stopped'\n返信ノート投稿\nreply_logs 記録"]
    PRCMD -- /unfollow --> PRUF["フォロー解除\nconsent_status = 'unfollowed'\n返信ノート投稿\nreply_logs 記録"]
    PRCMD -- その他 --> PRSKIP[skip: no_command]
    PRSTOP & PRUF & PRSKIP --> PC

    PC["❤リアクション確認\nnotes/reactions（ピン留め同意ノート）"]
    PC --> PCCHK{"新規❤あり?\n（未 consented）"}
    PCCHK -- No --> PEND([終了])
    PCCHK -- Yes --> PCACT["consent_status = 'consented'\nexperience_source_consents 更新"]
    PCACT --> PEND
```
