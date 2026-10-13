const GRAPH_API_VERSION = 'v20.0';

// Mídia na Cloud API vem só como um id no webhook: primeiro pede a URL temporária pro
// Graph, depois baixa o arquivo nessa URL (as duas chamadas exigem o token).
export async function downloadCloudMedia({ mediaId, accessToken, fetchImpl = fetch }) {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const metaRes = await fetchImpl(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, { headers });
  if (!metaRes.ok) {
    throw new Error(`Falha ao obter URL da mídia ${mediaId} (status ${metaRes.status}): ${await metaRes.text()}`);
  }
  const { url } = await metaRes.json();

  const fileRes = await fetchImpl(url, { headers });
  if (!fileRes.ok) {
    throw new Error(`Falha ao baixar mídia ${mediaId} (status ${fileRes.status})`);
  }
  return Buffer.from(await fileRes.arrayBuffer());
}

export async function sendWhatsAppMessage({ phoneNumberId, accessToken, to, body, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha ao enviar mensagem no WhatsApp (status ${res.status}): ${errText}`);
  }

  return res.json();
}
