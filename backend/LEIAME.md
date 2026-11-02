# Checkout próprio da Foto Goioerê

O site (GitHub Pages) cuida da vitrine, do carrinho e das telas de compra.
Esta pasta é o "servidor" que o site não pode ser: guarda os pedidos, cria o pagamento no
Mercado Pago, recebe o aviso de pagamento e deixa a loja informar envio e rastreio.

Enquanto `apiBase` estiver vazio em `js/config.js`, o checkout roda em **modo demonstração**:
não cria pedido e não cobra nada.

## O que já está pronto e testado

`node --test backend/backend.test.mjs` roda 8 testes, entre eles um pedido completo
(Pix, aviso de pagamento, envio com rastreio) com o Mercado Pago simulado.
O que isso prova: a lógica do servidor. O que NÃO prova: o pagamento de verdade,
porque ele só pode ser testado com as suas credenciais.

Regras de segurança já aplicadas:
- O preço vem sempre do catálogo do servidor, nunca do navegador.
- Item com preço de referência (não confirmado) ou sem estoque é recusado no servidor.
- O aviso de pagamento é conferido (assinatura) e depois consultado direto no Mercado Pago.
- Pedido só é consultado com o link que tem a chave do pedido.
- O painel da loja exige senha. Dados de cartão nunca passam por este servidor.

## O que você precisa fazer (uma vez)

1. **Preços reais.** Edite `data/products.js` com o preço confirmado e `priceEstimated: false`.
   Depois: `node backend/make-catalog.mjs` (gera `catalog.json`). Sem isso, nada é vendido online.
2. **Mercado Pago.** Crie a conta de vendedor e a "aplicação" no painel de desenvolvedores.
   Pegue a chave pública e o Access Token (use as de TESTE primeiro).
   Cadastre o webhook apontando para `PUBLIC_BASE_URL/webhooks/mercadopago`, evento "Pagamentos".
3. **Cloudflare (grátis para esse volume).** Crie a conta, instale com `npm i -g wrangler`, rode
   `wrangler login`, depois dentro de `backend/`:
   - `npx wrangler kv namespace create ORDERS` e cole o id em `wrangler.toml`
   - `npx wrangler secret put MP_ACCESS_TOKEN` (e `MP_WEBHOOK_SECRET`, `ADMIN_TOKEN`)
   - `npx wrangler deploy`
4. **Ligar o site.** Em `js/config.js` preencha `apiBase` (endereço do Worker) e `mpPublicKey`.
   Faça `git push`.
5. **Teste de ponta a ponta com credenciais de TESTE** (compra com Pix e cartão de teste do
   Mercado Pago, conferir a página do pedido e o painel `admin.html`). Só depois troque para as de produção.

## Opcionais

- **E-mails automáticos** (recebido, pago, enviado): conta no Resend e `RESEND_API_KEY`.
- **Frete pelo CEP**: token do Melhor Envio. Hoje o servidor usa uma caixa padrão de 30x15x30 cm e 1 kg
  por item (`DEFAULT_PACKAGE` em `worker.js`). **Confirme medidas e peso reais** antes de cobrar frete.
  Sem o token, a entrega fica indisponível e o cliente escolhe retirada na loja.
- **WhatsApp automático para o cliente** exige a API oficial do WhatsApp (paga). Hoje o cliente recebe
  e-mail e tem a página do pedido, que sempre mostra o status atual.

## Coisas que este checkout ainda NÃO faz

- Não emite nota fiscal (integre com Bling, Tiny ou o emissor que a contabilidade usar).
- Não reserva estoque durante o pagamento (dois clientes podem comprar a última unidade).
- Não faz estorno nem cancelamento: faça pelo painel do Mercado Pago.
- Não tem política de troca escrita: o CDC dá 7 dias de arrependimento em compra pela internet.
