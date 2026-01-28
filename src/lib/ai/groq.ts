import Groq from 'groq-sdk';

export function createGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  return new Groq({ apiKey });
}

export async function chatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string = 'mixtral-8x7b-32768'
) {
  const groq = createGroqClient();

  const completion = await groq.chat.completions.create({
    messages,
    model,
    temperature: 0.7,
    max_tokens: 1024,
  });

  return completion.choices[0]?.message?.content || '';
}
