from __future__ import annotations

from collections import Counter
from pathlib import Path

from emoji_sorter_common import (
    BK_DIR,
    RANK_D_DIR,
    WORK_DIR_NAME,
    detect_media_type,
    iter_source_files_for_step1,
    move_preserving_tree,
    parse_args_with_common_options,
)


def classify_source_file(path: Path) -> str:
    media_type = detect_media_type(path)
    if media_type == "animation":
        return RANK_D_DIR
    if media_type == "static":
        return WORK_DIR_NAME
    return BK_DIR


def run(images_root: Path, dry_run: bool, verbose: bool) -> Counter[str]:
    counts: Counter[str] = Counter()
    for item in iter_source_files_for_step1(images_root):
        target = classify_source_file(item.path)
        destination = move_preserving_tree(item.path, images_root, target, dry_run=dry_run)
        counts[target] += 1
        if verbose:
            print(f"{item.relative_path.as_posix()} -> {destination.relative_to(images_root).as_posix()}")
    return counts


def main() -> int:
    parser = parse_args_with_common_options(
        "Step1: data/images 配下の分類元フォルダから、静止画を 50-work、アニメーションを 4_rank-d へ移動します。"
    )
    args = parser.parse_args()
    counts = run(args.images_root, dry_run=args.dry_run, verbose=args.verbose)
    total = sum(counts.values())
    print(f"processed={total} static_to_work={counts[WORK_DIR_NAME]} animation_to_rank_d={counts[RANK_D_DIR]} fallback_to_bk={counts[BK_DIR]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
