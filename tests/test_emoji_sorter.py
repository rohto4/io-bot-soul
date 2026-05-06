from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from emoji_sort_step1 import classify_source_file
from emoji_sort_step2_merge import merge_all_step2, merge_run
from emoji_sorter_common import (
    BK_DIR,
    RANK_D_DIR,
    WORK_DIR_NAME,
    extract_csv_rows,
    extract_csv_rows_by_id,
)


PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc`\x00\x00\x00\x02\x00\x01"
    b"\xe2!\xbc3"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)
GIF_BYTES = (
    b"GIF89a"
    b"\x01\x00\x01\x00"
    b"\x80\x00\x00"
    b"\x00\x00\x00"
    b"\xff\xff\xff"
    b",\x00\x00\x00\x00\x01\x00\x01\x00\x00"
    b"\x02\x02D\x01\x00;"
)
UNKNOWN_BYTES = b"not-an-image"


class EmojiSorterTests(unittest.TestCase):
    def test_extract_csv_rows_handles_code_fence(self) -> None:
        raw = """```csv
relative_path,label,reason
50-work/a.png,text,文字主体
50-work/b.png,illust,絵だけ
```"""
        rows = extract_csv_rows(raw, ["relative_path", "label", "reason"])
        self.assertEqual(rows[0].relative_path, "50-work/a.png")
        self.assertEqual(rows[0].label, "text")
        self.assertEqual(rows[1].label, "illust")

    def test_step1_classifies_static_png_to_work(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "sample.bin"
            path.write_bytes(PNG_BYTES)
            self.assertEqual(classify_source_file(path), WORK_DIR_NAME)

    def test_step1_classifies_gif_to_rank_d(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "sample.bin"
            path.write_bytes(GIF_BYTES)
            self.assertEqual(classify_source_file(path), RANK_D_DIR)

    def test_step1_falls_back_to_bk_for_unknown(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "sample.bin"
            path.write_bytes(UNKNOWN_BYTES)
            self.assertEqual(classify_source_file(path), BK_DIR)

    def test_extract_csv_rows_by_id_normalizes_item_id(self) -> None:
        raw = """| item_id | label | reason |
| --- | --- | --- |
| item_id=1 | text | 文字主体 |
| #2 | illust | 絵だけ |
"""
        rows = extract_csv_rows_by_id(raw, ["item_id", "label", "reason"])
        self.assertEqual(rows[0].item_id, "1")
        self.assertEqual(rows[1].item_id, "2")

    def test_step2_merge_creates_consistent_combined_csv(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            batches = root / "data" / "images" / WORK_DIR_NAME / "_logs" / "step2" / "testrun" / "batches"
            batches.mkdir(parents=True)
            (batches / "step2-batch-0001.csv").write_text(
                "relative_path,label,reason\n"
                "50-work/a.png,text,文字主体\n"
                "50-work/b.png,illust,絵だけ\n",
                encoding="utf-8",
            )
            (batches / "step2-batch-0002.csv").write_text(
                "relative_path,label,reason\n"
                "50-work/c.png,illust-text,文字入り\n",
                encoding="utf-8",
            )
            output = root / "merged.csv"
            total, counts = merge_run(root / "data" / "images", "testrun", output)
            self.assertEqual(total, 3)
            self.assertEqual(counts["text"], 1)
            self.assertEqual(counts["illust"], 1)
            self.assertEqual(counts["illust-text"], 1)
            merged = output.read_text(encoding="utf-8")
            self.assertIn("run_name,batch_index,item_index,relative_path,label,reason,source_csv", merged)
            self.assertIn("testrun,1,1,50-work/a.png,text,文字主体,step2-batch-0001.csv", merged)

    def test_step2_merge_all_includes_legacy_and_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            legacy = root / "data" / "images" / WORK_DIR_NAME / "_logs" / "step2"
            legacy.mkdir(parents=True)
            (legacy / "step2-batch-0001.csv").write_text(
                "relative_path,label,reason\n"
                "50-work/legacy-a.png,text,旧方式\n",
                encoding="utf-8",
            )
            run_batches = legacy / "testrun" / "batches"
            run_batches.mkdir(parents=True)
            (run_batches / "step2-batch-0001.csv").write_text(
                "relative_path,label,reason\n"
                "50-work/run-a.png,illust,新方式\n",
                encoding="utf-8",
            )
            output = root / "merged-all.csv"
            total, counts = merge_all_step2(root / "data" / "images", "testrun", output)
            self.assertEqual(total, 2)
            self.assertEqual(counts["text"], 1)
            self.assertEqual(counts["illust"], 1)
            merged = output.read_text(encoding="utf-8")
            self.assertIn("source_kind,run_name,batch_index,item_index,relative_path,label,reason,source_csv", merged)
            self.assertIn("legacy,legacy,1,1,50-work/legacy-a.png,text,旧方式,step2-batch-0001.csv", merged)
            self.assertIn("run,testrun,1,1,50-work/run-a.png,illust,新方式,step2-batch-0001.csv", merged)


if __name__ == "__main__":
    unittest.main()
