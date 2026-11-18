# Piloto de uma semana da atendente com IA (Malibu): design

Complementa `2026-11-17-atendente-ia-malibu-design.md`. Objetivo: rodar a Maria na casa de verdade, sem pagar Gemini, com risco e privacidade controlados, e sair com números pra decidir se o Malibu contrata.

## Decisões

1. **Só leads de anúncio.** Nova opção `ai.only_ad_leads` (boolean, padrão `false`). Ligada, a IA só atende contatos com `whatsapp_contacts.source = 'ad'`. Os demais seguem nos robôs antigos (Reservas, Respostas automáticas, Fora do horário). Motivo: o plano grátis do Gemini pode usar o conteúdo pra melhorar produtos do Google; conversa de cliente "orgânico" (conhecidos, clientes antigos) fica de fora, e o lead de anúncio é onde o ganho de conversão é medido.
2. **Dados pessoais escondidos antes de ir pro Gemini.** Telefone, CPF, CNPJ e e-mail nas mensagens do histórico viram `[telefone]`, `[CPF]`, `[CNPJ]`, `[e-mail]`. Datas, horários e número de pessoas NÃO podem ser alterados. O primeiro nome do cliente continua indo (a Maria precisa dele). O telefone da reserva vem do contato (código), não do texto.
3. **Botão de segurança já existe:** "Pausar tudo" no Balcão. Nada novo.
4. **Relatório** (script somente leitura): período, conversas atendidas, respostas, repasses pra equipe e motivos, falhas/limite, reservas criadas pela IA, tokens (custo estimado se fosse pago).
5. **Fora do código:** avisar o Malibu do piloto e do que vai pro Google; o responsável clica em "Retomar" (a pausa geral está ligada hoje).

## Fora do escopo

Painel do relatório na tela, modo "sugestão", comparação automática de conversão (o relatório lista; a análise é feita à mão).
