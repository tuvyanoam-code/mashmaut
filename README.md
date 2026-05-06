# משמעות — אתר עלון פרשת השבוע

אתר ציבורי, פאנל ניהול ענני, רשימת תפוצה במייל, לוח אנליטיקס, ומערכת שליחה אוטומטית לעלון השבועי **משמעות** — רעיונות לפרשת השבוע מתוך תורתו של הרב יצחק גינזבורג שליט"א.

> **חי על**: https://alonmashmaut.org · **ניהול**: https://alonmashmaut.org/admin · **API**: https://api.alonmashmaut.org

---

## מה האתר עושה

### לקוראים
- **מסך פתיחה** עם הלוגו, הוק לקורא חדש ("כן, גם אתה יכול להבין"), וכפתור גלילה מונפש לעלון השבועי
- **ארכיון מסודר** של כל העלונים, ממוין אוטומטית לפי סדר הפרשיות בכל שנה
- **דף ייעודי לכל עלון** עם URL ייחודי וקריא (`/y/5786/emor`)
- **שני אופני קריאה**: PDF (iframe נטיב; באייפון — מסך נחיתה עם "פתח את ה-PDF" כי iframe לא מציג נכון) או טקסט מעוצב (HTML מומר מ-Word)
- **חיפוש מתקדם** בעברית בכל העלונים, כולל ניקוד, פרשיות וכותרות. Pre-fetch ברקע מיד עם פתיחת האתר → חיפוש ראשון מיידי
- **חוויית קריאה מלאה**: dropdown של פרקים במובייל, TOC צדדי בדסקטופ, זמן קריאה משוער, עיגול התקדמות (פינה ימנית-תחתונה במובייל), חגיגה בסיום (קונפטי + בלונים + צלצול)
- **כפתורי שיתוף** ב-WhatsApp / Telegram / Email / SMS / Copy — כל אחד פותח את האפליקציה הנכונה
- **מובייל-first**: כל המסכים מותאמים מ-360px ומעלה. tab bar קבוע למטה במובייל (גם בפאנל הניהול)
- **רישום למייל** דרך מודאל קצר; קישור ביטול הרשמה בכל מייל מוביל לדף ייעודי שמסיר אוטומטית

### למנהל (פאנל ניהול)
- **התראות** — לשונית עם feed כל פעם שמישהו נרשם, ביטל הרשמה, או שעלון נשלח אוטומטית. באדג' אדום עם מספר לא-נקראו על הסיידבר ועל ה-tab bar במובייל
- **שליטה מלאה על תזמון השליחה** — יום + שעה (שעון ישראל), אפשרות "דרוש אישור ידני לפני שליחה", הפעלה/כיבוי. Cron רץ כל שעה והוורקר מחליט לפי ההגדרה
- **באנר אישור שליחה** במסך הראשי כשעלון ממתין לאישור (במצב manual approval)
- **ניהול מנויים** — חיפוש לפי מייל, הוספה בכמות (paste רשימה בכל פורמט, המערכת חולצת אוטומטית), אופציה "שלח ברוך הבא" / "אל תשלח", הסרה במצב בחירה (V נבחרים), ייצוא ל-CSV (UTF-8 + BOM לאקסל)
- **ניהול עלונים** — גרירה למיון, סימון "העלון של השבוע" בכוכב, עריכת צבעים והחלפת קבצים, מחיקה
- **גרף שימוש** — בר 30 יום בדסקטופ, sparkline + KPI במובייל; פירוט לפי עלון/מדינה/עיר (עם הסבר על iCloud Private Relay)
- **לוגו ומיתוג** — העלאה דרך הגדרות (נשמר כ-data URL ב-config; build script מחלץ ל-`logo.png`/`og-image.png`/`favicon.png`)
- **מעברים חלקים** בין לשוניות — ה-shell של הניהול נשאר מקובע, רק האזור הפנימי משתנה. אין הבזק לבן

