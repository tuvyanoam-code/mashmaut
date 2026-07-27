// Smart defaults for the "upload bulletin" admin form: the coming Shabbat's
// parsha, that week's Friday Hebrew date, the Hebrew year, and the next issue
// number. Everything here is a *default* — the form leaves each field editable.
//
// Uses @hebcal/core (the Israel reading schedule) for the calendar maths so
// leap years, combined parshiot and festival weeks are all handled correctly.
// hebcal is imported dynamically inside the async function, so it lands in its
// own lazy chunk and never ships in the public site bundle.

import { PARSHIOT, numberToHebrewYear } from './parshiot.js';

// hebcal's English month name → the site's preferred Hebrew spelling.
// (Av is traditionally written מנחם־אב on this site; the rest are plain.)
const HEB_MONTHS = {
  Nisan: 'ניסן', Iyyar: 'אייר', Sivan: 'סיון', Tamuz: 'תמוז',
  Av: 'מנחם־אב', Elul: 'אלול', Tishrei: 'תשרי', Cheshvan: 'חשון',
  Kislev: 'כסלו', Tevet: 'טבת', "Sh'vat": 'שבט', Adar: 'אדר',
  'Adar I': 'אדר א׳', 'Adar II': 'אדר ב׳', 'Adar 1': 'אדר א׳', 'Adar 2': 'אדר ב׳',
};

// Strip Hebrew nikud / cantillation (combining marks) from hebcal output.
const stripNikud = (s) => String(s || '').replace(/[֑-ׇ]/g, '');

// Map a hebcal parsha basename to the site's slug by POSITION in the annual
// cycle — robust against transliteration/spelling differences (hebcal
// "Beha'alotcha" vs site "behaalotcha", "Re'eh" vs "reeh", …). hebcal's
// `parshiot` array is the 54 portions in reading order, which lines up with
// the site's integer cycleOrder 1…54.
function buildParshaMap(hebcalParshiot) {
  const byName = {};
  hebcalParshiot.forEach((name, i) => {
    const site = PARSHIOT.find((p) => p.cycleOrder === i + 1);
    if (site) byName[name] = site.slug;
  });
  return byName;
}

function basenameToSlug(basename, byName) {
  if (!basename) return null;
  if (byName[basename]) return byName[basename]; // single portion (incl. "Lech-Lecha")
  if (basename.includes('-')) {
    // Combined week, e.g. "Matot-Masei" / "Achrei Mot-Kedoshim".
    const parts = basename.split('-').map((s) => byName[s.trim()]);
    if (parts.length === 2 && parts[0] && parts[1]) {
      const combo = PARSHIOT.find(
        (p) => p.combined && p.combined[0] === parts[0] && p.combined[1] === parts[1],
      );
      if (combo) return combo.slug;
    }
  }
  return null;
}

// Next sequential issue number = highest existing + 1. Data-driven, so it works
// even if the calendar library fails to load.
export function nextIssueNumber(weeks) {
  const nums = (weeks || [])
    .map((w) => parseInt(w.issueNumber, 10))
    .filter((n) => !Number.isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : null;
}

/**
 * Compute editable defaults for a new bulletin.
 * @param {Array} weeks   existing bulletins (from index.json) — for the next
 *                        issue number and to skip already-published weeks.
 * @param {Date}  refDate reference "today" (defaults to now).
 * @returns {Promise<{issueNumber:?number, parshaSlug:?string, dateLabel:?string,
 *                    yearId:?string, yearDisplay:?string}>}
 */
export async function computeUploadDefaults(weeks = [], refDate = new Date()) {
  const out = {
    issueNumber: nextIssueNumber(weeks),
    parshaSlug: null,
    dateLabel: null,
    yearId: null,
    yearDisplay: null,
  };
  try {
    const { HDate, HebrewCalendar, gematriya, parshiot } = await import('@hebcal/core');
    const byName = buildParshaMap(parshiot);

    // The coming Shabbat (Saturday) on/after refDate.
    const startH = new HDate(refDate);
    let shabbat = startH.add((6 - startH.getDay() + 7) % 7, 'd');

    const forShabbat = (sat) => {
      let slug = null;
      const evs = HebrewCalendar.calendar({
        start: sat.greg(), end: sat.greg(), il: true, sedrot: true, noHolidays: true,
      });
      for (const e of evs) {
        const s = basenameToSlug(e.basename(), byName);
        if (s) { slug = s; break; }
      }
      const fri = sat.subtract(1, 'd');
      const month = HEB_MONTHS[fri.getMonthName()]
        || stripNikud((fri.render('he').split(' ')[1]) || '');
      const yearId = String(fri.getFullYear());
      return {
        slug,
        dateLabel: `${gematriya(fri.getDate())} ${month}`.trim(),
        yearId,
        yearDisplay: numberToHebrewYear(yearId),
      };
    };

    // Land on the next Shabbat that doesn't already have a bulletin, so opening
    // the form right after publishing this week suggests next week. Capped.
    let info = forShabbat(shabbat);
    for (let i = 0; i < 8; i++) {
      const exists = info.slug
        && weeks.some((w) => String(w.yearId) === info.yearId && w.slug === info.slug);
      if (!exists) break;
      shabbat = shabbat.add(7, 'd');
      info = forShabbat(shabbat);
    }

    out.parshaSlug = info.slug;
    out.dateLabel = info.dateLabel;
    out.yearId = info.yearId;
    out.yearDisplay = info.yearDisplay;
  } catch (e) {
    // Calendar library unavailable → keep the issue-number default; the form
    // stays fully usable and the moderator fills the rest by hand.
    console.warn('hebrewCalendar defaults failed:', e && e.message);
  }
  return out;
}
