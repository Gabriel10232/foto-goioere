// Regras de negócio do checkout. Funções puras: ficam fáceis de testar e não dependem do Cloudflare.

export const STATUS = {
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pagamento confirmado',
  separando: 'Em separação',
  enviado: 'Enviado',
  pronto_retirada: 'Pronto para retirar na loja',
  entregue: 'Entregue',
  recusado: 'Pagamento recusado',
  cancelado: 'Cancelado'
};

export const ADMIN_STATUS = ['separando', 'enviado', 'pronto_retirada', 'entregue', 'cancelado'];

export const onlyDigits = (s) => String(s == null ? '' : s).replace(/\D/g, '');

export function isValidCPF(value) {
  const c = onlyDigits(value);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += Number(c[i]) * (t + 1 - i);
    const d = ((sum * 10) % 11) % 10;
    if (d !== Number(c[t])) return false;
  }
  return true;
}

export const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()) && String(s).length <= 120;
export const isValidPhone = (s) => { const d = onlyDigits(s); return d.length === 10 || d.length === 11; };
export const isValidCEP = (s) => onlyDigits(s).length === 8;

export function cleanText(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

// Preços SEMPRE vêm do catálogo do servidor, nunca do navegador.
export function priceItems(cart, catalog) {
  if (!Array.isArray(cart) || !cart.length) return { error: 'cart_empty' };
  if (cart.length > 40) return { error: 'cart_too_big' };
  const items = [];
  let subtotalCents = 0;
  for (const line of cart) {
    const p = catalog[String(line && line.id)];
    const qty = Math.floor(Number(line && line.qty));
    if (!p) return { error: 'unknown_item', id: String(line && line.id) };
    if (!(qty >= 1 && qty <= 20)) return { error: 'bad_quantity', id: p.id };
    if (p.stock !== 'in') return { error: 'out_of_stock', id: p.id };
    if (p.priceCents == null) return { error: 'price_unconfirmed', id: p.id };
    items.push({ id: p.id, name: p.name, qty, unitCents: p.priceCents, totalCents: p.priceCents * qty });
    subtotalCents += p.priceCents * qty;
  }
  return { items, subtotalCents };
}

export const centsToBRL = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function newOrderId(now = Date.now(), rnd = Math.random) {
  const t = now.toString(36).toUpperCase().slice(-5);
  let r = '';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 4; i++) r += alphabet[Math.floor(rnd() * alphabet.length)];
  return 'FG-' + t + r;
}

export function newToken(bytes = 12) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Estado do pedido a partir do status de um pagamento do Mercado Pago.
export function statusFromPayment(mpStatus, current) {
  const locked = ['separando', 'enviado', 'pronto_retirada', 'entregue', 'cancelado'];
  if (locked.includes(current)) return current;
  if (mpStatus === 'approved') return 'pago';
  if (mpStatus === 'rejected' || mpStatus === 'cancelled') return 'recusado';
  return 'aguardando_pagamento';
}

// Confere a assinatura do aviso (webhook) enviado pelo Mercado Pago.
export async function verifyMpSignature(secret, headers, dataId) {
  const sig = headers.get('x-signature') || '';
  const reqId = headers.get('x-request-id') || '';
  const parts = Object.fromEntries(sig.split(',').map((p) => p.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${reqId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

// Valida o corpo do pedido vindo do site. Devolve { ok, errors, data }.
export function validateOrderInput(body) {
  const errors = {};
  const b = body || {};
  const c = b.customer || {};
  const d = b.delivery || {};
  const customer = {
    name: cleanText(c.name, 80),
    email: String(c.email || '').trim().toLowerCase(),
    phone: onlyDigits(c.phone),
    cpf: onlyDigits(c.cpf)
  };
  if (customer.name.split(' ').filter(Boolean).length < 2) errors.name = 'Informe nome e sobrenome.';
  if (!isValidEmail(customer.email)) errors.email = 'E-mail inválido.';
  if (!isValidPhone(customer.phone)) errors.phone = 'Telefone inválido.';
  if (!isValidCPF(customer.cpf)) errors.cpf = 'CPF inválido.';
  const mode = d.mode === 'retirada' ? 'retirada' : d.mode === 'entrega' ? 'entrega' : null;
  if (!mode) errors.mode = 'Escolha entrega ou retirada.';
  const delivery = { mode };
  if (mode === 'entrega') {
    delivery.cep = onlyDigits(d.cep);
    delivery.street = cleanText(d.street, 100);
    delivery.number = cleanText(d.number, 12);
    delivery.complement = cleanText(d.complement, 60);
    delivery.district = cleanText(d.district, 60);
    delivery.city = cleanText(d.city, 60);
    delivery.state = cleanText(d.state, 2).toUpperCase();
    delivery.optionId = cleanText(d.optionId, 40);
    if (!isValidCEP(delivery.cep)) errors.cep = 'CEP inválido.';
    if (!delivery.street) errors.street = 'Informe a rua.';
    if (!delivery.number) errors.number = 'Informe o número.';
    if (!delivery.city || !/^[A-Z]{2}$/.test(delivery.state)) errors.city = 'Informe cidade e estado.';
    if (!delivery.optionId) errors.optionId = 'Escolha uma forma de envio.';
  }
  return { ok: Object.keys(errors).length === 0, errors, data: { customer, delivery } };
}
