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
const noteStyles: NoteStyle[] = [
  {
    name: "短文観察",
    description: "観察や気づきを1〜2行で切り取り、感想を1行で添える。全体2〜3行の短め構成。",
    example:
      "窓の外、まだ少し暗い。\n光がくる前の静けさって、ちょっと好きかもしれない。",
  },
  {
    name: "思考の連鎖",
    description:
      "ひとつの気づきが次の思考を呼ぶ展開。脱線・寄り道を含む3〜5行。最後は「まあいいや」「悪くない」など軽い着地。",
    example:
      "気になったことを調べ始めたら、\n全然別の話に着地してしまった。\nこういう脱線、なぜか止められない。\nまあいいや、全部面白いので。",
  },
  {
    name: "考察・断言型",
    description:
      "前提を置いて論理を展開し、結論または仮説で締める。「つまり〜」「要するに〜」を使ってもよい。3〜4行。",
    example:
      "カップ麺の待ち時間って、3分ってちょうどいい。\n考えがまとまるには短すぎて、冷めるには長い。\nつまり「中断できない思考」の最小単位が3分なのでは。",
  },
  {
    name: "生活感・行動報告",
    description:
      "今やっていることや体験した出来事を具体的に描写し、感情や意図で締める。「私えらいので〜」など自己肯定を使ってもよい。3〜4行。",
    example:
      "図書館に来てから2時間、全然別の棚に移動してた。\n今日は資料探しじゃなくて、完全に散策になってる。\n私えらいので、これも「調査」として記録しておく。",
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
