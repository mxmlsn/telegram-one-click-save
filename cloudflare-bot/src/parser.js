// Telegram message parser — extracts structured data from incoming messages

import { normalizeUrl, formatTextWithEntities } from './helpers.js';

export function parseMessage(message, env) {
  const result = {
    type: 'quote',
    fileId: null,
    thumbnailFileId: null,
    content: '',
    contentHasHtml: false,
    sourceUrl: null,
    caption: message.caption || '',
    messageId: message.message_id,
    mediaType: null,
    mediaGroupId: message.media_group_id || null,
  };

  // Extract forward origin info
  if (message.forward_origin) {
    const origin = message.forward_origin;
    if (origin.type === 'channel' && origin.chat?.username) {
      result.sourceUrl = `https://t.me/${origin.chat.username}/${origin.message_id}`;
      if (origin.chat.title) result.channelTitle = origin.chat.title;
    } else if (origin.type === 'channel' && origin.chat?.title) {
      result.channelTitle = origin.chat.title;
    } else if (origin.type === 'user') {
      const isSelf = env?.ALLOWED_CHAT_ID && String(origin.sender_user?.id) === env.ALLOWED_CHAT_ID;
      if (!isSelf && origin.sender_user) {
        const name = [origin.sender_user.first_name, origin.sender_user.last_name]
          .filter(Boolean).join(' ');
        if (name) result.forwardFrom = name;
        const username = origin.sender_user.username;
        if (username) result.forwardUserUrl = `https://t.me/${username}`;
      }
    } else if (origin.type === 'hidden_user') {
      const name = origin.sender_user_name;
      if (name) result.forwardFrom = name;
    }
  }

  const isForward = !!message.forward_origin;
  const caption = result.caption;
  const hasSubstantialCaption = caption && caption.trim().length > 0;

  // Helper: apply caption with entity formatting
  const applyCaptionContent = (captionEntities) => {
    if (captionEntities && captionEntities.length) {
      result.content += formatTextWithEntities(caption, captionEntities);
      result.contentHasHtml = true;
    } else {
      result.content += caption;
    }
  };

  // Photo
  if (message.photo && message.photo.length > 0) {
    const largestPhoto = message.photo[message.photo.length - 1];
    result.fileId = largestPhoto.file_id;
    if (largestPhoto.width) result.imageWidth = largestPhoto.width;
    if (largestPhoto.height) result.imageHeight = largestPhoto.height;
    result.mediaType = 'image';
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      applyCaptionContent(message.caption_entities);
    } else {
      result.type = 'image';
      result.content += caption;
    }
    return result;
  }

  // Animation (GIF)
  if (message.animation) {
    result.fileId = message.animation.file_id;
    result.mediaType = 'gif';
    result.thumbnailFileId = message.animation.thumbnail?.file_id
      || message.animation.thumb?.file_id || null;
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      applyCaptionContent(message.caption_entities);
    } else {
      result.type = 'gif';
      result.content += caption;
    }
    return result;
  }

  // Video
  if (message.video) {
    result.fileId = message.video.file_id;
    result.mediaType = 'video';
    if (message.video.file_size) result.fileSize = message.video.file_size;
    result.thumbnailFileId = message.video.thumbnail?.file_id || null;
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      applyCaptionContent(message.caption_entities);
    } else {
      result.type = 'video';
      result.content += caption;
    }
    return result;
  }

  // Document
  if (message.document) {
    const mime = message.document.mime_type || '';
    const isImageDoc = mime.startsWith('image/');
    const isVideoDoc = mime.startsWith('video/');
    const docType = mime === 'application/pdf' ? 'pdf'
      : isImageDoc ? 'image'
      : isVideoDoc ? 'video'
      : 'document';

    result.fileId = message.document.file_id;
    result.fileName = message.document.file_name || '';
    if (message.document.file_size) result.fileSize = message.document.file_size;

    const thumb = message.document.thumbnail || message.document.thumb;
    if (thumb?.file_id) {
      result.thumbnailFileId = thumb.file_id;
      if (thumb.width) result.thumbnailWidth = thumb.width;
      if (thumb.height) result.thumbnailHeight = thumb.height;
    }

    if (isImageDoc) {
      result.mediaType = 'image';
      if (isForward || hasSubstantialCaption) {
        result.type = 'tgpost';
        applyCaptionContent(message.caption_entities);
      } else {
        result.type = 'image';
        result.content += caption;
      }
      return result;
    }

    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      result.mediaType = docType;
      applyCaptionContent(message.caption_entities);
    } else {
      result.type = docType;
      result.content += isVideoDoc ? (caption || '') : (caption || message.document.file_name || '');
    }
    return result;
  }

  // Video note (round video message)
  if (message.video_note) {
    result.fileId = message.video_note.file_id;
    result.thumbnailFileId = message.video_note.thumbnail?.file_id || null;
    result.audioDuration = message.video_note.duration || 0;
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      result.mediaType = 'video_note';
      applyCaptionContent(message.caption_entities);
    } else {
      result.type = 'video_note';
      result.content += caption;
    }
    return result;
  }

  // Voice message
  if (message.voice) {
    result.fileId = message.voice.file_id;
    result.audioDuration = message.voice.duration || 0;
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      result.mediaType = 'voice';
      applyCaptionContent(message.caption_entities);
    } else {
      result.type = 'voice';
      result.content += caption;
    }
    return result;
  }

  // Audio file
  if (message.audio) {
    result.fileId = message.audio.file_id;
    result.mediaType = 'audio';
    result.thumbnailFileId = message.audio.thumbnail?.file_id || null;
    result.audioTitle = message.audio.title || '';
    result.audioPerformer = message.audio.performer || '';
    result.audioDuration = message.audio.duration || 0;
    result.audioFileName = message.audio.file_name || '';
    if (isForward || hasSubstantialCaption) {
      result.type = 'tgpost';
      applyCaptionContent(message.caption_entities);
    } else {
      result.type = 'audio';
      result.content += caption
        || [message.audio.performer, message.audio.title].filter(Boolean).join(' — ')
        || message.audio.file_name || '';
    }
    return result;
  }

  // Text message
  if (message.text) {
    const allEntities = message.entities || [];
    const urlEntities = allEntities.filter(e => e.type === 'url');

    if (isForward) {
      result.type = 'tgpost';
      result.content += allEntities.length
        ? formatTextWithEntities(message.text, allEntities)
        : message.text;
      result.contentHasHtml = allEntities.length > 0;
      if (urlEntities.length > 0 && !result.sourceUrl) {
        result.sourceUrl = normalizeUrl(message.text.substring(
          urlEntities[0].offset,
          urlEntities[0].offset + urlEntities[0].length
        ));
      }
    } else if (urlEntities.length > 0) {
      const url = message.text.substring(
        urlEntities[0].offset,
        urlEntities[0].offset + urlEntities[0].length
      );
      result.type = 'link';
      result.sourceUrl = result.sourceUrl || normalizeUrl(url);
      result.content += message.text.replace(url, '').trim();
    } else {
      const bareUrlMatch = message.text.match(/^([\w-]+(?:\.[\w-]+)+(?:\/\S*)?)(?:\s|$)/);
      if (bareUrlMatch) {
        const bareUrl = bareUrlMatch[1];
        result.type = 'link';
        result.sourceUrl = normalizeUrl(bareUrl);
        result.content += message.text.replace(bareUrl, '').trim();
      } else {
        result.type = 'quote';
        result.content += message.text;
      }
    }
    return result;
  }

  return result;
}
