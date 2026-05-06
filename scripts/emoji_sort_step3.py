from __future__ import annotations

import csv
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from emoji_sorter_common import (
    BK_DIR,
    ILLUST_BUCKET,
    ILLUST_TEXT_BUCKET,
    ImageItem,
    RANK_A_DIR,
    RANK_B_DIR,
    RANK_C_DIR,
    TEXT_BUCKET,
    TRUSH_DIR,
    BatchResult,
    ClassificationError,
    OpenAICompatibleVisionClient,
    ParseClassificationError,
    WORK_DIR_NAME,
    copy_relative_to_root,
    ensure_dir,
    iter_step3_candidates,
    parse_args_with_common_options,
    relocate_relative_to_root,
    require_api_key,
    write_text_log,
)


SYSTEM_PROMPT = """あなたは Misskey ボット「涼凪かなめ」のために、カスタム絵文字を用途別に選別するアシスタントです。

判定軸:
- 感情表現ができるか
- 感情が強い弱いではなく、感情・態度・反応として読めるか
- ノート本文で自然に使えるか
- リアクションとして自然に使えるか
- 攻撃的すぎないか

出力ラベル:
- rank-a: ノート本文にもリアクションにも使いやすい
- rank-b: ノート本文には使いやすいが、リアクションには向きにくい
- rank-c: リアクションには使いやすいが、ノート本文には向きにくい
- bk: 感情や態度よりも、情報表示、分類ラベル、UI、単なる物体説明の意味が強く、会話の反応として使いにくい
- trush: 攻撃的、内輪性が高すぎる、用途が狭すぎる、露骨、使いづらい、優先度が低い

補足:
- ネガティブや悲観的な感情は許容する。
- ただし攻撃・煽り・威圧・露骨な侮辱は trush。
- 無表情、虚無、真顔、脱力、しょんぼり、困り顔、じー、うーん、ぽけー などは、態度や温度感が読めるなら bk にしない。
- 「気持ち」でなくても「反応」として使えるなら bk ではない。
- 絵文字単体で返されたとき、相手が感情や温度感を読めるなら bk ではない。
- かなめがノート末尾や単独リアクションで使って不自然でないなら、bk ではなく rank-a/b/c のいずれかを優先する。
- 単なるロゴ、保存アイコン、数字札、記号札、状態表示、機能ボタン風、感情のない無機物だけは bk 寄り。
- CSV以外の文章は禁止。
"""

USER_PROMPT_TEMPLATE = """以下の画像を分類してください。

出力形式:
item_id,label,reason

label は rank-a / rank-b / rank-c / bk / trush のいずれかだけを使うこと。
reason は短い日本語でよい。
relative_path は出力しないこと。必ず item_id をそのまま返すこと。
"""


LABEL_TO_TARGET = {
    "rank-a": RANK_A_DIR,
    "rank-b": RANK_B_DIR,
    "rank-c": RANK_C_DIR,
    "bk": BK_DIR,
    "trush": TRUSH_DIR,
    "trash": TRUSH_DIR,
}

AUTO_BK_PREFIXES = (
    "50-work/text/GUI/",
    "50-work/illust-text/GUI/",
    "50-work/illust/GUI/",
    "50-work/text/Places/",
    "50-work/illust-text/Places/",
    "50-work/illust/Places/",
    "50-work/text/Verification/",
    "50-work/illust-text/Verification/",
    "50-work/illust/Verification/",
    "50-work/text/SCP/",
    "50-work/illust-text/SCP/",
    "50-work/illust/SCP/",
    "50-work/text/Symbols/",
    "50-work/illust-text/Symbols/",
    "50-work/illust/Symbols/",
)


@dataclass(frozen=True)
class ManifestRow:
    bucket_name: str
    batch_index: int
    item_index: int
    relative_path: str


def get_run_dir(images_root: Path, run_name: str) -> Path:
    return images_root / WORK_DIR_NAME / "_logs" / "step3" / run_name


def get_manifest_path(run_dir: Path) -> Path:
    return run_dir / "manifest.csv"


def get_batches_dir(run_dir: Path) -> Path:
    return run_dir / "batches"


def get_errors_dir(run_dir: Path) -> Path:
    return run_dir / "errors"


def get_batch_filename(bucket_name: str, batch_index: int) -> str:
    return f"step3-{bucket_name}-batch-{batch_index:04d}.csv"


def build_manifest(images_root: Path, run_dir: Path, batch_size: int, force: bool) -> list[ManifestRow]:
    manifest_path = get_manifest_path(run_dir)
    if manifest_path.exists() and not force:
        return load_manifest(manifest_path)

    rows: list[ManifestRow] = []
    for bucket_name in (TEXT_BUCKET, ILLUST_TEXT_BUCKET, ILLUST_BUCKET):
        items = list(iter_step3_candidates(images_root, bucket_name))
        for absolute_index, item in enumerate(items):
            batch_index = absolute_index // batch_size + 1
            item_index = absolute_index % batch_size + 1
            rows.append(
                ManifestRow(
                    bucket_name=bucket_name,
                    batch_index=batch_index,
                    item_index=item_index,
                    relative_path=item.relative_path.as_posix(),
                )
            )

    ensure_dir(run_dir)
    with manifest_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["bucket_name", "batch_index", "item_index", "relative_path"])
        for row in rows:
            writer.writerow([row.bucket_name, row.batch_index, row.item_index, row.relative_path])
    return rows


