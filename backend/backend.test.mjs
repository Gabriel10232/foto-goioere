// Rodar: node --test backend/
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  isValidCPF, priceItems, validateOrderInput, statusFromPayment, verifyMpSignature, newOrderId
} from './logic.js';

const catalog = {
  A1: { id: 'A1', name: 'Capotraste', stock: 'in', priceCents: 12900 },
  B2: { id: 'B2', name: 'Violão', stock: 'in', priceCents: null },
  C3: { id: 'C3', name: 'Cabo', stock: 'out', priceCents: 5000 }
};

test('CPF: aceita válido e recusa inválido', () => {
  assert.equal(isValidCPF('529.982.247-25'), true);
  assert.equal(isValidCPF('111.111.111-11'), false);
  assert.equal(isValidCPF('529.982.247-24'), false);
  assert.equal(isValidCPF('123'), false);
});

test('preço vem do servidor, nunca do navegador', () => {
  const r = priceItems([{ id: 'A1', qty: 2, price: 1 }], catalog);
  assert.equal(r.subtotalCents, 25800);
});

test('recusa item sem preço confirmado, sem estoque, desconhecido ou quantidade ruim', () => {
  assert.equal(priceItems([{ id: 'B2', qty: 1 }], catalog).error, 'price_unconfirmed');
  assert.equal(priceItems([{ id: 'C3', qty: 1 }], catalog).error, 'out_of_stock');
  assert.equal(priceItems([{ id: 'ZZ', qty: 1 }], catalog).error, 'unknown_item');
  assert.equal(priceItems([{ id: 'A1', qty: 0 }], catalog).error, 'bad_quantity');
  assert.equal(priceItems([{ id: 'A1', qty: 99 }], catalog).error, 'bad_quantity');
  assert.equal(priceItems([], catalog).error, 'cart_empty');
});

test('valida dados do cliente e da entrega', () => {
  const bad = validateOrderInput({ customer: { name: 'Ana', email: 'x', phone: '1', cpf: '1' }, delivery: { mode: 'entrega' } });
  assert.equal(bad.ok, false);
  for (const f of ['name', 'email', 'phone', 'cpf', 'cep', 'street', 'number', 'optionId']) assert.ok(bad.errors[f], f);
  const good = validateOrderInput({
    customer: { name: 'Ana Souza', email: 'ANA@mail.com', phone: '(44) 99999-1234', cpf: '529.982.247-25' },
    delivery: { mode: 'retirada' }
  });
  assert.equal(good.ok, true);
  assert.equal(good.data.customer.email, 'ana@mail.com');
  assert.equal(good.data.customer.phone, '44999991234');
});

test('status do pedido segue o pagamento e não volta depois de enviado', () => {
  assert.equal(statusFromPayment('approved', 'aguardando_pagamento'), 'pago');
  assert.equal(statusFromPayment('pending', 'aguardando_pagamento'), 'aguardando_pagamento');
  assert.equal(statusFromPayment('rejected', 'aguardando_pagamento'), 'recusado');
  assert.equal(statusFromPayment('approved', 'enviado'), 'enviado');
  assert.equal(statusFromPayment('rejected', 'separando'), 'separando');
});

