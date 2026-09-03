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
   page. The stories are the product. Anything in planned.json is listed after
   them, greyed and unlinked, so the shape of the series is visible from the
   first story onward. */
function indexPage(stories, planned) {
  const cards = stories
    .map(
      (s, i) => `      <li class="item"><a class="in" href="./${s.id}/">
        <span class="n">FIG. ${String(i + 1).padStart(2, "0")} — PUBLISHED</span>
        <span class="sub">${escapeHtml(s.subject)}${
          s.klass ? ` <i>${escapeHtml(s.klass)}</i>` : ""
        }</span>
        <span class="dek">${escapeHtml(s.dek)}</span>${
          s.loss ? `\n        <span class="loss">${escapeHtml(s.loss)}</span>` : ""
        }
      </a></li>`
    )
    .join("\n");
  const soon = planned
    .map(
      (s, i) => `      <li class="item soon"><span class="in">
        <span class="n">FIG. ${String(stories.length + i + 1).padStart(2, "0")} — PLANNED</span>
        <span class="sub">${escapeHtml(s.subject)} <i>${escapeHtml(s.klass)}</i></span>
        <span class="dek">${escapeHtml(s.dek)}</span>${
          s.loss ? `\n        <span class="loss">${escapeHtml(s.loss)}</span>` : ""
        }
      </span></li>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#E7EBEE">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='4' fill='%23E7EBEE'/%3E%3Cpath d='M8 16h13M15 10l6 6-6 6' fill='none' stroke='%23D9531E' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<title>How It Broke</title>
<style>
  :root{--ground:#E7EBEE;--panel:#FBFCFD;--edge:#AEBCC8;--edge-hi:#5E7488;
    --ink:#16232D;--ink2:#53646F;--ink3:#84939E;--accent:#D9531E;
    --display:Futura,"Gill Sans","Avenir Next",-apple-system,sans-serif;
    --body:Charter,Georgia,Cambria,"Times New Roman",serif;
    --mono:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,monospace;
    --lift:0 0 0 1px var(--edge-hi),0 14px 30px -14px rgba(22,35,45,.35)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--ink);font:400 19px/1.62 var(--body);
    padding:64px 22px 120px;-webkit-font-smoothing:antialiased;
    background-image:linear-gradient(rgba(94,116,136,.07) 1px,transparent 1px),
      linear-gradient(90deg,rgba(94,116,136,.07) 1px,transparent 1px);
    background-size:26px 26px}
  main{max-width:720px;margin:0 auto}
  .brand{font:600 15px/1 var(--mono);color:var(--accent);letter-spacing:.14em;text-transform:uppercase}
  h1{font:500 36px/1.16 var(--display);text-transform:uppercase;letter-spacing:.02em;
    margin:22px 0 0;text-wrap:balance}
  .lede{color:var(--ink2);margin:16px 0 0;max-width:52ch;font-size:19px}
  .list{list-style:none;padding:0;margin:44px 0 0;display:grid;grid-template-columns:1fr;gap:18px}
  .item .in{display:block;height:100%;text-decoration:none;color:inherit;
    background:var(--panel);border:1px solid var(--edge);padding:20px 22px;position:relative;
    transition:border-color .2s ease,box-shadow .2s ease}
  .item .in::before,.item .in::after{content:"";position:absolute;width:9px;height:9px;
    pointer-events:none;border:0 solid var(--edge-hi);transition:border-color .2s}
  .item .in::before{top:-1px;left:-1px;border-top-width:2px;border-left-width:2px}
  .item .in::after{bottom:-1px;right:-1px;border-bottom-width:2px;border-right-width:2px}
  a.in:hover{border-color:var(--edge-hi);box-shadow:var(--lift)}
  a.in:hover::before,a.in:hover::after{border-color:var(--accent)}
  a.in:hover .sub{color:var(--accent)}
  .n{display:block;font:500 11px/1 var(--mono);letter-spacing:.12em;color:var(--ink3);margin-bottom:12px}
  .sub{display:block;font:600 12.5px/1.3 var(--mono);letter-spacing:.07em;text-transform:uppercase;
    color:var(--ink3);transition:color .2s}
  .sub i{font-style:normal;color:var(--accent);margin-left:8px}
  .dek{display:block;margin-top:10px;font-size:17px;line-height:1.55;color:var(--ink)}
  .loss{display:inline-block;margin-top:12px;font:600 13px/1 var(--mono);
    font-variant-numeric:tabular-nums;color:var(--accent)}
  .soonhead{font:600 12.5px/1 var(--mono);letter-spacing:.09em;text-transform:uppercase;
    color:var(--ink3);margin:56px 0 0}
  li.soon .in{background:rgba(251,252,253,.55)}
  li.soon .dek{color:var(--ink2)}
  li.soon .sub{color:var(--ink3)}
  li.soon .sub i{color:var(--ink3)}
  li.soon .loss{color:var(--ink2);font-weight:400}
  @media(max-width:640px){h1{font-size:27px}body{font-size:17.5px;padding-top:44px}}
</style>
</head>
<body>
<main>
  <div class="brand">How It Broke</div>
  <h1>Every failure, at the depth you want.</h1>
  <p class="lede">One incident per page, from a single sentence down to the calldata. You choose the depth.</p>
  <ul class="list">
${cards}
  </ul>
  <h2 class="soonhead">Coming soon</h2>
  <ul class="list">
${soon}
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
  const planned = JSON.parse(await read("planned.json"));
  await writeFile(join(here, "dist/index.html"), indexPage(built, planned), "utf8");
  console.log(
    `dist/index.html  ${built.length} published, ${planned.length} coming soon`
  );
}
