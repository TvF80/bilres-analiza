import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `You are an experienced financial analyst specializing in management reports for service companies. Write concise, professional management commentary in 3-4 sentences. Focus on key trends, anomalies, and actionable insights. Write in the language specified by the user. Output flowing prose — no bullet points, no headers, no markdown.`;

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

  const { section, lang, period, data } = req.body ?? {};

  if (!section || !lang || !period || !data)
    return res.status(400).json({ error: 'Brakujące pola: section, lang, period, data' });

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