### SEO
- מטא-תגים דינמיים לכל ראוט (title, description, og, twitter)
- JSON-LD: WebSite + Organization בדף הבית, Article לכל עלון
- `sitemap.xml` עם 105 URLs (נוצר אוטומטית בכל בנייה מ-`index.json`)
- `robots.txt`, אימות בעלות ב-Bing וב-Google Search Console
- favicon, theme-color, apple-touch-icon

### עיצוב
- **מסך פתיחה דמוי-עטיפה** של העלון המודפס: לוגו → תת-כותרת → קו פרק → "העלון האחרון · פרשת X" → ציטוט מרכזי + CTA
- **צבעים מותאמים לכל עלון** נחלצים אוטומטית מה-PDF (k-means על הצבעים הדומיננטיים)
- **לא מודגש** — כל ה-italics הוסרו; דגשים מהטקסט המקורי הופכים לבולד+צבע במקום להטיה
- `prefers-reduced-motion` נכבד: אין אנימציות אם המשתמש ביקש פחות תנועה
- focus rings לניווט מקלדת, יעדי מגע 44×44 על מסכי מגע

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
                  │  sitemap.xml (auto)     │
                  └─────────────────────────┘
                               ▲
   מנהל     ─►  /admin  ─►     │
                  ┌────────────┴────────────┐
                  │ api.alonmashmaut.org    │  ← Cloudflare Worker
                  │  /admin/*  (auth)       │     • כותב לגיטהאב דרך
                  │  /subscribe             │       Contents API
                  │  /event   (analytics)   │     • שולח מייל דרך Resend
                  │  cron כל שעה            │     • מאחסן KV
                  │   → reads schedule      │       (מנויים+אירועים+
                  │   → maybe send/skip     │        התראות+pending)
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
| עיצוב | CSS עם משתנים, RTL, mobile-first, גופנים: Assistant + Heebo + Rubik |
| חיפוש | פנימי, scan + normalize של עברית, parallel-fetch (8) + idle-time prefetch |
| המרת Word | mammoth.js + STYLE_MAP מורחב לעברית + heuristic לזיהוי כותרות לפי bold |
| חילוץ צבעים | pdf.js + Canvas (ב-browser) |
| Backend | Cloudflare Worker (JavaScript) |
| Storage | KV (מנויים + אירועים + התראות + pending), GitHub repo (תוכן) |
| Email | Resend עם דומיין מאומת |
| Hosting | GitHub Pages |
| DNS | Cloudflare Registrar (alonmashmaut.org) |
| SEO | sitemap.xml דינמי, JSON-LD per-page, og/twitter cards |

---

## מבנה הפרויקט

```
mashmaut-site/
├── public/
│   ├── index.html                    SPA shell + SEO meta + JSON-LD
│   ├── 404.html                      GH-Pages SPA fallback
│   ├── CNAME                         alonmashmaut.org
│   ├── robots.txt                    crawl rules + sitemap link
│   ├── sitemap.xml                   ⚙ generated by scripts/build-seo.js
│   ├── logo.png / og-image.png /
│   │   favicon.png                   ⚙ extracted from config.logo data-URL
│   ├── BingSiteAuth.xml              Bing Webmaster verification
│   └── data/                         ────────── התוכן הציבורי ──────────
│       ├── config.json               siteName, hero copy, dispatchSchedule, logo (data-URL)
│       ├── index.json                רשימת שנים + עלונים (סיכום)
│       └── bulletins/{year}/         לכל עלון: .json + .pdf + .docx (אופציונלי)
│
├── src/                              ────────── קוד הפרונט ──────────
│   ├── main.js                       רישום ראוטים + warmup חיפוש
│   ├── router.js                     History API; passes through mailto/sms/tel
│   ├── icons.js                      28 SVG אייקונים מינימליים
│   ├── pages/
│   │   ├── home.js                   Splash + cover (העלון השבוע)
│   │   ├── years.js                  ארכיון שנים
│   │   ├── year.js                   רשת עלונים בשנה (לפי סדר פרשיות)
│   │   ├── bulletin.js               תצוגת טקסט + TOC + reading progress + JSON-LD Article
│   │   ├── pdfView.js                iframe ל-PDF; iOS — מסך נחיתה
│   │   ├── search.js                 דף חיפוש
│   │   ├── admin.js                  פאנל ניהול (shell + dashboard + sections)
│   │   └── admin/
│   │       ├── stats.js              לוח אנליטיקס + sparkline במובייל
│   │       └── notifications.js      feed התראות + סימון כנקרא
│   ├── components/
│   │   ├── nav.js                    נאוויגיישן + לוגו + פוטר
│   │   ├── shareButtons.js           5 כפתורי שיתוף + toast
│   │   ├── bulletinCard.js           קלף עלון (פס דגש עליון + מספר גליון רקעי)
│   │   ├── readingProgress.js        עיגול התקדמות + צלצול + קונפטי + בלונים
│   │   ├── richEditor.js             contenteditable עם הדגשה (mark)
│   │   └── subscribeModal.js         מודל רישום + יצירת קשר
│   ├── lib/
│   │   ├── parshiot.js               54 פרשיות + 7 מחוברות + cycleOrder
│   │   ├── store.js                  טעינת config/index/bulletin
│   │   ├── shareLinks.js             builder ל-URLs של ערוצי שיתוף
│   │   ├── searchIndex.js            scan-based Hebrew search + warmup
│   │   ├── analytics.js              tracker אנונימי (sendBeacon)
│   │   ├── api.js                    apiCall wrapper
│   │   ├── fileProcess.js            mammoth + pdf.js + heuristic-headings
│   │   ├── seo.js                    setPageSeo helper (per-route meta)
│   │   └── loadingState.js           delayedLoading helper (לחלקות מעברים)
│   └── styles/
│       ├── base.css                  reset, vars, typography, nav, footer, focus
│       ├── components.css            splash, cover, bulletin reader, TOC, modal,
│       │                             reading progress, confetti, balloons
│       └── admin.css                 admin shell, tabbar, sheet, notif badge,
│                                     pending banner, dropzone, table, charts
│
├── worker/                           ────────── Cloudflare Worker ──────────
│   ├── wrangler.toml                 Account ID, KV bindings, hourly cron, vars
│   ├── src/index.js                  כל ה-API: subscribe, event, admin/*, cron
│   ├── package.json                  wrangler
│   └── .dev.vars                     [GIT-IGNORED] מפתחות לפיתוח לוקאלי
│
├── scripts/
│   ├── build-seo.js                  ⚙ prebuild: sitemap.xml + extract logo to png
│   ├── bulk-import.js                ייבוא תיקיית PDFs בכמות
│   └── publish.js                    ידני: git add+commit+push
│
├── .github/workflows/
│   └── deploy.yml                    on push: vite build → deploy to Pages
│
├── package.json                      "prebuild" hooks build-seo.js
├── vite.config.js
└── README.md                         (הקובץ הזה)
```

---

## תשתית ענן

### Cloudflare
- **חשבון**: alonmashmaut@gmail.com
- **Account ID**: `ea19fdb623516ff23c6cc375bea912bb`
- **דומיין**: `alonmashmaut.org` ב-Cloudflare Registrar (~$10/שנה)
- **Worker**: `mashmaut-api` (https://api.alonmashmaut.org)
- **KV namespaces**:
  - `EMAILS` (be1997254a314cd0bc359175cb933073) — `sub:<email>` → JSON
  - `EVENTS` (f7a3af92250640d8ac96ee4a83847860) — counters + fp + notifications + pending-dispatch + last-sent
- **Cron**: `0 * * * *` (כל שעה — ה-handler קורא את התזמון מ-config ומחליט אם לשלוח)

### Resend
- **דומיין מאומת**: `alonmashmaut.org` (DKIM + SPF + DMARC)
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

### SEO / Search Console
- **Google Search Console** — אומת. הגש את `https://alonmashmaut.org/sitemap.xml`.
- **Bing Webmaster Tools** — אומת באמצעות `public/BingSiteAuth.xml`.

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
2. **העלאת עלון** → גרירת Word (אופציונלי) ו-PDF, בחירת פרשה ושנה, תיאור קצר
3. שמירה — ה-Worker דוחף את הקבצים לגיטהאב, GitHub Actions בונה, תוך כדקה באתר
4. בעלון השבועי שצריך להופיע במסך הבית — סמן את הכוכב ב-**עלונים**
5. כשיגיע הזמן שקבעת ב-**הגדרות → תזמון** (ברירת מחדל: יום חמישי 19:00 ישראל), המערכת תשלח אוטומטית — או, אם הפעלת "דרוש אישור", תקבל באנר במסך הראשי לאישורך

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
npm run build        # מריץ prebuild (build-seo.js) ואז vite build → dist/
```

`prebuild` יוצר `public/sitemap.xml` ומחלץ את הלוגו מ-`config.json`'s data-URL ל-`logo.png`/`og-image.png`/`favicon.png`.

### עריכת ה-Worker

```bash
cd worker
npx wrangler login   # פעם אחת
npx wrangler deploy  # אחרי שינוי src/index.js או wrangler.toml
npx wrangler tail    # לוגים בזמן אמת
```

### ייבוא תיקיית עלונים בכמות

```bash
npm run import -- --src "/path/to/folder" --year "תשפ\"ז"
```

---

## ניתוב (Routes)

### ציבורי
| נתיב | מה מוצג |
|---|---|
| `/` | מסך הבית — Splash + Cover של העלון האחרון |
| `/years` | רשימת כל השנים |
| `/y/:year` | ארכיון שנה (ממוין לפי סדר פרשיות) |
| `/y/:year/:slug` | תצוגת טקסט של עלון |
| `/y/:year/:slug/pdf` | PDF (iframe / iOS landing) |
| `/search?q=...` | חיפוש |

### ניהול (דורש סיסמה)
| נתיב | מה מוצג |
|---|---|
| `/admin` | dashboard + באנר אישור-שליחה אם יש |
| `/admin/notifications` | feed התראות |
| `/admin/upload` | טופס העלאה |
| `/admin/bulletins` | רשימת עלונים + גרירה למיון |
| `/admin/edit?year=X&slug=Y` | עריכת עלון |
| `/admin/years` | ניהול שנים |
| `/admin/stats` | גרף שימוש |
| `/admin/subscribers` | מנויים — חיפוש, bulk-add, bulk-remove, CSV |
| `/admin/settings` | הגדרות אתר + לוגו + תזמון שליחה |

GitHub Pages SPA fallback: `404.html` מקודד את הנתיב, `index.html` מפענח (כל הנתיבים עובדים ברענון ישיר).

---

## API של ה-Worker

### ציבורי (ללא auth)

| פעולה | נתיב | גוף |
|---|---|---|
| בדיקה | `GET /health` | — |
| רישום למייל | `POST /subscribe` | `{email}` |
| ביטול | `POST /unsubscribe` | `{email}` |
| הסרה דרך קישור (מייל) | `GET /unsubscribe?email=…` | — דף HTML מאשר |
| אנליטיקס | `POST /event` | `{type, slug, year, fp}` |

### מנהל (Authorization: Bearer ADMIN_API_KEY)

| פעולה | נתיב | גוף |
|---|---|---|
| אימות סיסמה | `POST /admin/auth` | — |
| גרף שימוש | `GET /admin/stats` | — |
| רשימת מנויים | `GET /admin/subscribers` | — |
| ייצוא CSV | `GET /admin/subscribers/export.csv` | — |
| הוספה בכמות | `POST /admin/subscribers/bulk-add` | `{emails: string\|string[], sendWelcome: bool}` |
| הסרה בכמות | `POST /admin/subscribers/remove` | `{emails: string[]}` |
| התראות | `GET /admin/notifications` | — |
| סימון כנקראו | `POST /admin/notifications/mark-read` | — |
| מצב pending | `GET /admin/pending-dispatch` | — |
| אישור שליחה | `POST /admin/pending-dispatch/approve` | — |
| דחיית שליחה | `POST /admin/pending-dispatch/cancel` | — |
| מידע על תזמון | `GET /admin/schedule-info` | — |
| שליחה ידנית | `POST /admin/send-now` | — |
| מייל בדיקה | `POST /admin/test-email` | `{to?}` |
| יצירה/עדכון עלון | `POST /admin/bulletin` | `{week, pdfBase64?, wordBase64?}` |
| מחיקת עלון | `DELETE /admin/bulletin` | `{yearId, slug}` |
| מיון מחדש | `POST /admin/reorder` | `{order: ["yearId/slug", ...]}` |
| הוספת שנה | `POST /admin/year` | `{id, displayName}` |
| עדכון הגדרות | `POST /admin/config` | partial config (כולל `dispatchSchedule` ו-`logo`) |

---

## תזמון שליחה אוטומטית

ה-cron רץ **כל שעה** (`0 * * * *`). ה-handler קורא את `config.dispatchSchedule`:

```json
{
  "enabled": true,
  "dayOfWeek": 4,          // 0=ראשון … 4=חמישי
  "hour": 19,              // שעון ישראל (Asia/Jerusalem)
  "requireApproval": false
}
```

על כל cron-tick:
1. אם `enabled=false` → דלג
2. ממיר את הזמן הנוכחי לשעון ישראל; אם `getDay()` או `getHours()` לא תואמים — דלג
3. בודק `last-sent` ב-KV — אם העלון השבועי כבר נשלח → דלג
4. בודק `pending-dispatch` ב-KV — אם כבר ממתין לאישור → דלג
5. אם `requireApproval=true` → כותב `pending-dispatch` + שולח התראה למנהל; **לא שולח**
6. אחרת → שולח לכל המנויים, מעדכן `last-sent`, רושם התראת `bulletin-sent`

המנהל יכול לאשר/לדחות עלון ממתין דרך הבאנר במסך הראשי או דרך ה-API.

---

## אנליטיקס

ה-Worker שומר ב-KV (TTL 400 ימים):

1. **דלאלי לפי סוג** (`cnt:2026-05-04:type:view` → counter)
2. **דלאלי לפי עלון** (`cnt:2026-05-04:slug:5786/emor:view`)
3. **דלאלי לפי מדינה/עיר** (`cnt:2026-05-04:country:IL:view`)

ולכל דפדפן ייחודי (anonymous fingerprint ב-localStorage):
- `fp:<id>` ב-KV: visits, finished, shared, country, lastSeen

הגרף מציג 30 ימים אחרונים, פירוט לפי עלון/מדינה/עיר, וספירת דפדפנים ייחודיים/חוזרים. **שים לב**: משתמשים עם iCloud Private Relay (אייפון/Mac) או VPN יוצגו לפי שרת המעבר ולא לפי מיקומם האמיתי. הסבר על כך מופיע בעמוד הסטטיסטיקה.

ה-`buildStats` עושה pagination מלאה (היה תקוע על 1000 מפתחות בסיבוב הקודם — תוקן).

---

## עיצוב — בקצרה

- **גופנים**: Sans בלבד — Assistant (טקסט), Heebo (כותרות), Rubik (display + מספרים)
- **צבעי בסיס**: ירוק יער עמוק (#2d6a4f), צבעי עזר (joy-yellow, joy-pink, joy-coral, joy-sky)
- **כל עלון** מקבל פלטה משלו שנחלצת אוטומטית מה-PDF (k-means על הצבעים הדומיננטיים)
- **כיוון**: RTL מלא, כותרות מיושרות לימין
- **אייקונים**: SVG אינליין מ-`src/icons.js` (28 אייקונים, stroke=1.5, currentColor)
- **אנימציות**: כניסה רכה, hover elevation, אינדיקטור התקדמות, חגיגה בסיום קריאה. נכבד `prefers-reduced-motion`
- **ללא italics** — דגשים הופכים לבולד+צבע במקום להטיה
- **מובייל-first** עם breakpoints: 480 / 720 / 1024 / 1280
- **מעברים חלקים** — admin shell נשאר מקובע, רק האזור הפנימי משתנה; דפים אחרים משתמשים ב-`delayedLoading` (ספינר רק אם הטעינה > 250ms)

---

## מגבלות ידועות

| מגבלה | תוכנית פעולה |
|---|---|
| Resend חינם: 100 מיילים/יום | מספיק עד ~30 מנויים פעילים. שדרוג $20/חודש = 50K מיילים. |
| Cloudflare KV: 1,000 כתיבות/יום | מספיק לאלפי משתמשים. שדרוג $5/חודש = 10M. |
| חיפוש: linear scan | עובד מצוין עד מאות עלונים. אם נגיע לאלפים, נעבור ל-Lunr עם tokenizer עברי. |
| תאריכים מילוליים בעלונים מיובאים | לא מולאו אוטומטית — עורכים ידנית בפאנל. |
| מקסימום לוגו 250 KB | מאוחסן כ-data URL ב-config.json. |
| תזמון לפי שעה (לא דקה) | cron הוא hourly; אפשר לשלוח רק על השעה העגולה. |
| iCloud Private Relay | מציג מיקום שגוי בסטטיסטיקה (הסבר במסך). |

---

## בעיות שנפתרו (היסטוריה)

- **PDF נפתח כדף 404** — `pdfUrl` נשמר כיחסי, תוקן ל-absolute resolver
- **חיפוש החזיר ריק** — Lunr זרק tokens עבריים, הוחלף ל-scan פנימי שמנרמל ניקוד
- **חיפוש איטי בפעם הראשונה** — preload ב-`requestIdleCallback` + parallel fetch (8) ב-buildDocs
- **כפתור "סמן שבוע נוכחי" לא הגיב** — `draggable=true` על השורה ספגה את הקליק
- **Resend חסם שליחה לכתובות אחרות** — הדומיין אומת
- **קישור הסרה במייל ב-404** — היה ל-`alonmashmaut.org/unsubscribe`, תוקן ל-`api.alonmashmaut.org/unsubscribe`
- **כפתורי mail/SMS חזרו הביתה** — הראוטר תפס `mailto:`/`sms:` כקישורים פנימיים; הוסרו מהאינטרספציה
- **PDF באייפון מוקטן ולא קריא** — Safari לא תומך ב-`#view=FitH` בתוך iframe; iOS עכשיו מקבל landing card עם "פתח כ-PDF"
- **buildStats לא מציג את כל הנתונים** — היה ב-KV list limit 1000, נוסף pagination
- **iframe tabbar בניהול לא נשאר למטה בגלילה** — `.fade-in` הותיר transform על ה-shell, מה שהפך אותו ל-containing block ל-position:fixed; ה-tabbar הוצא מחוץ ל-shell
- **כותרות Word לא נתפסו** — STYLE_MAP הורחב לסגנונות עבריים מותאמים + heuristic לזיהוי לפי bold-only פסקאות
- **שליחת עלון בטעות** — כפתור "שלח עכשיו" דרש רק קליק; עכשיו דורש להקליד "שלח" עם הצגת שם הפרשה ומספר המנויים
- **"הבזק" בין מעברי לשוניות** — admin shell נשאר מקובע בין sections; דפים ציבוריים משתמשים ב-`delayedLoading` (ספינר רק אחרי 250ms)

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
