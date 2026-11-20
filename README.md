# PC Pulse — kompyuteringiz holati telefoningizda

**Sayt (telefon va kompyuter uchun):** https://typime.github.io/pcpulse/
**Windows dasturi:** [PCPulseAgent.exe ni yuklab olish](https://github.com/typime/pcpulse/releases/latest/download/PCPulseAgent.exe)

Kompyuterni kuzatadigan va masofadan boshqaradigan ilova. Siz harorat, yuklama, PSU kuchlanishi va fanlarni koʻrasiz. RAM ni qaysi dastur egallayotgani va kunlik ekran vaqti ham koʻrinadi. Bundan tashqari qoʻriqlash rejimi, masofadan oʻchirish/yoqish va telefonga muntazam hisobot bor. Hammasi internet orqali, istalgan joydan ishlaydi.

```
 Windows PC                         Bulut (Supabase)                     Telefon / brauzer
┌───────────────────┐  HTTPS   ┌─────────────────────────────┐  HTTPS  ┌────────────────────┐
│ PCPulseAgent.exe  │ ───────▶ │ Postgres + RPC funksiyalar   │ ◀────── │ PWA (GitHub Pages) │
│ sensorlar, fanlar │ ◀─buyruq─│ cron + edge funksiya (push)  │ ─push─▶ │ Android/iPhone/PC  │
└───────────────────┘          └─────────────────────────────┘         └────────────────────┘
```

---

## Boshlash — 3 qadam

1. **Akkaunt oching.** Telefonda https://typime.github.io/pcpulse/ ni oching → **Roʻyxatdan oʻtish** → username va parol kiriting.
2. **Kompyuterga agent oʻrnating.** [PCPulseAgent.exe](https://github.com/typime/pcpulse/releases/latest/download/PCPulseAgent.exe) ni yuklab, ishga tushiring:
   - Windows administrator ruxsatini soʻraydi — **Ha** ni bosing (harorat va fanlar uchun kerak).
   - *Windows protected your PC* (SmartScreen) chiqsa, **More info → Run anyway** ni bosing. Dastur raqamli imzosiz, shuning uchun bu ogohlantirish chiqadi.
   - Ochilgan oynada oʻsha username va parolni kiriting → **Ulash**.
   - Agent oʻzini Windows bilan birga, oynasiz ishga tushadigan qilib oʻrnatadi. Keyin hech narsa qilish shart emas.
3. **Telefonda ilova sifatida oʻrnating va bildirishnomalarni yoqing.**
   - **Android (Chrome):** menyu → *Ilovani oʻrnatish*.
   - **iPhone (iOS 16.4+):** Safari → Ulashish → *Ekranga qoʻshish*. Soʻng ilovani ochib, **Sozlamalar → Bildirishnomalar → Yoqish** ni bosing.

> **Harorat, PSU kuchlanishi va fanlar** uchun bepul [PawnIO](https://github.com/namazso/PawnIO.Setup/releases/latest) drayveri kerak — agent uni oʻzi jim oʻrnatadi.
>
> **Yangilanish avtomatik:** agent 6 soatda bir yangi versiyani tekshiradi, yuklab oladi (SHA-256 bilan tekshirib) va oʻzini almashtiradi. Yangi versiya ishga tushmasa, oldingisi qaytariladi. Saytda “Hozir yangilash” tugmasi ham bor; sozlamalardan oʻchirish mumkin. Agent 2.0/2.1 oʻrnatilgan boʻlsa, yangi exe ni bir marta ishga tushiring — eskisini oʻzi almashtiradi.

**Kompyuterda oʻz oynasi:** `PCPulseAgent.exe` ni yoki Start menyusi / ish stolidagi “PC Pulse” yorligʻini ochsangiz, PC Pulse brauzersiz, alohida dastur oynasida ochiladi (Windows’ning WebView2 dvigateli). Administrator ruxsati faqat oʻrnatish va yangilashda soʻraladi. Agent boshqaruv menyusi (qayta ulash, qayta ishga tushirish, olib tashlash): `PCPulseAgent.exe --manage`.

**Koʻrinish:** asosiy mavzu — Aurora Glass (fon kompyuter haroratiga qarab rangini oʻzgartiradi), ikkinchisi — Once UI (qorongʻi / yorugʻ / tizim). Sozlamalar → Koʻrinish. Eski interfeys vaqtincha `…/pcpulse/classic/` manzilida turibdi.

---

## Imkoniyatlar

| Boʻlim | Nima bor |
|---|---|
| **Umumiy** | Holat bitta jumlada, 100 ballik baho, har bir muammo uchun maslahat. CPU/GPU/RAM/disk, tarmoq, quvvat (W), ekran vaqti, 24 soatlik grafik, tezkor amallar. Fon rangi kompyuter haroratiga qarab oʻzgaradi. |
| **Tizim** | Protsessor (har bir yadro), videokarta, RAM modullari, SSD/HDD (resurs, harorat, TBW), ona plata va BIOS, barcha sensorlar roʻyxati. **Fanlar:** avto / qoʻlda / harorat boʻyicha (Sokin, Muvozanat, Unumdor, Maksimal). **Quvvat:** +12V, +5V, +3.3V relslari ATX ±5% meʼyori bilan, CMOS batareyasi. |
| **Jarayonlar** | RAM ni kim egallayotgani, dasturni masofadan yopish, maslahatlar, avtoyuklanishni boshqarish. |
| **Ekran vaqti** | Har bir ilovada qancha vaqt oʻtgani. Har kun alohida sana bilan saqlanadi; 7/14/30 kunlik grafik. |
| **Boshqaruv** | Qulflash, uyqu, gibernatsiya, qayta yoqish, oʻchirish. Wake-on-LAN bilan yoqish. Qoʻriqlash rejimi, taymer, harakatsizlikda avto-qulflash/uxlatish. Ekran rasmi, ekranga xabar, media tugmalar, tozalash. |
| **Bildirishnomalar** | Har 30 daqiqada hisobot (oraligʻini sozlash mumkin). Qizib ketish, disk toʻlishi, PC yoqildi/oʻchdi, qoʻriqlash ishga tushishi haqida darhol xabar. Tungi sokinlik rejimi ham bor. |

**Qoʻriqlash rejimi:** yoqilgandan keyin kimdir sichqoncha yoki klaviaturaga tegsa, ekran darhol qulflanadi va telefonga xabar keladi. Qulf ekranidagi harakat va qulfdan chiqarish haqida ham xabar beriladi.

---

## Masofadan yoqish (Wake-on-LAN)

Oʻchiq kompyuterni faqat **shu uy tarmogʻidagi yoniq qurilma** uygʻota oladi. Yoqish signalini internetdagi server yubora olmaydi. Shuning uchun uyda yana bitta qurilmada PC Pulse agenti ishlab turishi kerak (boshqa kompyuter yoki noutbuk). Tugmani bosganingizda, signal oʻsha qurilma orqali yuboriladi.

Kompyuterda bir marta sozlash kerak:
1. **BIOS:** *Wake on LAN* / *Power On By PCI-E* → **Enabled**, *ErP* → **Disabled**.
2. **Device Manager → tarmoq adapteri → Properties:**
   - *Power Management*: „Allow this device to wake the computer“ ni belgilang.
   - *Advanced*: „Wake on Magic Packet“ → **Enabled**.
3. **Fast Startup ni oʻchiring:** Control Panel → Power Options → *Choose what the power buttons do*.
4. Kompyuter **kabel** orqali ulangan boʻlsin — Wi-Fi orqali WOL deyarli ishlamaydi.

---

## Xavfsizlik va maxfiylik

- Parollar **bcrypt** bilan xeshlanadi. 10 marta notoʻgʻri urinishdan keyin akkaunt 10 daqiqaga bloklanadi.
- Har bir qurilma va har bir kirish uchun alohida token bor.
- *Sozlamalar → Barcha qurilmalardan chiqish* tugmasi barcha sessiyalarni yopadi.
- Maʼlumotlar bazasi jadvallari internetga ochilmagan. Brauzer va agent faqat token tekshiradigan funksiyalar orqali ishlaydi; sayt kodidagi `publishable` kalitni ochiq saqlash xavfsiz.
- Ekran rasmlari faqat siz soʻraganda olinadi va 1 kundan keyin oʻchiriladi.
- Saqlash muddatlari: grafiklar 8 kun, hodisalar 30 kun, ekran vaqti cheklanmagan.

---

## Dasturchilar uchun

```
app/                  Interfeys (PWA + kompyuter oynasi) — React 19 + TypeScript, esbuild bilan yigʻiladi
  src/core/           maʼlumot qatlami: Supabase RPC, jonli kuzatuv, buyruqlar, push, mavzu
  src/ui/             dizayn tizimi komponentlari (Panel, MetricCard, Ring, grafiklar, modal…)
  src/screens/        ekranlar: Umumiy, Tizim, Jarayonlar, Ekran vaqti, Boshqaruv, Sozlamalar
  src/styles/         tokenlar (Aurora Glass, Once UI), asos, komponentlar, ekranlar
  public/             service worker, manifest, ikonlar, shriftlar (Pulse Sans, Geist), Once UI tokenlari
web/                  eski interfeys (vanilla JS) — /classic/ manzilida
agent/                Windows agent (Python → PyInstaller orqali PCPulseAgent.exe)
  window.py           PC Pulse oynasi (pywebview / WebView2)
  agent.py            telemetriya, buyruqlar, ekran vaqti, qoʻriqlash, taymer, oʻrnatish
  sensors.py          LibreHardwareMonitor (DLL / web) + psutil/nvidia-smi zaxira
  health.py           holat tahlili va oʻzbekcha maslahatlar
  winapi.py, tools.py Windows API, avtoyuklanish, tozalash, WOL
  gui.py              kirish va boshqaruv oynalari (Tkinter)
supabase/
  migrations/         jadvallar (`pp` sxemasi) va public.pp_* RPC funksiyalari, cron
  functions/pp-push/  Web Push (RFC 8291/8292, faqat WebCrypto)
.github/workflows/    sayt deploy va .exe yigʻish + reliz
```

- `main` ga push qilinganda:
  - `app/` yoki `web/` oʻzgarsa, interfeys yigʻiladi (`npm run typecheck`, `npm run build`) va sayt yangilanadi.
- Interfeysni mahalliy yigʻish: `cd app && npm install && npm run build` (natija — `app/dist/`).
  - `agent/` oʻzgarsa, Windows’da yangi `PCPulseAgent.exe` yigʻiladi, oʻz-oʻzini tekshiradi (`--selftest`) va yangi reliz chiqadi.
- Agentni manbadan ishga tushirish: `pip install -r agent/requirements.txt && python agent/agent.py`.
- Oʻz Supabase loyihangizda ishlatish uchun:
  1. `supabase/migrations` ni tartib bilan qoʻllang.
  2. `pp.config` ga VAPID kalitlari va `cron_secret` ni yozing (`002_pcpulse_cron.sql` dagi izoh).
  3. `pp-push` funksiyasini `--no-verify-jwt` bilan joylang.
  4. `app/public/config.js`, `web/config.js` va `agent/cloud.py` dagi URL/kalitni almashtiring.
