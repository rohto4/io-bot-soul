export type MemoryDepth = "normal" | "reminisce" | "reference";

export type NoteStyle = {
  name: string;
  description: string;
  example: string;
};

export type NoteHint = {
  topic: string;
  tone: string;
  memoryDepth: MemoryDepth;
  style?: NoteStyle;  // normal depthのときのみ設定
};

const topics = [
  // 場所
  "図書館で調べていたら全然別の話に着地した",
  "商店街をぶらついたら気になる店があった",
  "ゲーセンで小さい発見をした",
  "近所の河原を歩いていた",
  "ラボで実験していたら予想外の結果が出た",
  "Misskey高校の廊下・休み時間の空気感",
  "家の窓から外を見ていた",
  // 行動
  "カップ麺を待ちながら何かを考えていた",
  "実績やログを眺めていたら気持ちが動いた",
  "何かを調べ始めたら脱線した",
  "気になったことをすぐ調べて既知を装った",
  // 感覚・発見
  "気になった言葉や表現を見つけた",
  "季節・気温・天気の変化に気づいた",
  "眠くなりながら何かを考えていた",
  "タイムラインに流れてきた雰囲気が面白かった",
  // 思考
  "どうでもいいけど筋の通った理論を思いついた",
  "最近ずっと気になっていた謎がある",
  "ITや化学の知識で日常を解釈してみた",
  "未知の何かに出会ってすぐ調べた",
  "収集しているもの（実績・記録）が増えた",
] as const;

const tones = [
  "独り言・ぼそっと（「〜だな」「まあいいや」「〜かも」）",
  "考察・衒学的（「つまり〜という仮説が」「要するに〜」を少し）",
  "自己肯定・得意気（「私えらいので〜」「妥当」）",
  "発見・興奮気味（楽しい時は「！！」、感情が理屈を追い越す感じ）",
  "観察者・淡々と（静かに短く、事実を並べる）",
  "懐っこさ・連帯感（「〜だよね」、フォロワーへの親しみ）",
] as const;

// 4つの文体・構成パターン（normal depthのときにランダムに1つ選ぶ）
// example は行ごとの役割説明のみ。具体的な内容は書かない（内容の引っ張りを防ぐ）
const noteStyles: NoteStyle[] = [
  {
    name: "短文観察",
    description: "全体2〜3行の短め構成。",
    example:
      "- 1行目: 観察した事実・気づき（短く具体的に）\n- 2行目: それに対する感想や感情（「〜かもしれない」「〜な気がする」など）",
  },
  {
    name: "思考の連鎖",
    description: "ひとつの気づきが次の思考を呼ぶ3〜5行。脱線・寄り道を含む。",
    example:
      "- 1行目: 最初の気づき・行動\n- 2〜3行目: そこから派生した思考（脱線してもよい）\n- 最終行: 「まあいいや」「悪くない」など軽い着地",
  },
  {
    name: "考察・断言型",
    description: "前提→論理→結論の3〜4行。「つまり〜」「要するに〜」で締めてよい。",
    example:
      "- 1行目: 観察・前提（日常的な出来事）\n- 2行目: そこから考えたこと\n- 3行目: 「つまり〜」「要するに〜」で仮説または結論",
  },
  {
    name: "生活感・行動報告",
    description: "体験の描写→感情→自己肯定の3〜4行。",
    example:
      "- 1行目: 今やっていること・体験した出来事（具体的な場所や行動）\n- 2行目: そこから感じたこと・状況の評価\n- 3行目: 体験をまとめる自己肯定または軽い宣言（自分の言葉で）",
  },
];

function drawMemoryDepth(rand: () => number): MemoryDepth {
  const r = rand();
  if (r < 0.05) return "reference";  // 5%: 過去の1件に言及
  if (r < 0.10) return "reminisce";  // 5%: 蓄積から連想
  return "normal";                    // 90%: 記憶を掘り返さない
}

export function drawNoteHint(random: () => number = Math.random): NoteHint {
  const memoryDepth = drawMemoryDepth(random);
  return {
    topic: topics[Math.floor(random() * topics.length)],
    tone: tones[Math.floor(random() * tones.length)],
    memoryDepth,
    // normal depthのときのみ文体パターンを設定
    style: memoryDepth === "normal"
      ? noteStyles[Math.floor(random() * noteStyles.length)]
      : undefined,
  };
}
