// Offline theme clustering for a corpus of saved posts. No API calls — same
// spirit as tagger.js, but corpus-level instead of per-post.
//
// Strategy:
//   1. Build a term set per post: hashtags (the author's own topic labels,
//      weighted highest) + meaningful unigrams/bigrams from the body.
//   2. Document-frequency band: keep terms common enough to be a theme but not
//      so common they're generic, nor so rare they're noise.
//   3. Greedily pick up to N seed terms, each bringing enough *fresh* posts to
//      stand as its own theme (dedupes near-identical seeds by coverage + words).
//   4. Assign each post to the *most specific* seed it contains (lowest df), so
//      a broad theme doesn't vacuum up posts that belong to a narrower one.
//
// Deterministic: same input always yields the same themes.

const STOPWORDS = new Set(
  `a an and are as at be been being but by for from had has have he her here him his how i if in into is it its just like me my no nor not of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours about above after again against all am any because before below between both did do does doing down during each few more most off our too s t can don now also get got make made one two new via amp dont im youre thats whats lets gonna really thing things lot way ways per vs etc www com net org io co linkedin article post posts write writes follow share shared repost reposted visit website site profile click link links read people work working time today day days week weeks year years great good best better need needs want using used use help love world life feel know think going right thanks thank congrats
   actually truly simply literally honestly basically clearly obviously certainly probably possibly maybe perhaps definitely absolutely essentially generally usually normally typically recently finally already still even much many every almost around instead however therefore meanwhile nearly quite rather pretty enough less least within without across along among toward towards whether either neither though although unless everyone everybody someone somebody anyone anybody nobody everything something anything nothing nowhere somewhere anywhere everywhere always never often sometimes seldom rarely soon later ever yet ago once twice big small large huge tiny said says say tell told ask asked look looks looking first next last another whole bit kind sort type things stuff`.split(
    /\s+/
  )
);

const DOMAIN_WORDS = new Set(
  "www com net org io co dev app linkedin twitter instagram youtube tiktok substack medium".split(
    /\s+/
  )
);

// Short tokens that are real topics — rescued from the length>=3 filter.
const KEEP_SHORT = new Set(
  "ai ml ux ui vc hr b2b b2c seo roi kpi llm api nlp saas cto ceo cfo iot ar vr".split(/\s+/)
);

// Common LinkedIn compound hashtags → spaced form, so a #RemoteWork hashtag and
// the body phrase "remote work" collapse into one theme with a readable name.
const COMPOUND = new Map(
  Object.entries({
    remotework: "remote work",
    futureofwork: "future of work",
    machinelearning: "machine learning",
    deeplearning: "deep learning",
    productmanagement: "product management",
    productmanager: "product management",
    venturecapital: "venture capital",
    artificialintelligence: "ai",
    generativeai: "generative ai",
    dataengineering: "data engineering",
    datascience: "data science",
    softwareengineering: "software engineering",
    softwaredevelopment: "software development",
    personalbranding: "personal branding",
    digitalmarketing: "digital marketing",
    contentmarketing: "content marketing",
    customerexperience: "customer experience",
    customersuccess: "customer success",
    careeradvice: "career advice",
    jobsearch: "job search",
    workfromhome: "remote work",
  })
);

// Acronyms / brands that should not be title-cased into "Ai", "Saas", etc.
const LABEL_ALIASES = new Map(
  Object.entries({
    ai: "AI", ml: "ML", llm: "LLMs", llms: "LLMs", saas: "SaaS", b2b: "B2B",
    b2c: "B2C", ux: "UX", ui: "UI", hr: "HR", ceo: "CEO", cto: "CTO", cfo: "CFO",
    api: "APIs", apis: "APIs", vc: "VC", roi: "ROI", kpi: "KPIs", seo: "SEO",
    nlp: "NLP", devops: "DevOps", iot: "IoT",
  })
);

function stripUrls(text) {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    // bare domains only — require an alphabetic TLD so numbers like "3.5" survive.
    .replace(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?/gi, " ");
}

