// Mapping of all weekly Torah portions and special Shabbatot.
// `slug` is the URL-safe Latin transliteration; `he` is the Hebrew display name.
// `cycleOrder` is the canonical position in the annual reading cycle, with
// combined parshiot using a fractional position between their two halves.

export const PARSHIOT = [
  { slug: 'bereshit', he: 'בראשית', cycleOrder: 1 },
  { slug: 'noach', he: 'נח', cycleOrder: 2 },
  { slug: 'lech-lecha', he: 'לך לך', cycleOrder: 3 },
  { slug: 'vayera', he: 'וירא', cycleOrder: 4 },
  { slug: 'chayei-sara', he: 'חיי שרה', cycleOrder: 5 },
  { slug: 'toldot', he: 'תולדות', cycleOrder: 6 },
  { slug: 'vayetze', he: 'ויצא', cycleOrder: 7 },
  { slug: 'vayishlach', he: 'וישלח', cycleOrder: 8 },
  { slug: 'vayeshev', he: 'וישב', cycleOrder: 9 },
  { slug: 'miketz', he: 'מקץ', cycleOrder: 10 },
  { slug: 'vayigash', he: 'ויגש', cycleOrder: 11 },
  { slug: 'vayechi', he: 'ויחי', cycleOrder: 12 },
  { slug: 'shemot', he: 'שמות', cycleOrder: 13 },
  { slug: 'vaera', he: 'וארא', cycleOrder: 14 },
  { slug: 'bo', he: 'בא', cycleOrder: 15 },
  { slug: 'beshalach', he: 'בשלח', cycleOrder: 16 },
  { slug: 'yitro', he: 'יתרו', cycleOrder: 17 },
  { slug: 'mishpatim', he: 'משפטים', cycleOrder: 18 },
  { slug: 'terumah', he: 'תרומה', cycleOrder: 19 },
  { slug: 'tetzaveh', he: 'תצוה', cycleOrder: 20 },
  { slug: 'ki-tisa', he: 'כי תשא', cycleOrder: 21 },
  { slug: 'vayakhel', he: 'ויקהל', cycleOrder: 22, combinable: 'vayakhel-pekudei' },
  { slug: 'pekudei', he: 'פקודי', cycleOrder: 23 },
  { slug: 'vayakhel-pekudei', he: 'ויקהל-פקודי', cycleOrder: 22.5, combined: ['vayakhel', 'pekudei'] },
  { slug: 'vayikra', he: 'ויקרא', cycleOrder: 24 },
  { slug: 'tzav', he: 'צו', cycleOrder: 25 },
  { slug: 'shemini', he: 'שמיני', cycleOrder: 26 },
  { slug: 'tazria', he: 'תזריע', cycleOrder: 27, combinable: 'tazria-metzora' },
  { slug: 'metzora', he: 'מצורע', cycleOrder: 28 },
  { slug: 'tazria-metzora', he: 'תזריע-מצורע', cycleOrder: 27.5, combined: ['tazria', 'metzora'] },
  { slug: 'acharei-mot', he: 'אחרי מות', cycleOrder: 29, combinable: 'acharei-mot-kedoshim' },
  { slug: 'kedoshim', he: 'קדושים', cycleOrder: 30 },
  { slug: 'acharei-mot-kedoshim', he: 'אחרי מות-קדושים', cycleOrder: 29.5, combined: ['acharei-mot', 'kedoshim'] },
  { slug: 'emor', he: 'אמור', cycleOrder: 31 },
  { slug: 'behar', he: 'בהר', cycleOrder: 32, combinable: 'behar-bechukotai' },
  { slug: 'bechukotai', he: 'בחקתי', cycleOrder: 33 },
  { slug: 'behar-bechukotai', he: 'בהר-בחקתי', cycleOrder: 32.5, combined: ['behar', 'bechukotai'] },
  { slug: 'bamidbar', he: 'במדבר', cycleOrder: 34 },
  { slug: 'naso', he: 'נשא', cycleOrder: 35 },
  { slug: 'behaalotcha', he: 'בהעלתך', cycleOrder: 36 },
  { slug: 'shelach', he: 'שלח', cycleOrder: 37 },
  { slug: 'korach', he: 'קרח', cycleOrder: 38 },
  { slug: 'chukat', he: 'חקת', cycleOrder: 39, combinable: 'chukat-balak' },
  { slug: 'balak', he: 'בלק', cycleOrder: 40 },
  { slug: 'chukat-balak', he: 'חקת-בלק', cycleOrder: 39.5, combined: ['chukat', 'balak'] },
  { slug: 'pinchas', he: 'פינחס', cycleOrder: 41 },
  { slug: 'matot', he: 'מטות', cycleOrder: 42, combinable: 'matot-masei' },
  { slug: 'masei', he: 'מסעי', cycleOrder: 43 },
  { slug: 'matot-masei', he: 'מטות-מסעי', cycleOrder: 42.5, combined: ['matot', 'masei'] },
  { slug: 'devarim', he: 'דברים', cycleOrder: 44 },
  { slug: 'vaetchanan', he: 'ואתחנן', cycleOrder: 45 },
  { slug: 'eikev', he: 'עקב', cycleOrder: 46 },
  { slug: 'reeh', he: 'ראה', cycleOrder: 47 },
  { slug: 'shoftim', he: 'שפטים', cycleOrder: 48 },
  { slug: 'ki-tetze', he: 'כי תצא', cycleOrder: 49 },
  { slug: 'ki-tavo', he: 'כי תבא', cycleOrder: 50 },
  { slug: 'nitzavim', he: 'נצבים', cycleOrder: 51, combinable: 'nitzavim-vayelech' },
  { slug: 'vayelech', he: 'וילך', cycleOrder: 52 },
  { slug: 'nitzavim-vayelech', he: 'נצבים-וילך', cycleOrder: 51.5, combined: ['nitzavim', 'vayelech'] },
  { slug: 'haazinu', he: 'האזינו', cycleOrder: 53 },
  { slug: 'vezot-haberacha', he: 'וזאת הברכה', cycleOrder: 54 },

  { slug: 'rosh-hashana', he: 'ראש השנה', cycleOrder: 100 },
  { slug: 'yom-kippur', he: 'יום כיפור', cycleOrder: 101 },
  { slug: 'sukkot', he: 'סוכות', cycleOrder: 102 },
  { slug: 'chol-hamoed-sukkot', he: 'שבת חול המועד סוכות', cycleOrder: 103 },
  { slug: 'shemini-atzeret', he: 'שמיני עצרת', cycleOrder: 104 },
  { slug: 'simchat-torah', he: 'שמחת תורה', cycleOrder: 105 },
  { slug: 'chanukah', he: 'חנוכה', cycleOrder: 106 },
  { slug: 'tu-bishvat', he: 'ט"ו בשבט', cycleOrder: 107 },
  { slug: 'purim', he: 'פורים', cycleOrder: 108 },
  { slug: 'pesach', he: 'פסח', cycleOrder: 109 },
  { slug: 'chol-hamoed-pesach', he: 'שבת חול המועד פסח', cycleOrder: 110 },
  { slug: 'shevii-pesach', he: 'שביעי של פסח', cycleOrder: 111 },
  { slug: 'lag-baomer', he: 'ל"ג בעומר', cycleOrder: 112 },
  { slug: 'shavuot', he: 'שבועות', cycleOrder: 113 },
];

