# משמעות — אתר עלון פרשת השבוע

אתר ציבורי, פאנל ניהול ענני, רשימת תפוצה במייל, ולוח אנליטיקס לעלון השבועי **משמעות**.

> **חי על**: https://alonmashmaut.org · **ניהול**: https://alonmashmaut.org/admin · **API**: https://api.alonmashmaut.org

---

## מה האתר עושה

- **ארכיון מסודר** של כל העלונים, ממוין אוטומטית לפי סדר הפרשיות בכל שנה
- **דף ייעודי לכל עלון** עם URL ייחודי וקריא (`/y/5786/emor`) — שיתוף בוואטסאפ פותח ישירות את העלון
- **שני אופני קריאה**: PDF (iframe נטיב) או טקסט מעוצב (HTML מומר מ-Word)
- **חיפוש מתקדם** בעברית בתוך כל העלונים, כולל ניקוד, פרשיות וכותרות
- **חוויית קריאה מלאה**: אינדקס צד אינטראקטיבי, זמן קריאה משוער, עיגול התקדמות, חגיגה (קונפטי + בלונים + צלצול) בסוף
- **כפתורי שיתוף** ב-WhatsApp / Telegram / Email / SMS / Copy
- **רישום למייל**: כל יום חמישי 17:00 UTC נשלח אוטומטית עלון השבוע למנויים
- **גרף אנליטיקס**: צפיות, סיומי קריאה, שיתופים, דפדפנים חוזרים, פירוט לפי מדינה/עיר
- **פאנל ניהול ענני**: גישה מכל מחשב/טלפון בכניסה עם סיסמה
- **עיצוב מותאם לכל עלון**: צבעים נחלצים אוטומטית מה-PDF, ניתנים לעריכה ידנית

---

## ארכיטקטורה

```
                  ┌─────────────────────────┐
   קוראים   ────► │ alonmashmaut.org        │  ← אתר סטטי
                  │ (GitHub Pages)          │
                  └────────────┬────────────┘
                               │
                  ┌────────────▼────────────┐
                  │ public/data/            │  ← תוכן (JSON+PDF) ב-repo
                  │  index.json             │
                  │  config.json            │
                  │  bulletins/{year}/...   │
                  └─────────────────────────┘
                               ▲
   מנהל     ─►  /admin  ─►     │
                  ┌────────────┴────────────┐
                  │ api.alonmashmaut.org    │  ← Cloudflare Worker
                  │  /admin/*  (auth)       │     • כותב לגיטהאב דרך
                  │  /subscribe             │       Contents API
                  │  /event   (analytics)   │     • שולח מייל דרך Resend
                  │  cron 17:00 UTC ר׳      │     • מאחסן KV (מנויים+אירועים)
                  └────────────┬────────────┘
                               │
                  ┌────────────┴────────────┐
                  │ GitHub Actions          │
                  │ build → deploy to Pages │
                  └─────────────────────────┘
```

**קצב עדכון**: שינוי בפאנל הניהול → push לגיטהאב → Actions בונה → תוך כ-60 שניות באתר.

---

## תוכן עכשיו

