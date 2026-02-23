// AI analysis prompts — single source of truth
// Used by both Chrome extension (background.js) and Cloudflare bot

export const AI_PROMPT_IMAGE = `Analyze this photo/image and return ONLY valid JSON, no other text:
{
  "content_type": null,
  "content_type_secondary": null,
  "title": "",
  "description": "detailed description: what is shown, composition, who/what is where, context",
  "materials": [],
  "color_palette": null,
  "color_subject": null,
  "color_top3": [],
  "text_on_image": "",
  "price": "",
  "author": "",
  "tweet_text": ""
}

Rules:
- content_type: This is a photo sent directly (not a link). The ONLY allowed non-null value is "product".
  *** CRITICAL RULE — READ CAREFULLY ***
  A visible price is the SINGLE MOST IMPORTANT factor for "product" classification.
  Set "product" ONLY when BOTH conditions are met:
    1. The image shows a purchasable item (clothing, shoes, furniture, gadgets, etc.)
    2. A price tag or price number is CLEARLY VISIBLE somewhere in the image (e.g. "$49", "€120", "¥3500")
  If there is NO visible price anywhere in the image → content_type MUST be null. NO EXCEPTIONS.
  Examples that are NOT "product" (because no price is shown):
    - A t-shirt photographed on a flat surface — null
    - A person wearing clothing — null
    - A fashion lookbook or editorial photo — null
    - A product photo without any price text — null
    - A brand showcase or catalog image — null
  The presence of clothing, shoes, or any item alone does NOT make it a product. Price is mandatory.
  Do NOT set "video", "article", or "xpost" — these are impossible for a direct photo.
- content_type_secondary: null for direct photos (not applicable).
- title: the single most important headline or title visible on the screen. Extract the primary heading/title text — the biggest, most prominent text that describes what this content is about. Keep it short (under 80 chars). If no clear title/headline exists, empty string.
- description: 2-4 sentences in English, describe composition, objects, people, mood, setting. Be specific.
- materials: list of textures/materials visible (e.g. ["leather", "denim"]). Empty array if none.
- COLOR TAGS — allowed values for all color fields: "red", "violet", "pink", "yellow", "green", "blue", "brown", "white", "black", "bw".
  - "red" = true reds, scarlet, crimson, burgundy, maroon, dark red
  - "violet" = purple, violet, lavender, indigo, magenta-leaning purple
  - "pink" = pink, magenta, rose, fuchsia, coral-pink
  - "yellow" = yellow, gold, amber, warm orange, mustard
  - "green" = green, emerald, olive, lime, teal-leaning green, mint
  - "blue" = blue, navy, cyan, teal, sky blue, cobalt
  - "brown" = brown, beige, tan, khaki, sand, chocolate, caramel
  - "white" = white, cream, off-white, very light gray
  - "black" = black, very dark gray, charcoal, near-black
  - "bw" = ONLY for genuine black-and-white or monochrome photography/imagery with no color
- color_palette: the single OVERALL dominant color of the entire image by area. Null if unclear.
- color_subject: the color of the MAIN SUBJECT/OBJECT (the thing the photo is about, not the background). For product photos — the product color. For portraits — clothing or key object color. Null if no clear subject or same as color_palette.
- color_top3: top 1-3 most prominent colors ordered by area coverage (largest first). Only include colors that cover a meaningful portion of the image. Do NOT pad to 3 — if the image is mostly one color, return just ["black"]. Empty array if no image.
  IMPORTANT for "black" and "white": Only include "black" or "white" in color_top3 if the image is TRULY DOMINATED by that color — i.e., the image looks dark/black or light/white overall. If the image has vivid chromatic colors (reds, blues, greens, etc.) that catch the eye, do NOT include "black" or "white" even if there are dark shadows or light highlights. A colorful image on a black background should list the chromatic colors, NOT "black". Only use "black"/"white" for images that genuinely LOOK black/white/dark/light to a human viewer.
- text_on_image: transcribe ALL visible text verbatim, preserving original language. Empty string if no text.
- price: the main product price with currency symbol (e.g. "$129"). ONLY extract the price if there is clearly ONE main product in focus AND its price is prominently displayed next to it. If the screenshot shows a gallery, listing, or grid of multiple equivalent products (e.g. a category page on Farfetch, SSENSE, etc.) — set price to empty string even if individual prices are visible. The rule: no single obvious hero product with one clear price = empty string.
- author: empty string.
- tweet_text: empty string.
- All fields must be present. No markdown, no extra fields.`;