export const PARSHA_BY_SLUG = Object.fromEntries(
  PARSHIOT.map((p) => [p.slug, p])
);

export const PARSHA_BY_HE = Object.fromEntries(
  PARSHIOT.map((p) => [p.he, p])
);

export function cycleOrderForSlug(slug) {
  const p = PARSHA_BY_SLUG[slug];
  return p?.cycleOrder ?? 999;
}

// Pairs that can be combined; used to build the dropdown groupings
export const COMBINABLE_PAIRS = PARSHIOT
  .filter((p) => p.combined)
  .map((p) => ({ combined: p, parts: p.combined.map((s) => PARSHA_BY_SLUG[s]) }));

export function slugForHebrew(heName) {
  const cleaned = heName.replace(/^פרשת\s+/, '').trim();
  const direct = PARSHA_BY_HE[cleaned];
  if (direct) return direct.slug;
  const normalize = (s) => s.replace(/[׳״'"`׳״]/g, '').replace(/\s+/g, ' ').trim();
  const target = normalize(cleaned);
  const match = PARSHIOT.find((p) => normalize(p.he) === target);
  return match ? match.slug : null;
}

export function hebrewForSlug(slug) {
  return PARSHA_BY_SLUG[slug]?.he || slug;
}

const HEBREW_LETTER_VALUES = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
  'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50,
  'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200,
  'ש': 300, 'ת': 400,
};

export function hebrewYearToNumber(heYear) {
  const cleaned = heYear.replace(/[׳״'"`׳״\s]/g, '');
  let value = 5000;
  for (const ch of cleaned) {
    if (HEBREW_LETTER_VALUES[ch] !== undefined) {
      value += HEBREW_LETTER_VALUES[ch];
    }
  }
  return String(value);
}

export function numberToHebrewYear(num) {
  let n = parseInt(num, 10) - 5000;
  if (n <= 0 || n >= 1000) return String(num);
  const letters = [];
  const tav = 400;
  while (n >= tav) { letters.push('ת'); n -= tav; }
  const hundreds = ['', 'ק', 'ר', 'ש'];
  if (n >= 100) {
    letters.push(hundreds[Math.floor(n / 100)]);
    n = n % 100;
  }
  if (n === 15) {
    letters.push('ט', 'ו');
    n = 0;
  } else if (n === 16) {
    letters.push('ט', 'ז');
    n = 0;
  }
  if (n >= 10) {
    const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    letters.push(tens[Math.floor(n / 10)]);
    n = n % 10;
  }
  if (n > 0) {
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    letters.push(ones[n]);
  }
  if (letters.length >= 2) {
    return letters.slice(0, -1).join('') + '״' + letters[letters.length - 1];
  }
  return letters.join('') + '׳';
}
