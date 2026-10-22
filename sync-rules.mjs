/* ===== オンライン版のルールと効果音を、index.html に流しこむ =====
   使いかた:  node sync-rules.mjs [オンライン版のフォルダ]
   （省略すると ../door-world-online。DOOR_WORLD_ONLINE でも指定できる）

   index.html は file:// で開いても動かしたいので、ES モジュールの import が使えない。
   そこで、オンライン版の public/rules.js と public/se.js の中身を
   「export を外して名前空間（R / SE）にまとめた形」で、index.html の印のあいだに書きこむ。
   印のあいだは毎回まるごと書きかわるので、手で直さないこと。
   ルール・文言を直したいときは、オンライン版の rules.js を直してからこれを流す。 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const online = resolve(process.argv[2] || process.env.DOOR_WORLD_ONLINE || join(here, "..", "door-world-online"));
const htmlPath = join(here, "index.html");

/* モジュールを、export を外した即時関数にする。export していた名前だけを返す */
function inline(file, ns) {
  let src = readFileSync(file, "utf8");
  const names = new Set();
  /* export { a, b, c }; のまとめ書き */
  src = src.replace(/^export\s*\{([\s\S]*?)\};?[ \t]*$/gm, (_, list) => {
    list.split(",").map(s => s.trim()).filter(Boolean).forEach(n => names.add(n.split(/\s+as\s+/).pop()));
    return "";
  });
  /* export function f / export const x */
  src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => {
    names.add(name);
    return `${kw} ${name}`;
  });
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`${file}: 取りのぞけない import/export が残っています`);
  return `const ${ns} = (() => {\n${src.trim()}\nreturn { ${[...names].join(", ")} };\n})();`;
}

/* どの版から取りこんだかを残しておく（あとで「どこまでそろっているか」を見るため） */
function sourceLabel() {
  try {
    const rev = execFileSync("git", ["-C", online, "log", "-1", "--format=%h %cs"], { encoding: "utf8" }).trim();
    const br = execFileSync("git", ["-C", online, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["-C", online, "status", "--porcelain", "public/rules.js", "public/se.js"], { encoding: "utf8" }).trim();
    return `${br} ${rev}${dirty ? "（未コミットの変更あり）" : ""}`;
  } catch { return "（git の情報なし）"; }
}

function replaceBlock(html, tag, body) {
  const re = new RegExp(`(/\\* @sync:${tag} begin[^\\n]*\\n)[\\s\\S]*?(/\\* @sync:${tag} end \\*/)`);
  if (!re.test(html)) throw new Error(`index.html に @sync:${tag} の印が見つかりません`);
  return html.replace(re, (_, a, b) => a + body + "\n" + b);
}

for (const f of ["public/rules.js", "public/se.js"])
  if (!existsSync(join(online, f))) { console.error(`見つかりません: ${join(online, f)}`); process.exit(1); }

const label = sourceLabel();
let html = readFileSync(htmlPath, "utf8");
const before = html;
html = replaceBlock(html, "rules", `/* 取りこみ元: door-world-online/public/rules.js — ${label} */\n` + inline(join(online, "public/rules.js"), "R"));
html = replaceBlock(html, "se", `/* 取りこみ元: door-world-online/public/se.js — ${label} */\n` + inline(join(online, "public/se.js"), "SE"));

/* 書きこんだものが、ちゃんとスクリプトとして読めるかを確かめる */
for (const tag of ["rules", "se"]) {
  const m = html.match(new RegExp(`/\\* @sync:${tag} begin[^\\n]*\\n([\\s\\S]*?)/\\* @sync:${tag} end \\*/`));
  try { new Function(m[1]); } catch (e) { console.error(`@sync:${tag} の中身が読めません: ${e.message}`); process.exit(1); }
}

if (html === before) console.log(`変更なし（${label}）`);
else { writeFileSync(htmlPath, html); console.log(`index.html を更新しました（${label}）`); }
