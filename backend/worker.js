// API do checkout da Foto Goioerê (Cloudflare Workers).
// Guarda os pedidos, cria o pagamento no Mercado Pago, recebe o aviso de pagamento
// e deixa a loja informar envio e rastreio. Veja backend/LEIAME.md para publicar.
import catalog from './catalog.json' with { type: 'json' };
import {
  STATUS, ADMIN_STATUS, priceItems, validateOrderInput, newOrderId, newToken,
  statusFromPayment, verifyMpSignature, centsToBRL, onlyDigits, cleanText
} from './logic.js';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin'
  };
}

const publicOrder = (o) => ({
  id: o.id, status: o.status, statusLabel: STATUS[o.status] || o.status, createdAt: o.createdAt,
  items: o.items, subtotalCents: o.subtotalCents, shippingCents: o.shippingCents, totalCents: o.totalCents,
  delivery: { mode: o.delivery.mode, city: o.delivery.city || null, state: o.delivery.state || null, optionName: o.shippingName || null },
  tracking: o.tracking || null,
  pix: o.status === 'aguardando_pagamento' && o.pix ? o.pix : null,
  history: o.history
});

async function saveOrder(env, order) {
  order.updatedAt = new Date().toISOString();
  await env.ORDERS.put('order:' + order.id, JSON.stringify(order));
}
async function loadOrder(env, id) {
  const raw = await env.ORDERS.get('order:' + id);
  return raw ? JSON.parse(raw) : null;
}
function pushHistory(order, status, note) {
  order.status = status;
  order.history.push({ status, label: STATUS[status] || status, at: new Date().toISOString(), note: note || undefined });
}

// ---------- e-mail (opcional, via Resend) ----------
async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, html })
    });
  } catch (e) { /* e-mail nunca derruba o pedido */ }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function orderLink(env, o) { return `${env.SITE_URL || ''}/pedido.html?id=${o.id}&t=${o.token}`; }
async function notify(env, order, kind) {
  const link = orderLink(env, order);
  const lines = order.items.map((i) => `${i.qty}x ${esc(i.name)}`).join('<br>');
  const base = (title, extra) => `<div style="font-family:Arial,sans-serif;max-width:520px"><h2>${title}</h2><p>Pedido <b>${order.id}</b></p><p>${lines}</p><p>Total: <b>${centsToBRL(order.totalCents)}</b></p>${extra || ''}<p><a href="${link}">Acompanhar meu pedido</a></p><p style="color:#666;font-size:13px">Foto Goioerê Instrumentos Musicais, Av. Francisco Scarpari, 345, Goioerê, PR. Dúvidas: WhatsApp (44) 99906-0030.</p></div>`;
  const to = order.customer.email;
  if (kind === 'pago') {
    await sendEmail(env, to, `Pagamento confirmado, pedido ${order.id}`, base('Pagamento confirmado', '<p>Recebemos seu pagamento e já vamos separar o pedido.</p>'));
    await sendEmail(env, env.STORE_EMAIL, `Novo pedido pago ${order.id}`, base('Novo pedido pago', `<p>${esc(order.customer.name)}, ${esc(order.customer.phone)}<br>${order.delivery.mode === 'retirada' ? 'RETIRADA NA LOJA' : 'ENTREGA'}</p>`));
  } else if (kind === 'recebido') {
    await sendEmail(env, to, `Recebemos seu pedido ${order.id}`, base('Recebemos seu pedido', '<p>Assim que o pagamento for confirmado, avisamos por e-mail.</p>'));
  } else if (kind === 'enviado') {
    const t = order.tracking || {};
    await sendEmail(env, to, `Seu pedido ${order.id} foi enviado`, base('Seu pedido foi enviado', `<p>Código de rastreio: <b>${esc(t.code || '')}</b> (${esc(t.carrier || '')})</p>`));
  } else if (kind === 'pronto_retirada') {
    await sendEmail(env, to, `Seu pedido ${order.id} está pronto para retirar`, base('Pronto para retirar', '<p>Pode vir buscar na loja, em horário de atendimento.</p>'));
  }
}

