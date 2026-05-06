from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

from emoji_sorter_common import ClassificationError, WORK_DIR_NAME, ensure_dir, parse_args_with_common_options


def get_run_dir(images_root: Path, run_name: str) -> Path:
    return images_root / WORK_DIR_NAME / "_logs" / "step2" / run_name


def get_legacy_dir(images_root: Path) -> Path:
    return images_root / WORK_DIR_NAME / "_logs" / "step2"


def parse_batch_index(path: Path) -> int:
    stem = path.stem
    if not stem.startswith("step2-batch-"):
        raise ClassificationError(f"batch csv 名が不正です: {path.name}")
    return int(stem.removeprefix("step2-batch-"))


def load_batch_rows(batch_path: Path) -> list[dict[str, str]]:
    with batch_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        expected = ["relative_path", "label", "reason"]
        if headers != expected:
            raise ClassificationError(f"CSVヘッダー不一致: {batch_path} expected={expected} actual={headers}")
        return list(reader)


def merge_run(images_root: Path, run_name: str, output_path: Path) -> tuple[int, Counter[str]]:
    run_dir = get_run_dir(images_root, run_name)
    batches_dir = run_dir / "batches"
    if not batches_dir.exists():
        raise ClassificationError(f"batches ディレクトリがありません: {batches_dir}")

    batch_paths = sorted(batches_dir.glob("step2-batch-*.csv"))
    if not batch_paths:
        raise ClassificationError(f"batch csv がありません: {batches_dir}")

    merged_rows: list[dict[str, str]] = []
    seen_paths: set[str] = set()
    label_counter: Counter[str] = Counter()

    for batch_path in batch_paths:
        batch_index = parse_batch_index(batch_path)
        for item_index, row in enumerate(load_batch_rows(batch_path), start=1):
            relative_path = row["relative_path"].strip()
            label = row["label"].strip()
            reason = row["reason"].strip()
            if label not in {"text", "illust-text", "illust"}:
                raise ClassificationError(f"未知の label です: {batch_path} label={label}")
            if relative_path in seen_paths:
                raise ClassificationError(f"relative_path 重複です: {relative_path}")
            seen_paths.add(relative_path)
            label_counter[label] += 1
            merged_rows.append(
                {
                    "run_name": run_name,
                    "batch_index": str(batch_index),
                    "item_index": str(item_index),
                    "relative_path": relative_path,
                    "label": label,
                    "reason": reason,
                    "source_csv": batch_path.name,
                }
            )

    merged_rows.sort(key=lambda row: (int(row["batch_index"]), int(row["item_index"]), row["relative_path"]))
    ensure_dir(output_path.parent)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["run_name", "batch_index", "item_index", "relative_path", "label", "reason", "source_csv"],
        )
        writer.writeheader()
        writer.writerows(merged_rows)

    return len(merged_rows), label_counter


def merge_all_step2(images_root: Path, run_name: str, output_path: Path) -> tuple[int, Counter[str]]:
    legacy_dir = get_legacy_dir(images_root)
    run_dir = get_run_dir(images_root, run_name)
    run_batches_dir = run_dir / "batches"

    legacy_batch_paths = sorted(legacy_dir.glob("step2-batch-*.csv"))
    run_batch_paths = sorted(run_batches_dir.glob("step2-batch-*.csv"))

    if not legacy_batch_paths and not run_batch_paths:
        raise ClassificationError("マージ対象の step2 batch csv がありません。")

    merged_rows: list[dict[str, str]] = []
    seen_paths: set[str] = set()
    label_counter: Counter[str] = Counter()

    for source_kind, batch_paths in (("legacy", legacy_batch_paths), ("run", run_batch_paths)):
        for batch_path in batch_paths:
            batch_index = parse_batch_index(batch_path)
            for item_index, row in enumerate(load_batch_rows(batch_path), start=1):
                relative_path = row["relative_path"].strip()
                label = row["label"].strip()
                reason = row["reason"].strip()
                if label not in {"text", "illust-text", "illust"}:
                    raise ClassificationError(f"未知の label です: {batch_path} label={label}")
                if relative_path in seen_paths:
                    raise ClassificationError(f"relative_path 重複です: {relative_path}")
                seen_paths.add(relative_path)
                label_counter[label] += 1
                merged_rows.append(
                    {
                        "source_kind": source_kind,
                        "run_name": run_name if source_kind == "run" else "legacy",
                        "batch_index": str(batch_index),
                        "item_index": str(item_index),
                        "relative_path": relative_path,
                        "label": label,
                        "reason": reason,
                        "source_csv": batch_path.name,
                    }
                )

    merged_rows.sort(key=lambda row: (row["source_kind"], int(row["batch_index"]), int(row["item_index"]), row["relative_path"]))
    ensure_dir(output_path.parent)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["source_kind", "run_name", "batch_index", "item_index", "relative_path", "label", "reason", "source_csv"],
        )
        writer.writeheader()
        writer.writerows(merged_rows)

    return len(merged_rows), label_counter


def main() -> int:
    parser = parse_args_with_common_options(
        "Step2 の batch csv を結合し、検証済みの統合CSVを出力します。"
    )
    parser.add_argument("--run-name", default="current")
    parser.add_argument("--output")
    parser.add_argument("--include-legacy", action="store_true")
    args = parser.parse_args()

    output_path = (
        Path(args.output)
        if args.output
        else (
            get_run_dir(args.images_root, args.run_name) / "step2-merged-all.csv"
            if args.include_legacy
            else get_run_dir(args.images_root, args.run_name) / "step2-merged.csv"
        )
    )
    total, counts = (
        merge_all_step2(args.images_root, args.run_name, output_path)
        if args.include_legacy
        else merge_run(args.images_root, args.run_name, output_path)
    )
    print(
        f"step2 merge total={total} text={counts['text']} illust_text={counts['illust-text']} "
        f"illust={counts['illust']} output={output_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
