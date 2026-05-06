from __future__ import annotations

import argparse
import base64
import csv
import json
import os
import re
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence
from urllib import error, request


PROJECT_ROOT = Path(__file__).resolve().parents[1]
IMAGES_ROOT = PROJECT_ROOT / "data" / "images"
WORK_DIR_NAME = "50-work"
TEXT_BUCKET = "text"
ILLUST_TEXT_BUCKET = "illust-text"
ILLUST_BUCKET = "illust"
STEP2_BUCKETS = {TEXT_BUCKET, ILLUST_TEXT_BUCKET, ILLUST_BUCKET}
RANK_A_DIR = "1-rank-a"
RANK_B_DIR = "2-rank-b"
RANK_C_DIR = "3-rank-c"
RANK_D_DIR = "4_rank-d"
TRUSH_DIR = "90-trush"
BK_DIR = "99-bk"
RESERVED_TOP_LEVEL_DIRS = {
    RANK_A_DIR,
    RANK_B_DIR,
    RANK_C_DIR,
    RANK_D_DIR,
    WORK_DIR_NAME,
    TRUSH_DIR,
    BK_DIR,
}
SUPPORTED_STATIC_EXTENSIONS = {".png", ".jpg", ".jpeg", ".svg", ".avif"}
SUPPORTED_ANIMATION_EXTENSIONS = {".gif"}
SUPPORTED_IMAGE_EXTENSIONS = SUPPORTED_STATIC_EXTENSIONS | SUPPORTED_ANIMATION_EXTENSIONS | {".webp"}


@dataclass(frozen=True)
class ImageItem:
    path: Path
    relative_path: Path


@dataclass(frozen=True)
class BatchResult:
    relative_path: str
    label: str
    reason: str


@dataclass(frozen=True)
class BatchResultById:
    item_id: str
    label: str
    reason: str


class ClassificationError(RuntimeError):
    pass


class ParseClassificationError(ClassificationError):
    def __init__(self, message: str, raw_response: str) -> None:
        super().__init__(message)
        self.raw_response = raw_response