// ---------- frete (Melhor Envio) ----------
const DEFAULT_PACKAGE = { width: 30, height: 15, length: 30, weight: 1 }; // CONFIRMAR com a loja: medidas e peso médios por item
async function quoteShipping(env, cep, items) {
  if (!env.MELHOR_ENVIO_TOKEN) return { available: false, options: [] };
  const originCep = onlyDigits(env.ORIGIN_CEP || '87360000');
  const products = items.map((i) => ({ id: i.id, ...DEFAULT_PACKAGE, insurance_value: i.unitCents / 100, quantity: i.qty }));
  const res = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.MELHOR_ENVIO_TOKEN, accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'FotoGoioere (' + (env.STORE_EMAIL || 'contato') + ')' },
    body: JSON.stringify({ from: { postal_code: originCep }, to: { postal_code: onlyDigits(cep) }, products })
  });
  if (!res.ok) return { available: false, options: [] };
  const data = await res.json();
  const options = (Array.isArray(data) ? data : [])
    .filter((o) => !o.error && o.price)
    .map((o) => ({ id: String(o.id), name: `${o.company && o.company.name ? o.company.name + ' ' : ''}${o.name}`.trim(), priceCents: Math.round(Number(o.custom_price || o.price) * 100), days: o.custom_delivery_time || o.delivery_time || null }))
    .sort((a, b) => a.priceCents - b.priceCents);
  return { available: options.length > 0, options };
}

// ---------- Mercado Pago ----------
async function createPayment(env, order, formData) {
  const fd = formData || {};
  const payer = fd.payer || {};
  const [first, ...rest] = order.customer.name.split(' ');
  const body = {
    transaction_amount: order.totalCents / 100,
    description: `Pedido ${order.id} Foto Goioerê`,
    payment_method_id: fd.payment_method_id,
    installments: Number(fd.installments) || 1,
    external_reference: order.id,
    notification_url: `${env.PUBLIC_BASE_URL}/webhooks/mercadopago`,
    payer: {
      email: order.customer.email,
      first_name: first,
      last_name: rest.join(' '),
      identification: { type: 'CPF', number: order.customer.cpf },
      ...(payer.entity_type ? { entity_type: payer.entity_type } : {})
    }
  };
  if (fd.token) body.token = fd.token;
  if (fd.issuer_id) body.issuer_id = fd.issuer_id;
  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.MP_ACCESS_TOKEN, 'content-type': 'application/json', 'x-idempotency-key': order.id },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}
function applyPayment(order, payment) {
  order.paymentId = String(payment.id);
  order.paymentMethod = payment.payment_method_id || order.paymentMethod;
  const td = payment.point_of_interaction && payment.point_of_interaction.transaction_data;
  if (td && td.qr_code) order.pix = { copyPaste: td.qr_code, qrBase64: td.qr_code_base64 || null, expiresAt: payment.date_of_expiration || null };
  const next = statusFromPayment(payment.status, order.status);
  if (next !== order.status) pushHistory(order, next, payment.status_detail || undefined);
  return next;
}

// ---------- rotas ----------
async function postOrder(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
  const v = validateOrderInput(body);
  if (!v.ok) return json({ error: 'validation', fields: v.errors }, 422);
  const priced = priceItems(body.items, catalog);
  if (priced.error) return json({ error: priced.error, id: priced.id }, 409);

  let shippingCents = 0, shippingName = null;
  if (v.data.delivery.mode === 'entrega') {
    const q = await quoteShipping(env, v.data.delivery.cep, priced.items);
    const opt = q.options.find((o) => o.id === v.data.delivery.optionId);
    if (!opt) return json({ error: 'shipping_unavailable' }, 409);
    shippingCents = opt.priceCents; shippingName = opt.name;
  }
  const order = {
    id: newOrderId(), token: newToken(), createdAt: new Date().toISOString(), status: 'aguardando_pagamento',
    customer: v.data.customer, delivery: v.data.delivery, items: priced.items,
    subtotalCents: priced.subtotalCents, shippingCents, shippingName, totalCents: priced.subtotalCents + shippingCents,
    history: [{ status: 'aguardando_pagamento', label: STATUS.aguardando_pagamento, at: new Date().toISOString() }]
  };
  const pay = await createPayment(env, order, body.payment);
  if (!pay.ok) return json({ error: 'payment_failed', detail: pay.data && (pay.data.message || pay.data.cause) }, 502);
  applyPayment(order, pay.data);
  await saveOrder(env, order);
  ctx.waitUntil(notify(env, order, order.status === 'pago' ? 'pago' : 'recebido'));
  return json({ id: order.id, token: order.token, status: order.status });
}

