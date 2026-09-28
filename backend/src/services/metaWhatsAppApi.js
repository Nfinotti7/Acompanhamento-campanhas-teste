const GRAPH_API_VERSION = 'v20.0';

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
