# EnglishUz — xavfsizlik siyosati

## Firebase konfiguratsiyasi

- `assets/js/firebase-config.js` ichidagi Firebase Web App config brauzer identifikatorlari hisoblanadi; ular service-account kaliti emas.
- Service-account JSON, private key, OAuth client secret yoki boshqa server maxfiy ma’lumotlarini hech qachon repository yoki frontendga qo‘ymang.
- Google Cloud Console'da Web API key uchun HTTP referrer cheklovlarini qo‘ying.
- Firebase Authentication'da faqat ishlatiladigan provider'larni yoqing va `Authorized domains` ro‘yxatini cheklang.
- Firestore uchun repository'dagi `firestore.rules` qoidalarini deploy qiling; test mode / allow-all qoidalarini ishlatmang.
- Har bir foydalanuvchi uchun ma’lumot yo‘li UID bilan bog‘langan. Qoidalar har bir so‘rovda `request.auth.uid` egasini tekshiradi.

## Hisobot berish

Xavfsizlik muammosini ommaviy issue'da maxfiy ma’lumotlar bilan joylamang. Avval repository egasiga maxfiy kanal orqali xabar bering.

## Chegaralar

Bu frontend ta’lim prototipi va statik sayt. Server-side admin rollari, to‘lovlar yoki imtihon sertifikatlari amalga oshirilmagan.