async function getOrder(request, env, id) {
  const url = new URL(request.url);
  const order = await loadOrder(env, id);
  if (!order || !url.searchParams.get('t') || url.searchParams.get('t') !== order.token) return json({ error: 'not_found' }, 404);
  return json(publicOrder(order));
}

async function webhookMp(request, env, ctx) {
  const url = new URL(request.url);
  let payload = {};
  try { payload = await request.json(); } catch (e) { /* alguns avisos vêm sem corpo */ }
  const dataId = (payload.data && payload.data.id) || url.searchParams.get('data.id') || url.searchParams.get('id');
  const type = payload.type || url.searchParams.get('type') || url.searchParams.get('topic');
  if (!dataId || (type && type !== 'payment')) return json({ ok: true });
  if (env.MP_WEBHOOK_SECRET && !(await verifyMpSignature(env.MP_WEBHOOK_SECRET, request.headers, dataId))) return json({ error: 'bad_signature' }, 401);
  const res = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(dataId), { headers: { authorization: 'Bearer ' + env.MP_ACCESS_TOKEN } });
  if (!res.ok) return json({ error: 'payment_lookup_failed' }, 502); // o Mercado Pago tenta de novo
  const payment = await res.json();
  const order = await loadOrder(env, String(payment.external_reference || ''));
  if (!order) return json({ ok: true });
  const before = order.status;
  applyPayment(order, payment);
  await saveOrder(env, order);
  if (before !== 'pago' && order.status === 'pago') ctx.waitUntil(notify(env, order, 'pago'));
  return json({ ok: true });
}

function isAdmin(request, env) {
  const h = request.headers.get('authorization') || '';
  return !!env.ADMIN_TOKEN && h === 'Bearer ' + env.ADMIN_TOKEN;
}
async function adminList(env) {
  const list = await env.ORDERS.list({ prefix: 'order:', limit: 200 });
  const orders = (await Promise.all(list.keys.map((k) => env.ORDERS.get(k.name)))).filter(Boolean).map((r) => JSON.parse(r));
  orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json(orders.map((o) => ({ ...publicOrder(o), customer: o.customer, deliveryFull: o.delivery, paymentMethod: o.paymentMethod || null })));
}
async function adminUpdate(request, env, ctx, id) {
  const order = await loadOrder(env, id);
  if (!order) return json({ error: 'not_found' }, 404);
  let body; try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
  if (body.tracking) order.tracking = { code: cleanText(body.tracking.code, 40), carrier: cleanText(body.tracking.carrier || 'Correios', 30) };
  if (body.status) {
    if (!ADMIN_STATUS.includes(body.status)) return json({ error: 'bad_status' }, 400);
    if (order.status === 'aguardando_pagamento' || order.status === 'recusado') return json({ error: 'not_paid' }, 409);
    if (body.status === 'enviado' && !(order.tracking && order.tracking.code)) return json({ error: 'tracking_required' }, 409);
    pushHistory(order, body.status);
    await saveOrder(env, order);
    if (body.status === 'enviado' || body.status === 'pronto_retirada') ctx.waitUntil(notify(env, order, body.status));
  } else {
    await saveOrder(env, order);
  }
  return json(publicOrder(order));
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    let res;
    try {
      if (path === '/shipping' && request.method === 'GET') {
        const priced = priceItems(JSON.parse(url.searchParams.get('cart') || '[]'), catalog);
        res = priced.error ? json({ error: priced.error, id: priced.id }, 409) : json(await quoteShipping(env, url.searchParams.get('cep'), priced.items));
      } else if (path === '/orders' && request.method === 'POST') res = await postOrder(request, env, ctx);
      else if (/^\/orders\/[A-Z0-9-]+$/.test(path) && request.method === 'GET') res = await getOrder(request, env, path.split('/')[2]);
      else if (path === '/webhooks/mercadopago' && request.method === 'POST') res = await webhookMp(request, env, ctx);
      else if (path === '/admin/orders' && request.method === 'GET') res = isAdmin(request, env) ? await adminList(env) : json({ error: 'unauthorized' }, 401);
      else if (/^\/admin\/orders\/[A-Z0-9-]+$/.test(path) && request.method === 'POST') res = isAdmin(request, env) ? await adminUpdate(request, env, ctx, path.split('/')[3]) : json({ error: 'unauthorized' }, 401);
      else if (path === '/health') res = json({ ok: true });
      else res = json({ error: 'not_found' }, 404);
    } catch (e) {
      res = json({ error: 'server_error' }, 500);
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }
};
