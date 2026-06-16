const windows874Decoder = new TextDecoder('windows-874');
const windows874Reverse = new Map<string, number>();

for (let byte = 0; byte <= 255; byte += 1) {
  const char = windows874Decoder.decode(Uint8Array.of(byte));
  if (char.length === 1 && !windows874Reverse.has(char)) {
    windows874Reverse.set(char, byte);
  }
}

function hasEncodingControlChars(value: string) {
  return Array.from(value).some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 0x80 && code <= 0x9f;
  });
}

function scoreText(value: string) {
  let score = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x80 && code <= 0x9f) score += 100;
    if (code === 0xfffd) score += 100;
  }
  return score;
}

function encodeWindows874(value: string) {
  const bytes: number[] = [];

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

export function repairThaiMojibake(value: string) {
  if (!hasEncodingControlChars(value)) return value;

  const bytes = encodeWindows874(value);
  if (!bytes) return value;

  const repaired = bytes.toString('utf8');
  return scoreText(repaired) < scoreText(value) ? repaired : value;
}

export function isUnreadableThaiFragment(value: string) {
  let baseLetters = 0;
  let marksAndLeadingVowels = 0;

  for (const char of value.replace(/\s/g, '')) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x0e01 && code <= 0x0e2e) baseLetters += 1;
    if (
      code === 0x0e31 ||
      (code >= 0x0e34 && code <= 0x0e3a) ||
      (code >= 0x0e40 && code <= 0x0e4e)
    ) {
      marksAndLeadingVowels += 1;
    }
  }

  return marksAndLeadingVowels >= 3 && baseLetters === 0;
}
