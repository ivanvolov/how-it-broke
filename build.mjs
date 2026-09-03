/* Builds every story into a self-contained HTML file under dist/.
 *
 *   npm run build                       every folder in stories/
 *   node build.mjs stories/nomad-bridge  just that one
 *
 * No dependencies, and the output has none either: styles, script and the whole
 * story are inlined, so a built page runs from a file:// path, an email
 * attachment, or any static host.
 *
 * A story is markdown. Parts are `## Part N · Title`, and inside each part the
 * levels of detail are `### L1` … `### L5`. The levels are ADDITIVE — level 3
 * renders L1 + L2 + L3 as one continuous text rather than replacing what came
 * before — which is why the parser keeps each level as its own chunk instead of
 * flattening them: the page appends them one at a time as the reader expands.
 *
 * Parts and levels are counted from the file. A sixth level, or a fourth part,
 * needs no change here.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFile(join(here, p), "utf8");

/* --- markdown ------------------------------------------------------------- */

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Inline spans. Code is stashed behind a NUL-delimited marker first, so its
   contents are never re-parsed as emphasis and never escaped twice. */
function inline(s) {
  const code = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => "\u0000" + (code.push(c) - 1) + "\u0000");
  s = escapeHtml(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s.replace(
    /\u0000(\d+)\u0000/g,
    (_, i) => "<code>" + escapeHtml(code[Number(i)]) + "</code>"
  );
}

/* Block level: fenced code, tables, lists, paragraphs. */
function blocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];

    if (ln.startsWith("```")) {
      const lang = ln.slice(3).trim();
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i]);
      i++;
      out.push(
        '<pre class="lang-' + escapeHtml(lang) + '">' + escapeHtml(body.join("\n")) + "</pre>"
      );
      continue;
    }

    if (ln.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(
          lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
        );
        i++;
      }
      const head = rows[0];
      const body = rows.slice(1).filter((r) => !/^[-: ]*$/.test(r.join("")));
      out.push(
        "<table><thead><tr>" +
          head.map((c) => "<th>" + inline(c) + "</th>").join("") +
          "</tr></thead><tbody>" +
          body
            .map((r) => "<tr>" + r.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>")
            .join("") +
          "</tbody></table>"
      );
      continue;
    }

    const ordered = /^\d+\.\s+/.test(ln);
    if (ln.startsWith("- ") || ordered) {
      const tag = ordered ? "ol" : "ul";
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(?:- |\d+\.\s+)(.*)/);
        if (!m) break;
        const item = [m[1]];
        for (i++; i < lines.length && lines[i].startsWith("  ") && lines[i].trim(); i++) {
          item.push(lines[i].trim());
        }
        items.push(item.join(" "));
      }
      out.push(
        "<" + tag + ">" + items.map((x) => "<li>" + inline(x) + "</li>").join("") + "</" + tag + ">"
      );
      continue;
    }

    if (!ln.trim()) {
      i++;
      continue;
    }

    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("|") &&
      !lines[i].startsWith("- ")
    ) {
      if (/^\d+\.\s+/.test(lines[i]) && para.length) break;
      para.push(lines[i]);
      i++;
    }
    out.push("<p>" + inline(para.join(" ")) + "</p>");
  }
  return out.join("");
}

/* --- story file ----------------------------------------------------------- */

/* `key: value` frontmatter. Values are plain text, never markdown. */
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return [{}, text];
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return [meta, text.slice(m[0].length)];
}

