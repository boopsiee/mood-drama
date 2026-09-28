# MOOD — production-ready Cloudflare Pages MVP

Энэ хувилбар нь өмнөх localStorage demo биш. Cloudflare Pages + Pages Functions + D1 + private R2 ашигладаг.

## Ажилладаг зүйлс
- `*.pages.dev` үнэгүй хаяг
- Жинхэнэ register/login + HttpOnly session cookie
- D1 database
- Нэг кино 3,000₮ entitlement
- Бүх кино 5,000₮ / 30 хоног subscription
- Admin panel
- Admin-аас 720p MP4 + poster-ийг private R2 руу direct upload
- Private video playback: эрхтэй хэрэглэгчид 15 минутын signed R2 link
- Төлбөрийн хүсэлт / reference code
- Admin төлбөр батлахад эрх database дээр автоматаар нээгдэнэ

> QPay API одоогоор холбоогүй. Одоогийн төлбөр нь банкны шилжүүлэг + админы баталгаажуулалт. QPay холбоход `purchases` хүснэгт болон entitlement logic бэлэн.

## 1. Cloudflare account + Pages project
GitHub repo үүсгээд энэ folder-ийг push хийнэ. Cloudflare Dashboard → Workers & Pages → Create → Pages → Git repo → Build output directory: `public`.

Project deploy болсны дараа `https://PROJECT.pages.dev` хаягтай болно.

## 2. D1 үүсгэх
Cloudflare → D1 → Create database: `mood-drama-db`.

Pages project → Settings → Bindings → D1 binding:
- Variable name: `DB`
- Database: `mood-drama-db`

`migrations.sql`-ийн бүх SQL-ийг D1 console дээр нэг удаа ажиллуул.

## 3. R2 private bucket
Cloudflare → R2 → Create bucket: `mood-drama-videos`.
Public access **OFF** байлгана.

Pages project → Settings → Bindings → R2 binding:
- Variable name: `VIDEOS`
- Bucket: `mood-drama-videos`

## 4. R2 API key
R2 → Manage R2 API Tokens → Create token. Bucket read/write эрхтэй token үүсгэнэ.

Pages project → Settings → Variables and Secrets:
- `R2_ACCOUNT_ID` = Cloudflare Account ID
- `R2_ACCESS_KEY_ID` = token Access Key ID
- `R2_SECRET_ACCESS_KEY` = token Secret Access Key (**Secret**)
- `R2_BUCKET_NAME` = `mood-drama-videos`

## 5. R2 CORS
`r2-cors.json` доторх `YOUR_PROJECT.pages.dev`-г өөрийн pages.dev хаягаар солиод R2 bucket-ийн CORS policy болгож тавина.

## 6. Admin
Variables:
- `ADMIN_EMAIL` = өөрийн admin болох имэйл

Тэр имэйлээр сайтад **анх бүртгүүлэхэд** role нь admin болно. Дараа нь navigation дээр `Admin` гарна.

## 7. Банкны мэдээлэл
Pages Variables:
- `BANK_NAME` = жишээ `Khan Bank`
- `BANK_ACCOUNT_NAME` = данс эзэмшигч
- `BANK_ACCOUNT_NUMBER` = дансны дугаар

Хэрэглэгч 3,000₮ эсвэл 5,000₮ сонгоход unique reference code гарна. Шилжүүлгийн утгад тэр code-ийг бичүүлнэ. Admin panel → pending payment → ✓ дарж батална.

## 8. 720p video preparation
Windows дээр FFmpeg суулгасан бол:

```bat
scripts\encode-720p.bat "D:\Movies\movie.mp4"
```

Тохиргоо:
- 1280×720
- H.264
- ~1.4 Mbps video
- AAC 128 kbps
- `faststart`

1–2 цагийн кино ойролцоогоор ~650 MB–1.4 GB болно.

## 9. Security notes
- R2 public access OFF.
- Video URL нь browser дээр байнгын public URL биш; entitlement шалгасны дараа 15 минутын signed URL гардаг.
- Signed URL-ийг 15 минут дотор бусдад дамжуулж болох эрсдэл бүрэн арилдаггүй. DRM хэрэгтэй бол дараа нь Cloudflare Stream/Mux/Widevine төрлийн тусдаа шийдэл хэрэгтэй.
- Production дээр QPay webhook-г нэмэхэд admin approval-г автомат болгож болно.

## 10. Контентын эрх
Төлбөртэй сайтад зөвхөн өөрийн эсвэл цахимаар түгээх/борлуулах эрхтэй кино, видео байршуул.
