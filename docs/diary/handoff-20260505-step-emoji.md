# 2026-05-05 カスタム絵文字分類 handoff

## 目的

Misskey bot「涼凪かなめ」が使うカスタム絵文字を、次の2段階で選別する作業を進めている。

1. `Step2`: `50-work` 内の画像を `text` / `illust-text` / `illust` に一次振り分け
2. `Step3`: 一次振り分け済みの画像を `1-rank-a` / `2-rank-b` / `3-rank-c` / `99-bk` / `90-trush` に用途分類

このファイルは、作業経緯・現状・再開方法をまとめた引き継ぎ用メモである。

## 現状サマリ

- `Step1` 完了済み
  - 静止画は `data/images/50-work`
  - アニメーションは `data/images/4_rank-d`
- `Step2` 完了済み
  - `apply` 済み
  - 一次振り分け先:
    - `data/images/50-work/text`
    - `data/images/50-work/illust-text`
    - `data/images/50-work/illust`
- `Step3` は未実行
  - ただし節約版スクリプトへ更新済み

## 今回使っているスクリプト

- `scripts/emoji_sort_step1.py`
- `scripts/emoji_sort_step2.py`
- `scripts/emoji_sort_step2_merge.py`
- `scripts/emoji_sort_step3.py`
- `scripts/emoji_sorter_common.py`

## Step2 でやったこと

### 旧方式

最初は旧方式で途中まで実行した。

- 旧CSV:
  - `data/images/50-work/_logs/step2/step2-batch-0001.csv` 〜 `step2-batch-0182.csv`
- 旧方式の失敗記録:
  - `data/images/50-work/_logs/step2/step2-batch-0183.error.txt`

### 新方式

その後、`classify/apply` 分離・manifest 方式・再開可能構成に切り替えた。

- run名:
  - `resume-20260505`
- classify 結果:
  - `data/images/50-work/_logs/step2/resume-20260505/batches`
- エラー記録:
  - `data/images/50-work/_logs/step2/resume-20260505/errors`
  - 例: `step2-batch-0491.error.txt`

途中で `step2-batch-0491.error.txt` などの失敗記録は出たが、最終的に対応する `.csv` が作成されているため、結果として回収済み。

## Step2 の最終成果物

### 新方式分のみ

- `data/images/50-work/_logs/step2/resume-20260505/step2-merged.csv`
- 件数: `8220`

### 旧方式 + 新方式の全体統合

- `data/images/50-work/_logs/step2/resume-20260505/step2-merged-all.csv`
- 件数: `10404`
- 内訳:
  - `text=7129`
  - `illust-text=1004`
  - `illust=2271`

## Step2 の実行コマンド履歴

### 旧方式から新方式への移行後に使ったもの

classify:

```bash
python scripts/emoji_sort_step2.py --mode classify --run-name resume-20260505 --batch-size 12 --request-image-limit 4 --workers 5 --pause-seconds 1.0
```

apply:

```bash
python scripts/emoji_sort_step2.py --mode apply --run-name resume-20260505
```

merge:

```bash
python scripts/emoji_sort_step2_merge.py --run-name resume-20260505
python scripts/emoji_sort_step2_merge.py --run-name resume-20260505 --include-legacy
```

## Step2 再開時の注意

- `resume-20260505` を再開するときに `--rebuild-manifest` を付けないこと
- `--rebuild-manifest` を付けると、既存 run の batch 番号と manifest がずれる
- `Step2` はすでに完了済みなので、通常は再開不要

## Step3 の現状

### 実装方針

`Step3` も `Step2` と同様に次の構成へ変更済み。

- `classify` / `apply` 分離
- `run-name` 単位の manifest 管理
- batch CSV による再開可能構成
- `workers` による並列 classify

### Quota 節約対応

次のプレフィックス配下は AI に投げず、自動的に `bk` として扱う。

- `GUI`
- `Places`
- `Verification`
- `SCP`
- `Symbols`

これにより、`Step3` の AI 対象を一部削減している。

### Step3 の想定コスト

現状の見積もり:

- 総対象: `10444`
- 自動 `bk`: `211`
- AI 対象: `10233`
- 想定問い合わせ回数: 約 `2560`

補足:

- `request-image-limit=4` が実際の問い合わせ回数を決める
- `batch-size=12` を増やしても Quota Usage はほぼ減らない
- Quota を減らしたいなら、自動 `bk` 対象を増やす方向が有効

## Step3 を最初から実行する手順

初回 classify:

```bash
python scripts/emoji_sort_step3.py --mode classify --run-name step3-20260505 --rebuild-manifest --batch-size 12 --request-image-limit 4 --workers 3 --pause-seconds 1.0
```

apply:

```bash
python scripts/emoji_sort_step3.py --mode apply --run-name step3-20260505
```

## Step3 再開手順

初回実行後に途中中断した場合は、同じ `run-name` で `--rebuild-manifest` を外して再開する。

```bash
python scripts/emoji_sort_step3.py --mode classify --run-name step3-20260505 --batch-size 12 --request-image-limit 4 --workers 3 --pause-seconds 1.0
```

再開時の注意:

- `--rebuild-manifest` は初回のみ
- 2回目以降は付けない

## もし最初から全部やり直す場合の手順

### Step1

```bash
python scripts/emoji_sort_step1.py
```

### Step2

classify:

```bash
python scripts/emoji_sort_step2.py --mode classify --run-name resume-20260505 --rebuild-manifest --batch-size 12 --request-image-limit 4 --workers 3 --pause-seconds 1.0
```

apply:

```bash
python scripts/emoji_sort_step2.py --mode apply --run-name resume-20260505
```

merge:

```bash
python scripts/emoji_sort_step2_merge.py --run-name resume-20260505
python scripts/emoji_sort_step2_merge.py --run-name resume-20260505 --include-legacy
```

### Step3

classify:

```bash
python scripts/emoji_sort_step3.py --mode classify --run-name step3-20260505 --rebuild-manifest --batch-size 12 --request-image-limit 4 --workers 3 --pause-seconds 1.0
```

apply:

```bash
python scripts/emoji_sort_step3.py --mode apply --run-name step3-20260505
```

## 今見るべきファイル

- `data/images/50-work/_logs/step2/resume-20260505/step2-merged.csv`
- `data/images/50-work/_logs/step2/resume-20260505/step2-merged-all.csv`
- `scripts/emoji_sort_step3.py`

## 中断時点の判断

- `Step2` は終わっている
- `Step3` は明日まとめて実行する前提
- Quota Usage を見る限り、`Step3` は 1日3000 回まで使えるなら 1日で完了見込み
- 今日 1000 回に抑えるなら 2日運用になる
