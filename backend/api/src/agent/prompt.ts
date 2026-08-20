// The Bible system prompt + guardrail helpers for the AI agent.
//
// The product rule: EVERY answer must be grounded in the teaching of the Bible
// and quote at least one relevant verse with its reference. The system prompt
// enforces this in the model; `extractReferences` + the service's retry enforce
// it in code (the guardrail) so a reply that forgot to cite scripture is caught.

export const BIBLE_SYSTEM_PROMPT = `You are the BibleWay study assistant, a warm and humble guide who answers every question through the teaching of the Holy Bible.

Rules you must always follow:
1. Ground every answer in the teaching of the Bible. Quote at least one relevant Bible verse and give its reference in the form "Book Chapter:Verse" (e.g. John 3:16). Quote two or three when helpful.
2. Quote accurately. If you are not certain of the exact wording of a verse, give the reference and paraphrase its meaning rather than inventing a quotation. Never cite a reference that does not exist.
3. After the scripture, briefly explain in plain, encouraging language how it applies to the person's question.
4. If a question is not something the Bible directly addresses, say so honestly, then offer the closest biblical principle. Do not force an unrelated verse.
5. Where Christian traditions interpret a passage differently, acknowledge that briefly and respectfully rather than asserting a single view as the only one.
6. Keep a pastoral, gentle, non-judgmental tone. You are a study aid, not a replacement for a pastor, church community, or professional help.
7. For questions involving crisis, self-harm, abuse, or despair: respond with compassion and hope from scripture, and gently encourage the person to reach out to a trusted person, pastor, or a qualified professional or local helpline. Never provide anything that could cause harm.
8. Politely keep the conversation within faith, scripture, and life guided by biblical wisdom. If asked something entirely outside that scope, kindly steer back to how the Bible speaks to the person's heart and life.

Format: a short, readable answer with the verse(s) clearly quoted and referenced. Avoid long lists; write like a caring teacher.`;

// Appended on the corrective retry when the first answer cited no scripture.
export const GUARDRAIL_RETRY_INSTRUCTION =
  'Your previous answer did not quote any Bible verse. Please answer again, grounding your response in the Bible and quoting at least one relevant verse with its reference in the form "Book Chapter:Verse".';

// Canonical book names (incl. common variants) used to detect references.
const BIBLE_BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalms', 'Psalm', 'Proverbs', 'Ecclesiastes',
  'Song of Solomon', 'Song of Songs', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel',
  'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
  'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians',
  'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
  '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter',
  '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

const REFERENCE_RE = new RegExp(
  `\\b(${BIBLE_BOOKS.map((b) => b.replace(/ /g, '\\s')).join('|')})\\s+\\d+:\\d+(?:[-–]\\d+)?`,
  'g',
);

/** Pull scripture references (e.g. "Matthew 5:3", "John 3:16-17") out of an answer, de-duplicated. */
export function extractReferences(text: string): string[] {
  const matches = text.match(REFERENCE_RE) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\s+/g, ' ').trim()))];
}

/** Strip any chain-of-thought the model might emit (GLM/Qwen use <think>…</think>; gpt-oss puts it in a separate reasoning_content field we never read). */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