- **תשפ״ה (5785)**: 18 עלונים (#1-18) — בהר-בחקתי → נצבים
- **תשפ״ו (5786)**: 32 עלונים (#19-50) — וילך → אמור

---

## טכנולוגיות

| שכבה | טכנולוגיה |
|---|---|
| Frontend | Vanilla JS + Vite (ללא framework) |
| עיצוב | CSS עם משתנים, RTL, גופנים: Assistant + Heebo + Rubik |
| חיפוש | פנימי, scan + normalize של עברית |
| המרת Word | mammoth.js (browser build) |
| חילוץ צבעים | pdf.js + Canvas (ב-browser) |
| Backend | Cloudflare Worker (JavaScript) |
| Storage | KV (מנויים + אירועים), GitHub repo (תוכן) |
| Email | Resend עם דומיין מאומת |
| Hosting | GitHub Pages |
| DNS | Cloudflare Registrar (alonmashmaut.org) |

---

## מבנה הפרויקט

```
mashmaut-site/
├── public/
│   ├── index.html                    SPA shell (decoder for SPA fallback)
│   ├── 404.html                      GH-Pages SPA fallback (encoder)
│   ├── CNAME                         alonmashmaut.org
│   └── data/                         ────────── התוכן הציבורי ──────────
│       ├── config.json               כותרות, מיילים, apiBase
│       ├── index.json                רשימת שנים + עלונים (סיכום)
│       └── bulletins/{year}/         לכל עלון: .json + .pdf + .docx (אופציונלי)
│           └── {slug}.json           week object עם textHtml, colors, headings...
│
├── src/                              ────────── קוד הפרונט ──────────
│   ├── main.js                       רישום ראוטים
│   ├── router.js                     History API, BASE detection
│   ├── icons.js                      28 SVG אייקונים מינימליים
│   ├── pages/
│   │   ├── home.js                   Hero + העלון השבוע
│   │   ├── years.js                  ארכיון שנים
│   │   ├── year.js                   רשת עלונים בשנה (לפי סדר פרשיות)
│   │   ├── bulletin.js               תצוגת טקסט + TOC + reading progress
│   │   ├── pdfView.js                iframe ל-PDF
│   │   ├── search.js                 דף חיפוש
│   │   ├── admin.js                  פאנל ניהול ענני (login + CRUD)
│   │   └── admin/stats.js            לוח אנליטיקס
│   ├── components/
│   │   ├── nav.js                    נאוויגיישן + קישורי קריאה למייל
│   │   ├── shareButtons.js           כפתורי שיתוף + toast
│   │   ├── bulletinCard.js           קלף עלון
│   │   ├── readingProgress.js        עיגול התקדמות + צלצול + קונפטי + בלונים
│   │   ├── richEditor.js             contenteditable עם הדגשה (mark)
│   │   └── subscribeModal.js         מודל רישום + יצירת קשר
│   ├── lib/
│   │   ├── parshiot.js               54 פרשיות + 7 מחוברות + cycleOrder
│   │   ├── store.js                  טעינת config/index/bulletin
│   │   ├── shareLinks.js             builder ל-URLs של ערוצי שיתוף
│   │   ├── searchIndex.js            scan-based Hebrew search
│   │   ├── analytics.js              tracker אנונימי (sendBeacon)
│   │   ├── api.js                    apiCall wrapper
│   │   └── fileProcess.js            mammoth + pdf.js (browser)
│   └── styles/
│       ├── base.css                  reset, vars, typography, nav, footer
│       ├── components.css            hero, bulletin reader, TOC, modal,
│       │                             reading progress, confetti, balloons
│       └── admin.css                 admin shell, dropzone, table, charts
│
├── worker/                           ────────── Cloudflare Worker ──────────
│   ├── wrangler.toml                 Account ID, KV bindings, cron, vars
│   ├── src/index.js                  כל ה-API: subscribe, event, admin/*, cron
│   ├── package.json                  wrangler
│   ├── setup.sh                      התקנה חד-פעמית (KV+secrets+deploy)
│   └── .dev.vars                     [GIT-IGNORED] מפתחות לפיתוח לוקאלי
│
├── scripts/
│   ├── bulk-import.js                ייבוא תיקיית PDFs בכמות
│   └── publish.js                    ידני: git add+commit+push
│
├── .github/workflows/
│   └── deploy.yml                    on push: vite build → deploy to Pages
│
├── package.json
├── vite.config.js
└── README.md                         (הקובץ הזה)
```

---

## תשתית ענן

### Cloudflare
- **חשבון**: alonmashmaut@gmail.com
- **Account ID**: `ea19fdb623516ff23c6cc375bea912bb`
- **דומיין**: `alonmashmaut.org` ב-Cloudflare Registrar (~$10/שנה)
- **Worker**: `mashmaut-api` (https://api.alonmashmaut.org + workers.dev fallback)
- **KV namespaces**:
  - `EMAILS` (be1997254a314cd0bc359175cb933073) — `sub:<email>` → JSON
  - `EVENTS` (f7a3af92250640d8ac96ee4a83847860) — `cnt:DATE:dim:val` ו-`fp:<id>`
- **Cron**: `0 17 * * 4` (חמישי 17:00 UTC)

### Resend
- **דומיין מאומת**: `alonmashmaut.org` (DKIM + SPF + DMARC ב-DNS)
- **שולח מ-**: `alon@alonmashmaut.org`
- **תוכנית חינם**: 100 מיילים/יום, 3,000/חודש

### GitHub
- **ריפו**: https://github.com/tuvyanoam-code/mashmaut (Public)
- **Pages**: source = GitHub Actions
- **Custom domain**: alonmashmaut.org (CNAME ב-public/CNAME)

### DNS (ב-Cloudflare)
| רשומה | סוג | תוכן |
|---|---|---|
| alonmashmaut.org | A × 4 | 185.199.108-111.153 (GitHub Pages) |
| www | CNAME | tuvyanoam-code.github.io |
| api | AAAA (proxied) | bound ל-Worker |
| resend._domainkey | TXT | DKIM של Resend |
| send | MX (10) | feedback-smtp.us-east-1.amazonses.com |
| send | TXT | `v=spf1 include:amazonses.com ~all` |

---

## סודות (Secrets)

כל הסודות חיים ב-Worker בלבד (`wrangler secret put`), לא בקוד.

| שם | תפקיד |
|---|---|
| `RESEND_API_KEY` | מפתח Full Access של Resend (`re_*`) |
| `ADMIN_API_KEY` | סיסמת הכניסה לפאנל הניהול |
| `GITHUB_TOKEN` | טוקן push לריפו (משמש את ה-Worker לכתוב לגיטהאב) |

**הסיסמה הנוכחית של הניהול**: `mashmaut-K9p4Qx8nVz2RmL7tBdF3wY`
(לשינוי: `cd worker && echo "<new>" | npx wrangler secret put ADMIN_API_KEY`)

---

## שגרת עבודה — הוספת עלון חדש

1. כניסה ל-https://alonmashmaut.org/admin
2. **העלאת עלון** → גרירת Word (אופציונלי) ו-PDF, בחירת פרשה ושנה
3. שמירה — ה-Worker דוחף את הקבצים לגיטהאב, GitHub Actions בונה, תוך כדקה באתר
4. בעלון השבועי שצריך להופיע במסך הבית — סמן את הכוכב ב-**עלונים**

ה-Worker ידאג לשליחה אוטומטית לכל המנויים בחמישי הבא.

---

## פיתוח מקומי

```bash
git clone https://github.com/tuvyanoam-code/mashmaut.git
cd mashmaut
npm install
npm run dev          # אתר + פאנל ב-http://localhost:5173
```

הפאנל לוקאלית מתחבר ל-`api.alonmashmaut.org` בענן (אותו ה-Worker שבייצור). אין צורך בשרת לוקאלי.

### בנייה ידנית (בדרך כלל לא נדרש — Actions עושה את זה)

```bash
npm run build        # יוצר dist/
```

### עריכת ה-Worker

```bash
cd worker
npx wrangler login   # פעם אחת
npx wrangler deploy  # אחרי שינוי src/index.js
npx wrangler tail    # לוגים בזמן אמת
```

### ייבוא תיקיית עלונים בכמות

```bash
npm run import -- --src "/path/to/folder" --year "תשפ\"ז"
```

הסקריפט מזהה אוטומטית פרשיות בעברית (כולל ניקוד, מקף עברי ־, פרשיות מחוברות).

---

## ניתוב (Routes)

| נתיב | מה מוצג |
|---|---|
| `/` | מסך הבית — Hero + העלון השבוע |
| `/years` | רשימת כל השנים |
| `/y/:year` | ארכיון שנה (ממוין לפי סדר פרשיות) |
| `/y/:year/:slug` | תצוגת טקסט של עלון |
| `/y/:year/:slug/pdf` | PDF בדף ייעודי |
| `/search?q=...` | חיפוש |
| `/admin` | פאנל ניהול (דורש סיסמה) |
| `/admin/upload` | טופס העלאה |
| `/admin/bulletins` | רשימת עלונים + גרירה למיון |
| `/admin/edit?year=X&slug=Y` | עריכת עלון |
| `/admin/years` | ניהול שנים |
| `/admin/stats` | גרף שימוש |
| `/admin/subscribers` | מנויים |
| `/admin/settings` | הגדרות אתר |

GitHub Pages SPA fallback: `404.html` מקודד את הנתיב, `index.html` מפענח (כדי שכל הנתיבים יעבדו ברענון ישיר).

---

## API של ה-Worker

### ציבורי (ללא auth)

| פעולה | נתיב | גוף |
|---|---|---|
| בדיקה | `GET /health` | — |
| רישום למייל | `POST /subscribe` | `{email}` |
| ביטול | `POST /unsubscribe` | `{email}` |
| הסרה דרך קישור | `GET /unsubscribe?email=…` | — |
| אנליטיקס | `POST /event` | `{type, slug, year, fp}` |

### מנהל (Authorization: Bearer ADMIN_API_KEY)

| פעולה | נתיב | גוף |
|---|---|---|
| אימות סיסמה | `POST /admin/auth` | — |
| גרף שימוש | `GET /admin/stats` | — |
| מנויים | `GET /admin/subscribers` | — |
| שליחה ידנית | `POST /admin/send-now` | — |
| מייל בדיקה | `POST /admin/test-email` | `{to?}` |
| יצירה/עדכון עלון | `POST /admin/bulletin` | `{week, pdfBase64?, wordBase64?}` |
| מחיקת עלון | `DELETE /admin/bulletin` | `{yearId, slug}` |
| מיון מחדש | `POST /admin/reorder` | `{order: ["yearId/slug", ...]}` |
| הוספת שנה | `POST /admin/year` | `{id, displayName}` |
| עדכון הגדרות | `POST /admin/config` | partial config |

---

## אנליטיקס

ה-Worker שומר 3 רמות מצרפים ב-KV (TTL 400 ימים):

1. **דלאלי לפי סוג** (`cnt:2026-05-04:type:view` → counter)
2. **דלאלי לפי עלון** (`cnt:2026-05-04:slug:5786/emor:view`)
3. **דלאלי לפי מדינה/עיר** (`cnt:2026-05-04:country:IL:view`)

ולכל דפדפן ייחודי:
- **fingerprint** ב-localStorage של המשתמש (UUID, ללא PII)
- מצרף `fp:<id>` ב-KV: visits, finished, shared, country, lastSeen

הגרף מציג את 30 הימים האחרונים, פירוט לפי עלון/מדינה/עיר, וספירת דפדפנים ייחודיים/חוזרים.

---

## עיצוב — בקצרה

- **גופנים**: רק Sans (אסיסטנט, היבו, רוביק) — ללא סריפים
- **צבעי בסיס**: ירוק יער עמוק (#2d6a4f), צבעי עזר חיוניים (joy-pink, joy-yellow, joy-coral, joy-sky)
- **כל עלון** מקבל פלטה משלו שנחלצת אוטומטית מה-PDF (k-means על הצבעים הדומיננטיים)
- **כיוון**: RTL מלא, כותרות מיושרות לימין
- **אייקונים**: SVG אינליין מ-`src/icons.js` (28 אייקונים, stroke=1.5, currentColor)
- **אנימציות**: כניסה רכה, hover elevation, אינדיקטור התקדמות, חגיגה בסוף קריאה

---

## מגבלות ידועות

| מגבלה | תוכנית פעולה |
|---|---|
| Resend חינם: 100 מיילים/יום | מספיק עד ~30 מנויים פעילים. שדרוג $20/חודש = 50K מיילים. |
| Cloudflare KV: 1,000 כתיבות/יום | מספיק לאלפי משתמשים. שדרוג $5/חודש = 10M. |
| חיפוש: linear scan | עובד מצוין עד מאות עלונים. אם נגיע לאלפים, נעבור ל-Lunr עם tokenizer עברי. |
| תאריכים מילוליים בעלונים מיובאים | לא מולאו אוטומטית — עורכים ידנית בפאנל. |
| גופן Word→HTML של mammoth | רק תכונות סטנדרטיות (Heading 1-3, Quote, Bold, Italic). תכונות מתקדמות לא יעברו. |

---

## בעיות שנפתרו (היסטוריה)

- **PDF נפתח כדף 404** — ה-pdfUrl נשמר כיחסי, תוקן ל-absolute resolver
- **חיפוש החזיר ריק** — Lunr זרק tokens עבריים, הוחלף ל-scan פנימי שמנרמל ניקוד
- **כפתור "סמן שבוע נוכחי" לא הגיב** — `draggable=true` על השורה ספגה את הקליק, הועברה לידית בלבד
- **Resend חסם שליחה לכתובות אחרות** — הדומיין אומת, FROM שונה ל-`alon@alonmashmaut.org`
- **DNS מקומי לא הכיר api** — נפתר על ידי גישה דרך אותו דומיין `alonmashmaut.org` בלבד

---

## תהליך פיתוח עם שיחת AI חדשה

אם פותחים שיחה חדשה (איתי או עם אסיסטנט אחר), כל המידע שצריך נמצא ב:

1. **ה-README הזה** — overview שלם
2. **`worker/wrangler.toml`** — תצורת ה-Worker
3. **`public/data/config.json`** — תצורת האתר
4. **קבצי ה-source** מתועדים בעצמם, ללא עומס

הסיסמאות (Resend key, GitHub token, Admin key) **לא** בקוד — הן רק ב-`.dev.vars` (לא ב-git) וב-Cloudflare Worker secrets.

לקבלת ערכי הסודות הנוכחיים מהענן (ל-debug):

```bash
cd worker
npx wrangler secret list  # רואה שמות, לא ערכים
```

הערכים אינם משוחזרים מ-Cloudflare. אם נדרש לשחזר, יוצרים מחדש ומעדכנים.

---

## בעלים

**טוביה לוויט** · alonmashmaut@gmail.com · gjlevitt@gmail.com (חשבון משני)

GitHub: [@tuvyanoam-code](https://github.com/tuvyanoam-code)
