(function () {
  'use strict';
  var PRODUCTS = window.PRODUCTS, CATEGORIES = window.CATEGORIES, STORE = window.STORE;
  var PAGE = 24;
  var CART_KEY = 'fg_cart_v2', RECENT_KEY = 'fg_recent_v1';
  var state = { list: [], query: '', category: null, onlyStock: false, sort: 'rel', shown: PAGE, cart: [], recent: [], lastFocus: null };
  var $ = function (id) { return document.getElementById(id); };
  document.documentElement.classList.add('js');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || '[]'); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return []; } }

  /* ---------- carrinho: persistência ---------- */
  function loadCart() { state.cart = store(CART_KEY).filter(function (i) { return byId(i.id) && i.qty > 0; }); }
  function saveCart() { store(CART_KEY, state.cart); }

  /* ---------- categorias ---------- */
  function counts() { var c = {}; PRODUCTS.forEach(function (p) { c[p.category] = (c[p.category] || 0) + 1; }); return c; }
  function stocked(catId, n) {
    return PRODUCTS.filter(function (p) { return (!catId || p.category === catId) && p.stock === 'in' && p.images.length; }).slice(0, n);
  }
  function renderCats() {
    var n = counts();
    $('catTiles').innerHTML = CATEGORIES.map(function (c) {
      var p = stocked(c.id, 1)[0];
      return '<button class="chip-cat" type="button" data-cat="' + c.id + '"><span class="c-img">' + (p ? imgTag(p, '', true, true) : '') + '</span>' + esc(c.name) + '</button>';
    }).join('');
    $('ddPanel').innerHTML = '<a href="#catalogo" data-cat="">Todos os produtos <small>' + PRODUCTS.length + '</small></a>' + CATEGORIES.map(function (c) {
      return '<a href="#catalogo" data-cat="' + c.id + '">' + esc(c.name) + ' <small>' + (n[c.id] || 0) + '</small></a>';
    }).join('');
    var chevR = '<svg class="m-chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var gridIco = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
    $('mBody').innerHTML = '<p class="m-title">Categorias</p>' +
      '<a class="m-row" href="#catalogo" data-cat=""><span class="m-ph m-all">' + gridIco + '</span><span class="m-name">Todos os produtos</span><small>' + PRODUCTS.length + '</small>' + chevR + '</a>' +
      CATEGORIES.map(function (c) {
        var p = stocked(c.id, 1)[0];
        return '<a class="m-row" href="#catalogo" data-cat="' + c.id + '"><span class="m-ph">' + (p ? imgTag(p, '', true, true) : '') + '</span><span class="m-name">' + esc(c.name) + '</span><small>' + (n[c.id] || 0) + '</small>' + chevR + '</a>';
      }).join('') +
      '<p class="m-title">A loja</p>' +
      '<a class="m-link" href="#destaques">Destaques</a><a class="m-link" href="#loja">Horário e endereço</a><a class="m-link" href="#contato">Contato</a>' +
      '<a class="m-wa" href="https://wa.me/5544999060030" target="_blank" rel="noopener" data-event="whatsapp_click" data-where="menu-mobile">Falar no WhatsApp</a>';
    $('footCats').innerHTML = CATEGORIES.map(function (c) { return '<li><button type="button" data-cat="' + c.id + '">' + esc(c.name) + '</button></li>'; }).join('');
  }
  function renderSide() {
    var n = counts();
    $('sideCats').innerHTML = '<li><button type="button" data-cat="" aria-pressed="' + (!state.category) + '">Todos <small>' + PRODUCTS.length + '</small></button></li>' +
      CATEGORIES.map(function (c) {
        return '<li><button type="button" data-cat="' + c.id + '" aria-pressed="' + (state.category === c.id) + '">' + esc(c.name) + ' <small>' + (n[c.id] || 0) + '</small></button></li>';
      }).join('');
  }

  /* ---------- banner ---------- */
  var slide = 0, slideTimer, slideCount = 0;
  function renderBanner() {
    document.querySelectorAll('[data-photos]').forEach(function (el) {
      el.innerHTML = stocked(el.dataset.photos, 3).map(function (p) { return '<figure>' + imgTag(p, '', false, true) + '</figure>'; }).join('');
    });
    slideCount = document.querySelectorAll('.slide').length;
    $('dots').innerHTML = Array.apply(null, Array(slideCount)).map(function (_, i) {
      return '<button type="button" role="tab" aria-label="Destaque ' + (i + 1) + '" aria-selected="' + (i === 0) + '" data-slide="' + i + '"><i></i></button>';
    }).join('');
  }
  function goSlide(i) {
    slide = (i + slideCount) % slideCount;
    document.querySelectorAll('.slide').forEach(function (s, k) { s.classList.toggle('is-active', k === slide); s.setAttribute('aria-hidden', String(k !== slide)); s.inert = k !== slide; });
    document.querySelectorAll('#dots button').forEach(function (b, k) { b.setAttribute('aria-selected', String(k === slide)); });
  }
  function autoplay(on) {
    clearInterval(slideTimer);
    if (on && !reduceMotion) slideTimer = setInterval(function () { goSlide(slide + 1); }, 6500);
  }

  /* ---------- cartões de destaque ---------- */
  function renderQuick() {
    var id = state.recent[0], p = id && byId(id);
    var first = stocked('violoes', 1)[0];
    $('recentCard').innerHTML = p
      ? '<h3>Visto recentemente</h3><button class="q-recent" type="button" data-open="' + p.id + '"><span class="q-img">' + imgTag(p, '', true, true) + '</span><span>' + esc(p.name) + '</span></button><a href="#catalogo">Ver produtos</a>'
      : '<h3>Comece pelos violões</h3><button class="q-recent" type="button" data-cat="violoes"><span class="q-img">' + (first ? imgTag(first, '', true, true) : '') + '</span><span>Violões, violas e ukuleles em estoque.</span></button><a href="#catalogo" data-cat="violoes">Ver violões</a>';
  }

  /* ---------- carrosséis de produtos ---------- */
  var ROWS = ['violoes', 'teclados', 'microfones', 'guitarras', 'percussao', 'som-iluminacao'];
  function renderRows() {
    $('rows').innerHTML = ROWS.map(function (cid) {
      var list = stocked(cid, 14);
      if (list.length < 3) return '';
      return '<section class="container row" aria-label="' + esc(catName(cid)) + '"><div class="row-head"><h2>' + esc(catName(cid)) + '</h2><button type="button" data-cat="' + cid + '">Ver todos</button></div>' +
        '<div class="row-wrap"><button class="arrow a-prev" type="button" aria-label="Anterior" data-scroll="-1"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M13 4l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
        '<div class="track">' + list.map(cardHtml).join('') + '</div>' +
        '<button class="arrow a-next" type="button" aria-label="Próximo" data-scroll="1"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div></section>';
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
  function availHtml(p) { return p.stock === 'in' ? '<div class="avail">Em estoque, retire na loja</div>' : '<div class="avail out">Sem estoque no momento</div>'; }

  function render() {
    var list = sorted(PRODUCTS.filter(matches));
    var parts = [];
    if (state.category) parts.push(catName(state.category));
    if (state.query) parts.push('“' + state.query + '”');
    $('resultLine').textContent = list.length + (list.length === 1 ? ' produto' : ' produtos') + (parts.length ? ': ' + parts.join(', ') : '');
    renderSide();
    if (!list.length) {
      state.list = [];
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
      (out ? '<button class="buy" type="button" data-notify="' + p.id + '">Avisar quando chegar</button>'
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
    state.recent = [id].concat(state.recent.filter(function (x) { return x !== id; })).slice(0, 6);
    store(RECENT_KEY, state.recent);
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
      (p.stock === 'out' ? '<button class="buy" type="button" data-notify="' + p.id + '">Avisar quando chegar</button>'
        : '<button class="buy" type="button" data-add="' + p.id + '">Adicionar ao carrinho</button>') +
      '<a class="buy" target="_blank" rel="noopener" data-event="whatsapp_click" data-where="produto" href="' + STORE.whatsappHref + '?text=' + msg + '">Tirar dúvida no WhatsApp</a>' +
      '</div></div>';
    openLayer('modal', 'closeModal');
    track('view_item', { item_id: p.id });
  }

  /* ---------- camadas ---------- */
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
    if (id === 'modal') renderQuick();
  }

  /* ---------- carrinho ---------- */
  function addToCart(id) {
    var it = state.cart.filter(function (i) { return i.id === id; })[0];
    if (it) it.qty++; else state.cart.push({ id: id, qty: 1 });
    saveCart(); renderCart(); track('add_to_cart', { item_id: id });
    toast('Adicionado: ' + byId(id).name);
  }
  function bump() { var c = $('count'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
  function flyToCart(src) {
    var cart = $('openCart');
    if (!src || !cart.animate) { bump(); return; }
    var a = src.getBoundingClientRect(), b = cart.getBoundingClientRect();
    if (!a.width || !b.width) { bump(); return; }
    var clone = document.createElement('img');
    clone.src = src.currentSrc || src.src; clone.alt = ''; clone.setAttribute('aria-hidden', 'true');
    clone.style.cssText = 'position:fixed;z-index:700;pointer-events:none;object-fit:contain;border-radius:8px;box-shadow:0 8px 24px oklch(17% 0.01 150 / 35%);background:oklch(99% 0.004 120);left:' + a.left + 'px;top:' + a.top + 'px;width:' + a.width + 'px;height:' + a.height + 'px;';
    document.body.appendChild(clone);
    var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    var anim = clone.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx * 0.55 + 'px,' + (dy * 0.3 - 70) + 'px) scale(0.5)', opacity: 0.95, offset: 0.5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.06)', opacity: 0.25 }
    ], { duration: 800, easing: 'cubic-bezier(0.5, 0, 0.25, 1)' });
    var finished = false, done = function () { if (finished) return; finished = true; clone.remove(); bump(); };
    anim.onfinish = done; anim.oncancel = done; setTimeout(done, 1100);
  }
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.querySelector('span').textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 7000);
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
      return '<div class="cartrow"><div class="thumb">' + imgTag(p, '', true, true) + '</div><div><b>' + esc(p.name) + '</b>' +
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

  /* ---------- loja aberta ou fechada ---------- */
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

  /* ---------- eventos ---------- */
  function swapRender() {
    var g = $('grid');
    if (!g.animate || !g.children.length) { render(); return; }
    var out = g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 140, easing: 'ease-in', fill: 'forwards' }), swapped = false;
    function swap() {
      if (swapped) return; swapped = true;
      out.cancel(); render();
      g.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
    out.onfinish = swap; setTimeout(swap, 260);
  }
  function setFilter(c, clear) {
    state.category = c || null; state.shown = PAGE;
    if (clear) { state.query = ''; $('search').value = ''; }
    swapRender();
  }
  function menuOpen() { return $('mPanel').classList.contains('open'); }
  function openMenu() {
    $('mPanel').classList.add('open'); $('mScrim').classList.add('open'); $('mPanel').setAttribute('aria-hidden', 'false');
    $('burger').setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; $('mClose').focus();
  }
  function closeMenu(refocus) {
    if (!menuOpen()) return;
    $('mPanel').classList.remove('open'); $('mScrim').classList.remove('open'); $('mPanel').setAttribute('aria-hidden', 'true');
    $('burger').setAttribute('aria-expanded', 'false');
    if (!document.querySelector('.drawer.open,.modal.open')) document.body.style.overflow = '';
    if (refocus) $('burger').focus();
  }
  function scrollToEl(el, extra) {
    var head = document.querySelector('header.site'), off = (head ? head.offsetHeight : 0) + (extra || 12);
    var to = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - off), from = window.pageYOffset, dist = to - from;
    if (Math.abs(dist) < 4) { window.scrollTo({ top: to, behavior: 'instant' }); return; }
    var dur = Math.min(900, 380 + Math.abs(dist) * 0.25) * (reduceMotion ? 0.6 : 1), t0 = null;
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function step(ts) { if (t0 === null) t0 = ts; var p = Math.min(1, (ts - t0) / dur); window.scrollTo({ top: from + dist * ease(p), behavior: 'instant' }); if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  function closeDropdown() { $('ddPanel').hidden = true; $('ddBtn').setAttribute('aria-expanded', 'false'); }
  function wire() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-add],[data-open],[data-dec],[data-inc],[data-rm],[data-cat],[data-notify],[data-event],[data-thumb],[data-scroll],[data-slide]');
      if (!$('ddPanel').hidden && !e.target.closest('.dd')) closeDropdown();
      if (menuOpen() && (e.target.closest('#mPanel a') || !e.target.closest('#burger, #mPanel'))) closeMenu();
      var an = e.target.closest('a[href^="#"]');
      if (an && an.getAttribute('href').length > 1 && !an.dataset.cat) {
        var target = document.getElementById(an.getAttribute('href').slice(1));
        if (target) { e.preventDefault(); scrollToEl(target); history.replaceState(null, '', an.getAttribute('href')); }
      }
      if (!t) return;
      var d = t.dataset;
      if (d.add) {
        var holder = t.closest('.card'), srcImg = holder ? holder.querySelector('.ph img') : document.querySelector('#galMain img');
        addToCart(d.add); flashButton(t); flyToCart(srcImg);
      }
      else if (d.open) openDetail(d.open);
      else if (d.dec) setQty(d.dec, -1);
      else if (d.inc) setQty(d.inc, 1);
      else if (d.rm) removeItem(d.rm);
      else if (d.scroll) { var tr = t.parentNode.querySelector('.track'); tr.scrollBy({ left: d.scroll * tr.clientWidth * 0.85, behavior: 'smooth' }); }
      else if (d.slide !== undefined) { goSlide(+d.slide); autoplay(true); }
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
        e.preventDefault(); closeDropdown(); setFilter(d.cat, true);
        scrollToEl($('catalogo'));
      }
      if (d.event === 'whatsapp_click') track('whatsapp_click', { where: d.where });
    });
    $('burger').onclick = function () { menuOpen() ? closeMenu(true) : openMenu(); };
    $('mClose').onclick = function () { closeMenu(true); };
    var mx = null;
    $('mPanel').addEventListener('touchstart', function (e) { mx = e.touches[0].clientX; }, { passive: true });
    $('mPanel').addEventListener('touchend', function (e) { if (mx !== null && e.changedTouches[0].clientX - mx < -60) closeMenu(true); mx = null; });
    $('ddBtn').onclick = function () {
      var open = $('ddPanel').hidden; $('ddPanel').hidden = !open; this.setAttribute('aria-expanded', String(open));
    };
    var tx = null, banner = document.querySelector('.banner');
    banner.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; autoplay(false); }, { passive: true });
    banner.addEventListener('touchend', function (e) {
      if (tx !== null) { var dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) goSlide(slide + (dx < 0 ? 1 : -1)); }
      tx = null; autoplay(true);
    });
    $('bPrev').onclick = function () { goSlide(slide - 1); autoplay(true); };
    $('bNext').onclick = function () { goSlide(slide + 1); autoplay(true); };
    var ban = document.querySelector('.banner');
    ban.addEventListener('mouseenter', function () { autoplay(false); });
    ban.addEventListener('mouseleave', function () { autoplay(true); });
    ban.addEventListener('focusin', function () { autoplay(false); });
    ban.addEventListener('focusout', function () { autoplay(true); });
    $('moreBtn').onclick = showMore;
    $('onlyStock').onchange = function (e) { state.onlyStock = e.target.checked; state.shown = PAGE; swapRender(); };
    $('sort').onchange = function (e) { state.sort = e.target.value; state.shown = PAGE; swapRender(); };
    $('searchForm').addEventListener('submit', function (e) { e.preventDefault(); scrollToEl($('catalogo')); });
    var timer;
    $('search').addEventListener('input', function (e) {
      state.query = e.target.value.trim(); state.shown = PAGE;
      clearTimeout(timer); timer = setTimeout(function () { swapRender(); if (state.query) track('search', { search_term: state.query }); }, 140);
    });
    $('openCart').onclick = function () { openLayer('drawer', 'closeCart'); };
    $('toastOpen').onclick = function () { $('toast').classList.remove('show'); openLayer('drawer', 'closeCart'); };
    $('closeCart').onclick = function () { closeLayer('drawer'); };
    $('closeModal').onclick = function () { closeLayer('modal'); };
    $('drawer').onclick = function (e) { if (e.target.id === 'drawer') closeLayer('drawer'); };
    $('modal').onclick = function (e) { if (e.target.id === 'modal') closeLayer('modal'); };
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (menuOpen()) closeMenu(true);
      else if (!$('ddPanel').hidden) closeDropdown();
      else if ($('modal').classList.contains('open')) closeLayer('modal');
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

  function initReveal() {
    if (!('IntersectionObserver' in window)) return;
    var groups = ['.quick .qcard', '.cat-chips .chip-cat', '#rows .row', '.promos .promo', '.sec-head', '.side', '#grid-note', '.visit > *', '.footer-grid > *'];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    groups.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el, i) {
        el.classList.add('reveal'); el.style.setProperty('--d', Math.min(i, 5) * 70 + 'ms'); io.observe(el);
      });
    });
    // rede de segurança: se o observador nunca disparar (aba em segundo plano), mostra tudo
    setTimeout(function () {
      if (!document.querySelector('.reveal.in')) document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    }, 2500);
  }
  var header = document.querySelector('header.site');
  function onScroll() { header.classList.toggle('scrolled', window.pageYOffset > 8); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  $('hours').innerHTML = STORE.hours.map(function (h) { return esc(h[0]) + ': ' + esc(h[1]); }).join('<br>');
  state.recent = store(RECENT_KEY).filter(byId);
  openStatus(); loadCart(); renderCats(); renderBanner(); renderQuick(); renderRows(); wire(); render(); renderCart();
  goSlide(0); autoplay(true); initReveal();
})();
