import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream";
import { createGzip } from "node:zlib";

const gzipCode = (file) => {
  const gzip =  createGzip({ level: 9 })
  const source = createReadStream(file);
  const destination = createWriteStream(`${file}.gz`);
  
  pipeline(source, gzip, destination, (err) => {
    if (err) {
      console.error('An error occurred:', err);
      process.exitCode = 1;
    }
  });
}

gzipCode('dist/pagefind/pagefind.js');
gzipCode('dist/pagefind/pagefind-ui.js');
gzipCode('dist/pagefind/pagefind-modular-ui.js');
gzipCode('dist/pagefind/pagefind-highlight.js');


gzipCode('dist/pagefind/pagefind-ui.css');
gzipCode('dist/pagefind/pagefind-modular-ui.css');
