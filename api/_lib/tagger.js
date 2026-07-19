// Local, offline tag suggestion. No API calls.
//
// Strategy (in priority order):
//   1. Author label                    -> one canonical "author: name" tag.
//   2. Hashtags in the post            -> strongest topic signal, used verbatim.
//   3. Existing vocabulary matches      -> reuse tags you've used before.
//   4. Salient phrases / keywords       -> only a few non-noisy topic labels.
//
// Output: up to MAX_SUGGESTIONS de-duplicated { tag, score, isExisting }.

const MAX_SUGGESTIONS = 4;
const MAX_AUTO_TOPICS = 3;

const STOPWORDS = new Set(
    `a an and are as at be been being but by for from had has have he her here him his how i if in into is it its just like me my no nor not of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours about above after again against all am any because before below between both did do does doing down during each few more most no off once our too s t can don now also get got make made one two new via amp dont im youre were thats whats lets gonna really thing things lot way ways via per vs etc www com net org io ai co linkedin article post posts write writes follow share shared repost reposted visit website site profile click link links read`.split(
    /\s+/
  )
);

const DOMAIN_WORDS = new Set(
  "www com net org io ai co dev app linkedin twitter x instagram youtube tiktok substack medium".split(
    /\s+/
  )
);

// LinkedIn chrome captured alongside the post body: ad CTA labels and media
// affordances ("View image", "Claim offer"). Stripped before analysis so they
// can't seed suggestions like "view image" / "image claim".
const CHROME_PHRASES_RE =
  /\b(?:view image|view profile|view sponsored content|claim offer|write article|learn more|sign ?up|see more|show more|visit website|see translation|activate to view larger image)\b/gi;

// Backstop: a candidate whose every word is chrome vocabulary is never a topic.
const CHROME_WORDS = new Set(
  "view image images claim offer see show more sponsored promoted follow play profile link saved".split(
    /\s+/
  )
);

function stripUrls(text) {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/gi, " ");
}

