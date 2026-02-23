// Bot worker URL for tags sync
export const BOT_WORKER_URL = 'https://stash-telegram-bot.mxmlsn-co.workers.dev';

// Emoji packs definition
// Order: red, yellow, green, blue, purple, black, white
export const EMOJI_PACKS = {
  circle: ['🔴', '🟡', '🟢', '🔵', '🟣', '⚫️', '⚪️'],
  heart: ['❤️', '💛', '💚', '💙', '💜', '🖤', '🤍'],
  soft: ['🍄', '🐤', '🐸', '💧', '🔮', '🌚', '💭']
};

// Color ID to index mapping (for emoji pack lookup)
export const COLOR_ID_TO_INDEX = {
  'red': 0,
  'yellow': 1,
  'green': 2,
  'blue': 3,
  'purple': 4,
  'black': 5,
  'white': 6
};

// Default settings — single source of truth for all files
export const DEFAULT_SETTINGS = {
  botToken: '',
  chatId: '',
  addScreenshot: true,
  imageCompression: true,
  showLinkPreview: false,
  showSelectionIcon: true,
  quoteMonospace: true,
  iconColor: 'circle1',
  useHashtags: true,
  tagImage: '#image',
  tagLink: '#link',
  tagQuote: '#text',
  tagGif: '#gif',
  tagPdf: '#pdf',
  enableQuickTags: true,
  sendWithColor: true,
  timerDuration: 4,
  emojiPack: 'circle',
  toastStyle: 'normal',
  themeLight: false,
  isConnected: false,
  customEmoji: ['🔴', '🟡', '🟢', '🔵', '🟣', '⚫️', '⚪️'],
  // Fixed 7 tags
  customTags: [
    { name: 'work', color: '#E64541', id: 'red' },
    { name: 'study', color: '#FFDE42', id: 'yellow' },
    { name: 'refs', color: '#4ED345', id: 'green' },
    { name: 'project1', color: '#377CDE', id: 'blue' },
    { name: '', color: '#BB4FFF', id: 'purple' },
    { name: '', color: '#3D3D3B', id: 'black' },
    { name: '', color: '#DEDEDE', id: 'white' }
  ],
  // Notion integration
  notionEnabled: false,
  notionToken: '',
  notionDbId: '30b6081f-3dc6-8148-871f-dfb6944ac36e',
  // AI Analysis
  aiEnabled: false,
  aiProvider: 'google',
  aiApiKey: '',
  aiModel: 'gemini-2.0-flash',
  aiAutoOnSave: true,
  aiAutoInViewer: true
};

// AI model options for options page
export const AI_MODELS = {
  google: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (free)' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (free)' }
  ],
  anthropic: [
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (fast)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet (smart)' }
  ]
};

export const AI_DEFAULT_MODEL = {
  google: 'gemini-2.0-flash',
  anthropic: 'claude-haiku-4-5-20251001'
};
