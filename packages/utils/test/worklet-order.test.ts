import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A worklet captures the functions it calls when it is created. Calling a
 * function declared further down the same file works in plain JS (hoisting)
 * but is `undefined` on the UI thread, which crashed the full player
 * ("undefined is not a function" in stepRing). Worklets may only call
 * functions declared above them.
 */
const ROOT = join(__dirname, '..', '..', '..');
const sources = [join(ROOT, 'packages/core/src/visualizer-scenes.ts')];

function laterCalls(src: string): string[] {
  const declared = new Map<string, number>();
  for (const m of src.matchAll(/function\s+(\w+)\s*\(/g)) if (!declared.has(m[1]!)) declared.set(m[1]!, m.index!);
  const problems: string[] = [];
  for (const m of src.matchAll(/function\s+(\w+)\s*\([^)]*\)[^{]*\{\s*'worklet'/g)) {
    const open = src.indexOf('{', m.index!);
    let depth = 0;
    let end = open;
    for (; end < src.length; end++) {
      if (src[end] === '{') depth++;
      else if (src[end] === '}' && --depth === 0) break;
    }
    for (const c of src.slice(open, end).matchAll(/\b(\w+)\s*\(/g)) {
      const at = declared.get(c[1]!);
      if (at != null && at > m.index! && c[1] !== m[1]) problems.push(`${m[1]} → ${c[1]}`);
    }
  }
  return [...new Set(problems)];
}

describe('worklets', () => {
  it.each(sources)('only call functions declared above them: %s', (file) => {
    expect(laterCalls(readFileSync(file, 'utf8'))).toEqual([]);
  });

  it('the check catches the stepRing crash', () => {
    const src = `function a() {\n  'worklet';\n  return b();\n}\nfunction b() {\n  'worklet';\n  return 1;\n}`;
    expect(laterCalls(src)).toEqual(['a → b']);
  });
});
