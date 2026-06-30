import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import swup from "@swup/astro";
import Compress from "astro-compress";
import icon from "astro-icon";
import { defineConfig } from "astro/config";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive"; /* Handle directives */
import remarkGithubAdmonitionsToDirectives from "remark-github-admonitions-to-directives";
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import { AdmonitionComponent } from "./src/plugins/rehype-component-admonition.mjs";
import { GithubCardComponent } from "./src/plugins/rehype-component-github-card.mjs";
import { parseDirectiveNode } from "./src/plugins/remark-directive-rehype.js";
import { remarkExcerpt } from "./src/plugins/remark-excerpt.js";
import { remarkHasMath } from "./src/plugins/remark-has-math.js";
import { remarkReadingTime } from "./src/plugins/remark-reading-time.mjs";

const dataStorePath = fileURLToPath(new URL("./.astro/data-store.json", import.meta.url));

function externalAstroContentDataStore() {
  return {
    name: "external-astro-content-data-store",
    apply: "build",
    transform(_code, id) {
      // Astro 7 turns the content data store into a huge ESM literal. Keep the
      // module tiny so Vite/Rolldown does not parse that generated payload.
      if (id === "\0astro:data-layer-content") {
        if (!existsSync(dataStorePath)) {
          return {
            code: "export default []",
            map: { mappings: "" },
          };
        }

        JSON.parse(readFileSync(dataStorePath, "utf-8"));

        return {
          code: `
import { readFileSync } from "node:fs";

export default JSON.parse(readFileSync(${JSON.stringify(dataStorePath)}, "utf-8"));
`,
          map: { mappings: "" },
        };
      }
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: "https://wsafight.github.io",
  base: "personBlog",
  trailingSlash: "always",
  integrations: [
    swup({
      theme: false,
      animationClass: "transition-swup-", // see https://swup.js.org/options/#animationselector
      // the default value `transition-` cause transition delay
      // when the Tailwind class `transition-all` is used
      containers: ["main", "#toc"],
      smoothScrolling: true,
      cache: true,
      preload: {
        hover: true,
        visible: false,
      },
      accessibility: true,
      updateHead: true,
      updateBodyClass: false,
      globalInstance: true,
    }),
    icon({
      include: {
        "material-symbols": [
          "calendar-today-outline-rounded",
          "edit-calendar-outline-rounded",
          "book-2-outline-rounded",
          "tag-rounded",
          "search-rounded",
          "notes-rounded",
          "schedule-outline-rounded",
          "chevron-left-rounded",
          "chevron-right-rounded",
          "keyboard-arrow-up-rounded",
          "more-horiz",
          "home-outline-rounded",
          "palette-outline",
          "menu-rounded",
          "copyright-outline-rounded",
        ],
        "fa6-brands": ["creative-commons", "github"],
        "fa6-regular": ["address-card"],
        "fa6-solid": ["arrow-up-right-from-square"],
      },
    }),
    sitemap(),
    Compress({
      // CSSO does not understand Tailwind 4's modern media query syntax like
      // `@media (width >= 64rem)` and drops responsive rules in production.
      CSS: false,
      HTML: true,
      JavaScript: false,
      Image: false,
      SVG: true,
      Action: {
        Passed: async () => true, // https://github.com/PlayForm/Compress/issues/376
      },
    }),
  ],
  markdown: {
    // Astro v7 默认使用 Sätteri 渲染 Markdown,这里显式切换回 unified 管道,
    // 以便继续复用现有的 remark / rehype 插件(KaTeX、Admonition、Autolink 等)。
    processor: unified({
      remarkPlugins: [
        remarkMath,
        remarkHasMath,
        remarkReadingTime,
        remarkExcerpt,
        remarkGithubAdmonitionsToDirectives,
        remarkDirective,
        remarkSectionize,
        parseDirectiveNode,
      ],
      rehypePlugins: [
        rehypeKatex,
        rehypeSlug,
        [
          rehypeComponents,
          {
            components: {
              github: GithubCardComponent,
              note: (x, y) => AdmonitionComponent(x, y, "note"),
              tip: (x, y) => AdmonitionComponent(x, y, "tip"),
              important: (x, y) => AdmonitionComponent(x, y, "important"),
              caution: (x, y) => AdmonitionComponent(x, y, "caution"),
              warning: (x, y) => AdmonitionComponent(x, y, "warning"),
            },
          },
        ],
        [
          rehypeAutolinkHeadings,
          {
            behavior: "append",
            properties: {
              className: ["anchor"],
            },
            content: {
              type: "element",
              tagName: "span",
              properties: {
                className: ["anchor-icon"],
                "data-pagefind-ignore": true,
              },
              children: [
                {
                  type: "text",
                  value: "#",
                },
              ],
            },
          },
        ],
      ],
    }),
    syntaxHighlight: {
      type: "prism",
      excludeLangs: [
        "math",
        "caddy",
        "tsrx",
        "gritql",
        "grit",
        "slint",
        "wxml",
        "make",
        "prisma",
        "conf",
        "asm",
        "moonbit",
        "TS",
        "TypeScript",
        "svelte",
        "vue",
      ],
    },
    shikiConfig: {
      langAlias: {
        TS: "typescript",
        TypeScript: "typescript",
        conf: "ini",
        wxml: "xml",
      },
    },
  },
  vite: {
    plugins: [externalAstroContentDataStore(), tailwindcss()],
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          // temporarily suppress this warning
          if (
            warning.message.includes("is dynamically imported by") &&
            warning.message.includes("but also statically imported by")
          ) {
            return;
          }
          warn(warning);
        },
      },
    },
  },
});
