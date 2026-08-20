(function () {
  // --- integracao com o backend (Supabase) ---
  var SUPABASE_URL = 'https://nwmuaiilbxtjkwfxpkay.supabase.co/functions/v1/';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53bXVhaWlsYnh0amt3Znhwa2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMTMxNDMsImV4cCI6MjEwMTY4OTE0M30.gXVAeCnF1TGVmHPO65Sd1UTV0Z8W25uoaAR1DNYSzaE';

  function sessionId() {
    var key = 'skill_sid';
    try {
      var id = localStorage.getItem(key);
      if (!id) {
        id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        localStorage.setItem(key, id);
      }
      return id;
    } catch (e) {
      return 'anon-' + Math.random().toString(36).slice(2, 10);
    }
  }

  function utms() {
    var p = new URLSearchParams(window.location.search);
    return {
      referrer: document.referrer || null,
      utm_source: p.get('utm_source'),
      utm_medium: p.get('utm_medium'),
      utm_campaign: p.get('utm_campaign')
    };
  }

  function post(path, payload) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 6000);
    return fetch(SUPABASE_URL + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).catch(function () {}).finally(function () { clearTimeout(timeout); });
  }

  // exposto para a pagina de download registrar o clique no .zip
  window.trackSkillEvent = function (event) {
    var payload = utms();
    payload.event = event;
    payload.session_id = sessionId();
    return post('track-skill-event', payload);
  };

  var overlay = document.getElementById('overlay');
  var form = document.getElementById('form');
  var submit = document.getElementById('submit');
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // funil: visita na pagina
  window.trackSkillEvent('visit');

  // capa do video: troca pelo iframe do YouTube so no clique
  var facade = document.getElementById('video-play');
  if (facade) {
    facade.addEventListener('click', function () {
      var frame = facade.parentNode;
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/Peiak6PvmRE?rel=0&autoplay=1';
      iframe.title = 'Como criar um pitch de prospecção impossível de ignorar, por Felipe Coelho';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      frame.appendChild(iframe);
      facade.remove();
    });
  }

  if (!overlay || !form) return;

  var lastFocus = null;

  function open() {
    window.trackSkillEvent('popup_open');
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('nome').focus();
  }
  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  document.getElementById('cta').addEventListener('click', open);
  document.getElementById('close').addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !overlay.hidden) close(); });

  function setError(field, msg) {
    var input = document.getElementById(field);
    var slot = document.querySelector('.err[data-for="' + field + '"]');
    slot.textContent = msg || '';
    input.classList.toggle('invalid', !!msg);
    return !msg;
  }

  // formatacao do whatsapp: (11) 99999-9999
  var whats = document.getElementById('whats');
  whats.addEventListener('input', function () {
    var d = whats.value.replace(/\D/g, '').slice(0, 11);
    var out = d;
    if (d.length > 2) out = '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length > 6) {
      var cut = d.length > 10 ? 7 : 6;
      out = '(' + d.slice(0, 2) + ') ' + d.slice(2, cut) + '-' + d.slice(cut);
    }
    whats.value = out;
  });

  // sintaxe de e-mail (RFC-pratico)
  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

  var DISPOSABLE = [
    'mailinator.com', 'tempmail.com', 'temp-mail.org', 'guerrillamail.com',
    '10minutemail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com',
    'getnada.com', 'dispostable.com', 'maildrop.cc', 'fakeinbox.com'
  ];

  var TYPOS = {
    'gmial.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmai.com': 'gmail.com',
    'gnail.com': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com',
    'outlok.com': 'outlook.com', 'yaho.com': 'yahoo.com', 'uol.com': 'uol.com.br'
  };

  // Checa se o dominio realmente recebe e-mail (registro MX/A) via DNS over HTTPS.
  // Se a rede falhar, nao bloqueia o usuario.
  function domainAcceptsMail(domain) {
    var url = 'https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX';
    return fetch(url, { headers: { Accept: 'application/dns-json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return true;                    // sem resposta: nao bloqueia
        if (data.Status === 3) return false;       // NXDOMAIN: dominio nao existe
        if (data.Answer && data.Answer.length) return true;
        // sem MX: tenta registro A como ultimo recurso
        return fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=A')
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d2) { return !d2 || !!(d2.Answer && d2.Answer.length); });
      })
      .catch(function () { return true; });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var nome = document.getElementById('nome').value.trim();
    var email = document.getElementById('email').value.trim().toLowerCase();
    var tel = whats.value.replace(/\D/g, '');

    var ok = true;
    ok = setError('nome', nome.length < 2 ? 'Digite seu nome para continuar.' : '') && ok;
    ok = setError('whats', tel.length < 10 ? 'Digite o DDD e o número para continuar.' : '') && ok;

    if (!email) {
      ok = setError('email', 'Digite seu e-mail.') && ok;
    } else if (!EMAIL_RE.test(email)) {
      ok = setError('email', 'Digite um e-mail válido para continuar.') && ok;
    } else {
      var domain = email.split('@')[1];
      if (TYPOS[domain]) {
        ok = setError('email', 'Você quis dizer @' + TYPOS[domain] + '?') && ok;
      } else if (DISPOSABLE.indexOf(domain) !== -1) {
        ok = setError('email', 'Use um e-mail permanente para continuar.') && ok;
      } else {
        setError('email', '');
      }
    }

    if (!ok) return;

    submit.disabled = true;
    submit.textContent = 'Verificando e-mail...';

    domainAcceptsMail(email.split('@')[1]).then(function (exists) {
      submit.disabled = false;
      submit.textContent = 'Liberar download';

      if (!exists) {
        setError('email', 'Esse domínio não existe. Confira a digitação.');
        return;
      }

      try {
        sessionStorage.setItem('lead', JSON.stringify({
          nome: nome, email: email, whatsapp: tel, em: new Date().toISOString()
        }));
      } catch (err) {}

      var payload = utms();
      payload.name = nome;
      payload.email = email;
      payload.whatsapp = tel;
      payload.session_id = sessionId();
      payload.language = navigator.language || null;
      payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
      payload.screen_resolution = window.screen.width + 'x' + window.screen.height;

      submit.disabled = true;
      submit.textContent = 'Liberando...';

      post('submit-skill-lead', payload).then(function () {
        window.location.href = 'download.html';
      });
    });
  });
})();