def load_manifest(manifest_path: Path) -> list[ManifestRow]:
    rows: list[ManifestRow] = []
    with manifest_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append(
                ManifestRow(
                    bucket_name=row["bucket_name"],
                    batch_index=int(row["batch_index"]),
                    item_index=int(row["item_index"]),
                    relative_path=row["relative_path"],
                )
            )
    return rows


def group_manifest_rows(rows: list[ManifestRow]) -> dict[tuple[str, int], list[ManifestRow]]:
    grouped: dict[tuple[str, int], list[ManifestRow]] = {}
    for row in rows:
        grouped.setdefault((row.bucket_name, row.batch_index), []).append(row)
    for batch_rows in grouped.values():
        batch_rows.sort(key=lambda row: row.item_index)
    return grouped


def write_batch_csv(path: Path, results: list[BatchResult]) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["relative_path", "label", "reason"])
        for row in results:
            writer.writerow([row.relative_path, row.label, row.reason])


def should_auto_bk(relative_path: str) -> str | None:
    normalized = relative_path.replace("\\", "/")
    for prefix in AUTO_BK_PREFIXES:
        if normalized.startswith(prefix):
            return "情報・記号系"
    return None


def classify_single_batch(
    *,
    images_root: Path,
    batch_rows: list[ManifestRow],
    api_key: str,
    base_url: str,
    primary_model: str,
    fallback_model: str,
    request_image_limit: int,
    pause_seconds: float,
    timeout_seconds: int,
    max_retries: int,
    verbose: bool,
) -> list[BatchResult]:
    auto_results: list[BatchResult] = []
    ai_items: list[ImageItem] = []

    for row in batch_rows:
        auto_reason = should_auto_bk(row.relative_path)
        if auto_reason:
            auto_results.append(BatchResult(relative_path=row.relative_path, label="bk", reason=auto_reason))
            continue

        path = images_root / row.relative_path
        if not path.exists():
            raise ClassificationError(f"分類対象が存在しません: {row.relative_path}")
        ai_items.append(ImageItem(path=path, relative_path=Path(row.relative_path)))

    if not ai_items:
        return auto_results

    client = OpenAICompatibleVisionClient(
        api_key=api_key,
        base_url=base_url,
        primary_model=primary_model,
        fallback_model=fallback_model,
        timeout_seconds=timeout_seconds,
        pause_seconds=pause_seconds,
        max_retries=max_retries,
        verbose=verbose,
    )
    ai_results = client.classify_batch_in_chunks(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=USER_PROMPT_TEMPLATE,
        items=ai_items,
        max_images_per_request=request_image_limit,
        expected_headers=["item_id", "label", "reason"],
    )

    result_map = {result.relative_path: result for result in auto_results}
    for result in ai_results:
        result_map[result.relative_path] = result
    return [result_map[row.relative_path] for row in batch_rows]


def read_batch_csv(path: Path) -> list[BatchResult]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return [
            BatchResult(
                relative_path=row["relative_path"],
                label=normalize_step3_label(row["label"]),
                reason=row.get("reason", ""),
            )
            for row in reader
        ]


def normalize_step3_label(label: str) -> str:
    normalized = label.strip().lower()
    if normalized == "trash":
        return "trush"
    if normalized == "a":
        return "rank-a"
    if normalized == "b":
        return "rank-b"
    if normalized == "c":
        return "rank-c"
    return normalized


def apply_single_result(images_root: Path, result: BatchResult, dry_run: bool, verbose: bool) -> str:
    target = LABEL_TO_TARGET.get(result.label)
    if not target:
        raise ClassificationError(f"未知の label: {result.label}")

    src = images_root / result.relative_path
    work_root = images_root / WORK_DIR_NAME
    rel_under_work = Path(result.relative_path).relative_to(WORK_DIR_NAME)
    dst = images_root / target / rel_under_work

    if result.label in {"rank-a", "rank-b", "rank-c"}:
        if dst.exists():
            return "already_applied"
        if not src.exists():
            return "missing"
        final_path = copy_relative_to_root(src, src_root=work_root, dst_root=images_root / target, dry_run=dry_run)
        if verbose:
            print(f"{result.relative_path} -> {final_path.relative_to(images_root).as_posix()} [{result.reason}]")
        return "copied"

    if src.exists():
        final_path = relocate_relative_to_root(src, src_root=work_root, dst_root=images_root / target, dry_run=dry_run)
        if verbose:
            print(f"{result.relative_path} -> {final_path.relative_to(images_root).as_posix()} [{result.reason}]")
        return "moved"
    if dst.exists():
        return "already_applied"
    return "missing"


