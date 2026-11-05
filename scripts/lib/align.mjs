// Parses align/chNN.txt files: "J1-J3 = E2" lines that pair Japanese and English sentence ids.
export function parseAlignment(src, jpIds, enIds) {
  const range = (spec, ids, prefix) => {
    if (spec === '-') return [];
    const [a, b = a] = spec.split('-').map((x) => Number(x.replace(prefix, '')));
    const out = [];
    for (let i = a; i <= b; i++) out.push(`${prefix}${i}`);
    return out;
  };
  const groups = [];
  for (const [ln, raw] of src.split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^(J\d+(?:-J\d+)?)\s*=\s*(E\d+(?:-E\d+)?|-)$/);
    if (!m) throw new Error(`align line ${ln + 1}: cannot parse "${raw}"`);
    groups.push({ jp: range(m[1], jpIds, 'J'), en: range(m[2], enIds, 'E') });
  }
  const check = (key, ids) => {
    const seen = groups.flatMap((g) => g[key]);
    const expect = ids.join(',');
    if (seen.join(',') !== expect) {
      const miss = ids.filter((id) => !seen.includes(id));
      const extra = seen.filter((id, i) => seen.indexOf(id) !== i || !ids.includes(id));
      throw new Error(`alignment ${key.toUpperCase()}: missing [${miss.join(' ')}] duplicate/unknown [${extra.join(' ')}] (or out of order)`);
    }
  };
  check('jp', jpIds);
  check('en', enIds);
  return groups;
}

