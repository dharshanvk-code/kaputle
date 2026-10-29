#!/usr/bin/env node
// Turns an assembly-manual PDF into a product file for the guide player.
//
//   npm run manual -- path/to/manual.pdf [--out guide/products/my-table.json] [--name "My table"]
//
// Claude reads the manual, drafts the file, and the draft is checked against what the player
// expects. If the check finds problems, Claude gets the list and fixes them (up to twice).
// Needs Anthropic credentials: ANTHROPIC_API_KEY, or an `ant auth login` profile.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { validateProduct, SHAPES, MATERIALS, TOOLS } from './validate-product.mjs';
import { formatProduct } from './format-product.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const MODEL = 'claude-opus-5-5';
const MAX_REPAIRS = 2;

function parseArgs(argv) {
  const args = { pdf: null, out: null, name: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--name') args.name = argv[++i];
    else if (a === '-h' || a === '--help') args.help = true;
    else if (!args.pdf) args.pdf = a;
  }
  return args;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';

// The example is our own bookshelf, so the model sees the exact format the player reads.
const example = JSON.stringify(JSON.parse(fs.readFileSync(path.join(repo, 'guide/products/bookshelf.json'), 'utf8')));

const SYSTEM = `You convert product assembly manuals into product files for a 3D assembly-guide player. The player builds every part from the file, lays the box contents out on the floor, and animates each step. Accuracy to the manual matters most: the right parts, the right counts, the manual's part numbers, the manual's order, and the right connections. Exact dimensions matter less.

Reply with exactly one JSON object inside a \`\`\`json code fence and nothing after the fence.

# Coordinates
- Centimetres. x runs left to right across the product, y is up, z runs back to front (front is +z). The floor is y = 0.
- "pos" is where a part sits in the FINISHED product standing the right way up, even when the manual builds it upside down.
- Boards are boxes centred on "pos", with "size" [x, y, z] in the finished orientation.
- Dowels and pins are cylinders centred on "pos". Screws and nails have their HEAD at "pos" and the shaft pointing along "dir". Knobs are centred on "pos", with "dir" pointing from the knob's head into the face it's fixed to.
- "dir" (all non-board parts) is the direction the part moves as it goes in, in the finished product's frame.

# Product
- "name": what the product is, in plain words. No brand names.
- "spec": one short line in this pattern: the finish, then "built from an N-page paper manual · sizes estimated", for example "Black-brown · built from an 8-page paper manual · sizes estimated". Leave out the size; the player works it out from the parts.
- "startFlipped": "x" or "z", only if the manual starts the build upside down.
- "startPose": {"axis": "x" or "z", "angle": degrees} instead, if the build starts on its side or front. For example {"axis": "z", "angle": -90} is lying on its right side; {"axis": "x", "angle": 90} is lying on its front.
- "parts", "steps": as below.
- "notes": an array of strings listing every estimate, ambiguity, or manual step you simplified.

# Parts
- "id": unique and short, for example "legL", "bolt1".
- "name": plain English, for example "Hanger bolt".
- "label": the part number printed in the manual (for example "114334"), or the letter the manual gives a board, or "" if there is none.
- "shape": one of ${SHAPES.join(', ')}.
- "size" for boards; "radius" and "length" for every other shape.
- "pos", and "dir" for every non-board part.
- "material": one of ${MATERIALS.join(', ')}. Pick the closest finish.
- "parent" (optional): the id of a part this one is fitted to BEFORE that part is placed, for example bolts screwed into a leg that is still lying flat. The child then travels with its parent. Boards can have parents too (a drawer's sides fitted to its front), and parents can nest.
- "stageUp" (optional, on a part that others are fitted to on the floor): the face, as a direction in the finished product, that faces up while it's worked on. For example [0, 0, -1] for a drawer front lying face down.

# Steps
- "manual": the step number printed in the manual.
- "title": short and imperative. "text": one or two plain sentences saying what to do, naming tool part numbers where the manual shows them.
- "tool": one of ${TOOLS.join(', ')}.
- "parts": the ids fitted in this step.
- "slide": for hardware, how far (cm) it travels along "dir" as it goes in. "spin": turns while going in, for anything screwed or turned.
- "from": [x, y, z], the offset a board comes in from. "approach": {"id": [x, y, z]} when parts in one step come from different sides.
- "lower": cm. Lifts everything built so far, brings this step's part in underneath, then lowers the assembly onto it. Use it when the manual lowers a sub-assembly onto a part lying on the floor.
- "view": camera direction in degrees around the product: 0 front, 90 right side, 180 back.
- Flip step: {"type": "flip", "axis": "x", "title": "...", "text": "...", "tool": "Hands", "parts": []} turns the whole assembly over. Add "angle" (degrees, default 180) for a quarter turn, for example to stand up a build that was lying on its side.
- Turn step: {"type": "turn", "turn": ["id", ...], "pose": "upsideDown", "title": "...", "text": "...", "tool": "Hands", "parts": []} turns parts that are being worked on on the floor. "pose" is "upright", "upsideDown" or "over" (turned over where it lies); or give "up": [x, y, z], the face (in the finished product's frame) to turn upward. Only parts without a parent can be turned.
- "from" and "approach" are in the world frame as the viewer sees it at that step, after any flips so far. With "local": true they are in the finished product's frame instead, which is easier for parts fitted to something on the floor. "dir" is always in the finished product's frame.
- "manual" can be a string such as "65–66" when one step covers two manual steps that have nothing to animate on their own.

# Rules
1. Follow the manual's order exactly. Make one step per numbered manual step. Split a numbered step into consecutive sub-steps only when it shows clearly separate actions, and give each sub-step the same "manual" number. Don't add steps the manual doesn't show, except a final flip when the manual builds upside down and leaves turning it over implied; leave "manual" off that step.
2. List every physical piece separately: "4x" means four parts. Give matching boards names that tell them apart by position, for example "Left side panel" and "Right side panel". Every part is fitted in exactly one step. Tools such as the supplied wrench or Allen key are not parts; name them in the step text.
3. Use the manual's printed part numbers as hardware labels.
4. Manuals rarely give measurements. Estimate sizes from the drawings' proportions and typical sizes for that kind of product, and record each estimate in "notes".
5. Line hardware up with what it joins: a dowel joining a shelf end to a side panel is centred on the joint face, half in each board.
6. If the manual fits hardware to a part while that part lies on the floor, use "parent". If it builds upside down or on its side, set "startFlipped" or "startPose" and build in that orientation. When the manual turns a sub-assembly over on the floor, add a turn step.
7. Leave out steps that only fix the product to a wall (drilling, wall plugs). Mention them in "notes".

# Example of the format (a different product, written by hand)
${example}`;

function extractJson(text) {
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const body = fences.length ? fences.at(-1)[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(body);
}

// After a server-side fallback, thinking blocks written before the switch must not be echoed back.
function echoable(content) {
  const lastFallback = content.map((b) => b.type).lastIndexOf('fallback');
  if (lastFallback < 0) return content;
  return content.filter((b, i) => i > lastFallback || !['thinking', 'redacted_thinking', 'tool_use'].includes(b.type));
}

async function ask(client, messages) {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  let chars = 0;
  let shown = false;
  const tick = setInterval(() => {
    shown = true;
    process.stdout.write(`\r  thinking and writing… ${chars.toLocaleString()} characters so far`);
  }, 1000);
  stream.on('text', (t) => (chars += t.length));
  try {
    return await stream.finalMessage();
  } finally {
    clearInterval(tick);
    if (shown) process.stdout.write('\r' + ' '.repeat(60) + '\r');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.pdf) {
    console.log('Usage: node tools/manual-to-guide.mjs <manual.pdf> [--out guide/products/name.json] [--name "Product name"]');
    process.exit(args.help ? 0 : 2);
  }
  const pdf = fs.readFileSync(args.pdf);
  const client = new Anthropic();
  const messages = [{
    role: 'user',
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
      {
        type: 'text',
        text: `Turn this assembly manual into a product file.${args.name ? ` Call the product "${args.name}".` : ''} Read every page before you start, then write the JSON.`,
      },
    ],
  }];

  console.log(`Reading ${path.basename(args.pdf)} with ${MODEL}…`);
  let product = null;
  let problems = [];
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const message = await ask(client, messages);
    if (message.stop_reason === 'refusal') throw new Error('Claude declined this request. Try a different manual.');
    if (message.stop_reason === 'max_tokens') throw new Error('The product file was too long to finish. Try a manual with fewer parts.');
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    try {
      product = extractJson(text);
      problems = validateProduct(product);
    } catch (e) {
      product = null;
      problems = [`The reply wasn't valid JSON: ${e.message}`];
    }
    const u = message.usage;
    console.log(`  attempt ${attempt + 1}: ${u.input_tokens + (u.cache_read_input_tokens || 0)} tokens in, ${u.output_tokens} out, ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
    if (!problems.length) break;
    if (attempt === MAX_REPAIRS) break;
    messages.push({ role: 'assistant', content: echoable(message.content) });
    messages.push({
      role: 'user',
      content: `The product file has these problems:\n${problems.map((p) => `- ${p}`).join('\n')}\n\nFix them and reply with the complete corrected JSON in a \`\`\`json fence.`,
    });
  }

  if (!product) throw new Error(`Couldn't get a usable product file:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  const out = args.out || path.join(repo, 'guide/products', `${slug(product.name || path.basename(args.pdf, '.pdf'))}.json`);
  fs.writeFileSync(out, formatProduct(product));
  const rel = path.relative(repo, out);
  console.log(`\nWrote ${rel}: ${product.parts.length} parts, ${product.steps.length} steps.`);
  if (problems.length) {
    console.log(`\nStill ${problems.length} problem${problems.length === 1 ? '' : 's'} after ${MAX_REPAIRS} fixes. Edit the file by hand:`);
    for (const p of problems) console.log(`  - ${p}`);
  }
  if (product.notes?.length) {
    console.log('\nThings to check (estimates and simplifications):');
    for (const n of product.notes) console.log(`  - ${n}`);
  }
  console.log(`\nOpen it at guide/?product=${path.basename(out, '.json')}`);
  process.exit(problems.length ? 1 : 0);
}

main().catch((err) => {
  if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(err?.message || '')) {
    console.error('No working Anthropic credentials. Set ANTHROPIC_API_KEY, or run `ant auth login`.');
  } else if (err instanceof Anthropic.RateLimitError) {
    console.error('Rate limited by the API. Wait a minute and try again.');
  } else if (err instanceof Anthropic.APIError) {
    console.error(`The API returned an error (${err.status}): ${err.message}`);
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
});
