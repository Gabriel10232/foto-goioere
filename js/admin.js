(function () {
  'use strict';
  var CFG = window.FG_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var token = '';
  try { token = sessionStorage.getItem('fg_admin') || ''; } catch (e) {}

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function api(path, opts) {
    opts = opts || {}; opts.headers = Object.assign({ authorization: 'Bearer ' + token, 'content-type': 'application/json' }, opts.headers || {});
    return fetch(CFG.apiBase + path, opts).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); });
  }
  function say(m) { $('msg').textContent = m || ''; }

  function card(o) {
    var d = o.deliveryFull || {}, c = o.customer || {};
    var addr = d.mode === 'entrega' ? esc(d.street + ', ' + d.number + (d.complement ? ' ' + d.complement : '') + ', ' + d.district + ', ' + d.city + '/' + d.state + ', CEP ' + d.cep) : 'Retirada na loja';
    var paid = ['pago', 'separando', 'enviado', 'pronto_retirada', 'entregue'].indexOf(o.status) > -1;
    var acts = '';
    if (paid) {
      acts += '<button data-act="separando" data-id="' + esc(o.id) + '">Em separação</button>';
      if (d.mode === 'entrega') acts += '<input placeholder="Código de rastreio" data-code="' + esc(o.id) + '" value="' + esc(o.tracking && o.tracking.code) + '" aria-label="Código de rastreio" /><button data-act="enviado" data-id="' + esc(o.id) + '">Marcar enviado</button>';
      else acts += '<button data-act="pronto_retirada" data-id="' + esc(o.id) + '">Pronto para retirar</button>';
      acts += '<button data-act="entregue" data-id="' + esc(o.id) + '">Entregue</button>';
    }
    return '<article class="adm-order"><header><b class="id">' + esc(o.id) + '</b><span><b>' + esc(o.statusLabel) + '</b>, ' + brl(o.totalCents) + '</span></header>' +
      '<div>' + esc(c.name) + ', ' + esc(c.phone) + ', ' + esc(c.email) + '<br>' + addr + '</div>' +
      '<div>' + o.items.map(function (i) { return i.qty + 'x ' + esc(i.name); }).join('<br>') + '</div>' +
      '<div class="adm-actions">' + acts + '</div></article>';
  }
  function load() {
    if (!CFG.apiBase) { say('O checkout ainda não está ligado: preencha apiBase em js/config.js.'); return; }
    if (!token) { say('Digite a senha do painel.'); return; }
    say('Carregando…');
    api('/admin/orders').then(function (list) {
      say(list.length ? list.length + ' pedidos' : 'Nenhum pedido ainda.');
      $('list').innerHTML = list.map(card).join('');
    }).catch(function () { say('Senha incorreta ou servidor fora do ar.'); $('list').innerHTML = ''; });
  }
  $('login').addEventListener('submit', function (e) { e.preventDefault(); token = $('tok').value.trim(); try { sessionStorage.setItem('fg_admin', token); } catch (x) {} load(); });
  $('list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var id = b.dataset.id, body = { status: b.dataset.act };
    var inp = document.querySelector('[data-code="' + id + '"]');
    if (inp && inp.value.trim()) body.tracking = { code: inp.value.trim(), carrier: 'Correios' };
    b.disabled = true;
    api('/admin/orders/' + id, { method: 'POST', body: JSON.stringify(body) }).then(load).catch(function (err) {
      b.disabled = false; say(err && err.error === 'tracking_required' ? 'Informe o código de rastreio antes de marcar como enviado.' : 'Não foi possível atualizar o pedido.');
    });
  });
  load();
})();
