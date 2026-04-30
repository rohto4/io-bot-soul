# Emotion Assets

## 目的

`images/` 配下のエモーション画像を、適切なタイミングでノートに添付する。

この機能はP1/P2扱いとし、MVPのテキスト投稿実装を妨げない。

## 素材ディレクトリ

- `images/`

現時点の素材:

- PNG: 500x500、11枚
- GIF: 112x112、3枚
- Header画像: `涼凪かなめ_header1.png`

## 基本方針

- 投稿本文のemotion、post kind、イベント文脈に応じて画像を選ぶ。
- AIに画像ファイルを直接選ばせない。AIはemotionや用途を返し、ロジックがマスタから画像を選ぶ。
- 画像添付は任意。画像がなくても投稿できる。
- 同じ画像を短期間に連続使用しない。
- 引用Renoteやリプライでは、画像添付を控えめにする。
- 季節イベントや「オーナーと行った体」の投稿では、適切な画像がある場合に添付してよい。

## 添付してよいタイミング

- おはよう / おやすみ。
- TL観測の感情が強い時。
- 体験投稿で、感情やイベントが明確な時。
- 季節イベント、記念日、花火、外出、食べ物、作業達成など。
- 「私えらいので〜」系の軽い自己肯定投稿。

## 添付しない方がよいタイミング

- `/stop` `/unfollow` などの制御応答。
- 謝罪、訂正、注意喚起。
- 引用Renote対象がセンシティブ寄り、重い、文脈が複雑な時。
- リプライで相手の話題を受けるだけの時。
- rate limitに近い時。

## 選択ロジック

1. 投稿候補に `emotion`、`post_kind`、`event_tag` を付ける。
2. `m_emotion_asset` から一致する候補を探す。
3. 直近使用履歴を確認する。
4. 添付確率を計算する。
5. 選ばれた画像をMisskey Driveへuploadする。
6. `notes/create` に `fileIds` を付けて投稿する。
7. `post_assets` に使用履歴を保存する。

## 初期添付確率

- `morning`: 20%
- `night`: 15%
- `sleep_talk`: 10%
- `tl_observation`: 10%
- `experience`: 20%
- `normal`: 8%
- `reply`: 3%
- `reaction_note`: 5%
- `event`: 40%

## AI判定との境界

AIが返してよいもの:

- `emotion`
- `event_tag`
- `asset_hint`
- 添付した方が自然かどうかの軽い提案

AIに任せないもの:

- ファイルパスの直接選択
- 同じ画像の連続使用判定
- Drive upload判断
- 添付してよいかの最終判定

## マスタ案

### `m_emotion_asset`

- `asset_key`
- `file_path`
- `asset_type`
- `emotion`
- `post_kind`
- `event_tag`
- `priority`
- `enabled`
- `cooldown_hours`
- `description`

### `post_assets`

- `id`
- `post_note_id`
- `asset_key`
- `drive_file_id`
- `attached_at`
- `reason`

## 未決

- 各画像のemotionラベル。
- GIFを通常投稿で使う頻度。
- Header画像をプロフィール/ヘッダー専用にするか、投稿にも使うか。
- Misskey Driveへの事前upload方式にするか、投稿時upload方式にするか。
