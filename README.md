# משמעות — אתר עלון פרשת השבוע

אתר סטטי לחלוטין. שני שלבי התקנה חד-פעמיים, ואז העלאת עלון לוקחת פחות מדקה.

## התקנה ראשונית (חד-פעמית, ~10 דקות)

### 1. התקנת תלויות מקומיות

```bash
cd "/Users/tuvyanoamlevitt/Downloads/mashmaut-site"
npm install
```

### 2. ייבוא העלונים הקיימים (אופציונלי)

אם יש לך תיקייה עם 32 העלונים הקיימים (PDF + Word), אפשר לייבא הכל בפעם אחת:

```bash
# רק PDFs:
npm run import -- --src "/Users/tuvyanoamlevitt/Downloads/עלון משמעות תשפ״ו" --year "תשפ״ו"

# PDFs בתיקייה אחת + Words בתיקייה אחרת:
npm run import -- --src "/path/to/pdfs" --word-src "/path/to/words" --year "תשפ״ו"
```

הסקריפט מזהה את שם הפרשה משם הקובץ (תבנית: `<מס׳>. משמעות פרשת <פרשה>`), מחלץ צבעים מה-PDF, וממיר את ה-Word ל-HTML.

### 3. יצירת ריפו ב-GitHub

לחיצה אחת:

1. היכנס ל-https://github.com/new
2. שם הריפו: `mashmaut` (או מה שתרצה)
3. שמור על ברירת המחדל (Public), בלי README, בלי gitignore
4. צור

ואז בטרמינל:

```bash
cd "/Users/tuvyanoamlevitt/Downloads/mashmaut-site"
git init
git add .
git commit -m "initial site"
git branch -M main
git remote add origin https://github.com/USERNAME/mashmaut.git
git push -u origin main
```

החלף `USERNAME` בשם המשתמש שלך ב-GitHub.

### 4. הפעל GitHub Pages

1. לך ל-`https://github.com/USERNAME/mashmaut/settings/pages`
2. תחת **Source**, בחר **GitHub Actions**
3. סיימת. דחיפה לבסיס תפעיל פריסה אוטומטית.

האתר יעלה ב-`https://USERNAME.github.io/mashmaut/`.

---

## שימוש יומיומי

### העלאת עלון חדש

```bash
npm run admin
```

זה יפתח חלון דפדפן עם פאנל הניהול. אל תסגור את הטרמינל.

בפאנל:
1. **העלאת עלון** → גרור Word + PDF, בחר פרשה ושנה, לחץ "העלה"
2. בדוק את העלון (כפתור "צפה")
3. לחץ **ראשי → פרסם עדכונים** ← זה דוחף לגיטהאב

תוך כדקה האתר מתעדכן אוטומטית.

### עריכת עיצוב של עלון קיים

בפאנל הניהול: **עלונים → ערוך**. תוכל לשנות:
- צבעי הרקע, הכותרות, האקסנט
- גופן, גודל וצבע לכל רמת כותרת
- תאריך, גליון, תיאור קצר

לחץ "שמור" ואז "פרסם עדכונים".

### שינוי כותרת ראשית באתר

פאנל ניהול → **הגדרות**

---

## מבנה הפרויקט

```
mashmaut-site/
├── public/data/        ← כל התוכן יושב כאן (JSONs + PDFs)
├── src/                ← קוד האתר עצמו
├── admin/              ← השרת המקומי לניהול
├── scripts/            ← bulk-import / publish
└── .github/workflows/  ← פריסה אוטומטית ל-GitHub Pages
```

הכל הוא קבצים. אפשר לערוך JSON ישירות אם רוצים.

---

## מילון פקודות

| פקודה | מה היא עושה |
|---|---|
| `npm install` | התקנה ראשונית |
| `npm run admin` | פותח פאנל ניהול לוקאלי בדפדפן |
| `npm run import -- --src "PATH" --year "תשפ״ו"` | ייבוא חד-פעמי של תיקיית עלונים |
| `npm run dev` | רק לפיתוח/בדיקה (בלי שרת ניהול) |
| `npm run build` | בנייה ידנית (בדרך כלל מיותר — GitHub עושה את זה) |
| `npm run publish-site` | git add/commit/push ידני |

---

## שאלות נפוצות

**איך אני יודע שהפרסום הצליח?**
לך ל-`https://github.com/USERNAME/mashmaut/actions` ותראה אם המשימה הסתיימה ב-✓ ירוק.

**עברית בכתובת ה-URL לא נראית טוב במייל**
זה למה השתמשנו בתעתיק לטיני: `bereshit`, `noach`, וכו׳. הקישור נשאר נקי וקצר.

**הצבעים שזוהו לא יפים**
פתח **עלונים → ערוך** ושנה צבעים ידנית. אפשר גם להעתיק קוד צבע בדיוק (#hex).

**איך מוסיפים שנה חדשה?**
היא נוצרת אוטומטית בהעלאת עלון ראשון לאותה שנה, או ידנית ב-**שנים → הוסף שנה**.

**איפה הקבצים שלי נשמרים?**
הכל ב-`public/data/bulletins/<שנה>/<פרשה>.{json,pdf,docx}` — בריפו עצמו. אין שום שרת חיצוני.