export const AI_PROMPT_LINK = `Analyze this saved link and return ONLY valid JSON, no other text:
{
  "content_type": null,
  "content_type_secondary": null,
  "title": "",
  "description": "detailed description: what is shown, composition, who/what is where, context",
  "materials": [],
  "color_palette": null,
  "color_subject": null,
  "color_top3": [],
  "text_on_image": "",
  "price": "",
  "author": "",
  "tweet_text": ""
}

Rules:
- content_type: set ONLY if confident, otherwise null. Must be one of:
  - "article" — URL is clearly an article/essay/instruction/journalism piece. NOT for book/document viewers with page navigation (use "pdf" instead)
  - "video" — URL is youtube.com/youtu.be/vimeo.com/instagram. OR screenshot shows video indicators: mute/unmute speaker icon, progress bar + playhead, play button overlay. Instagram posts with a mute/unmute icon are ALWAYS video.
  - "product" — the page shows a purchasable product WITH A VISIBLE PRICE. A price (e.g. "$49", "€120", "¥3500") MUST be clearly visible on the screenshot. If there is no price anywhere on the page — do NOT set "product", set null instead. A portfolio site, brand lookbook, design showcase, Are.na board, or any page showing items without prices is NOT "product". Only set "product" for actual e-commerce/store pages where a price is displayed.
  - "xpost" — URL contains x.com or twitter.com
  - "tool" — URL is a digital tool, app, SaaS service, template marketplace, font foundry/specimen, browser extension, CLI utility, framework/library page, AI tool, online generator/converter, or a showcase/launch post ("I made X", "I built X", Product Hunt, etc.). IMPORTANT: "tool" means the TOOL ITSELF is being saved (its homepage, landing page, or launch post). If the URL points to USER-GENERATED CONTENT hosted on a platform (e.g. a specific board/channel on Are.na, a specific project on Behance, a specific collection on Pinterest, a post on a forum, a user's profile page) — that is NOT "tool". The platform is just a host; what matters is the content being viewed.
  - "pdf" — screenshot shows a document/book being viewed. This includes: browser PDF viewer, Google Drive PDF preview, embedded PDF, Internet Archive book reader, any online document/book viewer with page navigation. Look for: PDF toolbar/controls, page navigation (e.g. "Page 1/141"), ".pdf" in URL bar or title, document-style layout with page borders, book covers being displayed in a reader interface, digital library/archive interfaces showing downloadable documents. Set "pdf" (NOT "article") when the page is displaying a PDF file, book, or document in a viewer/reader — even if the viewer is not a standard browser PDF viewer.
- content_type_secondary: If the content fits TWO categories, set the secondary one here. Same allowed values as content_type. Must be DIFFERENT from content_type (or null). Common cases:
  - xpost about a tool/app/SaaS → content_type="xpost", content_type_secondary="tool"
  - xpost about a product with visible price → content_type="xpost", content_type_secondary="product" (only if price is visible!)
  - article reviewing a tool → content_type="article", content_type_secondary="tool"
  - video about a product → content_type="video", content_type_secondary="product"
  Set null if only one category applies.
- title: the single most important headline or title visible on the screen. Extract the primary heading/title text — the biggest, most prominent text that describes what this content is about. For articles — the article headline. For products — the product name. For tools — the tool/app name. For PDFs — the document title. Keep it short (under 80 chars). If no clear title/headline exists, empty string.
- description: 2-4 sentences in English, describe composition, objects, people, mood, setting. Be specific.
- materials: list of textures/materials visible (e.g. ["leather", "denim"]). Empty array if none or no image.
- COLOR TAGS — allowed values for all color fields: "red", "violet", "pink", "yellow", "green", "blue", "brown", "white", "black", "bw".
  - "red" = true reds, scarlet, crimson, burgundy, maroon, dark red
  - "violet" = purple, violet, lavender, indigo, magenta-leaning purple
  - "pink" = pink, magenta, rose, fuchsia, coral-pink
  - "yellow" = yellow, gold, amber, warm orange, mustard
  - "green" = green, emerald, olive, lime, teal-leaning green, mint
  - "blue" = blue, navy, cyan, teal, sky blue, cobalt
  - "brown" = brown, beige, tan, khaki, sand, chocolate, caramel
  - "white" = white, cream, off-white, very light gray
  - "black" = black, very dark gray, charcoal, near-black
  - "bw" = ONLY for genuine black-and-white or monochrome photography/imagery with no color
- color_palette: the single OVERALL dominant color of the entire screenshot/image including backgrounds, UI, everything. For websites/apps — include the site background color. A dark-themed site = "black". A white site with a small red button = "white". Null if no image.
- color_subject: the color of the MAIN SUBJECT/OBJECT only, ignoring backgrounds and UI chrome. For product pages — the product itself. For tools/apps — the key accent/brand color. For articles — the hero image dominant color. Null if no clear subject or same as color_palette.
- color_top3: top 1-3 most prominent colors ordered by area coverage (largest first). Include ALL visually significant colors — backgrounds, UI, objects. Do NOT pad to 3 — if the image is mostly one color, return just ["black"]. Empty array if no image.
  IMPORTANT for "black" and "white": Only include "black" or "white" in color_top3 if the image is TRULY DOMINATED by that color — i.e., the image looks dark/black or light/white overall. If the image has vivid chromatic colors (reds, blues, greens, etc.) that catch the eye, do NOT include "black" or "white" even if there are dark shadows or light highlights. A colorful website on a white background should list the chromatic colors, NOT "white". Only use "black"/"white" for images that genuinely LOOK black/white/dark/light to a human viewer.
- text_on_image: transcribe ALL visible text verbatim, preserving original language. Empty string if no text or no image.
- price: the main product price with currency symbol (e.g. "$129", "€49.99"). ONLY extract the price if there is clearly ONE main product in focus AND its price is prominently displayed next to it. If the screenshot shows a gallery, listing, or grid of multiple equivalent products (e.g. a category page on Farfetch, SSENSE, etc.) — set price to empty string even if individual prices are visible. The rule: no single obvious hero product with one clear price = empty string.
- author: for xpost — @handle from screenshot. Empty string otherwise.
- tweet_text: for xpost — full tweet text from screenshot. Empty string otherwise.
- All fields must be present. No markdown, no extra fields.`;