function parse(body) {
  const parts = [];
  let cur = null;
  let level = null;
  for (const raw of body.split("\n")) {
    const part = raw.match(/^##\s+Part\s+(\d+)\s*[·.\-]\s*(.+)$/);
    const lvl = raw.match(/^###\s+L(\d)\s*$/);
    if (part) {
      cur = { n: Number(part[1]), title: part[2].trim(), levels: new Map() };
      parts.push(cur);
      level = null;
    } else if (lvl && cur) {
      level = Number(lvl[1]);
      cur.levels.set(level, []);
    } else if (raw.trim() === "---") {
      level = null; // a horizontal rule closes the level; it is not content
    } else if (cur && level) {
      cur.levels.get(level).push(raw);
    }
  }
  return parts.map((p) => ({
    n: p.n,
    title: p.title,
    levels: [...p.levels.keys()].sort((a, b) => a - b).map((k) => blocks(p.levels.get(k))),
  }));
}

/* --- emit ----------------------------------------------------------------- */

const REQUIRED = ["title", "subject", "dek"];

async function buildStory(dir, template) {
  const id = basename(dir);
  const [meta, body] = frontmatter(await read(join(dir, "story.md")));
  for (const key of REQUIRED) {
    if (!meta[key]) throw new Error(`${dir}/story.md is missing "${key}:" in its frontmatter`);
  }
  const parts = parse(body);
  if (!parts.length) throw new Error(`${dir}/story.md has no "## Part N · Title" headings`);

  // replacer functions, not strings: a title containing $& or $$ would
  // otherwise be interpreted as a replacement pattern
  const put = (s, token, value) => s.replace(token, () => value);
  let html = template;
  html = put(html, "__TITLE__", escapeHtml(meta.title));
  html = put(html, "__HEADLINE__", escapeHtml(meta.title));
  html = put(html, "__SUBJECT__", escapeHtml(meta.subject));
  html = put(html, "__DEK__", escapeHtml(meta.dek));
  html = put(html, "__DATA__", JSON.stringify(parts));

  await mkdir(join(here, "dist", id), { recursive: true });
  await writeFile(join(here, "dist", id, "index.html"), html, "utf8");
  const shape = parts.map((p) => p.levels.length).join(",");
  console.log(`dist/${id}/  ${parts.length} parts [${shape}]  ${(html.length / 1024) | 0} KB  «${meta.title}»`);
  return { id, ...meta, parts: parts.length };
}

/* The index is deliberately plain: it is a table of contents, not a landing
   page. The stories are the product. */
function indexPage(stories) {
  const cards = stories
    .map(
      (s) => `      <li><a href="./${s.id}/">
        <b>${escapeHtml(s.subject)}</b>
        <span>${escapeHtml(s.dek)}</span>
      </a></li>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#FAF9F5">
<title>How It Broke</title>
<style>
  :root{--paper:#FAF9F5;--ink:#141413;--ink2:#5F5E59;--ink3:#93918A;--rule:#E7E4DB;--clay:#C15F3C;
    --serif:Tiempos,Charter,Georgia,Cambria,"Times New Roman",serif;
    --sans:Styrene,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font:400 20px/1.65 var(--serif);
    padding:64px 22px 120px;-webkit-font-smoothing:antialiased}
  main{max-width:680px;margin:0 auto}
  .brand{font:600 15px/1 var(--sans);color:var(--clay)}
  h1{font:600 42px/1.15 var(--sans);letter-spacing:-.03em;margin:20px 0 0}
  .lede{color:var(--ink2);margin:16px 0 0;max-width:60ch}
  ul{list-style:none;padding:0;margin:44px 0 0}
  li{border-top:1px solid var(--rule)}
  li:last-child{border-bottom:1px solid var(--rule)}
  a{display:block;padding:22px 0;text-decoration:none;color:inherit}
  a:hover b{color:var(--clay)}
  b{display:block;font:600 13px/1 var(--sans);letter-spacing:.06em;text-transform:uppercase;
    color:var(--ink3);transition:color .2s}
  span{display:block;margin-top:10px;font-size:19px;color:var(--ink)}
</style>
</head>
<body>
<main>
  <div class="brand">How It Broke</div>
  <h1>Security failures, at the depth you want them.</h1>
  <p class="lede">Every story is three parts, and every part has five levels of detail you dial
  yourself. One sentence, or the post-mortem. Same page.</p>
  <ul>
${cards}
  </ul>
</main>
</body>
</html>
`;
}

const template = await read("template.html");
const only = process.argv[2];
const dirs = only
  ? [only.replace(/\/$/, "")]
  : (await readdir(join(here, "stories"), { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => join("stories", d.name))
      .sort();

const built = [];
for (const dir of dirs) built.push(await buildStory(dir, template));

if (!only) {
  await writeFile(join(here, "dist/index.html"), indexPage(built), "utf8");
  console.log(`dist/index.html  ${built.length} ${built.length === 1 ? "story" : "stories"}`);
}
