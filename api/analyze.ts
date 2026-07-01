import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `You are an experienced financial analyst specializing in management reports for service companies. Write concise, professional management commentary in 3-4 sentences. Focus on key trends, anomalies, and actionable insights. Write in the language specified by the user. Output flowing prose — no bullet points, no headers, no markdown.`;

// Dane wejściowe to zagregowane wskaźniki/sumy (nie surowe zapisy FK) — kilka KB
// wystarcza z zapasem; wyższe wartości to sygnał nadużycia lub błędu klienta.
const MAX_DATA_CHARS = 20_000;

// Best-effort rate limiting w pamięci procesu (per ciepła instancja funkcji).
// Nie gwarantuje globalnego limitu (kolejne cold starty / równoległe instancje
// mają osobny stan) — to obrona przed prostym nadużyciem/pętlą, nie pełny rate
// limiter. Dla twardej gwarancji potrzebny współdzielony store (Upstash/Vercel KV).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 15;
const hits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function buildUserPrompt(section: string, lang: string, period: string, data: unknown): string {
  const langName = lang === 'fr' ? 'French' : lang === 'en' ? 'English' : 'Polish';
  return `Section: ${section}
Period: ${period}
Language: ${langName}

Data (amounts in PLN):
${JSON.stringify(data, null, 2)}

Write a 3-4 sentence management commentary in ${langName}.`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.' });
  }

  const { section, lang, period, data } = req.body ?? {};

  if (!section || !lang || !period || !data)
    return res.status(400).json({ error: 'Brakujące pola: section, lang, period, data' });

  const dataStr = JSON.stringify(data);
  if (dataStr.length > MAX_DATA_CHARS)
    return res.status(413).json({ error: 'Dane sekcji są zbyt duże do analizy AI' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return res.status(503).json({ error: 'AI nie jest skonfigurowane (brak ANTHROPIC_API_KEY)' });

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildUserPrompt(section, lang, period, data) }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    return res.status(200).json({ text });
  } catch (err: any) {
    console.error('[api/analyze]', err?.message ?? err);
    return res.status(500).json({ error: 'Błąd generowania analizy. Spróbuj ponownie.' });
  }
}
