# TalkOn — ניהול הוצאות

אפליקציית React (Vite) לניהול הוצאות של TalkOn, מחוברת ל-Supabase. מחליפה את Glide, ללא עלות חודשית. עברית, RTL.

## הרצה מקומית

```bash
npm install
npm run dev
```

הדפדפן ייפתח ב-`http://localhost:5173`.

## משתני סביבה

צור קובץ `.env` (ראה `.env.example`):

```
VITE_SUPABASE_URL=https://wndktdcisvuryalslfqp.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

המפתח הוא publishable (anon) ומיועד לצד לקוח. RLS ב-Supabase מגן על הדאטה.

## מבנה

```
src/
  lib/supabase.js       — Supabase client יחיד
  lib/constants.js      — ORGANIZATION_ID, מטבעות, שערי המרה
  auth/AuthProvider.jsx — session + useAuth
  auth/ProtectedRoute.jsx
  components/Layout.jsx  — RTL shell + ניווט
  screens/Login.jsx      — התחברות / הרשמה (Supabase Auth)
  screens/ExpenseNew.jsx — טופס הזנת הוצאה
```

## הרשאות

RLS מאוכף ב-DB (owner/admin/editor/viewer). המסכים רק מציגים/מסתירים כפתורים; ה-DB
חוסם כל פעולה לא מורשית. שמירת הוצאה דורשת הרשאת `editor` ומעלה.

## פריסה (Vercel)

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- הגדר את שני משתני הסביבה (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) ב-Vercel.
- הוסף קובץ `vercel.json` (כלול ברפו) כדי שניתוב client-side יעבוד ב-refresh.

## מסכים בהמשך

רשימת הוצאות + ייצוא CSV, ואז מסכי ניהול (חברים, ספקים, קטגוריות).
