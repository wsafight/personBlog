import { rm } from "node:fs/promises";

const removeuselessJs = async (file) => {
  await rm(file, { force: true, recursive: true });
}

removeuselessJs("dist/pagefind/pagefind-highlight.js");
removeuselessJs("dist/pagefind/pagefind-modular-ui.css");
removeuselessJs("dist/pagefind/pagefind-modular-ui.js");
removeuselessJs("dist/pagefind/pagefind-ui.js");
removeuselessJs("dist/pagefind/pagefind-ui.css");
