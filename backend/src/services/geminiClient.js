// Cliente do Gemini por fetch (API REST generateContent). Sem SDK: o pipeline do Hostinger
// só instala o package.json da raiz. Chave e modelo vêm do ambiente, nunca do banco.
//   GEMINI_API_KEY          chave (Google AI Studio)
//   GEMINI_MODEL            modelo (padrão: alias gemini-flash-latest)
//   GEMINI_THINKING_BUDGET  opcional; 0 desliga o "pensar" nos modelos que aceitam (mais barato/rápido)

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_TIMEOUT_MS = 20000;

export class GeminiError extends Error {}

export async function generate({ system, contents, tools, maxOutputTokens = 500 }, deps = {}) {
  const apiKey = deps.apiKey ?? process.env.GEMINI_API_KEY;
  const model = deps.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const timeoutMs = deps.timeoutMs || DEFAULT_TIMEOUT_MS;
  const doFetch = deps.fetch || fetch;
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY não configurada.');

  const generationConfig = { maxOutputTokens, temperature: 0.6 };
  const budget = process.env.GEMINI_THINKING_BUDGET;
  if (budget !== undefined && budget !== '' && Number.isFinite(Number(budget))) {
    generationConfig.thinkingConfig = { thinkingBudget: Number(budget) };
  }
  const body = { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig };
  if (tools?.length) body.tools = [{ functionDeclarations: tools }];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await doFetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new GeminiError(`Gemini: passou do tempo limite (${timeoutMs} ms).`);
    throw new GeminiError(`Gemini: falha de rede (${error?.message || 'erro'}).`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new GeminiError(`Gemini: erro HTTP ${res.status}.`);
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('');
  const functionCalls = parts.filter((p) => p.functionCall).map((p) => ({
    name: p.functionCall.name,
    args: p.functionCall.args || {}
  }));
  if (!text.trim() && functionCalls.length === 0) {
    throw new GeminiError(`Gemini: resposta vazia ou bloqueada (${candidate?.finishReason || 'sem resposta'}).`);
  }
  return {
    parts,
    text,
    functionCalls,
    usage: { in: data.usageMetadata?.promptTokenCount || 0, out: data.usageMetadata?.candidatesTokenCount || 0 }
  };
}
