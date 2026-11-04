(function () {
  'use strict';
  var CFG = window.FG_CONFIG || {};
  var LIVE = !!(CFG.apiBase && CFG.mpPublicKey);
  var PRODUCTS = window.PRODUCTS || [];
  var $ = function (id) { return document.getElementById(id); };
  var byId = {}; PRODUCTS.forEach(function (p) { byId[p.id] = p; });

  var state = { cart: [], customer: null, delivery: { mode: 'retirada' }, shipping: null, step: 1, brick: null, brickAmount: 0, sending: false };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  /* ---------- validações (as mesmas regras do servidor) ---------- */
  function validCPF(v) {
    var c = digits(v); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i); if (((s * 10) % 11) % 10 !== Number(c[t])) return false; }
    return true;
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()); }
  function validPhone(v) { var d = digits(v); return d.length === 10 || d.length === 11; }

  /* ---------- máscaras ---------- */
  function maskCPF(v) { var d = digits(v).slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }
  function maskPhone(v) { var d = digits(v).slice(0, 11); if (d.length <= 2) return d ? '(' + d : ''; if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2); if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6); return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7); }
  function maskCEP(v) { var d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }

  /* ---------- carrinho ---------- */
  function loadCart() {
    try { state.cart = (JSON.parse(localStorage.getItem('fg_cart_v2') || '[]') || []).filter(function (i) { return byId[i.id] && i.qty > 0; }); } catch (e) { state.cart = []; }
  }
  function lines() { return state.cart.map(function (i) { return { p: byId[i.id], qty: i.qty }; }); }
  function problems() {
    return lines().filter(function (l) { return l.p.price == null || l.p.priceEstimated || l.p.stock !== 'in'; });
  }
  function subtotal() { return lines().reduce(function (s, l) { return s + (l.p.price || 0) * l.qty; }, 0); }
  function shippingValue() { return state.delivery.mode === 'entrega' && state.shipping ? state.shipping.priceCents / 100 : 0; }
  function total() { return subtotal() + shippingValue(); }

  function renderSummary() {
    $('sumItems').innerHTML = lines().map(function (l) {
      return '<li><span class="th"><img src="img/thumbs/' + l.p.id + '.webp" alt="" width="56" height="56" /><span class="q">' + l.qty + '</span></span>' +
        '<span class="nm">' + esc(l.p.name) + '</span><span class="pr">' + (l.p.price == null ? 'A confirmar' : brl(l.p.price * l.qty)) + '</span></li>';
    }).join('');
    $('tSub').textContent = brl(subtotal());
    var ship = $('tShip');
    if (state.delivery.mode === 'retirada') ship.textContent = 'Grátis (retirada)';
    else if (state.shipping) ship.textContent = brl(shippingValue());
    else ship.textContent = 'A escolher';
    $('tTotal').textContent = brl(total());
  }

  /* ---------- etapas ---------- */
  function setStep(n, quiet) {
    state.step = n;
    [1, 2, 3].forEach(function (i) {
      var card = $('step' + i), open = i === n, done = i < n;
      if (open || done) card.removeAttribute('data-locked'); else card.setAttribute('data-locked', '');
      $('form' + i) && ($('form' + i).hidden = !open);
      if (i === 3) $('payBox').hidden = !open;
      var sum = $('sum' + i); if (sum) sum.hidden = !done;
      var ed = card.querySelector('.ck-edit'); if (ed) ed.hidden = !done;
    });
    document.querySelectorAll('.ck-progress li').forEach(function (li) {
      var p = Number(li.dataset.p); li.className = p === n ? 'on' : p < n ? 'done' : '';
    });
    var head = $('step' + n); if (head && !quiet) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function showErrors(form, errs) {
    form.querySelectorAll('.err').forEach(function (e) { e.textContent = ''; });
    form.querySelectorAll('input').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    var first = null;
    Object.keys(errs).forEach(function (k) {
      var e = form.querySelector('[data-err="' + k + '"]'); if (e) e.textContent = errs[k];
      var inp = form.querySelector('[name="' + k + '"]'); if (inp) { inp.setAttribute('aria-invalid', 'true'); if (!first) first = inp; }
    });
    if (first) first.focus();
    return !first;
  }

  /* ---------- etapa 1 ---------- */
  function step1() {
    var f = $('form1'), errs = {};
    var d = { name: f.elements['name'].value.trim().replace(/\s+/g, ' '), email: f.email.value.trim().toLowerCase(), phone: digits(f.phone.value), cpf: digits(f.cpf.value) };
    if (d.name.split(' ').filter(Boolean).length < 2) errs.name = 'Informe nome e sobrenome.';
    if (!validEmail(d.email)) errs.email = 'E-mail inválido.';
    if (!validPhone(d.phone)) errs.phone = 'Telefone inválido. Use DDD e número.';
    if (!validCPF(d.cpf)) errs.cpf = 'CPF inválido.';
    if (!showErrors(f, errs)) return;
    state.customer = d;
    $('sum1').innerHTML = esc(d.name) + '<br>' + esc(d.email) + ' · ' + esc(maskPhone(d.phone));
    setStep(2);
  }

  /* ---------- etapa 2 ---------- */
  function onModeChange() {
    var mode = $('form2').mode.value;
    state.delivery.mode = mode; state.shipping = null;
    $('addrBox').hidden = mode !== 'entrega';
    renderSummary();
  }
  function lookupCEP() {
    var f = $('form2'), cep = digits(f.cep.value);
    if (cep.length !== 8) return;
    $('shipBox').innerHTML = '<p>Buscando endereço…</p>';
    fetch('https://viacep.com.br/ws/' + cep + '/json/').then(function (r) { return r.json(); }).then(function (a) {
      if (a.erro) { $('shipBox').innerHTML = '<p>CEP não encontrado. Confira o número ou preencha o endereço.</p>'; return; }
      f.street.value = a.logradouro || f.street.value; f.district.value = a.bairro || f.district.value;
      f.city.value = a.localidade || ''; f.state.value = a.uf || '';
      f.number.focus(); quote(cep);
    }).catch(function () { $('shipBox').innerHTML = '<p>Não consegui buscar o endereço agora. Preencha à mão.</p>'; quote(cep); });
  }
  function quote(cep) {
    state.shipping = null; renderSummary();
    var box = $('shipBox');
    if (!LIVE) { box.innerHTML = '<p>Na loja online, aqui aparecem as opções de frete (Correios e transportadoras) com preço e prazo.</p>'; state.shipping = { id: 'demo', name: 'Demonstração', priceCents: 0 }; return; }
    box.innerHTML = '<p>Calculando frete…</p>';
    var cart = encodeURIComponent(JSON.stringify(state.cart.map(function (i) { return { id: i.id, qty: i.qty }; })));
    fetch(CFG.apiBase + '/shipping?cep=' + cep + '&cart=' + cart).then(function (r) { return r.json(); }).then(function (q) {
      if (!q.available) { box.innerHTML = '<p>Entrega indisponível para este CEP agora. Escolha “Retirar na loja” ou fale com a gente pelo WhatsApp.</p>'; return; }
      box.innerHTML = q.options.map(function (o, i) {
        return '<label class="opt"><input type="radio" name="ship" value="' + esc(o.id) + '"' + (i === 0 ? ' checked' : '') + ' /><span><b>' + esc(o.name) + '</b><small>' + (o.days ? 'Chega em até ' + o.days + ' dias úteis' : 'Prazo informado no envio') + '</small></span><em>' + brl(o.priceCents / 100) + '</em></label>';
      }).join('');
      var pick = function (id) { var o = q.options.filter(function (x) { return x.id === id; })[0]; state.shipping = o || null; renderSummary(); };
      pick(q.options[0].id);
      box.querySelectorAll('input[name=ship]').forEach(function (r) { r.onchange = function () { pick(r.value); }; });
    }).catch(function () { box.innerHTML = '<p>Não consegui calcular o frete agora. Tente de novo em instantes.</p>'; });
  }
  function step2() {
    var f = $('form2'), mode = f.mode.value, errs = {};
    var d = { mode: mode };
    if (mode === 'entrega') {
      d.cep = digits(f.cep.value); d.street = f.street.value.trim(); d.number = f.number.value.trim(); d.complement = f.complement.value.trim();
      d.district = f.district.value.trim(); d.city = f.city.value.trim(); d.state = f.state.value.trim().toUpperCase();
      if (d.cep.length !== 8) errs.cep = 'CEP inválido.';
      if (!d.street) errs.street = 'Informe a rua.';
      if (!d.number) errs.number = 'Informe o número.';
      if (!d.city || !/^[A-Z]{2}$/.test(d.state)) errs.city = 'Informe cidade e UF.';
      if (!state.shipping) errs.cep = errs.cep || 'Escolha uma forma de envio.';
    }
    if (!showErrors(f, errs)) return;
    if (mode === 'entrega') d.optionId = state.shipping.id;
    state.delivery = d;
    $('sum2').innerHTML = mode === 'retirada'
      ? 'Retirar na loja: Av. Francisco Scarpari, 345, Goioerê'
      : esc(d.street + ', ' + d.number + (d.complement ? ' ' + d.complement : '') + ', ' + d.district) + '<br>' + esc(d.city + '/' + d.state + ' · CEP ' + maskCEP(d.cep)) + '<br>' + esc(state.shipping.name) + ': ' + brl(state.shipping.priceCents / 100);
    renderSummary();
    setStep(3); preparePayment();
  }

  /* ---------- etapa 3 ---------- */
  function say(msg, bad) { var m = $('payMsg'); m.textContent = msg || ''; m.className = 'ck-note' + (bad ? ' bad' : ''); }
  function preparePayment() {
    say('');
    var bad = problems();
    if (LIVE && bad.length) { $('brickBox').innerHTML = ''; $('demoPay').hidden = true; say('Há itens com valor ainda não confirmado. Peça a confirmação pelo WhatsApp antes de pagar.', true); return; }
    if (!LIVE) { $('brickBox').innerHTML = ''; $('demoPay').hidden = false; return; }
    $('demoPay').hidden = true;
    var amount = Math.round(total() * 100) / 100;
    if (state.brick && state.brickAmount === amount) return;
    if (state.brick) { try { state.brick.unmount(); } catch (e) {} state.brick = null; }
    $('brickBox').innerHTML = '<p class="ck-note">Carregando formas de pagamento…</p>';
    loadMP().then(function () {
      var mp = new window.MercadoPago(CFG.mpPublicKey, { locale: 'pt-BR' });
      return mp.bricks().create('payment', 'brickBox', {
        initialization: { amount: amount, payer: { email: state.customer.email } },
        customization: { paymentMethods: { creditCard: 'all', bankTransfer: 'all', maxInstallments: 6 } },
        callbacks: {
          onReady: function () { state.brickAmount = amount; },
          onSubmit: function (p) { return sendOrder(p.formData); },
          onError: function () { say('Algo deu errado ao carregar o pagamento. Atualize a página e tente de novo.', true); }
        }
      });
    }).then(function (b) { state.brick = b; }).catch(function () { say('Não consegui carregar o pagamento. Verifique sua conexão e tente de novo.', true); });
  }
  function loadMP() {
    if (window.MercadoPago) return Promise.resolve();
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'https://sdk.mercadopago.com/js/v2'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  var ERRORS = {
    price_unconfirmed: 'Um dos itens ainda não tem valor confirmado para venda online. Fale com a loja pelo WhatsApp.',
    out_of_stock: 'Um dos itens ficou sem estoque. Volte à loja e revise o carrinho.',
    shipping_unavailable: 'Essa forma de envio não está mais disponível. Volte e escolha de novo.',
    payment_failed: 'O pagamento não foi aprovado. Confira os dados do cartão ou tente o Pix.',
    validation: 'Alguns dados estão incorretos. Volte às etapas anteriores e confira.'
  };
  function sendOrder(formData) {
    if (state.sending) return Promise.reject();
    state.sending = true; say('Processando seu pedido…');
    return fetch(CFG.apiBase + '/orders', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer: state.customer, delivery: state.delivery, items: state.cart.map(function (i) { return { id: i.id, qty: i.qty }; }), payment: formData })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (r) {
      state.sending = false;
      if (!r.ok) { say(ERRORS[r.j.error] || 'Não foi possível concluir o pedido. Tente de novo.', true); return Promise.reject(); }
      try { localStorage.removeItem('fg_cart_v2'); } catch (e) {}
      location.href = 'pedido.html?id=' + encodeURIComponent(r.j.id) + '&t=' + encodeURIComponent(r.j.token);
    }).catch(function (e) { state.sending = false; if (e) say('Sem conexão com o servidor. Seu cartão não foi cobrado. Tente de novo.', true); return Promise.reject(); });
  }

  /* ---------- início ---------- */
  function init() {
    loadCart();
    if (!state.cart.length) { $('emptyBox').hidden = false; return; }
    $('ckGrid').hidden = false;
    $('demoBanner').hidden = LIVE;
    var bad = problems();
    if (bad.length) {
      var box = $('blockUnconfirmed');
      var msg = encodeURIComponent('Olá! Quero confirmar o valor e a disponibilidade destes itens:\n' + bad.map(function (l) { return l.qty + 'x ' + l.p.name; }).join('\n'));
      box.hidden = false;
      box.innerHTML = '<b>' + (LIVE ? 'Antes de pagar:' : 'Aviso:') + '</b> estes itens ainda têm valor de referência ou estão sem estoque, então a loja precisa confirmar antes da compra online.<ul>' +
        bad.map(function (l) { return '<li>' + esc(l.p.name) + '</li>'; }).join('') + '</ul><a href="https://wa.me/' + (CFG.whatsapp || '5544999060030') + '?text=' + msg + '" target="_blank" rel="noopener">Confirmar pelo WhatsApp</a>';
    }
    renderSummary();
    setStep(1, true);
    var f1 = $('form1'), f2 = $('form2');
    f1.cpf.addEventListener('input', function () { f1.cpf.value = maskCPF(f1.cpf.value); });
    f1.phone.addEventListener('input', function () { f1.phone.value = maskPhone(f1.phone.value); });
    f2.cep.addEventListener('input', function () { f2.cep.value = maskCEP(f2.cep.value); if (digits(f2.cep.value).length === 8) lookupCEP(); });
    f2.state.addEventListener('input', function () { f2.state.value = f2.state.value.toUpperCase(); });
    f1.addEventListener('submit', function (e) { e.preventDefault(); step1(); });
    f2.addEventListener('submit', function (e) { e.preventDefault(); step2(); });
    f2.querySelectorAll('input[name=mode]').forEach(function (r) { r.addEventListener('change', onModeChange); });
    document.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { setStep(Number(b.dataset.edit)); }); });
    $('demoFinish').addEventListener('click', function () { location.href = 'pedido.html?demo=1'; });
  }
  document.addEventListener('change', function () {
    document.querySelectorAll('.opt').forEach(function (o) { var i = o.querySelector('input'); if (i) o.classList.toggle('on', i.checked); });
  });
  init();
  document.querySelectorAll('.opt').forEach(function (o) { var i = o.querySelector('input'); if (i) o.classList.toggle('on', i.checked); });
})();
