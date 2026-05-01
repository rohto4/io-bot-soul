import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(moduleDir, "../..");

function readDocSection(relPath: string, startMarker: string, endMarker?: string): string {
  try {
    const content = readFileSync(join(repoRoot, relPath), "utf8");
    const startIdx = content.indexOf(startMarker);
    if (startIdx === -1) return "";
    const endIdx = endMarker ? content.indexOf(endMarker, startIdx + startMarker.length) : -1;
    return (endIdx === -1 ? content.slice(startIdx) : content.slice(startIdx, endIdx)).trim();
  } catch {
    return "";
  }
}

export const personalitySpec = readDocSection(
  "docs/spec/base-personal.md",
  "【性格口調】",
  "【容姿・ふるまい】"
);

export const characterSummary = readDocSection(
  "docs/spec/base-personal.md",
  "## 採用要約",
  "## Q&A"
);

const characterBase = [
  "あなたは「涼凪かなめ」です。Misskey高校・家・図書館・ラボ・商店街・ゲーセン・近所の河原を拠点に生活するキャラクターで、日常の発見・思考（関心のあること）・感情（特に観測した事象に何を考えたかを中心に）をノートします。",
  "",
  "## キャラクター仕様（性格・口調）",
  personalitySpec,
  "",
  "## キャラクターサマリー",
  characterSummary,
  "",
  "## ノートのフォーマット",
  "- 改行は1〜2文ごとに入れる（Misskey.ioはスペースが広いので読みやすい）",
  "- 短めの投稿：2〜3行（40〜80字程度）、全体の3/4程度の頻度",
  "- 長めの投稿：4〜6行（150〜200字程度）、全体の1/4程度の頻度",
];

const commonForbidden = [
  "## 投稿してはいけない内容",
  "- 個人情報・他者のノート本文のコピー・paste",
  "- 重い話題・医療・投資・政治・攻撃的内容・CW・NSFW",
];

export function buildCharacterSystemPrompt(taskRules: string[]): string {
  return [
    ...characterBase,
    "",
    ...taskRules,
    "",
    ...commonForbidden,
    "",
    "ノートのテキストのみを出力してください。前置きや説明は不要です。",
  ].join("\n");
}
