# EnglishUz 2.0 — Final Release

O‘zbekiston o‘quvchilari uchun ingliz tilini o‘zbekcha izohlar bilan bosqichma-bosqich o‘rganish platformasi. Ushbu repository 1–10-bosqichlarni bitta GitHub Pages loyihasiga birlashtiradi.

## Platforma tarkibi

| Bo‘lim | Tarkib |
|---|---|
| Dashboard | Haqiqiy progress, bugungi tavsiyalar va faoliyat xulosasi |
| Grammar | A1–C1 darajadagi 41 ta dars |
| Vocabulary | Manba hujjatdagi 600 yozuv (527 noyob inglizcha birlik) |
| Articles | 10 PART bo‘yicha 100 ta to‘liq maqola va har biriga tegishli lug‘at |
| Tests | 16 test to‘plami, 405 savol; Grammar, Vocabulary, Reading, Listening, Mixed va Placement |
| Profile | Google Authentication va o‘quvchi profili (Firebase sozlangach) |
| Results | Test tarixi, ko‘nikma kesimidagi natijalar, grafiklar va CSV eksport |
| Activity | Faol vaqt, maqsad, streak, kalendar heatmap va bo‘limlar statistikasi |
| Smart Learning | Natijalarga mos tavsiyalar, takrorlash navbati va kunlik reja |
| Global search | Grammar, maqola, lug‘at va testlar bo‘yicha qidiruv; Ctrl/Cmd+K |

## Muhim ma’lumotlar va cheklovlar

- Grammar darslari o‘zbek o‘quvchilari uchun original tushuntirishlar va misollar bilan tuzilgan.
- 100 ta maqola va 600 ta lug‘at yozuvi foydalanuvchi yuborgan DOCX manbasidan integratsiya qilingan.
- Listening mashqlari hozir brauzerning Text-to-Speech ovozidan foydalanadi; MP3 audio kutubxonasi emas.
- Placement test natijasi taxminiy diagnostika; rasmiy CEFR sertifikati yoki standartlashtirilgan baho emas.
- Smart Learning — natijalar va progressga tayanuvchi qoidaviy tavsiya mexanizmi; generativ AI emas.
- Firebase Web App konfiguratsiyasi kiritilmagan bo‘lsa, sayt mehmon rejimida ishlaydi. Google login va bulutli sinxronlash faqat Firebase loyihasi sozlangach ishlaydi.
- `EnglishUz-Standalone.html` internetga/Firebase'ga ulanmagan lokal demo. Progress faqat shu brauzerda saqlanadi.

## 1. Lokal ishga tushirish

`file://` o‘rniga lokal HTTP serverdan foydalaning.

### Python

```bash
python -m http.server 8000
```

So‘ng `http://localhost:8000` manzilini oching.

### Node.js (ixtiyoriy)

```bash
npx http-server . -p 8000
```

## 2. GitHub Pages orqali nashr qilish

Repository ildizida `index.html` bo‘lishi kerak. Ushbu loyihada `.github/workflows/deploy.yml` avtomatik nashr workflow'i bor.

1. ZIP tarkibini GitHub repository ildiziga yuklang.
2. Repository default branch'i `main` bo‘lishini tekshiring. Agar boshqa branch ishlatsangiz, `deploy.yml` ichidagi `branches` qiymatini o‘zgartiring.
3. GitHub repository → **Settings → Pages → Build and deployment → Source** bo‘limida **GitHub Actions** ni tanlang.
4. `main` branch'ga push qiling yoki Actions bo‘limidan workflow'ni qo‘lda ishga tushiring.
5. Deploy tugagach, Pages sahifasida sayt manzili chiqadi.

Workflow GitHub'ning Pages Actions usulidan foydalanadi: checkout → configure-pages → upload-pages-artifact → deploy-pages. Rasmiy yo‘riqnoma: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 3. Google login va Firebase sozlash

Google login ishlab ketishi uchun o‘zingizning Firebase loyihangiz ma’lumotlari kerak.

