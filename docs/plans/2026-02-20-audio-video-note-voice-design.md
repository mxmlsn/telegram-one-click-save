# Video Note, Voice, Audio Support — Design

## New Media Types

### 1. Video Note (кружочки)
- **Bot**: `message.video_note` → `type: 'video_note'`, `mediaType: 'video_note'`
- **Viewer card**: `card-videonote` — circular mask, autoplay muted loop
- **Playback**: Direct TG API link via `resolveFileId`
- **Click**: restart from beginning with sound
- **Footer**: author name (forwardFrom / channelTitle)
- **Always standalone** (never in albums)

### 2. Voice Message
- **Bot**: `message.voice` → `type: 'voice'`, `mediaType: 'voice'`
- **Viewer card**: `card-voice` — compact bar with custom player
- **Playback**: Direct TG API link via `resolveFileId`
- **Player**: play/pause button + progress bar + duration
- **Footer**: author name
- **Always standalone**

### 3. Audio File (mp3, wav)
- **Bot**: `message.audio` → `type: 'audio'`, `mediaType: 'audio'`
- **Viewer card**: `card-audio` — album art + title + performer + player
- **Playback**: Via CORS proxy (binary download)
- **Player**: play/pause button + progress bar + time
- **Extra ai_data**: `audioTitle`, `audioPerformer`, `audioDuration`
- **Thumbnail**: album cover art via `thumbnailFileId`
- **Footer**: source info (forwardFrom / channelTitle)
- **Always standalone**

## Changes Required

### Bot (cloudflare-bot/src/index.js)
- Add 3 branches in `parseMessage()` between document and text checks
- Store extra fields in ai_data for audio (title, performer, duration)
- Skip AI analysis for these types (nothing visual to analyze)

### Viewer (web-viewer/viewer.js)
- Add to `parseItem()`: detect video_note/voice/audio types, set fileIds
- Add 3 new card renderers in `renderCard()`
- Add action handlers: `videonote-play`, `voice-play`, `audio-play`
- Add to `BASE_TYPES` set for filters
- Add filter pill buttons in HTML

### Viewer (web-viewer/index.html)
- Add CSS for `.card-videonote`, `.card-voice`, `.card-audio`
- Add filter buttons: `video_note`, `voice`, `audio`
- Custom audio player styles (progress bar, play/pause)

### CORS Proxy — no changes needed
Audio binary fetch uses existing `binary: true` mode.
