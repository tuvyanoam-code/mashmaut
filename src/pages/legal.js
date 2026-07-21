// Static legal pages required for Israeli business-website compliance:
//   /accessibility — הצהרת נגישות (Equal Rights for People with Disabilities Law / IS 5568 AA)
//   /privacy       — מדיניות פרטיות (Privacy Protection Law, amendment 13)
// Both render into #app with the standard nav + footer chrome. Content is
// static and trusted (no user input), so it's inlined directly.

import { navHtml, footerHtml, bindNav } from '../components/nav.js';
import { loadConfig } from '../lib/store.js';
import { setPageSeo } from '../lib/seo.js';

const CONTACT_EMAIL = 'alon@alonmashmaut.org';
const OWNER = 'מערכת עלון משמעות';
const COORDINATOR = 'טוביה נעם לויט';
const UPDATED = 'יולי 2026';

async function renderShell(inner, { title, description, path }) {
  const app = document.getElementById('app');
  const [config, nav] = await Promise.all([loadConfig(), navHtml()]);
  app.innerHTML = `
    ${nav}
    <main class="legal-page fade-in">
      ${inner}
    </main>
    ${footerHtml(config)}
  `;
  bindNav();
  setPageSeo({ title, description, path });
  window.scrollTo(0, 0);
}

export async function renderAccessibility() {
  const inner = `
    <article class="legal">
      <h1 class="legal-title">הצהרת נגישות</h1>
      <p class="legal-lead">${OWNER} רואה חשיבות רבה במתן שירות שוויוני לכלל הגולשים, ופועלת להנגשת האתר כך שיהיה נוח לשימוש גם עבור אנשים עם מוגבלות.</p>

      <h2>רמת ההנגשה</h2>
      <p>האתר הונגש בהתאם להנחיות התקן הישראלי (ת"י 5568), המבוסס על הנחיות הנגישות הבינלאומיות WCAG 2.0 ברמה AA.</p>

      <h2>מה הונגש באתר</h2>
      <ul>
        <li><b>רכיב נגישות</b> — כפתור ייעודי בפינת המסך פותח תפריט נגישות: הגדלת והקטנת טקסט, מצב ניגודיות גבוהה, הדגשת קישורים, ועצירת אנימציות.</li>
        <li><b>ניווט מקלדת מלא</b> — ניתן להגיע לכל הקישורים, הכפתורים והשדות באמצעות מקש Tab בלבד, עם סימון ברור של הפוקוס.</li>
        <li><b>טקסט חלופי לתמונות</b> — לתמונות באתר יש תיאור טקסטואלי הנקרא על ידי קוראי מסך.</li>
        <li><b>מבנה סמנטי</b> — כותרות, אזורים ותוויות מסומנים לטובת טכנולוגיות מסייעות.</li>
        <li><b>ניגודיות צבעים</b> — הטקסטים תוכננו לעמוד ביחסי ניגודיות תקינים מול הרקע.</li>
      </ul>

      <h2>מגבלות ידועות</h2>
      <p>קובצי ה-PDF של העלונים עשויים שלא להיות נגישים במלואם — אך הטקסט המלא של כל עלון זמין גם כדף אינטרנט נגיש באתר. כמו כן, תכנים שנכתבים על ידי גולשים באזור השיחות אינם בשליטת המערכת. אנו ממשיכים לשפר את הנגישות באופן שוטף.</p>

      <h2>נתקלת בבעיה? נשמח לשמוע</h2>
      <p>אם נתקלת בקושי בגלישה או בבעיית נגישות כלשהי, נשמח שתעדכן את רכז הנגישות ונפעל לתקן זאת בהקדם:</p>
      <ul class="legal-contact">
        <li><b>רכז הנגישות:</b> ${COORDINATOR}</li>
        <li><b>דוא"ל:</b> <a href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('פנייה בנושא נגישות — עלון משמעות')}">${CONTACT_EMAIL}</a></li>
      </ul>

      <p class="legal-updated">עודכן לאחרונה: ${UPDATED}</p>
    </article>
  `;
  await renderShell(inner, {
    title: 'הצהרת נגישות · עלון משמעות',
    description: 'הצהרת הנגישות של אתר עלון משמעות ופרטי רכז הנגישות.',
    path: '/accessibility',
  });
}

