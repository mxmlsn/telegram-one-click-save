// Caption building and formatting utilities

import { COLOR_ID_TO_INDEX, EMOJI_PACKS } from '../shared/constants.js';

// Get emoji for a tag based on selected pack
export function getEmojiForTag(tag, emojiPack = 'circle', customEmoji = []) {
  if (!tag || !tag.id) return '';
  const index = COLOR_ID_TO_INDEX[tag.id];
  if (index === undefined) return '';

  if (emojiPack === 'custom' && customEmoji && customEmoji.length > index) {
    return customEmoji[index] || '';
  }

  const pack = EMOJI_PACKS[emojiPack] || EMOJI_PACKS.circle;
  return pack[index] || '';
}

// Escape HTML for Telegram parse_mode=HTML
export function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Format URL for display (truncate long URLs to domain)
export function formatUrl(url) {
  if (!url) return { text: '', isLink: false, fullUrl: '' };
  let clean = url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

  if (clean.length <= 35) {
    return { text: escapeHTML(clean), isLink: false, fullUrl: url };
  }

  const domain = clean.split('/')[0];
  return { text: escapeHTML(domain), isLink: true, fullUrl: url };
}

// Build caption with URL, tags, and optional text
export function buildCaption(url, tag, extraText = '', settings = {}, selectedTag = null) {
  const useHashtags = settings.useHashtags !== false;
  const quoteMonospace = settings.quoteMonospace !== false;

  // Special formatting for links when screenshot is disabled
  if (tag === settings.tagLink && settings.addScreenshot === false && !extraText) {
    let caption = escapeHTML(url) + '\n\n';
    let parts = [];

    if (selectedTag && selectedTag.name) {
      let tagText = `#${escapeHTML(selectedTag.name)}`;
      if (settings.sendWithColor) {
        const emoji = getEmojiForTag(selectedTag, settings.emojiPack, settings.customEmoji);
        if (emoji) tagText = `${emoji} ${tagText}`;
      }
      parts.push(tagText);
    }

    if (useHashtags && tag) {
      parts.push(escapeHTML(tag));
    }

    caption += parts.filter(p => p && p.trim()).join(' | ');
    return caption;
  }

  const formatted = formatUrl(url);
  let caption = '';

  if (extraText) {
    const escapedText = escapeHTML(extraText.slice(0, 3900));
    if (quoteMonospace) {
      caption += `<code>${escapedText}</code>\n\n`;
    } else {
      caption += `${escapedText}\n\n`;
    }
  } else {
    // Braille space + newline for visual separation
    caption += '⠀\n';
  }

  // Build tag parts: [emoji] [selectedTag] | [typeTag] | [url]
  let parts = [];

  if (selectedTag && selectedTag.name) {
    let tagText = `#${escapeHTML(selectedTag.name)}`;
    if (settings.sendWithColor) {
      const emoji = getEmojiForTag(selectedTag, settings.emojiPack, settings.customEmoji);
      if (emoji) tagText = `${emoji} ${tagText}`;
    }
    parts.push(tagText);
  }

  if (useHashtags && tag) {
    parts.push(escapeHTML(tag));
  }

  if (formatted.isLink) {
    parts.push(`<a href="${formatted.fullUrl}">${formatted.text}</a>`);
  } else if (formatted.text) {
    parts.push(formatted.text);
  }

  const finalParts = parts.filter(p => p && p.trim()).join(' | ');
  caption += finalParts;

  return caption;
}
