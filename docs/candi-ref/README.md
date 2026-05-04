# Candidate Reference

`docs/candi-ref/` は、**候補案・比較中の案・未採用案・調査メモ**を置く。

## 置くもの

- まだ採用していない設計案。
- 採用するか判断中の比較・調査。
- 将来実装するかもしれない候補。
- 採用済み仕様から外したが、履歴として残したい案。

## 置かないもの

- 確定仕様 → `docs/spec/`
- 採用済みの運用手順 → `docs/guide/`
- 実装待ちタスク → `docs/imp/imp-tasks.md`
- ユーザー判断待ち → `docs/imp/user-judge.md`
- セッション記録 → `docs/diary/`

## ファイル構成

- [候補リファレンス概要](candi-ref-summary.md)
- [BOT挙動の実装候補](bot-behavior-candidates.md)

## 運用

- `docs/candi-ref/` 直下は最大10ファイル程度に収める。
- 採用が決まった内容は `docs/spec/` または `docs/guide/` に移す。
- 実装することが決まった作業は `docs/imp/imp-tasks.md` に落とす。
- ユーザー判断が必要なものは `docs/imp/user-judge.md` に置く。

