#!/usr/bin/env node
// One layout for every product file: top-level fields on their own lines, and one part, step or
// note per line, so a change to a part shows up as a one-line diff.
//
//   node tools/format-product.mjs [product.json ...]     reformats in place (default: all products)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function formatProduct(product) {
  const lines = Object.entries(product).map(([key, value]) => {
    const body = Array.isArray(value) && value.length
      ? `[\n${value.map((item) => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]`
      : JSON.stringify(value);
    return `  ${JSON.stringify(key)}: ${body}`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const productsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'guide', 'products');
  const files = process.argv.length > 2
    ? process.argv.slice(2)
    : fs.readdirSync(productsDir).filter((f) => f.endsWith('.json')).map((f) => path.join(productsDir, f));
  for (const file of files) {
    fs.writeFileSync(file, formatProduct(JSON.parse(fs.readFileSync(file, 'utf8'))));
    console.log(`Formatted ${path.relative(process.cwd(), file)}`);
  }
}