1. Firebase Console'da loyiha yarating.
2. Project settings → Your apps → Web App orqali web app qo‘shing.
3. Authentication → Sign-in method (yoki Providers) ichida Google provider'ni yoqing.
4. Authentication settings → Authorized domains bo‘limiga `USERNAME.github.io` domeningizni qo‘shing. Custom domain ishlatsangiz, uni ham qo‘shing.
5. Cloud Firestore database yarating.
6. `assets/js/firebase-config.example.js` faylidan nusxa olib `assets/js/firebase-config.js` yarating va Firebase Web App config qiymatlarini kiriting.
7. Firestore qoidalarini deploy qiling:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

8. Saytni qayta yuklab, Profile → Google bilan davom etish orqali sinab ko‘ring.

**Xavfsizlik:** Web App config browser'da ishlatiladigan public identifikatorlar. Service-account JSON yoki private key'ni hech qachon `assets/`, `index.html` yoki GitHub repository'ga qo‘ymang. API key'ga HTTP referrer restriction qo‘ying. Firestore Rules'ni ochiq (`allow read, write: if true`) qoldirmang.

Rasmiy Firebase yo‘riqnomalari:
- Google login: https://firebase.google.com/docs/auth/web/google-signin
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/rules-conditions

## 4. Firebase konfiguratsiyasi haqida

`assets/js/firebase-config.js` hozir bo‘sh template. Bu ataylab qoldirilgan: har bir Firebase loyihasi uchun `apiKey`, `authDomain`, `projectId` va `appId` boshqacha. O‘zingizning qiymatlaringizni kiritmasdan haqiqiy OAuth loginni yakuniy sinovdan o‘tkazib bo‘lmaydi. `firebase-config.js` GitHub Pages uchun kerak bo‘lsa repository'da bo‘lishi mumkin, chunki u service-account secret emas; lekin secret kalitlar kiritilmasligi shart.

## 5. Test / QA

Loyihada `tests/qa.cjs` statik va JavaScript data-integrity tekshiruvlarini bajaradi. Node.js 18+ talab qilinadi:

```bash
node tests/qa.cjs
```

Tekshiruvlar: 9 ta navigatsiya bo‘limi, HTML ID takrorlanmasligi, 41 grammar lesson, 600 vocabulary entry, 100 article, 10 PART, 16 test pack, 405 question, test javob kalitlari, qidiruv indeksi, kunlik reja daqiqalari va Firebase konfiguratsiya placeholder'lari.

Bu QA brauzerlararo haqiqiy OAuth, Firestore Rules emulator'i yoki real qurilmadagi vizual sinov o‘rnini bosmaydi.

## Fayl tuzilishi

```text
EnglishUz/
├── index.html
├── EnglishUz-Standalone.html
├── README.md
├── SECURITY.md
├── CHANGELOG.md
├── VERSION
├── .nojekyll
├── .gitignore
├── firebase.json
├── firestore.rules
├── .github/workflows/deploy.yml
├── tests/qa.cjs
├── QA-REPORT.txt
├── data/
│   ├── articles.json
│   ├── smart-learning.json
│   ├── test-bank-summary.json
│   └── 100_English_Articles_with_Full_Vocabulary.docx
└── assets/
    ├── favicon.svg
    └── js/
        ├── auth.js
        ├── firebase-config.js
        └── firebase-config.example.js
```

`index.html` asosiy to‘liq platforma; `assets/js/auth.js` Google Authentication va Firestore sinxronlashni boshqaradi. `EnglishUz-Standalone.html` esa cloud login'siz lokal ko‘rish uchun mo‘ljallangan.

## Release notes

- Stage 10: haqiqiy dashboard ko‘rsatkichlari, umumiy qidiruv, klaviatura accessibility, kamchilikdagi SVG ikonlar to‘ldirildi, GitHub Pages workflow, SECURITY policy, deployment qo‘llanmasi va QA skripti qo‘shildi.
- Eski, runtime'da ishlatilmaydigan JS scaffold fayllari olib tashlandi.