test('assinatura do aviso do Mercado Pago', async () => {
  const secret = 's3cr3t', ts = '1700000000', reqId = 'req-1', dataId = 'ABC123';
  const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${reqId};ts:${ts};`).digest('hex');
  const h = (sig) => new Headers({ 'x-signature': sig, 'x-request-id': reqId });
  assert.equal(await verifyMpSignature(secret, h(`ts=${ts},v1=${v1}`), dataId), true);
  assert.equal(await verifyMpSignature(secret, h(`ts=${ts},v1=${'0'.repeat(64)}`), dataId), false);
  assert.equal(await verifyMpSignature('outro', h(`ts=${ts},v1=${v1}`), dataId), false);
  assert.equal(await verifyMpSignature(secret, new Headers(), dataId), false);
});

test('número do pedido tem formato legível', () => {
  assert.match(newOrderId(), /^FG-[A-Z0-9]{5}[A-Z2-9]{4}$/);
});

// ---- fluxo completo no Worker, com KV e Mercado Pago falsos ----
function fakeKV() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) };
}

test('fluxo: retirada na loja, pagamento por Pix, aviso do Mercado Pago, envio', async () => {
  if (!fs.existsSync(new URL('./catalog.json', import.meta.url))) fs.writeFileSync(new URL('./catalog.json', import.meta.url), JSON.stringify({ A1: catalog.A1 }));
  const raw = JSON.parse(fs.readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
  const worker = (await import('./worker.js')).default;
  const confirmedId = Object.values(raw).find((p) => p.priceCents != null && p.stock === 'in')?.id;
  assert.ok(confirmedId, 'catálogo precisa de ao menos um item com preço confirmado e em estoque');

  const env = { ORDERS: fakeKV(), MP_ACCESS_TOKEN: 'tok', ADMIN_TOKEN: 'adm', ALLOWED_ORIGINS: 'https://loja.test', PUBLIC_BASE_URL: 'https://api.test', SITE_URL: 'https://loja.test' };
  const ctx = { waitUntil: () => {} };
  let mpStatus = 'pending';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).endsWith('/v1/payments') && opts.method === 'POST') {
      const sent = JSON.parse(opts.body);
      assert.equal(sent.external_reference.startsWith('FG-'), true);
      assert.equal(sent.payer.identification.number, '52998224725');
      assert.ok(sent.transaction_amount > 0);
      return new Response(JSON.stringify({ id: 777, status: 'pending', payment_method_id: 'pix', point_of_interaction: { transaction_data: { qr_code: '000201...', qr_code_base64: 'AAA' } }, external_reference: sent.external_reference }), { status: 201 });
    }
    if (String(url).includes('/v1/payments/777')) {
      const order = JSON.parse([...env.ORDERS._m.values()][0]);
      return new Response(JSON.stringify({ id: 777, status: mpStatus, external_reference: order.id, payment_method_id: 'pix' }));
    }
    return realFetch(url, opts);
  };
  const m = new Map(); env.ORDERS = { _m: m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) };
  try {
    const body = {
      customer: { name: 'Ana Souza', email: 'ana@mail.com', phone: '44999991234', cpf: '52998224725' },
      delivery: { mode: 'retirada' },
      items: [{ id: confirmedId, qty: 1, price: 1 }],
      payment: { payment_method_id: 'pix', payer: { email: 'ana@mail.com' } }
    };
    let res = await worker.fetch(new Request('https://api.test/orders', { method: 'POST', headers: { origin: 'https://loja.test', 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, ctx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://loja.test');
    const created = await res.json();
    assert.equal(created.status, 'aguardando_pagamento');

    // consulta com token certo e errado
    res = await worker.fetch(new Request(`https://api.test/orders/${created.id}?t=${created.token}`), env, ctx);
    const view = await res.json();
    assert.equal(view.pix.copyPaste, '000201...');
    assert.equal(view.totalCents, raw[confirmedId].priceCents);
    res = await worker.fetch(new Request(`https://api.test/orders/${created.id}?t=errado`), env, ctx);
    assert.equal(res.status, 404);

    // aviso de pagamento aprovado
    mpStatus = 'approved';
    res = await worker.fetch(new Request('https://api.test/webhooks/mercadopago?data.id=777&type=payment', { method: 'POST', body: JSON.stringify({ type: 'payment', data: { id: '777' } }) }), env, ctx);
    assert.equal(res.status, 200);
    res = await worker.fetch(new Request(`https://api.test/orders/${created.id}?t=${created.token}`), env, ctx);
    const paid = await res.json();
    assert.equal(paid.status, 'pago');
    assert.equal(paid.pix, null);

    // painel da loja exige senha
    res = await worker.fetch(new Request('https://api.test/admin/orders'), env, ctx);
    assert.equal(res.status, 401);
    const auth = { authorization: 'Bearer adm', 'content-type': 'application/json' };
    res = await worker.fetch(new Request(`https://api.test/admin/orders/${created.id}`, { method: 'POST', headers: auth, body: JSON.stringify({ status: 'enviado' }) }), env, ctx);
    assert.equal(res.status, 409); // enviado exige código de rastreio
    res = await worker.fetch(new Request(`https://api.test/admin/orders/${created.id}`, { method: 'POST', headers: auth, body: JSON.stringify({ status: 'enviado', tracking: { code: 'AA123456789BR', carrier: 'Correios' } }) }), env, ctx);
    const shipped = await res.json();
    assert.equal(shipped.status, 'enviado');
    assert.equal(shipped.tracking.code, 'AA123456789BR');

    // pagamento atrasado não desfaz o envio
    res = await worker.fetch(new Request('https://api.test/webhooks/mercadopago?data.id=777&type=payment', { method: 'POST', body: '{}' }), env, ctx);
    res = await worker.fetch(new Request(`https://api.test/orders/${created.id}?t=${created.token}`), env, ctx);
    assert.equal((await res.json()).status, 'enviado');

    // item sem preço confirmado é recusado no servidor
    const unconfirmed = Object.values(raw).find((p) => p.priceCents == null && p.stock === 'in');
    if (unconfirmed) {
      res = await worker.fetch(new Request('https://api.test/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, items: [{ id: unconfirmed.id, qty: 1 }] }) }), env, ctx);
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error, 'price_unconfirmed');
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});
