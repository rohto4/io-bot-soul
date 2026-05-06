from __future__ import annotations

import csv
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path

from emoji_sorter_common import (
    BatchResult,
    ClassificationError,
    ImageItem,
    OpenAICompatibleVisionClient,
    ParseClassificationError,
    STEP2_BUCKETS,
    WORK_DIR_NAME,
    ensure_dir,
    iter_step2_candidates,
    parse_args_with_common_options,
    relocate_relative_to_root,
    require_api_key,
    write_text_log,
)


SYSTEM_PROMPT = """あなたは Misskey.io のカスタム絵文字分類アシスタントです。

目的は、絵文字を次の3種類へ厳密に分けることです。
- text: 文字だけで意味や感情を伝えるもの。文字主体。記号やタイポグラフィのみも含む。
- illust-text: 絵と文字の両方があり、どちらも意味理解に必要なもの。
- illust: 絵だけで意味や感情を伝えるもの。顔、人物、動物、物体、記号化イラストを含む。

判定ルール:
- 見た目優先で判定し、ファイル名の意味に引っ張られすぎない。
- 余計な説明文は禁止。CSVのみ返す。
"""

USER_PROMPT_TEMPLATE = """以下の画像を分類してください。

出力形式:
item_id,label,reason

label は text / illust-text / illust のいずれかだけを使うこと。
reason は10文字程度の短い日本語でよい。
relative_path は出力しないこと。必ず item_id をそのまま返すこと。
"""


@dataclass(frozen=True)
class ManifestRow:
    batch_index: int
    item_index: int
    relative_path: str


def get_run_dir(images_root: Path, run_name: str) -> Path:
    return images_root / WORK_DIR_NAME / "_logs" / "step2" / run_name


def get_manifest_path(run_dir: Path) -> Path:
    return run_dir / "manifest.csv"


def get_batches_dir(run_dir: Path) -> Path:
    return run_dir / "batches"


def get_errors_dir(run_dir: Path) -> Path:
    return run_dir / "errors"


def build_manifest(images_root: Path, run_dir: Path, batch_size: int, force: bool) -> list[ManifestRow]:
    manifest_path = get_manifest_path(run_dir)
    if manifest_path.exists() and not force:
        return load_manifest(manifest_path)

    items = list(iter_step2_candidates(images_root))
    rows: list[ManifestRow] = []
    for absolute_index, item in enumerate(items):
        batch_index = absolute_index // batch_size + 1
        item_index = absolute_index % batch_size + 1
        rows.append(
            ManifestRow(
                batch_index=batch_index,
                item_index=item_index,
                relative_path=item.relative_path.as_posix(),
            )
        )

    ensure_dir(run_dir)
    with manifest_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["batch_index", "item_index", "relative_path"])
        for row in rows:
            writer.writerow([row.batch_index, row.item_index, row.relative_path])
    return rows


def load_manifest(manifest_path: Path) -> list[ManifestRow]:
    rows: list[ManifestRow] = []
    with manifest_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append(
                ManifestRow(
                    batch_index=int(row["batch_index"]),
                    item_index=int(row["item_index"]),
                    relative_path=row["relative_path"],
                )
            )
    return rows


def group_manifest_rows(rows: list[ManifestRow]) -> dict[int, list[ManifestRow]]:
    grouped: dict[int, list[ManifestRow]] = {}
    for row in rows:
        grouped.setdefault(row.batch_index, []).append(row)
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


def read_batch_csv(path: Path) -> list[BatchResult]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return [
            BatchResult(
                relative_path=row["relative_path"],
                label=row["label"],
                reason=row.get("reason", ""),
            )
            for row in reader
        ]


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
    items = []
    for row in batch_rows:
        path = images_root / row.relative_path
        if not path.exists():
            raise ClassificationError(f"分類対象が存在しません: {row.relative_path}")
        items.append(ImageItem(path=path, relative_path=Path(row.relative_path)))

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
    return client.classify_batch_in_chunks(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=USER_PROMPT_TEMPLATE,
        items=items,
        max_images_per_request=request_image_limit,
        expected_headers=["item_id", "label", "reason"],
    )