export async function renderPrivacy() {
  const inner = `
    <article class="legal">
      <h1 class="legal-title">מדיניות פרטיות</h1>
      <p class="legal-lead">אתר עלון משמעות ("האתר") מכבד את פרטיותך. מדיניות זו מסבירה איזה מידע נאסף, לשם מה, ומה זכויותיך. האחראי על המידע: ${OWNER} (${COORDINATOR}), בדוא"ל <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

      <h2>איזה מידע נאסף</h2>
      <ul>
        <li><b>הרשמה לדיוור:</b> השם המלא וכתובת הדוא"ל שאתה מזין בטופס ההרשמה.</li>
        <li><b>השתתפות בשיחות:</b> שם התצוגה שבחרת, כתובת דוא"ל (לצורך התראות על תגובות), ותוכן ההודעות שאתה מפרסם. כן נשמר מזהה טכני אקראי של הדפדפן, כדי לקשר בין ההודעות שלך ולאפשר לך לערוך או למחוק אותן.</li>
        <li><b>נתוני שימוש:</b> מידע כללי על השימוש באתר (עמודים שנצפו, סוג מכשיר, ואזור גיאוגרפי משוער לפי כתובת ה-IP) — לצורך הבנת השימוש ושיפור האתר.</li>
        <li><b>מדידת דיוור:</b> אם נרשמת לדיוור, אנו מודדים פתיחת מיילים ולחיצות על קישורים (באמצעות פיקסל וקישורי מעקב), כדי לדעת אילו תכנים מעניינים ולשפר.</li>
      </ul>

      <h2>אחסון מקומי בדפדפן</h2>
      <p>האתר שומר בדפדפן שלך (localStorage) העדפות ונתונים מקומיים — למשל שם התצוגה שלך בשיחות, מיקום הקריאה האחרון, והעדפות התראה. מידע זה נשמר במכשיר שלך בלבד. <b>האתר אינו עושה שימוש בעוגיות (cookies) של צד שלישי לצורכי פרסום.</b></p>

      <h2>לשם מה משמש המידע</h2>
      <p>לשליחת העלון השבועי, לניהול אזור השיחות ולמשלוח ההתראות שביקשת, ולשיפור האתר והתוכן. איננו עושים במידע שימוש אחר.</p>

      <h2>שיתוף מידע</h2>
      <p>איננו מוכרים את המידע ואיננו מעבירים אותו לצדדים שלישיים למטרות שיווק. לצורך הפעלת השירות אנו נעזרים בספקי תשתית מקובלים: Resend (משלוח דוא"ל), Cloudflare (תשתית ואבטחה) ו-GitHub Pages (אחסון האתר).</p>

      <h2>זכויותיך</h2>
      <ul>
        <li><b>הסרה מהדיוור:</b> בכל מייל שנשלח קיים קישור להסרה מיידית מרשימת התפוצה.</li>
        <li><b>עיון, תיקון או מחיקה:</b> באפשרותך לפנות אלינו בכל עת בבקשה לעיין במידע שלך, לתקנו או למחוק אותו — בדוא"ל <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. נטפל בפנייה בזמן סביר.</li>
      </ul>

      <h2>אבטחת מידע</h2>
      <p>אנו נוקטים באמצעים סבירים ומקובלים לשמירה על המידע ולמניעת גישה לא מורשית אליו. עם זאת, אין אמצעי אבטחה מושלם, ואיננו יכולים להבטיח הגנה מוחלטת.</p>

      <h2>שינויים במדיניות</h2>
      <p>נעדכן מדיניות זו מעת לעת. הגרסה המעודכנת תפורסם תמיד בעמוד זה.</p>

      <p class="legal-updated">עודכן לאחרונה: ${UPDATED}</p>
    </article>
  `;
  await renderShell(inner, {
    title: 'מדיניות פרטיות · עלון משמעות',
    description: 'מדיניות הפרטיות של אתר עלון משמעות — איזה מידע נאסף, לשם מה, ומה זכויותיך.',
    path: '/privacy',
  });
}
