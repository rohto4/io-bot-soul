export type MemoryDepth = "normal" | "reminisce" | "reference";

export type NoteHint = {
  topic: string;
  tone: string;
  memoryDepth: MemoryDepth;
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

function drawMemoryDepth(rand: () => number): MemoryDepth {
  const r = rand();
  if (r < 0.05) return "reference";  // 5%: 過去の1件に言及
  if (r < 0.10) return "reminisce";  // 5%: 蓄積から連想
  return "normal";                    // 90%: 記憶を掘り返さない
}

export function drawNoteHint(random: () => number = Math.random): NoteHint {
  return {
    topic: topics[Math.floor(random() * topics.length)],
    tone: tones[Math.floor(random() * tones.length)],
    memoryDepth: drawMemoryDepth(random),
  };
}
