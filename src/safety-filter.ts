// 軽量テキストフィルタ: 明らかなNGワードをAI判定前に弾く
// AI分類（classify-quote-safety / classify-experience-candidate）の前段として使用

const NG_PATTERNS: RegExp[] = [
  // 成人向け・性的表現
  /エ[ロ口]い|エッチ|淫乱|淫語|性交|セックス|チ[ンﾝ]コ|マ[ンﾝ]コ|AV女優|ＡＶ女優|エロ動画|エロ画像|エロ漫画/i,
  // 暴力・攻撃的
  /死ね[よやぁあ]|殺[すし]|消えろ|氏ね|ブス|キチガイ|ガイジ|クソ[野奴]郎|クソガキ/,
  // 激しい炎上・罵倒
  /([ぶブ][すス]|[ば馬][かカ])め|バ[カか]にしてる|ゴミ[野奴]郎|てめえ[らﾗ]|お前ら[はが]最悪/,
];

export function passesLightweightFilter(text: string): boolean {
  return !NG_PATTERNS.some(pattern => pattern.test(text));
}
