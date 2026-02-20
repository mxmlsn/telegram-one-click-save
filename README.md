# Stash · Visual Knowledge Base

> Open-source alternative to MyMind — save anything from the web with AI auto-tagging, own your data.

[🇷🇺 Русский](#russian) • [🇬🇧 English](#english)

---

<a name="russian"></a>

## 🇷🇺 О проекте

**Stash** — это личная визуальная база знаний с AI-тегированием. Сохраняй картинки, статьи, твиты и товары в один клик из браузера. AI автоматом распознаёт тип контента, извлекает цены, описания и цвета. Все данные хранятся в твоём Notion (или Telegram, или на своём сервере) — ты владеешь ими полностью.

### Зачем ещё один сервис?

**MyMind** крутой, но:
- $72/год за подписку
- данные на их серверах
- нельзя кастомизировать
- закроется сервис — потеряешь всё

**Stash даёт:**
- ✅ бесплатно навсегда (bring your own backend)
- ✅ владение данными (Notion/Telegram/локальный сервер)
- ✅ open source — форкни и меняй что хочешь
- ✅ AI на твоих условиях (используй Gemini бесплатно или Claude за копейки)
- ✅ privacy by design — данные не проходят через мои серверы

---

## 🎯 Что работает сейчас

### ✅ Chrome Extension — quick save

- **context menu** — правый клик на любой элемент → "Send to Telegram"
- **quick tags** — выбор категории в красивом тосте за 1 секунду
- **smart detection** — автоопределение картинок/видео даже на Instagram
- **formats** — картинки (сжатые/оригинал), текст, ссылки, PDF, GIF
- **notion integration** — автосохранение метаданных в твою базу
- **AI analysis** — автотегирование через Claude/Gemini (опционально)

### ✅ Viewer — personal MyMind

- **dark masonry grid** — красивая сетка как в MyMind/Pinterest
- **typed cards** — разные дизайны для изображений/статей/продуктов/твитов
- **filters** — по типу контента, цвету, тегам
- **search** — полнотекстовый поиск + OCR текста с картинок
- **AI background processing** — автоматом анализирует несохранённые айтемы

### ✅ AI Analysis (optional)

- **type detection** — article/video/product/xpost/tool/pdf
- **description** — краткое описание контента
- **structured extraction:**
  - цены для товаров
  - текст твитов с автором
  - заголовки статей
  - доминантные цвета
  - текст с изображений (OCR fallback)

### ✅ Integrations

- **Notion** — хранение метаданных в database (с AI-полями)
- **Telegram** — бесплатное хранилище файлов (неограниченно)
- **Anthropic/Google AI** — vision analysis (приносишь свой ключ)

---

## 🚀 Roadmap

### 📅 Q2 2025 — Web Viewer

- [ ] публичный сайт вместо extension page
- [ ] CORS proxy через Vercel/Cloudflare Workers
- [ ] доступ с мобильного браузера
- [ ] credentials в localStorage (privacy-first)
- [ ] одна кодовая база для extension + web

### 📅 Q2 2025 — Telegram Bot

- [ ] отправка ссылок/картинок прямо в бота → автосохранение
- [ ] пересылка постов из каналов
- [ ] inline buttons "view all saved"
- [ ] webhook на Cloudflare Worker (24/7 даже без компа)

### 📅 Q3 2025 — Custom Storage Backends

- [ ] adapter pattern для storage
- [ ] local folder (~/stash) вместо Telegram
- [ ] self-hosted server (Docker one-liner)
- [ ] S3/Cloudflare R2 support
- [ ] выбор бэкенда в настройках extension

### 📅 Future

- [ ] Telegram Mini App — viewer прямо в телеге
- [ ] iOS share extension
- [ ] Supabase/Airtable backend альтернативы
- [ ] collaborative collections (shared tags)

---

## 📦 Установка и настройка

### 1. Установить extension (Chrome/Edge/Brave)

```bash
git clone https://github.com/mxmlsn/telegram-one-click-save
# Открыть chrome://extensions
# Developer mode → Load unpacked → выбрать папку проекта
```

### 2. Создать Telegram бота (2 минуты)

1. Открыть [@BotFather](https://t.me/BotFather) в Telegram
2. Отправить `/newbot`
3. Скопировать токен (выглядит как `123456:ABC-DEF...`)

### 3. Создать Notion database (5 минут)

**Вариант A: использовать template (быстро)**
- [Duplicate this template](https://notion.so/templates/stash) → в свой workspace

**Вариант B: создать вручную**
1. Создать новую Database в Notion
2. Добавить properties:
   - `URL` (title)
   - `Type` (select: image/link/text/gif/pdf)
   - `Tag` (select: твои категории)
   - `Date` (created time)
   - `File ID` (text) — для Telegram файлов
   - `Source URL` (url)
3. Settings → Connections → New integration → скопировать token
4. Share database с integration
5. Скопировать Database ID из URL (30 символов после последнего слеша)

### 4. Настроить extension

1. Кликнуть на иконку extension → Options
2. Вставить Telegram Bot Token и Chat ID (свой Telegram ID)
3. Вставить Notion Integration Token и Database ID
4. (Опционально) Добавить AI API key:
   - Google Gemini — бесплатно 1500 запросов/день → [aistudio.google.com](https://aistudio.google.com)
   - Anthropic Claude — $0.25 за 1000 изображений → [console.anthropic.com](https://console.anthropic.com)

### 5. Готово! 🎉

Правый клик на любом элементе → "Send to Telegram" → выбери тег → сохранено.

Открыть viewer: правый клик на странице → "Open Viewer".

---

## 🛠 Tech Stack

- **Extension:** Vanilla JS, Chrome Manifest V3
- **Viewer:** HTML/CSS/JS, masonry layout (CSS columns)
- **AI:** Anthropic Claude API / Google Gemini API (vision models)
- **Storage:** Notion API, Telegram Bot API
- **Future web:** Vercel Functions / Cloudflare Workers (CORS proxy)

---

## 🤝 Contributing

Проект в активной разработке. Pull requests welcome!

**Нужна помощь с:**
- iOS share extension
- Android app
- Улучшение AI промптов
- Переводы (сейчас только RU/EN)

---

## 📄 License

MIT — делай что хочешь, crediting appreciated.

---

## 💬 Community

- **Issues** — баги и feature requests
- **Discussions** — вопросы и идеи
- **Telegram** — [@stash_community](https://t.me/stash_community) (скоро)

---

<a name="english"></a>

## 🇬🇧 About

**Stash** is a personal visual knowledge base with AI auto-tagging. Save images, articles, tweets, and products in one click from your browser. AI automatically detects content type, extracts prices, descriptions, and colors. All data stored in your Notion (or Telegram, or self-hosted server) — you own it completely.

### Why another service?

**MyMind** is great, but:
- $72/year subscription
- data on their servers
- can't customize
- service shuts down → you lose everything

**Stash gives you:**
- ✅ free forever (bring your own backend)
- ✅ data ownership (Notion/Telegram/self-hosted)
- ✅ open source — fork and customize
- ✅ AI on your terms (use Gemini free or Claude for pennies)
- ✅ privacy by design — data never touches my servers

---

## 🎯 What works now

### ✅ Chrome Extension — quick save

- **context menu** — right-click anything → "Send to Telegram"
- **quick tags** — pick category in beautiful toast (1 second)
- **smart detection** — auto-finds images/videos even on Instagram
- **formats** — images (compressed/original), text, links, PDF, GIF
- **notion integration** — auto-save metadata to your database
- **AI analysis** — auto-tagging via Claude/Gemini (optional)

### ✅ Viewer — personal MyMind

- **dark masonry grid** — beautiful layout like MyMind/Pinterest
- **typed cards** — different designs for images/articles/products/tweets
- **filters** — by content type, color, tags
- **search** — full-text search + OCR text from images
- **AI background processing** — auto-analyzes unsaved items

### ✅ AI Analysis (optional)

- **type detection** — article/video/product/xpost/tool/pdf
- **description** — brief content summary
- **structured extraction:**
  - prices for products
  - tweet text with author
  - article headlines
  - dominant colors
  - text from images (OCR fallback)

### ✅ Integrations

- **Notion** — metadata storage in database (with AI fields)
- **Telegram** — free unlimited file storage
- **Anthropic/Google AI** — vision analysis (bring your own key)

---

## 🚀 Roadmap

### 📅 Q2 2025 — Web Viewer

- [ ] public website instead of extension page
- [ ] CORS proxy via Vercel/Cloudflare Workers
- [ ] mobile browser access
- [ ] credentials in localStorage (privacy-first)
- [ ] single codebase for extension + web

### 📅 Q2 2025 — Telegram Bot

- [ ] send links/images directly to bot → auto-save
- [ ] forward posts from channels
- [ ] inline buttons "view all saved"
- [ ] webhook on Cloudflare Worker (24/7 without PC)

### 📅 Q3 2025 — Custom Storage Backends

- [ ] adapter pattern for storage
- [ ] local folder (~/stash) instead of Telegram
- [ ] self-hosted server (Docker one-liner)
- [ ] S3/Cloudflare R2 support
- [ ] backend selection in extension settings

### 📅 Future

- [ ] Telegram Mini App — viewer inside Telegram
- [ ] iOS share extension
- [ ] Supabase/Airtable backend alternatives
- [ ] collaborative collections (shared tags)

---

## 📦 Installation & Setup

### 1. Install extension (Chrome/Edge/Brave)

```bash
git clone https://github.com/mxmlsn/telegram-one-click-save
# Open chrome://extensions
# Developer mode → Load unpacked → select project folder
```

### 2. Create Telegram bot (2 minutes)

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot`
3. Copy token (looks like `123456:ABC-DEF...`)

### 3. Create Notion database (5 minutes)

**Option A: use template (fast)**
- [Duplicate this template](https://notion.so/templates/stash) → to your workspace

**Option B: create manually**
1. Create new Database in Notion
2. Add properties:
   - `URL` (title)
   - `Type` (select: image/link/text/gif/pdf)
   - `Tag` (select: your categories)
   - `Date` (created time)
   - `File ID` (text) — for Telegram files
   - `Source URL` (url)
3. Settings → Connections → New integration → copy token
4. Share database with integration
5. Copy Database ID from URL (30 chars after last slash)

### 4. Configure extension

1. Click extension icon → Options
2. Paste Telegram Bot Token and Chat ID (your Telegram ID)
3. Paste Notion Integration Token and Database ID
4. (Optional) Add AI API key:
   - Google Gemini — free 1500 requests/day → [aistudio.google.com](https://aistudio.google.com)
   - Anthropic Claude — $0.25 per 1000 images → [console.anthropic.com](https://console.anthropic.com)

### 5. Done! 🎉

Right-click any element → "Send to Telegram" → pick tag → saved.

Open viewer: right-click page → "Open Viewer".

---

## 🛠 Tech Stack

- **Extension:** Vanilla JS, Chrome Manifest V3
- **Viewer:** HTML/CSS/JS, masonry layout (CSS columns)
- **AI:** Anthropic Claude API / Google Gemini API (vision models)
- **Storage:** Notion API, Telegram Bot API
- **Future web:** Vercel Functions / Cloudflare Workers (CORS proxy)

---

## 🤝 Contributing

Project in active development. Pull requests welcome!

**Need help with:**
- iOS share extension
- Android app
- AI prompt improvements
- Translations (currently RU/EN only)

---

## 📄 License

MIT — do whatever you want, crediting appreciated.

---

## 💬 Community

- **Issues** — bugs and feature requests
- **Discussions** — questions and ideas
- **Telegram** — [@stash_community](https://t.me/stash_community) (coming soon)

---

**Built with ❤️ by [@mxmlsn](https://github.com/mxmlsn)**
