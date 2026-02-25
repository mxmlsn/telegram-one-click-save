# Stash · Visual Knowledge Base

[🇷🇺 Русский](#russian) · [🇬🇧 English](#english)

---

<a name="russian"></a>

**Stash** — инструмент для личной коллекции контента. Сохраняй картинки, статьи, ссылки, PDF, GIF, видео, аудио через расширение браузера или прямо пересылая в Telegram-бота. Всё хранится в твоём Notion (метаданные) и Telegram (файлы). Viewer: [stash.mxml.sn](https://stash.mxml.sn).

## Что умеет

### Chrome Extension

- правый клик на любой элемент → "Save to Telegram" → выбор тега в тосте
- автоопределение контента: картинки, видео, GIF, ссылки, PDF, текст
- AI-анализ при сохранении: тип контента, описание, цвета, цена товара (опционально)
- метаданные пишутся в Notion

### Telegram Bot (Cloudflare Worker)

- пересылай любое сообщение боту → автосохранение в Notion
- поддерживаемые типы: фото, видео, GIF, документы, аудио, голосовые, видеокружки, ссылки, текст
- после сохранения присылает кнопки с тегами — выбираешь прямо в Telegram
- AI-анализ: OCR текста на изображениях, транскрипция голосовых
- для ссылок делает скриншот страницы как превью

### Web Viewer ([stash.mxml.sn](https://stash.mxml.sn))

- masonry grid, разные карточки для разных типов контента
- фильтры: по типу, тегу, цвету; полнотекстовый поиск
- quick save: перетащи файл или ссылку → сохранится в Telegram + Notion
- создание заметок с прикреплёнными файлами
- mass select mode: выбрать несколько карточек → удалить
- AI фоновая обработка новых элементов без метаданных

### Are.na Sync (Cloudflare Worker)

- синхронизирует блоки из Are.na-канала в Notion + Telegram по расписанию

---

## Установка

### 1. Расширение Chrome

**Из исходников:**
```bash
git clone https://github.com/mxmlsn/telegram-one-click-save
# chrome://extensions → Developer mode → Load unpacked → выбрать папку
```

**Готовый zip:** [stash-extension-v2.0.zip](https://github.com/mxmlsn/telegram-one-click-save/raw/main/stash-extension-v2.0.zip) → распаковать → Load unpacked

### 2. Telegram-бот (2 минуты)

1. [@BotFather](https://t.me/BotFather) → `/newbot` → скопировать токен
2. Получить свой Chat ID (например через [@userinfobot](https://t.me/userinfobot))

### 3. Notion database

1. Создать новую Database в Notion
2. Properties:
   - `URL` (title)
   - `Type` (select)
   - `Tag` (select)
   - `Date` (created time)
   - `File ID` (text)
   - `Source URL` (url)
   - `ai_data` (text) — для AI-полей
3. Settings → Connections → создать integration → скопировать токен
4. Share database с integration
5. Скопировать Database ID из URL

### 4. Настройки расширения

Extension icon → Options:
- Telegram Bot Token
- Telegram Chat ID
- Notion Integration Token
- Notion Database ID
- (опционально) Gemini API Key или Anthropic API Key

### 5. Telegram Bot на Cloudflare Worker (опционально)

```bash
cd cloudflare-bot
npm install
npx wrangler deploy
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>.workers.dev"
```

### 6. Are.na Sync (опционально)

```bash
cd arena-worker
npm install
# Настроить wrangler.toml с ARENA_AUTH_TOKEN, ARENA_APP_TOKEN, ARENA_CHANNEL_SLUG
npx wrangler deploy
```

---

## Tech Stack

- **Extension:** Vanilla JS, Chrome Manifest V3
- **Web Viewer:** HTML/CSS/JS (без фреймворков), Cloudflare Pages
- **Workers:** Cloudflare Workers, KV storage
- **AI:** Google Gemini API, Anthropic Claude API
- **Storage:** Notion API, Telegram Bot API

---

## License

MIT — [@mxmlsn](https://github.com/mxmlsn)

---

<a name="english"></a>

**Stash** is a personal content collection tool. Save images, articles, links, PDFs, GIFs, videos, audio via a browser extension or by forwarding to a Telegram bot. Everything is stored in your own Notion (metadata) and Telegram (files). Viewer: [stash.mxml.sn](https://stash.mxml.sn).

## What it does

### Chrome Extension

- Right-click any element → "Save to Telegram" → pick tag in toast
- Auto-detects content type: images, video, GIF, links, PDF, text
- Optional AI analysis on save: content type, description, colors, product price
- Metadata auto-saved to Notion

### Telegram Bot (Cloudflare Worker)

- Forward any message to the bot → auto-saved to Notion
- Supported: photos, video, GIFs, documents, audio, voice messages, video notes, links, text
- Tag buttons sent after saving — pick directly in Telegram
- AI: OCR text from images, voice transcription
- Screenshots of links as previews

### Web Viewer ([stash.mxml.sn](https://stash.mxml.sn))

- Masonry grid, typed cards per content type
- Filters by type, tag, color; full-text search
- Quick save: drag & drop file or link → saves to Telegram + Notion
- Create notes with attachments
- Mass select mode: select cards → delete
- AI background processing for items without metadata

### Are.na Sync (Cloudflare Worker)

- Syncs blocks from an Are.na channel into Notion + Telegram on a schedule

---

## Installation

### 1. Chrome Extension

**From source:**
```bash
git clone https://github.com/mxmlsn/telegram-one-click-save
# chrome://extensions → Developer mode → Load unpacked → select folder
```

**Ready-made zip:** [stash-extension-v2.0.zip](https://github.com/mxmlsn/telegram-one-click-save/raw/main/stash-extension-v2.0.zip) → unpack → Load unpacked

### 2. Telegram bot (2 minutes)

1. [@BotFather](https://t.me/BotFather) → `/newbot` → copy token
2. Get your Chat ID (e.g. via [@userinfobot](https://t.me/userinfobot))

### 3. Notion database

1. Create a new Database in Notion
2. Properties: `URL` (title), `Type` (select), `Tag` (select), `Date` (created time), `File ID` (text), `Source URL` (url), `ai_data` (text)
3. Settings → Connections → create integration → copy token
4. Share database with integration, copy Database ID from URL

### 4. Extension settings

Extension icon → Options: Telegram Bot Token, Chat ID, Notion Integration Token, Notion Database ID, (optional) Gemini or Anthropic API Key

### 5. Telegram Bot on Cloudflare Worker (optional)

```bash
cd cloudflare-bot && npm install && npx wrangler deploy
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>.workers.dev"
```

### 6. Are.na Sync (optional)

```bash
cd arena-worker && npm install
# set ARENA_AUTH_TOKEN, ARENA_APP_TOKEN, ARENA_CHANNEL_SLUG in wrangler.toml
npx wrangler deploy
```

---

## Tech Stack

- **Extension:** Vanilla JS, Chrome Manifest V3
- **Web Viewer:** HTML/CSS/JS (no frameworks), Cloudflare Pages
- **Workers:** Cloudflare Workers, KV storage
- **AI:** Google Gemini API, Anthropic Claude API
- **Storage:** Notion API, Telegram Bot API

---

MIT — [@mxmlsn](https://github.com/mxmlsn)