def run_classify(args) -> int:
    api_key = require_api_key(args.api_key)
    run_dir = get_run_dir(args.images_root, args.run_name)
    manifest_rows = build_manifest(args.images_root, run_dir, args.batch_size, force=args.rebuild_manifest)
    if not manifest_rows:
        print("step3 classify: 対象ファイルはありません。")
        return 0

    grouped = group_manifest_rows(manifest_rows)
    batches_dir = get_batches_dir(run_dir)
    errors_dir = get_errors_dir(run_dir)
    ensure_dir(batches_dir)
    ensure_dir(errors_dir)

    pending_keys = [
        key for key in sorted(grouped)
        if not (batches_dir / get_batch_filename(key[0], key[1])).exists()
    ]
    if not pending_keys:
        print(f"step3 classify: 未処理バッチはありません run={run_dir}")
        return 0

    summary = {
        "run_name": args.run_name,
        "batch_size": args.batch_size,
        "request_image_limit": args.request_image_limit,
        "workers": args.workers,
        "total_batches": len(grouped),
        "pending_batches": len(pending_keys),
    }
    write_text_log(run_dir / "summary.json", json.dumps(summary, ensure_ascii=False, indent=2))

    completed = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_map = {
            executor.submit(
                classify_single_batch,
                images_root=args.images_root,
                batch_rows=grouped[key],
                api_key=api_key,
                base_url=args.base_url,
                primary_model=args.primary_model,
                fallback_model=args.fallback_model,
                request_image_limit=args.request_image_limit,
                pause_seconds=args.pause_seconds,
                timeout_seconds=args.timeout_seconds,
                max_retries=args.max_retries,
                verbose=args.verbose,
            ): key
            for key in pending_keys
        }

        for future in as_completed(future_map):
            bucket_name, batch_index = future_map[future]
            batch_path = batches_dir / get_batch_filename(bucket_name, batch_index)
            try:
                results = future.result()
                write_batch_csv(batch_path, results)
                completed += 1
                print(
                    f"step3 classify bucket={bucket_name} batch={batch_index} items={len(grouped[(bucket_name, batch_index)])} "
                    f"done={completed}/{len(pending_keys)} csv={batch_path.relative_to(args.images_root).as_posix()}"
                )
            except ParseClassificationError as exc:
                write_text_log(errors_dir / f"step3-{bucket_name}-batch-{batch_index:04d}.raw.txt", exc.raw_response)
                write_text_log(errors_dir / f"step3-{bucket_name}-batch-{batch_index:04d}.error.txt", str(exc))
                raise
            except Exception as exc:  # noqa: BLE001
                write_text_log(errors_dir / f"step3-{bucket_name}-batch-{batch_index:04d}.error.txt", str(exc))
                raise
    return 0


def run_apply(args) -> int:
    run_dir = get_run_dir(args.images_root, args.run_name)
    manifest_path = get_manifest_path(run_dir)
    if not manifest_path.exists():
        raise ClassificationError(f"manifest がありません: {manifest_path}")

    grouped = group_manifest_rows(load_manifest(manifest_path))
    batches_dir = get_batches_dir(run_dir)

    copied = 0
    moved = 0
    already_applied = 0
    missing = 0

    for key in sorted(grouped):
        bucket_name, batch_index = key
        batch_path = batches_dir / get_batch_filename(bucket_name, batch_index)
        if not batch_path.exists():
            if args.skip_missing_batches:
                continue
            raise ClassificationError(f"未分類バッチが残っています: {batch_path}")
        results = read_batch_csv(batch_path)
        for result in results:
            state = apply_single_result(args.images_root, result, dry_run=args.dry_run, verbose=args.verbose)
            if state == "copied":
                copied += 1
            elif state == "moved":
                moved += 1
            elif state == "already_applied":
                already_applied += 1
            else:
                missing += 1

    print(
        f"step3 apply copied={copied} moved={moved} already_applied={already_applied} "
        f"missing={missing} run={run_dir}"
    )
    return 0


def main() -> int:
    parser = parse_args_with_common_options(
        "Step3: 50-work/text, illust-text, illust を rank-a / rank-b / rank-c / 99-bk / 90-trush に再開可能な形で分類します。"
    )
    parser.add_argument("--mode", choices=["classify", "apply", "all"], default="classify")
    parser.add_argument("--run-name", default="current")
    parser.add_argument("--rebuild-manifest", action="store_true")
    parser.add_argument("--skip-missing-batches", action="store_true")
    parser.add_argument("--api-key")
    parser.add_argument("--base-url", default="https://llm.chutes.ai/v1")
    parser.add_argument("--primary-model", default="google/gemma-4-31B-turbo-TEE")
    parser.add_argument("--fallback-model", default="Qwen/Qwen2.5-VL-32B-Instruct")
    parser.add_argument("--batch-size", type=int, default=12)
    parser.add_argument("--request-image-limit", type=int, default=4)
    parser.add_argument("--pause-seconds", type=float, default=1.0)
    parser.add_argument("--timeout-seconds", type=int, default=180)
    parser.add_argument("--max-retries", type=int, default=3)
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()

    if args.workers <= 0:
        raise ClassificationError("--workers は 1 以上にしてください。")

    if args.mode in {"classify", "all"}:
        run_classify(args)
    if args.mode in {"apply", "all"}:
        run_apply(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