def parse_args_with_common_options(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--images-root", type=Path, default=IMAGES_ROOT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    return parser


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def is_reserved_top_level(path: Path, images_root: Path) -> bool:
    rel = path.relative_to(images_root)
    return rel.parts[0] in RESERVED_TOP_LEVEL_DIRS


def iter_source_files_for_step1(images_root: Path) -> Iterable[ImageItem]:
    for child in sorted(images_root.iterdir()):
        if not child.is_dir() or child.name in RESERVED_TOP_LEVEL_DIRS:
            continue
        for path in sorted(child.rglob("*")):
            if path.is_file():
                yield ImageItem(path=path, relative_path=path.relative_to(images_root))


def iter_step2_candidates(images_root: Path) -> Iterable[ImageItem]:
    work_root = images_root / WORK_DIR_NAME
    if not work_root.exists():
        return

    for path in sorted(work_root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(work_root)
        if rel.parts and rel.parts[0] in STEP2_BUCKETS:
            continue
        if rel.parts and rel.parts[0] == "_logs":
            continue
        if is_supported_image_file(path):
            yield ImageItem(path=path, relative_path=Path(WORK_DIR_NAME) / rel)


def iter_step3_candidates(images_root: Path, bucket_name: str) -> Iterable[ImageItem]:
    source_root = images_root / WORK_DIR_NAME / bucket_name
    if not source_root.exists():
        return

    for path in sorted(source_root.rglob("*")):
        if path.is_file() and is_supported_image_file(path):
            yield ImageItem(path=path, relative_path=path.relative_to(images_root))


def is_supported_image_file(path: Path) -> bool:
    ext = path.suffix.lower()
    if ext in SUPPORTED_IMAGE_EXTENSIONS:
        return True
    detected = detect_media_type(path)
    return detected in {"static", "animation"}


def read_prefix(path: Path, size: int = 4096) -> bytes:
    with path.open("rb") as handle:
        return handle.read(size)


def detect_media_type(path: Path) -> str | None:
    ext = path.suffix.lower()
    if ext in SUPPORTED_ANIMATION_EXTENSIONS:
        return "animation"
    if ext in SUPPORTED_STATIC_EXTENSIONS:
        if ext == ".png" and is_apng(path):
            return "animation"
        return "static"
    if ext == ".webp":
        return "animation" if is_animated_webp(path) else "static"

    prefix = read_prefix(path)
    if prefix.startswith(b"GIF87a") or prefix.startswith(b"GIF89a"):
        return "animation"
    if prefix.startswith(b"\x89PNG\r\n\x1a\n"):
        return "animation" if is_apng(path) else "static"
    if prefix.startswith(b"\xff\xd8\xff"):
        return "static"
    if prefix.startswith(b"RIFF") and prefix[8:12] == b"WEBP":
        return "animation" if is_animated_webp(path) else "static"
    if b"<svg" in prefix.lower():
        return "static"
    if len(prefix) >= 12 and prefix[4:8] == b"ftyp" and prefix[8:12] in {b"avif", b"avis"}:
        return "static"
    return None


def is_apng(path: Path) -> bool:
    with path.open("rb") as handle:
        data = handle.read(512 * 1024)
    return b"acTL" in data


def is_animated_webp(path: Path) -> bool:
    with path.open("rb") as handle:
        data = handle.read()
    return b"ANIM" in data or b"ANMF" in data


def move_preserving_tree(src: Path, images_root: Path, target_top_level: str, dry_run: bool) -> Path:
    relative = src.relative_to(images_root)
    destination = images_root / target_top_level / relative
    if dry_run:
        return destination
    ensure_dir(destination.parent)
    shutil.move(str(src), str(destination))
    cleanup_empty_dirs(src.parent, images_root)
    return destination


def copy_preserving_tree(src: Path, images_root: Path, target_top_level: str, dry_run: bool) -> Path:
    relative = src.relative_to(images_root)
    destination = images_root / target_top_level / relative
    if dry_run:
        return destination
    ensure_dir(destination.parent)
    shutil.copy2(src, destination)
    return destination


def relocate_relative_to_root(src: Path, src_root: Path, dst_root: Path, dry_run: bool) -> Path:
    relative = src.relative_to(src_root)
    destination = dst_root / relative
    if dry_run:
        return destination
    ensure_dir(destination.parent)
    shutil.move(str(src), str(destination))
    cleanup_empty_dirs(src.parent, src_root)
    return destination


def copy_relative_to_root(src: Path, src_root: Path, dst_root: Path, dry_run: bool) -> Path:
    relative = src.relative_to(src_root)
    destination = dst_root / relative
    if dry_run:
        return destination
    ensure_dir(destination.parent)
    shutil.copy2(src, destination)
    return destination


def cleanup_empty_dirs(start: Path, stop: Path) -> None:
    current = start
    while current != stop and current.exists():
        try:
            current.rmdir()
        except OSError:
            break
        current = current.parent


def build_data_url(path: Path) -> str:
    mime = mime_type_for_path(path)
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def mime_type_for_path(path: Path) -> str:
    ext = path.suffix.lower()
    mapping = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".avif": "image/avif",
    }
    return mapping.get(ext, "application/octet-stream")


def extract_csv_rows(text: str, expected_headers: Sequence[str]) -> list[BatchResult]:
    normalized = text.strip()
    if normalized.startswith("```"):
        normalized = strip_code_fence(normalized)

    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    if not lines:
        raise ClassificationError("AI応答が空です。")

    header_line_index = None
    expected_header = ",".join(expected_headers)
    for index, line in enumerate(lines):
        compact = line.replace(" ", "")
        if compact == expected_header:
            header_line_index = index
            break
        if compact.strip("|") == expected_header:
            header_line_index = index
            break
    if header_line_index is None:
        table_rows = try_extract_markdown_table(lines, expected_headers)
        if table_rows:
            return table_rows
        loose_rows = try_extract_loose_csv_rows(lines, expected_headers)
        if loose_rows:
            return loose_rows
        raise ClassificationError("AI応答からCSVヘッダーを検出できませんでした。")

    csv_text = "\n".join(lines[header_line_index:])
    if csv_text.lstrip().startswith("|"):
        table_rows = try_extract_markdown_table(lines[header_line_index:], expected_headers)
        if table_rows:
            return table_rows
    reader = csv.DictReader(csv_text.splitlines())
    actual_headers = reader.fieldnames or []
    if list(actual_headers) != list(expected_headers):
        raise ClassificationError(f"CSVヘッダー不一致: expected={expected_headers}, actual={actual_headers}")

    results: list[BatchResult] = []
    for row in reader:
        rel = (row.get("relative_path") or "").strip()
        label = (row.get("label") or "").strip()
        reason = (row.get("reason") or "").strip()
        if not rel or not label:
            raise ClassificationError(f"CSV行が不正です: {row}")
        results.append(BatchResult(relative_path=rel, label=label, reason=reason))
    return results


def try_extract_markdown_table(lines: Sequence[str], expected_headers: Sequence[str]) -> list[BatchResult]:
    table_lines = [line for line in lines if line.startswith("|") and line.endswith("|")]
    if len(table_lines) < 2:
        return []

    parsed_rows = []
    for line in table_lines:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        parsed_rows.append(cells)

    headers = [cell.replace(" ", "") for cell in parsed_rows[0]]
    if headers != list(expected_headers):
        return []

    data_rows = []
    for row in parsed_rows[1:]:
        if all(re.fullmatch(r"[-:]+", cell) for cell in row):
            continue
        if len(row) != len(expected_headers):
            continue
        data_rows.append(
            BatchResult(
                relative_path=row[0].strip("` "),
                label=row[1].strip("` "),
                reason=row[2].strip("` "),
            )
        )
    return data_rows


def try_extract_loose_csv_rows(lines: Sequence[str], expected_headers: Sequence[str]) -> list[BatchResult]:
    rows: list[BatchResult] = []
    for line in lines:
        cleaned = line.strip().strip("`")
        if not cleaned or cleaned.lower().startswith(("note:", "output:", "csv:", "以下")):
            continue
        if "," not in cleaned:
            continue
        parts = next(csv.reader([cleaned]))
        if len(parts) != len(expected_headers):
            continue
        first = parts[0].strip()
        second = parts[1].strip()
        third = parts[2].strip()
        if first == expected_headers[0] and second == expected_headers[1]:
            continue
        if "/" not in first and "\\" not in first and "." not in first:
            continue
        rows.append(BatchResult(relative_path=first, label=second, reason=third))
    return rows


def extract_csv_rows_by_id(text: str, expected_headers: Sequence[str]) -> list[BatchResultById]:
    normalized = text.strip()
    if normalized.startswith("```"):
        normalized = strip_code_fence(normalized)

    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    if not lines:
        raise ClassificationError("AI応答が空です。")

    header_line_index = None
    expected_header = ",".join(expected_headers)
    for index, line in enumerate(lines):
        compact = line.replace(" ", "")
        if compact == expected_header or compact.strip("|") == expected_header:
            header_line_index = index
            break

    if header_line_index is None:
        table_rows = try_extract_markdown_table_by_id(lines, expected_headers)
        if table_rows:
            return table_rows
        loose_rows = try_extract_loose_csv_rows_by_id(lines, expected_headers)
        if loose_rows:
            return loose_rows
        raise ClassificationError("AI応答からCSVヘッダーを検出できませんでした。")

    csv_text = "\n".join(lines[header_line_index:])
    if csv_text.lstrip().startswith("|"):
        table_rows = try_extract_markdown_table_by_id(lines[header_line_index:], expected_headers)
        if table_rows:
            return table_rows

    reader = csv.DictReader(csv_text.splitlines())
    actual_headers = reader.fieldnames or []
    if list(actual_headers) != list(expected_headers):
        raise ClassificationError(f"CSVヘッダー不一致: expected={expected_headers}, actual={actual_headers}")

    results: list[BatchResultById] = []
    for row in reader:
        item_id = normalize_item_id((row.get("item_id") or "").strip())
        label = (row.get("label") or "").strip()
        reason = (row.get("reason") or "").strip()
        if not item_id or not label:
            raise ClassificationError(f"CSV行が不正です: {row}")
        results.append(BatchResultById(item_id=item_id, label=label, reason=reason))
    return results


def try_extract_markdown_table_by_id(lines: Sequence[str], expected_headers: Sequence[str]) -> list[BatchResultById]:
    table_lines = [line for line in lines if line.startswith("|") and line.endswith("|")]
    if len(table_lines) < 2:
        return []

    parsed_rows = []
    for line in table_lines:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        parsed_rows.append(cells)

    headers = [cell.replace(" ", "") for cell in parsed_rows[0]]
    if headers != list(expected_headers):
        return []

    data_rows = []
    for row in parsed_rows[1:]:
        if all(re.fullmatch(r"[-:]+", cell) for cell in row):
            continue
        if len(row) != len(expected_headers):
            continue
        data_rows.append(
            BatchResultById(
                item_id=normalize_item_id(row[0].strip("` ")),
                label=row[1].strip("` "),
                reason=row[2].strip("` "),
            )
        )
    return data_rows


def try_extract_loose_csv_rows_by_id(lines: Sequence[str], expected_headers: Sequence[str]) -> list[BatchResultById]:
    rows: list[BatchResultById] = []
    for line in lines:
        cleaned = line.strip().strip("`")
        if not cleaned or cleaned.lower().startswith(("note:", "output:", "csv:", "以下")):
            continue
        if "," not in cleaned:
            continue
        parts = next(csv.reader([cleaned]))
        if len(parts) != len(expected_headers):
            continue
        first = normalize_item_id(parts[0].strip())
        second = parts[1].strip()
        third = parts[2].strip()
        if first == "item_id" and second == expected_headers[1]:
            continue
        if not first:
            continue
        rows.append(BatchResultById(item_id=first, label=second, reason=third))
    return rows


def normalize_item_id(value: str) -> str:
    cleaned = value.strip().strip("`")
    cleaned = re.sub(r"^(item_id|id)\s*[:=]\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^\#\s*", "", cleaned)
    match = re.search(r"\d+", cleaned)
    return match.group(0) if match else ""


def strip_code_fence(text: str) -> str:
    lines = text.splitlines()
    if len(lines) >= 2 and lines[0].startswith("```") and lines[-1].startswith("```"):
        return "\n".join(lines[1:-1])
    return text


def write_text_log(path: Path, text: str) -> None:
    ensure_dir(path.parent)
    path.write_text(text, encoding="utf-8")


class OpenAICompatibleVisionClient:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        primary_model: str,
        fallback_model: str | None,
        timeout_seconds: int,
        pause_seconds: float,
        max_retries: int,
        verbose: bool,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.primary_model = primary_model
        self.fallback_model = fallback_model
        self.timeout_seconds = timeout_seconds
        self.pause_seconds = pause_seconds
        self.max_retries = max_retries
        self.verbose = verbose
        self._last_request_at = 0.0

    def classify_batch(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        items: Sequence[ImageItem],
        max_tokens: int = 2000,
        temperature: float = 0.0,
    ) -> str:
        errors: list[str] = []
        model_order = [self.primary_model]
        if self.fallback_model and self.fallback_model != self.primary_model:
            model_order.append(self.fallback_model)

        for model in model_order:
            try:
                return self._classify_with_model(
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    items=items,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{model}: {exc}")
                if self.verbose:
                    print(f"[warn] model failed: {model}: {exc}")
        raise ClassificationError(" / ".join(errors))

    def classify_batch_in_chunks(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        items: Sequence[ImageItem],
        max_images_per_request: int,
        expected_headers: Sequence[str],
        max_tokens: int = 2000,
        temperature: float = 0.0,
    ) -> list[BatchResult]:
        if max_images_per_request <= 0:
            raise ClassificationError("max_images_per_request must be greater than 0")

        merged: list[BatchResult] = []
        for start in range(0, len(items), max_images_per_request):
            chunk = items[start : start + max_images_per_request]
            chunk_prompt = build_chunk_prompt_with_ids(user_prompt, chunk)
            raw = self.classify_batch(
                system_prompt=system_prompt,
                user_prompt=chunk_prompt,
                items=chunk,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            try:
                rows = extract_csv_rows_by_id(raw, expected_headers)
            except ClassificationError as exc:
                raise ParseClassificationError(str(exc), raw) from exc
            id_to_path = {
                str(index + 1): item.relative_path.as_posix()
                for index, item in enumerate(chunk)
            }
            expected_ids = set(id_to_path)
            actual_ids = {row.item_id for row in rows}
            if expected_ids != actual_ids:
                missing = sorted(expected_ids - actual_ids)
                extra = sorted(actual_ids - expected_ids)
                raise ClassificationError(
                    f"CSV item_id mismatch missing={missing[:5]} extra={extra[:5]}"
                )
            for row in rows:
                merged.append(
                    BatchResult(
                        relative_path=id_to_path[row.item_id],
                        label=row.label,
                        reason=row.reason,
                    )
                )
        return merged

    def _classify_with_model(
        self,
        *,
        model: str,
        system_prompt: str,
        user_prompt: str,
        items: Sequence[ImageItem],
        max_tokens: int,
        temperature: float,
    ) -> str:
        content: list[dict[str, object]] = [{"type": "text", "text": user_prompt}]
        for item in items:
            content.append(
                {
                    "type": "text",
                    "text": f"relative_path={item.relative_path.as_posix()}",
                }
            )
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": build_data_url(item.path),
                        "detail": "low",
                    },
                }
            )

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        for attempt in range(self.max_retries + 1):
            self._sleep_for_rate_limit()
            req = request.Request(
                url=f"{self.base_url}/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                },
                data=json.dumps(payload).encode("utf-8"),
                method="POST",
            )
            try:
                with request.urlopen(req, timeout=self.timeout_seconds) as response:
                    raw = response.read().decode("utf-8")
                    data = json.loads(raw)
                    content_value = data["choices"][0]["message"]["content"]
                    if isinstance(content_value, list):
                        parts = [part.get("text", "") for part in content_value if isinstance(part, dict)]
                        return "\n".join(parts).strip()
                    return str(content_value).strip()
            except error.HTTPError as exc:
                body = exc.read().decode("utf-8", errors="replace")
                if exc.code in {408, 409, 425, 429, 500, 502, 503, 504} and attempt < self.max_retries:
                    retry_after = exc.headers.get("Retry-After")
                    sleep_seconds = float(retry_after) if retry_after else 2 ** attempt
                    if self.verbose:
                        print(f"[retry] {model} HTTP {exc.code}, sleeping {sleep_seconds}s")
                    time.sleep(sleep_seconds)
                    continue
                raise ClassificationError(f"HTTP {exc.code}: {body[:300]}") from exc
            except error.URLError as exc:
                if attempt < self.max_retries:
                    sleep_seconds = 2 ** attempt
                    if self.verbose:
                        print(f"[retry] {model} URL error, sleeping {sleep_seconds}s: {exc}")
                    time.sleep(sleep_seconds)
                    continue
                raise ClassificationError(str(exc)) from exc

        raise ClassificationError(f"{model}: retry exhausted")

    def _sleep_for_rate_limit(self) -> None:
        if self.pause_seconds <= 0:
            self._last_request_at = time.monotonic()
            return
        elapsed = time.monotonic() - self._last_request_at
        remaining = self.pause_seconds - elapsed
        if remaining > 0:
            time.sleep(remaining)
        self._last_request_at = time.monotonic()


def build_chunk_prompt_with_ids(user_prompt: str, items: Sequence[ImageItem]) -> str:
    lines = [user_prompt, "", "対象アイテム一覧:"]
    for index, item in enumerate(items, start=1):
        lines.append(f"{index}, {item.relative_path.as_posix()}")
    lines.append("")
    lines.append("必ず item_id をそのまま返すこと。relative_path は書き換えず、出力に含めないこと。")
    return "\n".join(lines)


def require_api_key(explicit_value: str | None) -> str:
    api_key = explicit_value or os.environ.get("CHUTES_API_KEY", "")
    if not api_key:
        raise ClassificationError("CHUTES_API_KEY が未設定です。--api-key または環境変数で指定してください。")
    return api_key
