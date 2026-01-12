# Telegram Instant Saver

[English](#english) | [Русский](#russian)

<a name="english"></a>
## 🇬🇧 English

**Telegram Instant Saver** is a powerful Chrome Extension that allows you to save content from the web directly to your Telegram Saved Messages (or any chat) with a single click. Whether it's screenshots, images, interesting quotes, or links, you can organize them instantly with custom tags.

### ✨ Features

*   **One-Click Screenshots**: Capture the visible part of any webpage and send it to Telegram instantly.
*   **Context Menu Integration**: Right-click on any image, link, or selected text to "Pocket it" to Telegram.
*   **Smart Media Detection**: Automatically detects images or videos under your cursor, perfect for sites like Instagram where direct right-clicking is blocked.
*   **Tagging System**: Organize your saved content with customizable tags (e.g., #work, #ideas, #memes).
    *   **Quick Tags**: A popup overlay to select tags on the fly before saving.
    *   **Emoji Packs**: Fun emoji-based tagging themes.
    *   **Drag & Drop**: Reorder your tags easily in the settings.
*   **Customizable Experience**:
    *   Dark/Light themes.
    *   Minimalist popup mode.
    *   Configurable timers and toast notifications.
*   **Privacy Focused**: All data (Bot Token, Chat ID) is stored locally in your browser.

### 🛠 Tech Stack

*   **Core**: HTML5, CSS3, JavaScript (ES6+)
*   **Platform**: Chrome Extension Manifest V3
*   **API**: Telegram Bot API
*   **Styling**: Vanilla CSS (no external frameworks for lightweight performance)

### 🏗 Architecture

The extension follows the standard Chrome Extension Manifest V3 architecture:

1.  **Background Worker (`background.js`)**:
    *   Acts as the central controller.
    *   Manages context menus and extension icon clicks.
    *   Handles all HTTP communication with the Telegram API.
    *   Manages data persistence via `chrome.storage`.

2.  **Content Scripts (`content.js`, `content.css`)**:
    *   Injects UI elements (Toast notifications, Quick Tags overlay) into the current webpage.
    *   Detects elements under the cursor (images/videos).
    *   Captures text selections for quoting.

3.  **Options Page**:
    *   A comprehensive settings dashboard to configure your Bot Token, Chat ID, and customize tags/appearance.
    *   Features a responsive, dark-mode ready UI with drag-and-drop lists.

---

<a name="russian"></a>
## 🇷🇺 Русский

**Telegram Instant Saver** — это мощное расширение для Chrome, позволяющее сохранять контент из интернета прямо в "Избранное" Telegram (или любой другой чат) одним кликом. Скриншоты, картинки, цитаты или ссылки — всё это можно мгновенно структурировать с помощью удобной системы тегов.

### ✨ Возможности

*   **Скриншоты в один клик**: Сделайте снимок видимой части любой веб-страницы и мгновенно отправьте его в Telegram.
*   **Интеграция в контекстное меню**: Нажмите правой кнопкой мыши на любую картинку, ссылку или выделенный текст, чтобы сохранить их.
*   **Умное определение медиа**: Автоматически находит изображения или видео под курсором. Идеально подходит для сайтов вроде Instagram, где обычное сохранение может быть заблокировано.
*   **Система тегов**: Организуйте сохраненный контент с помощью настраиваемых тегов (например, #работа, #идеи, #мемы).
    *   **Быстрые теги**: Всплывающее окно для выбора тега прямо перед сохранением.
    *   **Эмодзи-паки**: Тематические наборы эмодзи для визуальной маркировки.
    *   **Drag & Drop**: Легко меняйте порядок тегов в настройках перетаскиванием.
*   **Гибкие настройки**:
    *   Темная и светлая темы.
    *   Минималистичный режим уведомлений.
    *   Настраиваемые таймеры и стиль уведомлений.
*   **Приватность**: Все данные (токен бота, ID чата) хранятся локально в вашем браузере.

### 🛠 Технологический стек

*   **Ядро**: HTML5, CSS3, JavaScript (ES6+)
*   **Платформа**: Chrome Extension Manifest V3
*   **API**: Telegram Bot API
*   **Стили**: Vanilla CSS (без тяжелых фреймворков для максимальной скорости)

### 🏗 Архитектура

Расширение построено на архитектуре Chrome Manifest V3:

1.  **Background Worker (`background.js`)**:
    *   Центральный контроллер приложения.
    *   Управляет контекстным меню и кликами по иконке расширения.
    *   Отвечает за все запросы к Telegram API.
    *   Управляет сохранением настроек через `chrome.storage`.

2.  **Content Scripts (`content.js`, `content.css`)**:
    *   Встраивает элементы интерфейса (уведомления, меню выбора тегов) на текущую веб-страницу.
    *   Определяет элементы под курсором (изображения/видео).
    *   Захватывает выделенный текст для цитирования.

3.  **Страница настроек (Options Page)**:
    *   Панель управления для настройки токена бота, ID чата и кастомизации тегов.
    *   Современный интерфейс с поддержкой темной темы и drag-and-drop сортировкой списков.