// "ProductManagement" -> "product management", "B2BSaaS" -> "b2 b saas" (best-effort)
function splitCamel(word) {
  return word
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

function tokenize(text) {
  return stripUrls(text)
    .replace(/#([\p{L}0-9_]+)/gu, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ""))
    .filter(Boolean);
}

function isMeaningful(word) {
  return (
    word.length >= 3 &&
    !STOPWORDS.has(word) &&
    !DOMAIN_WORDS.has(word) &&
    !/^\d+$/.test(word)
  );
}

function normalizePersonName(value) {
  if (!value || typeof value !== "string") return "";
  return value
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^A-Za-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function authorTokens(author) {
  return new Set(normalizePersonName(author).split(/\s+/).filter((w) => w.length >= 3));
}

function extractHashtags(rawText) {
  const tags = [];
  for (const m of rawText.matchAll(/#([\p{L}0-9_]+)/gu)) {
    const cleaned = splitCamel(m[1].replace(/_/g, " ")).trim();
    if (cleaned.length >= 2) tags.push(cleaned);
  }
  return tags;
}

// Words the author Capitalized mid-sentence — proxy for topics / proper nouns.
function capitalizedWords(rawText) {
  const set = new Set();
  const sentences = stripUrls(rawText).split(/(?<=[.!?\n])\s+/);
  for (const s of sentences) {
    const words = s.trim().split(/\s+/);
    words.forEach((w, i) => {
      const bare = w.replace(/[^A-Za-z0-9]/g, "");
      if (i > 0 && /^[A-Z][a-z]{2,}$/.test(bare)) set.add(bare.toLowerCase());
    });
  }
  return set;
}

/**
 * @param {string} text        the post body
 * @param {{name:string}[]} existingTags  current vocabulary
 * @returns {{tag:string, score:number, isExisting:boolean}[]}
 */
export function suggestTags(text, existingTags = []) {
  const options =
    Array.isArray(existingTags) ? { existingTags } : existingTags && typeof existingTags === "object" ? existingTags : {};
  const raw = (text || "").replace(CHROME_PHRASES_RE, " ");
  const tokens = tokenize(raw);
  const tokenSet = new Set(tokens);
  const capWords = capitalizedWords(raw);
  const usedTags = options.existingTags || [];
  const author = normalizePersonName(options.author);
  const authorWordSet = authorTokens(options.author);

  // map: tag string -> { score, isExisting }
  const candidates = new Map();
  const bump = (tag, score, isExisting = false, category = "topic") => {
    const key = tag.trim().toLowerCase();
    if (key.length < 2) return;
    if (isNoisyTag(key, authorWordSet)) return;
    const prev = candidates.get(key);
    if (prev) {
      prev.score = Math.max(prev.score, score);
      prev.isExisting = prev.isExisting || isExisting;
      prev.category = prev.category || category;
    } else {
      candidates.set(key, { score, isExisting, category });
    }
  };

  // 1. One canonical author label.
  if (author) bump(`author: ${author}`, 120, false, "author");

  // 2. Hashtags — strongest topic signal.
  for (const h of extractHashtags(raw)) bump(h, 100, false);

  // 3. Existing vocabulary matches.
  for (const { name } of usedTags) {
    const parts = name.split(/\s+/).filter(Boolean);
    const allPresent = parts.every((p) => tokenSet.has(p));
    if (allPresent && parts.length) bump(name, 50 + parts.length, true);
  }

  // Frequency counts for phrases & keywords.
  const uniFreq = new Map();
  const biFreq = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (isMeaningful(w) && !authorWordSet.has(w)) {
      uniFreq.set(w, (uniFreq.get(w) || 0) + 1);
    }
    if (i < tokens.length - 1) {
      const a = tokens[i];
      const b = tokens[i + 1];
      if (
        isMeaningful(a) &&
        isMeaningful(b) &&
        !authorWordSet.has(a) &&
        !authorWordSet.has(b)
      ) {
        const bg = `${a} ${b}`;
        biFreq.set(bg, (biFreq.get(bg) || 0) + 1);
      }
    }
  }

  // 3. Bigrams (weighted higher than single words).
  for (const [bg, count] of biFreq) bump(bg, 10 + count * 6, false);

  // 4. Unigrams, boosted if Capitalized in the source.
  for (const [w, count] of uniFreq) {
    const cap = capWords.has(w) ? 4 : 0;
    bump(w, count * 3 + cap, false);
  }

  const ranked = [...candidates.entries()]
    .map(([tag, v]) => ({ tag, ...v }))
    // Drop a unigram if it is fully contained in a higher kept phrase later.
    .sort((a, b) => b.score - a.score);

  // De-overlap: prefer phrases / existing tags over their component words.
  const kept = [];
  let topicCount = 0;
  for (const cand of ranked) {
    const words = cand.tag.split(/\s+/);
    const redundant =
      words.length === 1 &&
      kept.some((k) => k.tag.split(/\s+/).includes(cand.tag));
    if (redundant) continue;
    if (cand.category === "topic") {
      if (topicCount >= MAX_AUTO_TOPICS) continue;
      topicCount += 1;
    }
    kept.push(cand);
    if (kept.length >= MAX_SUGGESTIONS) break;
  }

  return kept;
}

function isNoisyTag(tag, authorWordSet) {
  if (tag.startsWith("author: ")) return false;
  if (/https?|\.com|\.net|\.org|www/.test(tag)) return true;

  const words = tag.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.every((word) => DOMAIN_WORDS.has(word))) return true;
  if (words.every((word) => CHROME_WORDS.has(word))) return true;
  if (words.every((word) => authorWordSet.has(word))) return true;
  if (words.length === 2 && words.some((word) => DOMAIN_WORDS.has(word))) return true;

  return false;
}