def run_classify(args) -> int:
    api_key = require_api_key(args.api_key)
    run_dir = get_run_dir(args.images_root, args.run_name)
    manifest_rows = build_manifest(args.images_root, run_dir, args.batch_size, force=args.rebuild_manifest)
    if not manifest_rows:
        print("step2 classify: 対象ファイルはありません。")
        return 0

    grouped = group_manifest_rows(manifest_rows)
    batches_dir = get_batches_dir(run_dir)
    errors_dir = get_errors_dir(run_dir)
    ensure_dir(batches_dir)
    ensure_dir(errors_dir)

    pending_batch_indexes = [
        batch_index for batch_index in sorted(grouped)
        if not (batches_dir / f"step2-batch-{batch_index:04d}.csv").exists()
    ]
    if not pending_batch_indexes:
        print(f"step2 classify: 未処理バッチはありません run={run_dir}")
        return 0

    summary = {
        "run_name": args.run_name,
        "batch_size": args.batch_size,
        "request_image_limit": args.request_image_limit,
        "workers": args.workers,
        "total_batches": len(grouped),
        "pending_batches": len(pending_batch_indexes),
    }
    write_text_log(run_dir / "summary.json", json.dumps(summary, ensure_ascii=False, indent=2))

    completed = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_map = {
            executor.submit(
                classify_single_batch,
                images_root=args.images_root,
                batch_rows=grouped[batch_index],
                api_key=api_key,
                base_url=args.base_url,
                primary_model=args.primary_model,
                fallback_model=args.fallback_model,
                request_image_limit=args.request_image_limit,
                pause_seconds=args.pause_seconds,
                timeout_seconds=args.timeout_seconds,
                max_retries=args.max_retries,
                verbose=args.verbose,
            ): batch_index
            for batch_index in pending_batch_indexes
        }

        for future in as_completed(future_map):
            batch_index = future_map[future]
            batch_path = batches_dir / f"step2-batch-{batch_index:04d}.csv"
            try:
                results = future.result()
                write_batch_csv(batch_path, results)
                completed += 1
                print(
                    f"step2 classify batch={batch_index} items={len(grouped[batch_index])} "
                    f"done={completed}/{len(pending_batch_indexes)} csv={batch_path.relative_to(args.images_root).as_posix()}"
                )
            except ParseClassificationError as exc:
                write_text_log(errors_dir / f"step2-batch-{batch_index:04d}.raw.txt", exc.raw_response)
                write_text_log(errors_dir / f"step2-batch-{batch_index:04d}.error.txt", str(exc))
                raise
            except Exception as exc:  # noqa: BLE001
                write_text_log(errors_dir / f"step2-batch-{batch_index:04d}.error.txt", str(exc))
                raise

    return 0


def apply_single_result(images_root: Path, result: BatchResult, dry_run: bool, verbose: bool) -> str:
    if result.label not in STEP2_BUCKETS:
        raise ClassificationError(f"未知の label: {result.label}")

    src = images_root / result.relative_path
    work_root = images_root / WORK_DIR_NAME
    rel_under_work = Path(result.relative_path).relative_to(WORK_DIR_NAME)
    dst = work_root / result.label / rel_under_work

    if src.exists():
        final_path = relocate_relative_to_root(src, src_root=work_root, dst_root=work_root / result.label, dry_run=dry_run)
        if verbose:
            print(f"{result.relative_path} -> {final_path.relative_to(images_root).as_posix()} [{result.reason}]")
        return "moved"

    if dst.exists():
        return "already_applied"

    return "missing"


def run_apply(args) -> int:
    run_dir = get_run_dir(args.images_root, args.run_name)
    manifest_path = get_manifest_path(run_dir)
    if not manifest_path.exists():
        raise ClassificationError(f"manifest がありません: {manifest_path}")

    grouped = group_manifest_rows(load_manifest(manifest_path))
    batches_dir = get_batches_dir(run_dir)

    moved = 0
    already_applied = 0
    missing = 0

    for batch_index in sorted(grouped):
        batch_path = batches_dir / f"step2-batch-{batch_index:04d}.csv"
        if not batch_path.exists():
            if args.skip_missing_batches:
                continue
            raise ClassificationError(f"未分類バッチが残っています: {batch_path}")
        results = read_batch_csv(batch_path)
        for result in results:
            state = apply_single_result(args.images_root, result, dry_run=args.dry_run, verbose=args.verbose)
            if state == "moved":
                moved += 1
            elif state == "already_applied":
                already_applied += 1
            else:
                missing += 1

    print(f"step2 apply moved={moved} already_applied={already_applied} missing={missing} run={run_dir}")
    return 0


def main() -> int:
    parser = parse_args_with_common_options(
        "Step2: 50-work の未分類画像を再開可能な manifest 単位で AI 分類し、後段で反映します。"
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
    parser.add_argument("--workers", type=int, default=2)
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
