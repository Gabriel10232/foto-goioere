(function () {
  'use strict';
  var PRODUCTS = window.PRODUCTS, CATEGORIES = window.CATEGORIES, STORE = window.STORE;
  var PAGE = 24;
  var CART_KEY = 'fg_cart_v2';
  var state = { list: [], query: '', category: null, onlyStock: false, sort: 'rel', shown: PAGE, cart: [], lastFocus: null };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- analytics (espaço preparado; troque pelo GA4/Nuvemshop) ---------- */
  window.dataLayer = window.dataLayer || [];
  function track(name, params) { window.dataLayer.push(Object.assign({ event: name }, params || {})); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function money(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  var index = {};
  PRODUCTS.forEach(function (p) { index[p.id] = p; p._hay = norm([p.name, p.brand, catName(p.category), catKeywords(p.category), p.oldCategory].join(' ')); });
  function byId(id) { return index[id]; }
  function cat(id) { return CATEGORIES.filter(function (c) { return c.id === id; })[0] || {}; }
  function catName(id) { return cat(id).name || ''; }
  function catKeywords(id) { return cat(id).keywords || ''; }
  function img(p, i) { return p.images && p.images[i || 0]; }
  function imgTag(p, alt, lazy, thumb) {
    var src = thumb && p.id ? 'img/thumbs/' + p.id + '.webp' : img(p);
    return src ? '<img src="' + esc(src) + '" alt="' + esc(alt) + '"' + (lazy ? ' loading="lazy"' : '') + ' decoding="async" width="320" height="320" />' : '';
  }

  /* ---------- cart persistence (apenas ids e quantidades) ---------- */
  function loadCart() {
    try {
      var raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      state.cart = raw.filter(function (i) { return byId(i.id) && i.qty > 0; });
    } catch (e) { state.cart = []; }
  }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch (e) {} }

  /* ---------- categorias ---------- */
  function counts() {
    var c = {}; PRODUCTS.forEach(function (p) { c[p.category] = (c[p.category] || 0) + 1; }); return c;
  }
  function firstPhoto(catId) {
    return PRODUCTS.filter(function (p) { return p.category === catId && p.stock === 'in' && p.images.length; })[0];
  }
  function renderCats() {
    var n = counts();
    $('catTiles').innerHTML = CATEGORIES.map(function (c) {
      var p = firstPhoto(c.id);
      return '<button class="tile" type="button" data-cat="' + c.id + '"><span class="t-photo">' + (p ? imgTag(p, '', true, true) : '') + '</span>' +
        '<span class="t-name">' + esc(c.name) + '</span><span class="t-count">' + (n[c.id] || 0) + ' produtos</span></button>';
    }).join('');
    $('topNav').innerHTML = '<a href="#catalogo" data-cat="">Todos</a>' + CATEGORIES.map(function (c) {
      return '<a href="#catalogo" data-cat="' + c.id + '">' + esc(c.name) + '</a>';
    }).join('') + '<a href="#loja">A loja</a><a href="#contato">Contato</a>';
    // hero: três fotos reais de produtos em estoque
    var picks = ['violoes', 'teclados', 'microfones'].map(firstPhoto).filter(Boolean);
    $('heroPhotos').innerHTML = picks.map(function (p) { return '<figure>' + imgTag(p, '') + '</figure>'; }).join('');
  }
  function renderSide() {
    var n = counts();
    $('sideCats').innerHTML = '<li><button type="button" data-cat="" aria-pressed="' + (!state.category) + '">Todos <small>' + PRODUCTS.length + '</small></button></li>' +
      CATEGORIES.map(function (c) {
        return '<li><button type="button" data-cat="' + c.id + '" aria-pressed="' + (state.category === c.id) + '">' + esc(c.name) + ' <small>' + (n[c.id] || 0) + '</small></button></li>';
      }).join('');
  }

  /* ---------- listagem ---------- */
  function matches(p) {
    if (state.category && p.category !== state.category) return false;
    if (state.onlyStock && p.stock !== 'in') return false;
    if (!state.query) return true;
    return norm(state.query).split(/\s+/).every(function (t) { return p._hay.indexOf(t) !== -1; });
  }
  function sorted(list) {
    var l = list.slice();
    if (state.sort === 'az') l.sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
    else if (state.sort === 'price') l.sort(function (a, b) { return (b.price != null) - (a.price != null); });
    else l.sort(function (a, b) { return (b.stock === 'in') - (a.stock === 'in'); });
    return l;
  }
  function priceHtml(p) {
    if (p.price == null) return '<div class="price ask">Consulte o valor</div>';
    return '<div class="price">' + money(p.price) + '</div>' + (p.priceEstimated ? '<div class="ref">valor de referência</div>' : '');
  }
  function availHtml(p) { return p.stock === 'in' ? '<div class="avail">Em estoque</div>' : '<div class="avail out">Sem estoque no momento</div>'; }

  function render() {
    var list = sorted(PRODUCTS.filter(matches));
    var parts = [];
    if (state.category) parts.push(catName(state.category));
    if (state.query) parts.push('“' + state.query + '”');
    $('resultLine').textContent = list.length + (list.length === 1 ? ' produto' : ' produtos') + (parts.length ? ': ' + parts.join(', ') : '');
    renderSide();

    if (!list.length) {
      $('grid').innerHTML = '<div class="empty-state"><h3>Nada por aqui</h3>' +
        '<p>Não encontramos o que você buscou. Tente outra palavra, veja uma categoria ou pergunte para a equipe no WhatsApp.</p>' +
        '<div class="chips">' + CATEGORIES.slice(0, 6).map(function (c) { return '<button class="chip" type="button" data-cat="' + c.id + '" data-clear="1">' + esc(c.name) + '</button>'; }).join('') + '</div></div>';
      $('moreBtn').parentNode.hidden = true;
      return;
    }
    state.list = list;
    $('grid').innerHTML = list.slice(0, state.shown).map(cardHtml).join('');
    updateMore();
  }
  function cardHtml(p) {
    var out = p.stock === 'out';
    return '<article class="card">' + (out ? '<span class="flag">Sem estoque</span>' : '') +
      '<button class="ph" type="button" data-open="' + p.id + '" aria-label="Ver detalhes: ' + esc(p.name) + '">' + imgTag(p, '', true, true) + '</button>' +
      '<div class="body"><div class="brandline">' + esc(p.brand) + '</div>' +
      '<h3 class="name"><button type="button" data-open="' + p.id + '">' + esc(p.name) + '</button></h3>' +
      priceHtml(p) + availHtml(p) +
      (out ? '<button class="buy alt" type="button" data-notify="' + p.id + '">Avisar quando chegar</button>'
        : '<button class="buy" type="button" data-add="' + p.id + '">Adicionar ao carrinho</button>') +
      '</div></article>';
  }
  function updateMore() {
    var left = state.list.length - state.shown;
    $('moreBtn').parentNode.hidden = left <= 0;
    $('moreBtn').textContent = 'Mostrar mais (' + left + ' restantes)';
  }
  function showMore() {
    var from = state.shown; state.shown += PAGE;
    $('grid').insertAdjacentHTML('beforeend', state.list.slice(from, state.shown).map(cardHtml).join(''));
    updateMore();
  }

  /* ---------- detalhe ---------- */
  function openDetail(id) {
    var p = byId(id); if (!p) return;
    var specs = Object.keys(p.specs || {}).map(function (k) { return '<tr><th scope="row">' + esc(k) + '</th><td>' + esc(p.specs[k]) + '</td></tr>'; }).join('');
    var msg = encodeURIComponent('Olá! Tenho uma dúvida sobre: ' + p.name);
    var thumbs = p.images.length > 1 ? '<div class="thumbs">' + p.images.map(function (src, i) {
      return '<button type="button" data-thumb="' + i + '" aria-label="Foto ' + (i + 1) + '"' + (i === 0 ? ' aria-current="true"' : '') + '><img src="' + esc(src) + '" alt="" width="62" height="62" loading="lazy" /></button>';
    }).join('') + '</div>' : '';
    $('detail').innerHTML =
      '<div><div class="gal-main" id="galMain">' + imgTag(p, p.name) + '</div>' + thumbs + '</div>' +
      '<div><div class="brandline">' + esc(p.brand) + (p.brand ? ', ' : '') + esc(catName(p.category)) + '</div><h2 id="dName">' + esc(p.name) + '</h2>' +
      priceHtml(p) + availHtml(p) +
      (p.description.length ? '<h3>Descrição</h3><div class="desc">' + p.description.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</div>' : '') +
      (specs ? '<h3>Especificações</h3><table class="specs"><tbody>' + specs + '</tbody></table>' : '') +
      '<h3>Entrega e retirada</h3><ul class="ship"><li>Entrega: frete calculado pelo CEP no checkout.</li><li>Retirada na loja: Av. Francisco Scarpari, 345, Goioerê.</li></ul>' +
      '<div class="actions">' +
      (p.stock === 'out' ? '<button class="buy alt" type="button" data-notify="' + p.id + '">Avisar quando chegar</button>'
        : '<button class="buy" type="button" data-add="' + p.id + '">Adicionar ao carrinho</button>') +
      '<a class="buy alt" target="_blank" rel="noopener" data-event="whatsapp_click" data-where="produto" href="' + STORE.whatsappHref + '?text=' + msg + '">Tirar dúvida no WhatsApp</a>' +
      '</div></div>';
    openLayer('modal', 'closeModal');
    track('view_item', { item_id: p.id });
  }

  /* ---------- layers ---------- */
  function openLayer(id, closeId) {
    state.lastFocus = document.activeElement;
    var el = $(id); el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $(closeId).focus();
  }
  function closeLayer(id) {
    var el = $(id); el.classList.remove('open'); el.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.drawer.open,.modal.open')) document.body.style.overflow = '';
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  /* ---------- carrinho ---------- */
  function addToCart(id) {
    var it = state.cart.filter(function (i) { return i.id === id; })[0];
    if (it) it.qty++; else state.cart.push({ id: id, qty: 1 });
    saveCart(); renderCart(); track('add_to_cart', { item_id: id });
    bump(); toast('Adicionado: ' + byId(id).name);
  }
  function bump() {
    var c = $('count'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  }
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.querySelector('span').textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function flashButton(btn) {
    if (!btn || btn.dataset.flash) return;
    var old = btn.textContent; btn.dataset.flash = '1'; btn.textContent = 'Adicionado ✓'; btn.classList.add('done');
    setTimeout(function () { btn.textContent = old; btn.classList.remove('done'); delete btn.dataset.flash; }, 1200);
  }
  function setQty(id, d) {
    var it = state.cart.filter(function (i) { return i.id === id; })[0]; if (!it) return;
    it.qty += d;
    if (it.qty <= 0) state.cart = state.cart.filter(function (i) { return i.id !== id; });
    saveCart(); renderCart();
  }
  function removeItem(id) { state.cart = state.cart.filter(function (i) { return i.id !== id; }); saveCart(); renderCart(); }

  function renderCart() {
    var n = state.cart.reduce(function (s, i) { return s + i.qty; }, 0);
    $('count').textContent = n;
    var box = $('cartItems'), foot = $('cartFoot');
    if (!state.cart.length) {
      box.className = 'empty'; box.innerHTML = 'Seu carrinho está vazio.<br>Escolha um produto para começar.'; foot.hidden = true; return;
    }
    box.className = ''; foot.hidden = false;
    box.innerHTML = state.cart.map(function (i) {
      var p = byId(i.id);
      return '<div class="cartrow"><div class="thumb">' + imgTag(p, '', true) + '</div><div><b>' + esc(p.name) + '</b>' +
        '<small>' + (p.price == null ? 'Consulte o valor' : money(p.price) + ' cada' + (p.priceEstimated ? ' (referência)' : '')) + '</small><br>' +
        '<span class="qty"><button type="button" data-dec="' + p.id + '" aria-label="Diminuir quantidade de ' + esc(p.name) + '">−</button>' +
        '<output aria-live="polite">' + i.qty + '</output>' +
        '<button type="button" data-inc="' + p.id + '" aria-label="Aumentar quantidade de ' + esc(p.name) + '">+</button></span>' +
        '<button class="rm" type="button" data-rm="' + p.id + '">Remover</button></div></div>';
    }).join('');
    var unknown = state.cart.some(function (i) { return byId(i.id).price == null; });
    var estimated = state.cart.some(function (i) { return byId(i.id).priceEstimated; });
    var sum = state.cart.reduce(function (s, i) { var p = byId(i.id); return p.price == null ? s : s + p.price * i.qty; }, 0);
    if (unknown) {
      $('total').textContent = 'A confirmar';
      $('totalNote').textContent = 'Há itens sem valor publicado. A loja confirma o total com você.';
    } else {
      $('total').textContent = (estimated ? '~ ' : '') + money(sum);
      $('totalNote').textContent = (estimated ? 'Valores de referência: a loja confirma o preço final. ' : '') + 'Frete não incluso.';
    }
    var lines = state.cart.map(function (i) { return i.qty + 'x ' + byId(i.id).name; }).join('\n');
    $('quoteLink').href = STORE.whatsappHref + '?text=' + encodeURIComponent('Olá! Quero confirmar valores e disponibilidade destes itens:\n' + lines);
  }

  /* ---------- eventos ---------- */
  function setFilter(c, clear) {
    state.category = c || null; state.shown = PAGE;
    if (clear) { state.query = ''; $('search').value = ''; }
    render();
  }
  function wire() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-add],[data-open],[data-dec],[data-inc],[data-rm],[data-cat],[data-notify],[data-event],[data-thumb]');
      if (!t) return;
      var d = t.dataset;
      if (d.add) { addToCart(d.add); flashButton(t); }
      else if (d.open) openDetail(d.open);
      else if (d.dec) setQty(d.dec, -1);
      else if (d.inc) setQty(d.inc, 1);
      else if (d.rm) removeItem(d.rm);
      else if (d.thumb !== undefined) {
        var name = $('dName').textContent, p = PRODUCTS.filter(function (x) { return x.name === name; })[0];
        $('galMain').innerHTML = imgTag({ images: [p.images[+d.thumb]] }, name);
        document.querySelectorAll('.thumbs button').forEach(function (b) { b.removeAttribute('aria-current'); });
        t.setAttribute('aria-current', 'true');
      }
      else if (d.notify) {
        track('restock_notify_click', { item_id: d.notify });
        window.open(STORE.whatsappHref + '?text=' + encodeURIComponent('Olá! Quero ser avisado quando chegar: ' + byId(d.notify).name), '_blank', 'noopener');
      }
      else if (d.cat !== undefined) {
        e.preventDefault(); setFilter(d.cat, !!d.clear || true);
        $('catalogo').scrollIntoView();
      }
      if (d.event === 'whatsapp_click') track('whatsapp_click', { where: d.where });
    });
    $('moreBtn').onclick = showMore;
    $('onlyStock').onchange = function (e) { state.onlyStock = e.target.checked; state.shown = PAGE; render(); };
    $('sort').onchange = function (e) { state.sort = e.target.value; state.shown = PAGE; render(); };
    $('searchForm').addEventListener('submit', function (e) { e.preventDefault(); $('catalogo').scrollIntoView(); });
    var timer;
    $('search').addEventListener('input', function (e) {
      state.query = e.target.value.trim(); state.shown = PAGE;
      clearTimeout(timer); timer = setTimeout(function () { render(); if (state.query) track('search', { search_term: state.query }); }, 140);
    });
    $('openCart').onclick = function () { openLayer('drawer', 'closeCart'); };
    $('toastOpen').onclick = function () { $('toast').classList.remove('show'); openLayer('drawer', 'closeCart'); };
    $('closeCart').onclick = function () { closeLayer('drawer'); };
    $('closeModal').onclick = function () { closeLayer('modal'); };
    $('drawer').onclick = function (e) { if (e.target.id === 'drawer') closeLayer('drawer'); };
    $('modal').onclick = function (e) { if (e.target.id === 'modal') closeLayer('modal'); };
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('modal').classList.contains('open')) closeLayer('modal');
      else if ($('drawer').classList.contains('open')) closeLayer('drawer');
    });
    document.querySelectorAll('input[name=mode]').forEach(function (r) {
      r.addEventListener('change', function () { $('cepBox').hidden = document.querySelector('input[name=mode]:checked').value === 'retirada'; });
    });
    $('cep').addEventListener('input', function (e) {
      var v = e.target.value.replace(/\D/g, '').slice(0, 8);
      e.target.value = v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5) : v;
    });
    $('checkout').onclick = function () {
      track('begin_checkout', { items: state.cart.length });
      alert('Protótipo: o checkout real será conectado à Nuvemshop. Nenhum pagamento é feito aqui.');
    };
  }

  function openStatus() {
    var now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    var day = now.getDay(), min = now.getHours() * 60 + now.getMinutes();
    var close = { 2: 18, 3: 18, 4: 18, 5: 18, 6: 12 }, open = 8 * 60;
    var el = $('openNow');
    if (close[day] !== undefined && min >= open && min < close[day] * 60) {
      el.className = 'status'; el.innerHTML = '<b>Aberta agora</b>, fecha às ' + close[day] + 'h.';
    } else {
      var next = { 0: 'terça às 8h', 1: 'terça às 8h', 2: 'quarta às 8h', 3: 'quinta às 8h', 4: 'sexta às 8h', 5: 'sábado às 8h', 6: 'terça às 8h' };
      var today = close[day] !== undefined && min < open;
      el.className = 'status closed'; el.innerHTML = '<b>Fechada agora</b>, abre ' + (today ? 'hoje às 8h' : next[day]) + '.';
    }
  }
  $('hours').innerHTML = STORE.hours.map(function (h) { return esc(h[0]) + ': ' + esc(h[1]); }).join('<br>');
  openStatus(); loadCart(); renderCats(); wire(); render(); renderCart();
})();
