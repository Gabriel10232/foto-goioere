(function () {
  'use strict';
  var CFG = window.FG_CONFIG || {};
  var q = new URLSearchParams(location.search);
  var root = document.getElementById('od');
  var timer = null;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function fmt(iso) { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  var wa = 'https://wa.me/' + (CFG.whatsapp || '5544999060030');

  // Linha do tempo conforme o tipo de entrega
  function steps(o) {
    var pickup = o.delivery.mode === 'retirada';
    return [
      { k: 'pago', t: 'Pagamento confirmado' },
      { k: 'separando', t: 'Em separação' },
      pickup ? { k: 'pronto_retirada', t: 'Pronto para retirar na loja' } : { k: 'enviado', t: 'Enviado' },
      { k: 'entregue', t: pickup ? 'Retirado' : 'Entregue' }
    ];
  }
  function reached(o, key) { return o.history.some(function (h) { return h.status === key; }); }

  function render(o) {
    var bad = o.status === 'recusado' || o.status === 'cancelado';
    var st = steps(o), nowIdx = -1;
    st.forEach(function (s, i) { if (reached(o, s.k)) nowIdx = i; });
    var tl = st.map(function (s, i) {
      var h = o.history.filter(function (x) { return x.status === s.k; })[0];
      var cls = i < nowIdx ? 'done' : i === nowIdx ? 'now' : '';
      return '<li class="' + cls + '">' + esc(s.t) + (h ? '<small>' + fmt(h.at) + '</small>' : '') + '</li>';
    }).join('');
    var html = '<div class="od-card"><p class="od-id">Pedido ' + esc(o.id) + '</p><span class="od-status' + (bad ? ' bad' : '') + '">' + esc(o.statusLabel) + '</span>';
    if (o.status === 'aguardando_pagamento') {
      html += '<p>Assim que o pagamento for confirmado, atualizamos esta página e avisamos por e-mail. Guarde o link desta página.</p>';
    }
    if (!bad && o.status !== 'aguardando_pagamento') html += '<ol class="tl">' + tl + '</ol>';
    if (bad) html += '<p>' + (o.status === 'recusado' ? 'O pagamento não foi aprovado. Nenhum valor foi cobrado. Você pode fazer o pedido de novo na loja.' : 'Este pedido foi cancelado. Se tiver dúvidas, fale com a gente.') + '</p>';
    html += '</div>';

    if (o.pix) {
      html += '<div class="od-card pix"><h2>Pague com Pix</h2><p>Abra o app do seu banco, escolha Pix, e leia o código ou use o copia e cola.</p>' +
        (o.pix.qrBase64 ? '<img src="data:image/png;base64,' + esc(o.pix.qrBase64) + '" alt="QR Code do Pix" width="220" height="220" />' : '') +
        '<textarea readonly id="pixCode" aria-label="Pix copia e cola">' + esc(o.pix.copyPaste) + '</textarea>' +
        '<button class="small-btn" type="button" id="copyPix">Copiar código</button>' +
        (o.pix.expiresAt ? '<p class="ck-note">Vale até ' + fmt(o.pix.expiresAt) + '.</p>' : '') + '</div>';
    }
    if (o.tracking && o.tracking.code) {
      var link = /correios/i.test(o.tracking.carrier || '') ? 'https://rastreamento.correios.com.br/app/index.php?objetos=' + encodeURIComponent(o.tracking.code) : null;
      html += '<div class="od-card"><h2>Rastreio</h2><p>' + esc(o.tracking.carrier || 'Transportadora') + '</p><p class="track-code">' + esc(o.tracking.code) + '</p>' +
        (link ? '<a class="small-btn" href="' + link + '" target="_blank" rel="noopener">Acompanhar nos Correios</a>' : '') + '</div>';
    }
    if (o.status === 'pronto_retirada' || (o.delivery.mode === 'retirada' && o.status !== 'recusado' && o.status !== 'cancelado' && o.status !== 'aguardando_pagamento')) {
      html += '<div class="od-card"><h2>Retirada na loja</h2><p>Av. Francisco Scarpari, 345, Goioerê. Terça a sexta, 8h às 18h. Sábado, 8h às 12h. Leve um documento com foto e o número do pedido.</p></div>';
    }
    html += '<div class="od-card"><h2>Itens</h2><ul class="od-items">' + o.items.map(function (i) { return '<li><span>' + i.qty + 'x ' + esc(i.name) + '</span><b>' + brl(i.totalCents) + '</b></li>'; }).join('') +
      '</ul><ul class="od-items"><li><span>Entrega' + (o.delivery.optionName ? ' (' + esc(o.delivery.optionName) + ')' : '') + '</span><b>' + (o.shippingCents ? brl(o.shippingCents) : 'Grátis') + '</b></li><li><span><b>Total</b></span><b>' + brl(o.totalCents) + '</b></li></ul></div>';
    html += '<p class="od-help">Dúvidas sobre o pedido? <a href="' + wa + '?text=' + encodeURIComponent('Olá! Sobre o pedido ' + o.id) + '" target="_blank" rel="noopener">Fale com a loja no WhatsApp</a></p>';
    root.innerHTML = html;
    var cp = document.getElementById('copyPix');
    if (cp) cp.onclick = function () {
      var t = document.getElementById('pixCode'); t.select();
      (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.resolve(document.execCommand('copy'))).then(function () { cp.textContent = 'Copiado'; setTimeout(function () { cp.textContent = 'Copiar código'; }, 1800); });
    };
  }

  function demo() {
    document.getElementById('demoBanner').hidden = false;
    var now = Date.now(), h = function (s, m) { return { status: s, at: new Date(now - m * 60000).toISOString() }; };
    render({ id: 'FG-EXEMPLO', status: 'enviado', statusLabel: 'Enviado', delivery: { mode: 'entrega', optionName: 'Correios PAC' }, shippingCents: 2890, totalCents: 15790, items: [{ qty: 1, name: 'Produto de exemplo', totalCents: 12900 }],
      tracking: { code: 'AA123456789BR', carrier: 'Correios' }, history: [h('aguardando_pagamento', 180), h('pago', 175), h('separando', 120), h('enviado', 30)] });
  }

  function load() {
    var id = q.get('id'), t = q.get('t');
    if (q.get('demo')) { demo(); return; }
    if (!id || !t || !CFG.apiBase) { root.innerHTML = '<div class="od-card"><h1>Pedido não encontrado</h1><p>Confira o link que enviamos por e-mail.</p><a class="small-btn" href="index.html">Ir para a loja</a></div>'; return; }
    fetch(CFG.apiBase + '/orders/' + encodeURIComponent(id) + '?t=' + encodeURIComponent(t)).then(function (r) { if (!r.ok) throw new Error('nf'); return r.json(); }).then(function (o) {
      render(o);
      clearTimeout(timer);
      if (o.status === 'aguardando_pagamento') timer = setTimeout(load, 8000);
      else if (['pago', 'separando', 'enviado', 'pronto_retirada'].indexOf(o.status) > -1) timer = setTimeout(load, 60000);
    }).catch(function () { root.innerHTML = '<div class="od-card"><h1>Pedido não encontrado</h1><p>Confira o link que enviamos por e-mail ou fale com a loja.</p><a class="small-btn" href="' + wa + '" target="_blank" rel="noopener">WhatsApp da loja</a></div>'; });
  }
  load();
})();