function splitCamel(word) {
  return word
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

function tokenize(text) {
  return stripUrls(String(text || ""))
    .replace(/#([\p{L}0-9_]+)/gu, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ""))
    .filter(Boolean);
}

function isMeaningful(word) {
  if (STOPWORDS.has(word) || DOMAIN_WORDS.has(word) || /^\d+$/.test(word)) return false;
  if (KEEP_SHORT.has(word)) return true;
  return word.length >= 3 && word.length <= 24;
}

function normalizeHashtag(tag) {
  const bare = tag.replace(/^#/, "").replace(/_/g, " ").toLowerCase().replace(/\s+/g, "");
  if (COMPOUND.has(bare)) return COMPOUND.get(bare);
  return splitCamel(tag.replace(/^#/, "").replace(/_/g, " ")).trim();
}

function hashtagTerms(post) {
  const raw = String(post.text || "");
  const fromText = [...raw.matchAll(/#([\p{L}0-9_]+)/gu)].map((m) => m[1]);
  const fromMeta = Array.isArray(post.metadata?.hashtags)
    ? post.metadata.hashtags.map((h) => String(h))
    : [];
  const out = new Set();
  for (const tag of [...fromText, ...fromMeta]) {
    const term = normalizeHashtag(tag);
    if (!term) continue;
    // a compound may expand to multiple words — all of them are meaningful here
    if ((term.length >= 2 || KEEP_SHORT.has(term)) && !STOPWORDS.has(term)) out.add(term);
  }
  return out;
}

// Candidate term set for one post, plus the subset that came from hashtags.
function termSetFor(post) {
  const hashtags = hashtagTerms(post);
  const terms = new Set(hashtags);

  const tokens = tokenize(post.text);
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (isMeaningful(w)) terms.add(w);
    if (i < tokens.length - 1) {
      const a = tokens[i];
      const b = tokens[i + 1];
      if (isMeaningful(a) && isMeaningful(b)) terms.add(`${a} ${b}`);
    }
  }
  return { terms, hashtags };
}

function wordSet(term) {
  return new Set(term.split(" "));
}

// One term's words fully contained in the other's (e.g. "product" ⊆ "product team").
function lexicalOverlap(a, b) {
  const wa = wordSet(a);
  const wb = wordSet(b);
  const [small, big] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

function labelFor(term) {
  return term
    .split(" ")
    .map((w) => LABEL_ALIASES.get(w) || w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slugFor(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";
}

/**
 * Cluster posts into a handful of named themes.
 * @param {Array<{text:string, metadata?:object}>} posts
 * @param {{maxThemes?:number, minThemeSize?:number}} [opts]
 * @returns {{themes: {name:string, slug:string, count:number, term:string}[], themeByIndex: string[]}}
 */
export function clusterThemes(posts, { maxThemes = 10, minThemeSize = 3 } = {}) {
  const N = posts.length;
  const OTHER = "Other";
  if (N === 0) return { themes: [], themeByIndex: [] };

  // Per-post term sets + corpus document frequency, tracking hashtag origin.
  const postTerms = [];
  const hashtagVocab = new Set();
  const df = new Map();
  const postsByTerm = new Map();
  posts.forEach((post, i) => {
    const { terms, hashtags } = termSetFor(post);
    postTerms[i] = terms;
    for (const h of hashtags) hashtagVocab.add(h);
    for (const term of terms) {
      df.set(term, (df.get(term) || 0) + 1);
      if (!postsByTerm.has(term)) postsByTerm.set(term, new Set());
      postsByTerm.get(term).add(i);
    }
  });

  // Hashtags are the author's own labels → strongest signal; bigrams beat words.
  const weightOf = (term) =>
    hashtagVocab.has(term) ? 3.0 : term.includes(" ") ? 1.5 : 1.0;

  const minDf = Math.max(minThemeSize, Math.ceil(N * 0.015));
  const maxDf = Math.max(minDf + 1, Math.floor(N * 0.5));

  const candidates = [...df.entries()]
    .filter(([, count]) => count >= minDf && count <= maxDf)
    .map(([term, count]) => ({ term, score: count * weightOf(term), count }))
    // score desc, then df desc, then term asc — fully deterministic.
    .sort((a, b) => b.score - a.score || b.count - a.count || (a.term < b.term ? -1 : 1));

  // Greedy seed selection: each new seed must bring some fresh posts so it
  // isn't a near-duplicate of one already chosen. The novelty floor is kept
  // below minThemeSize on purpose — themes legitimately share posts, and the
  // post-assignment drop below enforces the real minimum size.
  const novelty = Math.max(2, Math.ceil(minThemeSize * 0.6));
  const seeds = [];
  const covered = new Set();
  for (const cand of candidates) {
    if (seeds.length >= maxThemes) break;
    if (seeds.some((s) => lexicalOverlap(s.term, cand.term))) continue;
    let fresh = 0;
    for (const i of postsByTerm.get(cand.term)) if (!covered.has(i)) fresh++;
    if (fresh < novelty) continue;
    seeds.push(cand);
    for (const i of postsByTerm.get(cand.term)) covered.add(i);
  }

  // Assign each post to the most specific seed it contains (lowest df), so a
  // broad theme can't starve a narrower one; break ties by score, then name.
  function bestSeed(i, pool) {
    let best = null;
    for (const s of pool) {
      if (!postTerms[i].has(s.term)) continue;
      if (
        !best ||
        s.count < best.count ||
        (s.count === best.count && s.score > best.score) ||
        (s.count === best.count && s.score === best.score && s.term < best.term)
      ) {
        best = s;
      }
    }
    return best ? best.term : null;
  }

  let assignment = posts.map((_, i) => bestSeed(i, seeds));

  // Drop themes that ended up too small; reassign their posts to the next-best
  // surviving seed, else Other. Iterate until stable.
  let survivors = seeds;
  for (let pass = 0; pass < seeds.length; pass++) {
    const counts = new Map();
    assignment.forEach((t) => t && counts.set(t, (counts.get(t) || 0) + 1));
    const next = survivors.filter((s) => (counts.get(s.term) || 0) >= minThemeSize);
    if (next.length === survivors.length) break;
    survivors = next;
    assignment = posts.map((_, i) => bestSeed(i, survivors));
  }

  // Build labels (merging any seeds that collapse to the same display name).
  const nameByTerm = new Map();
  const order = [];
  for (const s of survivors) {
    const name = labelFor(s.term);
    if (!nameByTerm.has(name)) order.push(name);
    nameByTerm.set(s.term, name);
  }

  const themeByIndex = assignment.map((term) => (term ? nameByTerm.get(term) : OTHER));

  const countByName = new Map();
  for (const name of themeByIndex) countByName.set(name, (countByName.get(name) || 0) + 1);

  const termByName = new Map();
  for (const s of survivors) {
    if (!termByName.has(nameByTerm.get(s.term))) termByName.set(nameByTerm.get(s.term), s.term);
  }

  const themes = order
    .filter((name) => (countByName.get(name) || 0) > 0)
    .map((name) => ({
      name,
      slug: slugFor(name),
      count: countByName.get(name) || 0,
      term: termByName.get(name) || "",
    }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));

  if (countByName.get(OTHER)) {
    themes.push({ name: OTHER, slug: "other", count: countByName.get(OTHER), term: "" });
  }

  return { themes, themeByIndex };
}
