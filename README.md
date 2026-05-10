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
- **חוויית קריאה מלאה**: dropdown של פרקים במובייל, TOC צדדי בדסקטופ, זמן קריאה משוער, עיגול התקדמות, חגיגה בסיום (קונפטי + צלצול) — חד-פעמי, לא חוזר ברענון
- **שיחות פתוחות בכל עלון**: כפתור "התחל שיחה על העלון" בתחתית, רשימת שיחות קיימות (כותרת + הצג). דף שיחה בודדת עם הודעות, ריאקציות (❤🙏👍🤔😮), replies רמה אחת, polling כל 6 שניות, ניהול שם תצוגה. כפתור "שיחות" בנאוויגציה מופיע אם יש שיחות שהמשתמש עוקב אחריהן. פירוט מלא בסעיף [מערכת עיצוב](#מערכת-עיצוב) ו-[שיחות בעלונים](#שיחות-בעלונים-discussions)
- **המשך מאיפה שעצרת** — מיקום הגלילה נשמר ב-localStorage. כשהמשתמש חוזר לעלון מקבל באנר "תרצה להמשיך מ-42%?". במסך הבית מופיע פיל קטן שמוביל לעלון האחרון שביקרת בו (5 שניות ואז דועך). סיימת לקרוא? המערכת זוכרת ולא מציעה להמשיך
- **אהבתי ❤** — בסוף כל מאמר כפתור "אהבתי" + ספירה של כמה אנשים אהבו את המאמר. ספירה משולבת בבועה בראש המאמר. אותו דפדפן יכול להוסיף/להסיר לייק (לא יכול להזריק כפילויות)
- **כפתורי שיתוף** ב-WhatsApp / Telegram / Email / SMS / Copy — בסוף המאמר תחת "נהנת מהקריאה? שתף עם חבר —"
- **מובייל-first**: כל המסכים מותאמים מ-360px ומעלה. tab bar קבוע למטה במובייל (גם בפאנל הניהול)
- **רישום למייל** דרך מודאל קצר; קישור ביטול הרשמה בכל מייל מוביל לדף ייעודי שמסיר אוטומטית

### למנהל (פאנל ניהול)

**התראות** (`/admin/notifications`)
- Feed של אירועים: מנוי חדש, ביטול הרשמה, שליחה אוטומטית הצליחה (עם N נשלחו / נכשלו), עלון ממתין לאישור
- Badge אדום עם מספר ההתראות שלא נקראו על הסיידבר, על כפתור "עוד" בתפריט התחתון, ועל הלשונית בתוך bottom sheet
- סימון אוטומטי כנקראו 1.5 שניות אחרי כניסה לעמוד; כפתור "סמן הכל כנקרא"
- read-state נשמר בענן (`notif-read-until` cursor) — מסונכרן בין דפדפנים אם המנהל נכנס מכמה מכשירים

**ניהול מנויים** (`/admin/subscribers`)
- חיפוש לייב לפי כתובת מייל
- **הוספה בכמות** — paste רשימה בכל פורמט (פסיקים/רווחים/שורות/`Name <email>`); המערכת חולצת רגקס את כל הכתובות התקינות, מסירה כפילויות; עם/בלי "מייל ברוך הבא"
- **הסרה בכמות** — כפתור "הסר מנויים" → מצב בחירה (V), בחר מי שצריך, "הסר נבחרים", confirm
- **ייצוא CSV** — `email, addedAt, country, city, source` עם UTF-8 BOM (אקסל פותח עברית נכון)
- עמודת "מקור" — `אתר` (הרשמה ציבורית) / `ידני` (הוספה דרך הניהול)

**שליטה על שליחה** (`/admin/settings`)
- כרטיס "פעולות מייל" — שליחה ידנית של העלון לכל המנויים (דורש להקליד "שלח" עם הצגת שם הפרשה ומספר המנויים — לא ניתן ללחוץ עליו בטעות) + שליחת מייל בדיקה לעצמך
- כרטיס "תזמון" — יום + שעה (שעון ישראל), הפעלה/כיבוי, צ'קבוקס "דרוש אישור ידני"
- במצב "אישור ידני" — באנר צהוב במסך הראשי של הניהול עם "שלח עכשיו" / "דחה לשבוע הבא"

**ניהול עלונים** (`/admin/bulletins`)
- גרירה למיון; סימון "העלון של השבוע" בכוכב; עריכת צבעים והחלפת קבצים; מחיקה

**גרף שימוש** (`/admin/stats`)
- בר 30 יום בדסקטופ, sparkline + KPI במובייל
- KPI: סה"כ צפיות, צפיות ב-PDF, סיומי קריאה, שיתופים, דפדפנים ייחודיים/חוזרים
- פירוט לפי עלון, מדינה, עיר (עם הסבר על iCloud Private Relay)
- **dedupe צד-שרת**: אותו דפדפן (לפי fingerprint) נספר פעם אחת לכל סוג אירוע פר-עלון. רענון/ביקור חוזר לא מנפח את הספירה
- **כפתור "אפס נתוני שימוש"** — מוחק `cnt:*` + `fp:*` + `done:*`. מצריך להקליד "אפס". התראות, מנויים, תזמון לא נמחקים

**הגדרות** (`/admin/settings`)
- שם האתר, כותרת מזמינה, תת-כותרת (גינזבורג), פסקת תיאור
- **לוגו** — העלאה דרך file input; נשמר כ-data URL ב-config; build script מחלץ ל-`logo.png` / `og-image.png` / `favicon.png` כדי שסקרייפרים חיצוניים יראו תמונה אמיתית
- **ארכיון נתוני שימוש** — toggle + period (ימים). כשפעיל, ה-cron השעתי מארכב את `cnt:*` / `fp:*` / `done:*` ל-CSV ב-KV ומאפס. כברירת-מחדל **כבוי בייצור**
- **שיחות מופעלות** — kill-switch לפיצ'ר השיחות (ברירת מחדל = פעיל)

**שיחות** (`/admin/comments`)
- שתי לשוניות: **שיחות** (רשימת threads) + **משתתפים** (directory ייחודי לפי fp)
- בכל thread: צפייה מלאה, תגובת מנהל, ⚠ **מחיקה = hard delete** של ה-thread + כל ה-replies + reactions + reports + ניקוי שמות של משתתפים שנותרו ריקים
- מחיקת **תגובה בודדת** ע"י מנהל היא soft-delete (משאיר `[ההודעה נמחקה]` במקום)
- כל user card מציג initial-stamp avatar, ספירת הודעות, שיחות אחרונות, וכפתור "שנה שם" — שמעדכן את ה-author בכל הודעות + ה-replyToAuthor של תגובות שהתייחסו אליו

**מעברים חלקים בין לשוניות** — ה-shell של הניהול נשאר מקובע בכל ניווט; רק האזור הפנימי משתחלף. אין הבזק לבן

### SEO
- מטא-תגים דינמיים לכל ראוט (title, description, og, twitter, canonical)
- JSON-LD: WebSite + Organization + SearchAction בדף הבית, Article לכל עלון
- `sitemap.xml` (~105 URLs, נוצר אוטומטית בכל בנייה מ-`index.json`)
- `robots.txt` עם הפניה ל-sitemap; `BingSiteAuth.xml` לאימות Bing
- אומת ב-Google Search Console + Bing Webmaster Tools
- favicon, theme-color, apple-touch-icon

### עיצוב
- **מסך פתיחה דמוי-עטיפה** של העלון המודפס: לוגו → תת-כותרת → קו פרק → "העלון האחרון · פרשת X" → ציטוט מרכזי + CTA
- **צבעים מותאמים לכל עלון** נחלצים אוטומטית מה-PDF (k-means על הצבעים הדומיננטיים)
- **ללא italics באתר** — דגשים מהטקסט הופכים לבולד+צבע במקום להטיה
- `prefers-reduced-motion` נכבד
- focus rings לניווט מקלדת, יעדי מגע 44×44 על מסכי מגע
- mobile-first עם breakpoints: 480 / 720 / 1024 / 1280

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
                  │  /like    (likes)       │     • מאחסן KV
                  │  cron כל שעה            │       (מנויים+אירועים+
                  │   → reads schedule      │        התראות+lifecycle keys)
                  │   → maybe send/skip     │
                  └────────────┬────────────┘
                               │
                  ┌────────────┴────────────┐
                  │ GitHub Actions          │
                  │ build → deploy to Pages │
                  └─────────────────────────┘
```

**קצב עדכון**: שינוי בפאנל הניהול → push לגיטהאב → Actions בונה → תוך כ-60 שניות באתר. שינויי הגדרות (config.json) משתקפים מיד בפאנל (in-memory patch) ועוברים ל-static קובץ אחרי ~דקה.

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
| Storage | KV (מנויים + אירועים + lifecycle), GitHub repo (תוכן) |
| Email | Resend עם דומיין מאומת |
| Hosting | GitHub Pages |
| DNS | Cloudflare Registrar (alonmashmaut.org) |
| SEO | sitemap.xml דינמי, JSON-LD per-page, og/twitter cards |
| Persistence (מקומי) | localStorage: `mashmaut.fp` (fingerprint), `mashmaut.adminKey` (מפתח מנהל), `mashmaut.read-pos` (מיקומי קריאה + סיומים) |

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
│   ├── main.js                       רישום ראוטים + warmup חיפוש + prune מיקומים
│   ├── router.js                     History API; passes through mailto/sms/tel
│   ├── icons.js                      29 SVG אייקונים (heart + heartFilled נוספו)
│   ├── pages/
│   │   ├── home.js                   Splash + cover + resume pill
│   │   ├── years.js                  ארכיון שנים
│   │   ├── year.js                   רשת עלונים בשנה (לפי סדר פרשיות)
│   │   ├── bulletin.js               תצוגת טקסט + TOC + reading progress + likes + JSON-LD
│   │   ├── pdfView.js                iframe ל-PDF; iOS — מסך נחיתה
│   │   ├── search.js                 דף חיפוש
│   │   ├── admin.js                  פאנל ניהול (shell + dashboard + sections)
│   │   └── admin/
│   │       ├── stats.js              לוח אנליטיקס + sparkline במובייל + reset stats
│   │       └── notifications.js      feed התראות + סימון כנקרא
│   ├── components/
│   │   ├── nav.js                    נאוויגיישן + לוגו + פוטר
│   │   ├── shareButtons.js           5 כפתורי שיתוף + toast
│   │   ├── bulletinCard.js           קלף עלון (פס דגש עליון + מספר גליון רקעי)
│   │   ├── readingProgress.js        עיגול התקדמות + צלצול + קונפטי + בלונים + finished-flag
│   │   ├── richEditor.js             contenteditable עם הדגשה (mark)
│   │   └── subscribeModal.js         מודל רישום + יצירת קשר
│   ├── lib/
│   │   ├── parshiot.js               54 פרשיות + 7 מחוברות + cycleOrder
│   │   ├── store.js                  טעינת config/index/bulletin + patchConfig (cache update)
│   │   ├── shareLinks.js             builder ל-URLs של ערוצי שיתוף
│   │   ├── searchIndex.js            scan-based Hebrew search + warmup
│   │   ├── analytics.js              tracker אנונימי (sendBeacon)
│   │   ├── api.js                    apiCall wrapper
│   │   ├── fileProcess.js            mammoth + pdf.js + heuristic-headings
│   │   ├── seo.js                    setPageSeo helper (per-route meta)
│   │   ├── loadingState.js           delayedLoading helper (לחלקות מעברים)
│   │   ├── readingPosition.js        save/finished/lastVisited dictionary in localStorage
│   │   └── likes.js                  toggle/getLikeState (uses fp from analytics)
│   └── styles/
│       ├── base.css                  reset, vars, typography, nav, footer, focus
│       ├── components.css            splash, cover, bulletin reader, TOC, modal,
│       │                             reading progress, confetti, balloons,
│       │                             likes bubble + button, share-cta, resume pill
│       └── admin.css                 admin shell, tabbar, sheet, notif badge,
│                                     pending banner, dropzone, table, charts
│
├── worker/                           ────────── Cloudflare Worker ──────────
│   ├── wrangler.toml                 Account ID, KV bindings, hourly cron, vars
│   ├── src/index.js                  כל ה-API: subscribe, event, like, admin/*, cron
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
  - `EVENTS` (f7a3af92250640d8ac96ee4a83847860) — multiple key prefixes (ראה פירוט בהמשך)
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
- **Google Search Console** — אומת. Sitemap מוגש: `sitemap.xml`
- **Bing Webmaster Tools** — אומת באמצעות `public/BingSiteAuth.xml`

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

### בנייה ידנית

```bash
npm run build        # מריץ prebuild (build-seo.js) ואז vite build → dist/
```

`prebuild` יוצר `public/sitemap.xml` ומחלץ את הלוגו מ-`config.json` data-URL ל-PNGs.

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
| `/y/:year/:slug` | תצוגת טקסט של עלון (כולל likes + share-cta + thread list בסוף) |
| `/y/:year/:slug/pdf` | PDF (iframe / iOS landing) |
| `/y/:year/:slug/discuss/new` | פתיחת שיחה חדשה על העלון (כותרת + הודעה ראשונה) |
| `/y/:year/:slug/discuss/:threadId` | דף שיחה בודדת — opening message + replies + composer + polling |
| `/search?q=...` | חיפוש |

### ניהול (דורש סיסמה)
| נתיב | מה מוצג |
|---|---|
| `/admin` | dashboard + באנר אישור-שליחה אם יש |
| `/admin/notifications` | feed התראות + sym mark-as-read |
| `/admin/upload` | טופס העלאה |
| `/admin/bulletins` | רשימת עלונים + גרירה למיון |
| `/admin/edit?year=X&slug=Y` | עריכת עלון |
| `/admin/years` | ניהול שנים |
| `/admin/stats` | גרף שימוש + reset |
| `/admin/subscribers` | מנויים — חיפוש, bulk-add, bulk-remove, CSV |
| `/admin/settings` | הגדרות אתר + לוגו + תזמון + פעולות מייל |

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
| מצב לייקים | `GET /like-state?slug=X&year=Y&fp=Z` | — |
| toggle לייק | `POST /like` | `{slug, year, fp}` |
| **רשימת שיחות בעלון** | `GET /discuss/threads?year=Y&slug=S` | — מחזיר רשימה רזה (ללא בודי) |
| **פתיחת שיחה חדשה** | `POST /discuss/threads` | `{year, slug, title, body, displayName, fp, honeypot}` |
| **שיחה מלאה** | `GET /discuss/threads/:id?year=Y&slug=S` | — thread + replies + reactions |
| **תגובה לשיחה** | `POST /discuss/threads/:id/reply` | `{year, slug, body, displayName, fp, replyToId?, honeypot}` |
| **עריכת שיחה (own, ≤15 דק׳)** | `PUT /discuss/threads/:id` | `{year, slug, title?, body?, fp}` |
| **עריכת תגובה (own, ≤15 דק׳)** | `PUT /discuss/replies/:id` | `{year, slug, threadId, body, fp}` |
| **מחיקת שיחה (own)** | `POST /discuss/threads/:id/delete` | `{year, slug, fp}` — soft, משאיר placeholder |
| **מחיקת תגובה (own)** | `POST /discuss/replies/:id/delete` | `{year, slug, threadId, fp}` |
| **ריאקציה לשיחה** | `POST /discuss/threads/:id/react` | `{year, slug, emoji, fp}` |
| **ריאקציה לתגובה** | `POST /discuss/replies/:id/react` | `{year, slug, threadId, emoji, fp}` |
| **דיווח על שיחה** | `POST /discuss/threads/:id/report` | `{year, slug, reason?, fp}` |
| **דיווח על תגובה** | `POST /discuss/replies/:id/report` | `{year, slug, threadId, reason?, fp}` |

### מנהל (Authorization: Bearer ADMIN_API_KEY)

| פעולה | נתיב | גוף |
|---|---|---|
| אימות סיסמה | `POST /admin/auth` | — |
| גרף שימוש | `GET /admin/stats` | — |
| **איפוס נתוני שימוש** | `POST /admin/stats/reset` | מוחק `cnt:*` `fp:*` `done:*` |
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
| עדכון הגדרות | `POST /admin/config` | partial config (כולל `dispatchSchedule`, `logo`, `statsArchive`, `commentsEnabled`) |
| **רשימת ארכיוני סטטיסטיקה** | `GET /admin/stats/archives` | — |
| **הורדת ארכיון CSV** | `GET /admin/stats/archives/:id` | → CSV עם BOM |
| **מחיקת ארכיון** | `DELETE /admin/stats/archives/:id` | — |
| **רשימת threads (כל העלונים)** | `GET /admin/discuss/threads` | — |
| **thread מלא למודרציה** | `GET /admin/discuss/threads/:year/:slug/:threadId` | — כולל reports counters |
| **מחיקה אדמין** | `POST /admin/discuss/delete` | `{year, slug, threadId, replyId?}` — replyId=soft, no replyId=**HARD** |
| **תגובת מנהל** | `POST /admin/discuss/reply` | `{year, slug, threadId, body, author?}` |
| **שיחה חדשה ע"י מנהל** | `POST /admin/discuss/new-thread` | `{year, slug, title, body, author?}` |
| **רשימת משתתפים** | `GET /admin/discuss/users` | — מקובץ לפי fp, מסנן deleted |
| **שינוי שם משתתף** | `POST /admin/discuss/rename-user` | `{fp, newName}` — מעדכן הכל כולל replyToAuthor |

---

## מפת מפתחות KV (`EVENTS`)

| Prefix | תוכן | TTL |
|---|---|---|
| `cnt:DATE:type:T` | מונה צפיות/PDF/finish/share/subscribe-cta ביום ספציפי | 400 ימים |
| `cnt:DATE:slug:Y/S:T` | מונה אירוע T לעלון Y/S ביום DATE | 400 ימים |
| `cnt:DATE:country:C:T` | מונה לפי מדינה | 400 ימים |
| `cnt:DATE:city:C:CT` | מונה לפי עיר (רק ל-views) | 400 ימים |
| `fp:<id>` | רשומה לכל דפדפן: visits, finished, shared, country, lastSeen | 400 ימים |
| `done:T:Y/S:fp` | dedupe — מסמן שדפדפן fp כבר ביצע אירוע T על Y/S | 400 ימים |
| `notif:<ts>:<rand>` | רשומת התראה: `{type, email/slug/sent/failed/..., at}` | 400 ימים |
| `notif-read-until` | ISO timestamp — כל ההתראות לפניו נחשבות נקראו | ∞ |
| `dispatch:DATE:slug` | תיעוד שליחה שבועית | ∞ |
| `last-sent` | `{slug, yearId, at}` — dedupe למניעת שליחה כפולה של אותו שבוע | ∞ |
| `pending-dispatch` | `{slug, yearId, parshaName, scheduledAt}` כשממתין לאישור | ∞ |
| `like-count:Y/S` | מספר לייקים לעלון | ∞ |
| `like-fp:Y/S:fp` | מסמן שדפדפן fp נתן לייק לעלון | ∞ |
| `archive:<isoTs>` | snapshot CSV של נתוני שימוש לפני איפוס אוטומטי | ∞ (cap 100) |
| `last-stats-archive` | ISO של הארכוב האחרון (cursor לתזמון) | ∞ |
| `thread:Y/S:<sortableId>` | רשומת שיחה — `{id, title, body, author, fp, createdAt, lastAt, replyCount, deleted?, isAdmin?}` | ∞ |
| `reply:Y/S/<threadId>:<sortableId>` | תגובה בתוך שיחה — `{id, threadId, body, author, fp, createdAt, replyToId?, replyToAuthor?, deleted?, isAdmin?}` | ∞ |
| `reaction:t:<id>:<fp>` / `reaction:r:<id>:<fp>` | אימוג'י של דפדפן ספציפי על שיחה (`t`) / תגובה (`r`) | ∞ |
| `reactionAgg:t:<id>` / `reactionAgg:r:<id>` | counters: `{ "❤": n, "👍": n, ... }` (מצרפים בכתיבה) | ∞ |
| `name:<normalized>` | reservation לשם תצוגה — `{fp, lastSeen}`, ייחודי לפי fp | 180 ימים (refresh בכל פוסט) |
| `rl:<fp>:<unixMinute>` | rate-limit: max 5 פוסטים/דקה לדפדפן | 90 שניות |
| `report:t:<id>:<fp>` / `report:r:<id>:<fp>` | רשומת דיווח | 90 ימים |
| `report-count:t:<id>` / `report-count:r:<id>` | counter דיווחים למיון מודרציה | ∞ |

ב-`EMAILS`:
| Prefix | תוכן |
|---|---|
| `sub:<email>` | רשומת מנוי: `{email, addedAt, country, city, source, token}` |

---

## מפת localStorage (צד-לקוח)

| מפתח | תוכן |
|---|---|
| `mashmaut.fp` | UUID לזיהוי דפדפן (משותף לאנליטיקס + לייקים + שיחות) |
| `mashmaut.adminKey` | סיסמת המנהל (רק במכשיר של המנהל) |
| `mashmaut.read-pos` | JSON: `{ "Y/S": {pct, top, at, parshaName, ...}, _lastVisitedKey, _finished: {...} }` |
| `mashmaut.displayName` | שם תצוגה של המשתמש בשיחות (נבחר ב-prompt בפעם הראשונה) |
| `mashmaut.followedThreads` | JSON: list של שיחות שהדפדפן השתתף בהן `[{year, slug, threadId, title, parshaName, followedAt, lastSeenAt}, ...]` (cap 50) |

`_finished` מסמן עלונים שהדפדפן כבר סיים — מונע חזרה על החגיגה ברענון, ולא מציע להמשיך לעלונים שכבר הסתיימו.

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

## אנליטיקס + Likes

ה-Worker שומר ב-KV (TTL 400 ימים):

1. **דלאלי לפי סוג** (`cnt:2026-05-04:type:view` → counter)
2. **דלאלי לפי עלון** (`cnt:2026-05-04:slug:5786/emor:view`)
3. **דלאלי לפי מדינה/עיר**
4. **לייקים** (`like-count:5786/emor` → counter; `like-fp:5786/emor:<fp>` → '1')

ולכל דפדפן ייחודי:
- `fp:<id>` ב-KV: visits, finished, shared, country, lastSeen
- **dedupe per (fp,type,slug+year)** — `done:T:Y/S:fp`. אותו דפדפן נספר פעם אחת לכל סוג אירוע פר-עלון. רענון/ביקור חוזר לא מנפח את הספירה.

הגרף מציג 30 ימים אחרונים, פירוט לפי עלון/מדינה/עיר, וספירת דפדפנים ייחודיים/חוזרים. **iCloud Private Relay** של Apple עלול להציג מיקום שגוי (שרת מעבר); הסבר על כך מופיע בעמוד הסטטיסטיקה. הספירות הכלליות אמינות.

**איפוס**: `POST /admin/stats/reset` או כפתור ב-`/admin/stats` — מוחק `cnt:*` `fp:*` `done:*`. נשמרים: התראות, מנויים, תזמון, lifecycle keys.

---

## עיצוב — בקצרה

- **גופנים**: Sans בלבד — Assistant (טקסט), Heebo (כותרות), Rubik (display + מספרים)
- **צבעי בסיס**: ירוק יער עמוק (#2d6a4f), צבעי עזר (joy-yellow, joy-pink, joy-coral, joy-sky)
- **כל עלון** מקבל פלטה משלו שנחלצת אוטומטית מה-PDF (k-means על הצבעים הדומיננטיים)
- **כיוון**: RTL מלא, כותרות מיושרות לימין
- **אייקונים**: SVG אינליין מ-`src/icons.js` (29 אייקונים, stroke=1.5, currentColor)
- **אנימציות**: כניסה רכה, hover elevation, אינדיקטור התקדמות, חגיגה בסיום קריאה (חד-פעמי). נכבד `prefers-reduced-motion`
- **ללא italics** — דגשים הופכים לבולד+צבע במקום להטיה
- **mobile-first** עם breakpoints: 480 / 720 / 1024 / 1280
- **מעברים חלקים** — admin shell נשאר מקובע, רק האזור הפנימי משתנה; דפים אחרים משתמשים ב-`delayedLoading` (ספינר רק אם הטעינה > 250ms)

---

## מערכת עיצוב

המתווה הוויזואלי שמתועד פה הוא **חוזה** — כל פיצ'ר חדש בפאנל הניהול או באזור השיחות צריך לכבד אותו. המטרה: עקביות, חמימות, וברור — לא רעש.

### פאנל ניהול: "סטודיו אור-יום"

האסתטיקה נקראת "studio loft" — בהיר, חמים, מקצועי בלי להיות סטרילי. מבוסס נייר קרם, אקצנט ירוק לפעולות ראשיות, נגיעות משמש (apricot) בריחוף ובמצבי דגש עדינים.

**טוקני עיצוב** מוגדרים ב-[`src/styles/admin.css`](src/styles/admin.css) על `.admin-shell`:

```css
--a-paper:        #fdfbf6;   /* רקע נייר ראשי */
--a-paper-warm:   #f7f1e2;   /* גוון חמים יותר ל-hero / hover */
--a-paper-cool:   #f4f1ea;   /* רקע ה-shell עצמו */
--a-edge:         #ece4d0;   /* borders ראשיים */
--a-edge-soft:    #f1ead8;   /* dividers בטבלאות */
--a-ink:          #28251f;   /* טקסט עיקרי */
--a-ink-soft:     #6f675b;   /* תת-טקסט, labels */
--a-ink-faint:    #a89f8d;   /* placeholders, decorations */
--a-accent:       var(--accent, #2d6a4f);   /* ירוק האתר — primary actions */
--a-accent-soft:  #e7efe6;
--a-apricot:      #f59c66;   /* accent חם, רק ב-hover ובמצבי דגש */
--a-apricot-soft: #ffe5cf;
--a-shadow-xs:    0 1px 0 rgba(60, 40, 10, .04);
--a-shadow-sm:    0 1px 2px rgba(60, 40, 10, .04), 0 4px 14px rgba(60, 40, 10, .05);
--a-shadow-md:    0 1px 2px rgba(60, 40, 10, .04), 0 8px 28px rgba(60, 40, 10, .07);
```

**עקרונות**:
- **בלי "punctuation dots"** לפני כותרות (h1) או על כרטיסים. ניסיתי ולא אהבו — הוסר.
- **Sidebar**: רקע `--a-paper` עם gradient ל-`--a-paper-warm`, פס accent דקיק (משמש→ירוק) על השוליים הפנימיים. nav-item פעיל = רקע לבן + טקסט accent + פס משמש דק לצד ה-`inset-inline-start`.
- **Headers (h1)**: `var(--font-display, 'Rubik')`, weight 700, `letter-spacing: -.012em`, גודל `clamp(1.5rem, 3.6vw, 2rem)`.
- **Cards**: לבן, `border: 1px solid var(--a-edge)`, `border-radius: 18px`, `box-shadow: var(--a-shadow-xs)`. ב-hover: `--a-shadow-sm`.
- **Hero card** (`.admin-hero`): gradient משמש בפינה הימנית-עליונה + עיגול דקורטיבי שקוף. מבנה: eyebrow caps → display title (Rubik 700) → sub-text → optional `.admin-hero-meta` עם stat cards. **כל לשונית חשובה צריכה Hero**.
- **Section eyebrow** (`.admin-section-eyebrow`): label CAPS עם letter-spacing wide ו-`::before` line, לקיבוץ קלפים בלשונית הגדרות.
- **Quick action grid** (`.admin-quickgrid` + `.admin-quick`): 4 כרטיסים עם אייקון בעיגול, ב-hover האייקון מסתובב 6° + עליה.
- **Workflow list** (`.admin-workflow`): צעדים ממוספרים בעיגולים accent — לדפים שמסבירים flow.
- **Tables**: `.admin-table` עם headers ב-CAPS letter-spacing, dividers `--a-edge-soft`, hover `--a-paper-warm`. במובייל הופכים לכרטיסי-stack אוטומטית.
- **Stat cards** (`.stat-card`): ערך גדול ב-display font, hover lift עם accent border.
- **Tabs פנימיים** (`.admin-discuss-tabs`): pills בתוך מעטפת `--a-accent-soft` עם border accent, פעיל = רקע לבן + צל עדין.
- **Notif badge**: `.notif-badge` עם רקע אדום עדין `#fdecec` + טקסט אדום-כהה `#b91c1c`. **חייב להעלם לחלוטין כשאפס** — `:empty { display: none }` + `[hidden] { display: none !important }`.

### צ'אט ושיחות: "מחברת חמה"

האסתטיקה נקראת "warm notebook" — נייר קרם חמים יותר מהפאנל, מותאם לקריאה רצופה של טקסט, עם דגשי משמש לפעולות אינטראקטיביות.

**טוקני עיצוב** מוגדרים ב-[`src/styles/components.css`](src/styles/components.css) על `.threadlist, .discuss-page`:

```css
--d-paper:        #fffbf3;
--d-paper-warm:   #fef4e2;
--d-edge:         #efe5cf;
--d-edge-soft:    #f5ecd8;
--d-ink:          #2a2722;
--d-ink-soft:     #6f675b;
--d-apricot:      #f59c66;   /* accent בקליק "(בתגובה ל-X)" + ב-pulse */
--d-apricot-soft: #ffe5cf;
--d-mint:         var(--accent, #2d6a4f);   /* כפתור שליחה + accent מנהל */
--d-shadow:       0 1px 2px rgba(60, 40, 10, .04), 0 6px 22px rgba(60, 40, 10, .05);
```

**עקרונות**:
- **Thread list מתחת לעלון** (`.threadlist`, `mountThreadList()`): נסגר בקלף עגול עם gradient משמש פינתי + decoration קטנה בפינה. כפתור "התחל שיחה על העלון" pill עם `chatSquare` icon (לא `chat`!), ב-hover מתרומם וזז קצת עם משמש border. רשימת שיחות = שורות עם כותרת + "הצג", **fade-out מאסק על השמאל** של הכותרת (RTL = end-of-line) כדי שכותרות ארוכות לא יתנגשו ב-"הצג".
- **Discuss page** (`.discuss-page`, `discussThread.js`): כל הודעה כ-`<article>` עם רקע `--d-paper`, border `--d-edge`, shadow `--d-shadow`. ההודעה הפותחת מקבלת gradient לבן→משמש כדי להבליטה. תגובות מנהל (`.is-admin`) — רקע ירוק-מינט עדין.
- **Chevron expand** (`.discuss-msg-chevron`): כפתור עיגולי קטן ב-end של ראש ההודעה. **לחיצה = CSS-only class toggle, לא repaint** — מונע scroll-jump וגניבת focus. הפאנל למטה משתמש ב-`grid-template-rows: 0fr → 1fr` transition.
- **Reply context** (`.discuss-msg-replyto`): "(בתגובה ל-X)" — `<button>` נטוי עם `--d-apricot`, `data-jump-to="<id>"`. לחיצה: `scrollIntoView({ block: 'center' })` + `.jump-highlight` class על היעד עם apricot ring pulse של 2 שניות.
- **Composer** (`.discuss-composer-form`): textarea שטוח, **בלי קופסה** — `border: 0; border-bottom: 1.5px solid --d-edge`. ב-focus border-bottom משמש. אוטו-resize עם JS. כפתור שליחה = `.discuss-composer-send` עיגולי ירוק עם arrowLeft icon, `disabled` עד שיש טקסט. Enter שולח, Shift+Enter יורד שורה.
- **Reactions**: שכבה כפולה. תמיד גלויה: `.discuss-msg-reaction-summary` עם `.reaction-tally` pills קטנים מתחת לבודי ההודעה (רק אימוג'י שיש להם count > 0). מורחב (אחרי click chevron): `.discuss-actions-reactions` עם 5 הריאקציות הזמינות. animation `.pop` ב-click.
- **Display name modal** (`promptForDisplayName()` ב-`displayName.js`): מודאל מותאם. **כולל בדיקת שמות אסורים client-side** — מציג שגיאה inline כש-input מכיל "משמעות"/"גינזבורג"/וריאציות.
- **User menu** = tabs בראש דף השיחה (`discussMenu.js`): שתי לשוניות pill — "השיחות שלי" (רשימת follows עם badges לתגובות חדשות) + "הגדרות" (שינוי שם).
- **Footer**: בלי letter-mark עיגולי. רק tagline + nav + copyright. סרק את ה-`<span class="footer-mark">` — נמחק.

### דפוסים משותפים

#### אייקון רישמי לשיחות

`chatSquare` (בועה מרובעת + 2 פסים) הוא **האייקון הקנוני לכל קונטקסט שיחה**. בנאוויגציה ("שיחות"), בכפתור "התחל שיחה על העלון", בלשונית "השיחות שלי", ובסיידבר הניהול ("שיחות"). האייקון `chat` (עיגולי) קיים ב-`icons.js` אבל **לא בשימוש** — לא להשתמש בו.

#### מודאלים מותאמים

**אסור** להשתמש ב-`window.alert`, `window.confirm`, `window.prompt`. הם לא מעוצבים, מקרטעים בעברית, ובעיקר — `window.prompt` החזיר `''` ולא `null` ב-cancel, מה שגרם לבאגים (דיווח נשלח גם בביטול).

תמיד להשתמש ב-[`src/lib/dialog.js`](src/lib/dialog.js):
```js
import { openConfirm, openPrompt, showToast } from '../lib/dialog.js';

const ok = await openConfirm({ title, message, confirmLabel, cancelLabel, destructive });
const value = await openPrompt({ title, message, placeholder, initial, multiline, required, maxLength });
showToast('הצלחה', { kind: 'success' });   // info | success | error
```

`openPrompt` מחזיר `null` ב-cancel, מחרוזת בהסכמה. `openConfirm` boolean.

#### Show More

כל רשימה > 4 פריטים בפאנל הניהול חייבת להפעיל `applyShowMore`:

```js
import { applyShowMore } from '../lib/showMore.js';
const tbody = root.querySelector('.admin-table tbody');
if (tbody) applyShowMore(tbody, { initial: 4, after: tbody.parentElement });
```

מציג 4 פריטים ראשונים, מוסיף כפתור pill "הצג עוד (N)" עם chevronDown מסתובב. כבר מיושם על: עלונים, מנויים, התראות, slugs/countries/cities ב-stats, ארכיוני stats, threads ב-/admin/comments, users ב-/admin/comments.

#### Hero pattern (העתק-הדבק לכל לשונית חדשה)

```html
<header class="admin-header">
  <h1>Title</h1>
  <div>...optional buttons...</div>
</header>

<div class="admin-hero">
  <div class="admin-hero-content">
    <div class="admin-hero-eyebrow">EYEBROW SHORT CAPS</div>
    <h2 class="admin-hero-title">Big title with <span>accent word</span></h2>
    <p class="admin-hero-sub">Brief explanation, max ~56ch.</p>
  </div>
  <div class="admin-hero-meta">
    <div class="admin-hero-stat">
      <div class="admin-hero-stat-value">N</div>
      <div class="admin-hero-stat-label">label</div>
    </div>
  </div>
</div>
```

#### Section eyebrow (לקיבוץ קלפים)

```html
<h2 class="admin-section-eyebrow">קבוצה</h2>
<div class="admin-card">...</div>
<div class="admin-card">...</div>
```

#### Mobile responsive

הקובץ [`src/styles/admin.css`](src/styles/admin.css) (סוף הקובץ) ו-[`src/styles/components.css`](src/styles/components.css) (סוף הקובץ) מכילים בלוקי "Mobile responsive hardening". ערובות בסיסיות:
- `html, body { overflow-x: hidden }` — אין scroll אופקי בשום מקרה
- `overflow-wrap: anywhere` על כל קונטיינר טקסט — שמות ארוכים נשברים
- `min-width: 0` על flex items כדי לאפשר ellipsis
- `flex-wrap: wrap` על action bars
- `.admin-users-grid` עובר ל-2 עמודות רק מ-1100px (לא 720) כדי שיהיה מקום
- `.admin-user-rename span { display: none }` ב-< 480px — אייקון בלבד

### Conventions / מוסכמות לא לשכוח

| נושא | הכלל |
|---|---|
| אייקון שיחה | תמיד `chatSquare`, לא `chat` |
| Confirm/prompt/alert | תמיד `dialog.js`, לא `window.*` |
| רשימה > 4 פריטים | `applyShowMore({ initial: 4 })` |
| Notif badge | חובה `[hidden] { display: none !important }` + `:empty { display: none }` |
| Hero על כל לשונית | יש eyebrow קצר → display title → sub-text → optional stat |
| נקודות צבעוניות לפני h1 | **לא**. הוסרו, לא להחזיר. |
| בלונים בחגיגת סיום | **לא**. הוסרו, לא להחזיר. |
| Footer letter-mark | **לא**. הוסר, לא להחזיר. |
| מחיקת thread ע"י מנהל | **HARD delete** (נמחק לחלוטין מ-KV + cleanup שמות). מחיקת תגובה = soft. |
| Display name | server enforces uniqueness per fp; client בודק שמות שמורים לפני שליחה (`isForbiddenName`) |

## מגבלות ידועות

| מגבלה | תוכנית פעולה |
|---|---|
| Resend חינם: 100 מיילים/יום | מספיק עד ~30 מנויים פעילים. שדרוג $20/חודש = 50K מיילים. |
| Cloudflare KV חינם: 100K reads + 1K writes/deletes/lists ביום | במאי 2026 הגענו ל-50% תוך יום אחד אחרי deploy. הגזרנים הראשיים: `getUnreadNotifCount()` שטוען את כל ה-`notif:*` (200×) בכל ניווט בפאנל; `/admin/stats` שסורק את כל ה-`cnt:*` ו-`fp:*`. אופטימיזציות אפשריות (לא בוצעו): counter נפרד ל-unread, חלון של 30 ימים ב-stats, cache ב-localStorage. שדרוג $5/חודש = 10M reads / 1M writes — פותר הכל. |
| חיפוש: linear scan | עובד מצוין עד מאות עלונים. אם נגיע לאלפים, נעבור ל-Lunr עם tokenizer עברי. |
| חיפוש: רק טקסט המאמרים | לא מחפש בתוך PDFs. אם הקובץ הוא PDF-only, חיפוש לא ימצא. |
| תאריכים מילוליים בעלונים מיובאים | לא מולאו אוטומטית — עורכים ידנית בפאנל. |
| מקסימום לוגו 250 KB | מאוחסן כ-data URL ב-config.json. |
| תזמון לפי שעה (לא דקה) | cron הוא hourly; אפשר לשלוח רק על השעה העגולה. |
| iCloud Private Relay | מציג מיקום שגוי בסטטיסטיקה (הסבר במסך). |
| Likes: dedupe לפי דפדפן | אם המשתמש מנקה localStorage או עובר דפדפן, הוא יוכל לתת לייק שוב. |

---

## בעיות שנפתרו (היסטוריה)

- **PDF נפתח כדף 404** — `pdfUrl` נשמר כיחסי, תוקן ל-absolute resolver
- **חיפוש החזיר ריק** — Lunr זרק tokens עבריים, הוחלף ל-scan פנימי שמנרמל ניקוד
- **חיפוש איטי בפעם הראשונה** — preload ב-`requestIdleCallback` + parallel fetch (8) ב-buildDocs
- **כפתור "סמן שבוע נוכחי" לא הגיב** — `draggable=true` על השורה ספגה את הקליק
- **Resend חסם שליחה לכתובות אחרות** — הדומיין אומת
- **קישור הסרה במייל ב-404** — היה ל-`alonmashmaut.org/unsubscribe`, תוקן ל-`api.alonmashmaut.org/unsubscribe`
- **כפתורי mail/SMS חזרו הביתה** — הראוטר תפס `mailto:`/`sms:` כקישורים פנימיים; הוסרו מהאינטרספציה
- **PDF באייפון מוקטן ולא קריא** — Safari לא תומך ב-`#view=FitH` בתוך iframe; iOS מקבל landing card
- **buildStats לא מציג את כל הנתונים** — היה ב-KV list limit 1000, נוסף pagination
- **iframe tabbar בניהול לא נשאר למטה** — `.fade-in` הותיר transform על ה-shell; ה-tabbar הוצא מחוץ ל-shell
- **כותרות Word לא נתפסו** — STYLE_MAP הורחב לסגנונות עבריים מותאמים + heuristic לזיהוי לפי bold-only
- **שליחת עלון בטעות** — כפתור "שלח עכשיו" דרש רק קליק; עכשיו דורש להקליד "שלח" עם הצגת שם הפרשה ומספר המנויים
- **"הבזק" בין מעברי לשוניות** — admin shell נשאר מקובע בין sections; דפים ציבוריים משתמשים ב-`delayedLoading`
- **הגדרות לא הציגו ערכים שמורים** — `loadConfig` cache לא התעדכן; הוספנו `patchConfig` שמעדכן in-memory מיד אחרי שמירה
- **גרף שימוש מנופח (refresh = view חדש)** — נוסף server-side dedupe `done:T:Y/S:fp`. אותו דפדפן נספר פעם אחת לכל סוג פר-עלון
- **חגיגת קונפטי חזרה ברענון** — נוסף `_finished` ב-localStorage; readingProgress מתחיל ב-completed=true אם זוהה
- **Home pill הציע להמשיך עלון שכבר סיימתי** — נוסף guard ב-saveReadingPosition שלא יוצר entry חדש לעלון finished גם כשגוללים למעלה
- **התראה: badge לא נעלמה אחרי קריאה** — clearAllBadges() נקרא מיד אחרי mark-read, לא רק בניווט הבא

---

## תהליך פיתוח עם שיחת AI חדשה

אם פותחים שיחה חדשה (איתי או עם אסיסטנט אחר), כל המידע שצריך נמצא ב:

1. **ה-README הזה** — overview שלם
2. **[STAGING.md](STAGING.md)** — workflow לסביבת בדיקה לפני ייצור
3. **[`worker/wrangler.toml`](worker/wrangler.toml)** — תצורת ה-Worker (כולל `[env.staging]` נפרד)
4. **[`public/data/config.json`](public/data/config.json)** — תצורת האתר. נכון למאי 2026: `commentsEnabled` ו-`statsArchive` חסרים → ברירת מחדל = שיחות פעילות, ארכיון כבוי
5. **קבצי ה-source** מתועדים בעצמם, ללא עומס

### אזהרה לסשנים הבאים

לפני שאתה ניגש לשנות עיצוב או להוסיף פיצ'ר חדש בפאנל הניהול / שיחות:

1. **קרא את הסעיף "[מערכת עיצוב](#מערכת-עיצוב)"** — זה חוזה מחייב, לא הצעה. פיצ'ר חדש שלא משתמש ב-tokens, ב-hero pattern, וב-conventions ייראה זר ויידחה.
2. **השתמש ב-`src/lib/dialog.js`** לכל אישור/קלט/הודעה. אסור `window.confirm/prompt/alert`.
3. **השתמש ב-`chatSquare`** לכל קונטקסט שיחה. לא `chat`.
4. **רשימה > 4 פריטים?** מוחל `applyShowMore({ initial: 4 })`.
5. **לא להוסיף**: נקודות צבעוניות לפני h1, בלונים בחגיגה, footer letter-mark, "punctuation dots" על stat cards. כל אלה הוסרו במכוון.
6. **בדוק mobile** ברוחב 360px / 390px / 768px לפני deploy. הקבצים `admin.css` ו-`components.css` מכילים בלוקי "Mobile responsive hardening" — שמור עליהם.

### תהליך פריסה לייצור (חובה!)

**אסור לדחוף ישר לייצור בלי בדיקה ב-staging.** קרא [STAGING.md](STAGING.md) למבט מלא. בקצרה:

```bash
# 1. פיתוח לוקאלי מול staging worker (קונפיגורציה ב-.env.local)
npm run dev

# 2. אחרי שינויי Worker — deploy ל-staging:
cd worker && npx wrangler deploy --env staging

# 3. אחרי שהכל עובד ב-staging:
cd worker && npx wrangler deploy           # ייצור
git push origin main                        # GH Pages auto-builds (~60s)
```

**שתי שכבות הגנה ב-staging** (חובה לוודא שתמיד פעילות אחרי שינויים ב-`worker/src/index.js`):
- `STAGING_MODE === '1'` → `ghPutFile/ghDeleteFile` הם no-op, `sendEmail` רק ל-`ADMIN_EMAIL`
- `GITHUB_BRANCH = "staging"` (לא קיים) → אם הראשון נכשל, כתיבה תיכשל בקול

### Secrets

הסיסמאות (Resend key, GitHub token, Admin key) **לא** בקוד — הן רק ב-`.dev.vars` (לא ב-git) וב-Cloudflare Worker secrets.

לקבלת ערכי הסודות הנוכחיים מהענן (ל-debug):

```bash
cd worker
npx wrangler secret list                    # ייצור
npx wrangler secret list --env staging      # staging
```

הערכים אינם משוחזרים מ-Cloudflare. אם נדרש לשחזר, יוצרים מחדש ומעדכנים.

**Staging admin key** (לפיתוח לוקאלי): `mashmaut-staging-Rvs65UOko8WCBTSCoZ2vNMcZ` (אם השתנה — ראה output של `wrangler secret put ADMIN_API_KEY --env staging`).

### שיחות בעלונים (Discussions) — מפת קוד

קבצים חדשים שנוצרו בפיצ'ר השיחות:

| קובץ | תפקיד |
|---|---|
| [`src/components/threadList.js`](src/components/threadList.js) | רשימת שיחות מתחת לעלון + כפתור "התחל שיחה" |
| [`src/components/discussMenu.js`](src/components/discussMenu.js) | tabs בראש דף השיחה (השיחות שלי / הגדרות) |
| [`src/pages/discussNew.js`](src/pages/discussNew.js) | דף יצירת שיחה חדשה |
| [`src/pages/discussThread.js`](src/pages/discussThread.js) | דף שיחה בודדת — render + polling + actions |
| [`src/pages/admin/comments.js`](src/pages/admin/comments.js) | פאנל מודרציה (tabs: שיחות / משתתפים) |
| [`src/lib/threads.js`](src/lib/threads.js) | wrapper ל-API `/discuss/*` |
| [`src/lib/displayName.js`](src/lib/displayName.js) | localStorage + prompt + isForbiddenName |
| [`src/lib/myDiscussions.js`](src/lib/myDiscussions.js) | followed threads tracking + checkUpdates |
| [`src/lib/dialog.js`](src/lib/dialog.js) | openConfirm / openPrompt / showToast (חובה!) |
| [`src/lib/fp.js`](src/lib/fp.js) | ensureFp() — fingerprint משותף (analytics + likes + שיחות) |
| [`src/lib/adminApi.js`](src/lib/adminApi.js) | adminCall + adminFetch + adminDownload לפאנל |
| [`src/lib/showMore.js`](src/lib/showMore.js) | "הצג עוד" pattern לכל הרשימות |

ה-Worker ([`worker/src/index.js`](worker/src/index.js)) מאורגן בסקציות:
- `// --- Discussions (per-bulletin threads)` — סכמה + helpers
- `// --- Discussions (public; per-bulletin threads)` בתוך הראוטינג — endpoints ציבוריים
- `// --- Discussions (admin)` בתוך `/admin/` — endpoints מנהליים
- `// --- Stats archive` — `maybeArchiveStats` + endpoints

### ארכיטקטורה: דחיפה ל-real-time

`discussThread.js` עושה polling פשוט (לא WebSocket / SSE / Durable Objects):
- `setInterval` כל 6 שניות, backoff ל-15ש' אחרי 5 polls שקטים
- `document.visibilityState` משעה כשהטאב חבוי
- כל poll = `getThread(...)` שעושה ~22 KV operations בממוצע (1 thread + list + N replies + N reactionAggs)
- ⚠ **גורם לעלות KV משמעותית עם משתמשים פעילים**. ראה "מגבלות ידועות" — אופטימיזציה חכמה תהיה counter יחיד או cursor-based polling.

---

## בעלים

**טוביה לוויט** · alonmashmaut@gmail.com · gjlevitt@gmail.com (חשבון משני)

GitHub: [@tuvyanoam-code](https://github.com/tuvyanoam-code)
