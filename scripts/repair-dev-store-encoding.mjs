import fs from 'node:fs';
import path from 'node:path';

const storePath = path.resolve('data', 'dev-store.json');
const windows874Decoder = new TextDecoder('windows-874');
const windows874Reverse = new Map();

for (let byte = 0; byte <= 255; byte += 1) {
  const char = windows874Decoder.decode(Uint8Array.of(byte));
  if (char.length === 1 && !windows874Reverse.has(char)) {
    windows874Reverse.set(char, byte);
  }
}

function hasEncodingControlChars(value) {
  return Array.from(value).some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 0x80 && code <= 0x9f;
  });
}

function scoreText(value) {
  let score = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x80 && code <= 0x9f) score += 100;
    if (code === 0xfffd) score += 100;
  }
  return score;
}

function encodeWindows874(value) {
  const bytes = [];

  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) {
      bytes.push(code);
      continue;
    }

    const byte = windows874Reverse.get(char);
    if (byte === undefined) return null;
    bytes.push(byte);
  }

  return Buffer.from(bytes);
}

function repairThaiMojibake(value) {
  if (typeof value !== 'string' || !hasEncodingControlChars(value)) return value;

  const bytes = encodeWindows874(value);
  if (!bytes) return value;

  const repaired = bytes.toString('utf8');
  return scoreText(repaired) < scoreText(value) ? repaired : value;
}

function repairObject(value, changes, pathParts = []) {
  if (typeof value === 'string') {
    const repaired = repairThaiMojibake(value);
    if (repaired !== value) {
      changes.push({
        path: pathParts.join('.'),
        before: value,
        after: repaired,
      });
    }
    return repaired;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => repairObject(item, changes, [...pathParts, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        repairObject(item, changes, [...pathParts, key]),
      ])
    );
  }

  return value;
}

if (!fs.existsSync(storePath)) {
  console.log('No data/dev-store.json file found.');
  process.exit(0);
}

const raw = fs.readFileSync(storePath, 'utf8').replace(/^\uFEFF/, '');
const data = JSON.parse(raw);
const changes = [];
const repaired = repairObject(data, changes);

if (!changes.length) {
  console.log('No mojibake encoding issues found.');
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.resolve('data', `dev-store.before-encoding-repair-${timestamp}.json`);
fs.copyFileSync(storePath, backupPath);
fs.writeFileSync(storePath, JSON.stringify(repaired, null, 2), 'utf8');

console.log(
  JSON.stringify(
    {
      backup: path.relative(process.cwd(), backupPath),
      repairedFields: changes.length,
      changes,
    },
    null,
    2
  )
);

