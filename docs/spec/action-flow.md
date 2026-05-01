# 行動フロー全体図

## 5分 post-draw（行動ガチャ）

```mermaid
flowchart TD
    START([5分tick]) --> EN{SCHEDULED_POSTING\n_ENABLED?}
    EN -- false --> SK0[skip: disabled]
    EN -- true --> TLG

    TLG{"TL観測ガチャ\nrandom &lt; 0.20?"}
    TLG -- "外れ 80%" --> NP_START
    TLG -- "当たり 20%" --> SCAN

    SCAN["TLスキャン\nnotes/timeline 20件取得\nCW / renote / 空テキスト除外\nsource_notes 保存"]
    SCAN --> CHKSM{"summaries ≥ 3件?"}
    CHKSM -- No --> NP_START
    CHKSM -- Yes --> QRG

    QRG{"引用RNガチャ\nrandom &lt; 0.20?"}
    QRG -- "外れ 80%" --> TLGEN
    QRG -- "当たり 20%" --> QPICK

    QPICK["許可済みユーザー抽選\n最大5人 × users/notes 20件\n構造フィルタ（CW/reply/renote）\n1週間超 → 除外"]
    QPICK --> QFLT{"適切なノートあり?"}
    QFLT -- No --> TLGEN
    QFLT -- Yes --> QSAFE

    QSAFE["AI安全判定\nclassify-quote-safety\nOK / NG"]
    QSAFE -- "全件 NG" --> TLGEN
    QSAFE -- OK --> QGEN

    QGEN["引用コメント生成\ngenerate-quote-post\n1〜2文"]
    QGEN -- "AI失敗" --> TLGEN
    QGEN -- "AI成功" --> QPOST[["投稿 quote_renote\nposts.kind = 'quote_renote'"]]

    TLGEN["TL観測テキスト生成\ngenerate-tl-post"]
    TLGEN -- "AI失敗" --> NP_START
    TLGEN -- "AI成功" --> TLPOST[["投稿 tl_observation\nposts.kind = 'tl_observation'"]]

    NP_START{"直近 normal から\n最短間隔経過?"}
    NP_START -- No --> SK1[skip: min_interval]
    NP_START -- Yes --> NP_PROB

    NP_PROB{"経過時間確率テーブル\n5分: 10%\n10分: 15%\n30分: 80%\n60分: 95%"}
    NP_PROB -- 外れ --> SK2[skip: probability]
    NP_PROB -- 当たり --> NPGEN

    NPGEN["通常ノート生成\ngenerate-post\nAI → fallbackテンプレート"]
    NPGEN --> NPPOST[["投稿 normal\nposts.kind = 'normal'\nlast_note_at 更新"]]
```

### 確率サマリー（5分tickあたり）

| 行動 | 確率 |
|---|---|
| skip: disabled / min_interval / probability | 状況による |
| 通常ノート投稿 | TL観測外れ（80%）× 経過時間確率 |
| TL観測テキスト投稿 | 16%（= 20% × 80%）|
| 引用RN投稿 | 最大4%（= 20% × 20%）、候補・安全判定次第で減少 |

---

## 1分 polling

```mermaid
flowchart TD
    PTICK([1分tick]) --> PF

    PF["フォロー通知確認\ni/notifications type=follow"]
    PF --> PFCHK{"未処理フォローあり?\n（consent_guides未記録）"}
    PFCHK -- No --> PR
    PFCHK -- Yes --> PFACT["フォロー返し\n同意案内ノート投稿\nconsent_guides 記録\nexperience_source_consents 更新"]
    PFACT --> PR

    PR["リプライ/メンション確認\ni/notifications type=reply,mention"]
    PR --> PRCHK{"未処理あり?\n（reply_logs未記録）"}
    PRCHK -- No --> PC
    PRCHK -- Yes --> PRCMD{"/stop\nor /unfollow?"}
    PRCMD -- /stop --> PRSTOP["停止処理\nconsent_status='stopped'\n返信ノート投稿\nreply_logs 記録"]
    PRCMD -- /unfollow --> PRUF["フォロー解除\nconsent_status='unfollowed'\n返信ノート投稿\nreply_logs 記録"]
    PRCMD -- "その他" --> PRSKIP[skip: no_command]
    PRSTOP --> PC
    PRUF --> PC
    PRSKIP --> PC

    PC["❤リアクション確認\nnotes/reactions\nピン留め同意ノート"]
    PC --> PCCHK{"新規❤あり?\n（未 consented）"}
    PCCHK -- No --> PEND([終了])
    PCCHK -- Yes --> PCACT["consent_status='consented'\nexperience_source_consents 更新"]
    PCACT --> PEND
```

---

## fall-through の連鎖

```mermaid
flowchart LR
    Q[引用RN失敗] --> T[TL観測テキスト]
    T2[TL観測スキャン不足] --> N[通常ノート抽選]
    T --> |AI失敗| N
```

引用RNが失敗した場合はTL観測テキストへ、TL観測テキストも失敗・スキャン不足なら通常ノート抽選へと連鎖する。
