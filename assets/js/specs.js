/* ===========================================================================
   Kuicur — the specification board.

   Cards can be picked up and swapped with each other. Opening one gives you a
   different thing to do every time: a counter that runs at the real rate, a
   calendar that drains, a button you hold, a timer that runs itself, modes you
   click, heads you retire, a density you compare, a box you unpack.

   Every figure comes from the published numbers. Where something is sped up
   to fit a screen, the panel says so.
   =========================================================================== */

(function () {
  'use strict';

  var board = document.getElementById('board');
  var modal = document.getElementById('modal');
  if (!board || !modal) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function frag(parent, kids) { kids.forEach(function (k) { parent.appendChild(k); }); return parent; }

  /* --- the running wave on the motor frame ------------------------------- */

  var stripWave = document.querySelector('.fr__wave');

  /* --- shared demo furniture -------------------------------------------- */

  var timers = [];                              // cleared whenever the dialog closes
  function every(fn) { var id = requestAnimationFrame(function tick(t) {
    fn(t); id = requestAnimationFrame(tick); timers.push(id); }); timers.push(id); }
  function stopAll() { timers.forEach(cancelAnimationFrame); timers = []; }

  function readout(value, unit) {
    var p = el('p', 'demo__read');
    p.append(document.createTextNode(value));
    if (unit) { var s = el('small', null, unit); p.appendChild(s); }
    return p;
  }
  function note(text) { return el('p', 'demo__note', text); }
  function action(label, onClick) {
    var b = el('button', 'demo__btn', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function wavePath(w, h, amp, freq, phase) {
    var mid = h / 2, steps = 150, d = '', i, x, y;
    for (i = 0; i <= steps; i++) {
      x = (i / steps) * w;
      y = mid + Math.sin((i / steps) * Math.PI * 2 * freq + phase) * amp
             * Math.sin((i / steps) * Math.PI);
      d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    return d;
  }
  function svgWave() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'demo__wave');
    svg.setAttribute('viewBox', '0 0 600 110');
    svg.setAttribute('preserveAspectRatio', 'none');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
    return { svg: svg, path: path };
  }

  /* --- one demo per card, each with its own way of being played with ----- */

  var demos = {

    /* Speed, not size: a counter running at the real rate of 700 a second. */
    motor: function () {
      var body = el('div', 'demo');
      var read = readout('0', 'vibrations so far');
      var clock = el('p', 'demo__sub', '0.0 s at full speed');
      var w = svgWave();

      var t0 = null;
      every(function (t) {
        if (t0 === null) t0 = t;
        var secs = (t - t0) / 1000;
        read.firstChild.nodeValue = Math.floor(secs * 700).toLocaleString('en-US');
        clock.textContent = secs.toFixed(1) + ' s at full speed';
        w.path.setAttribute('d', wavePath(600, 110, 34, 13, secs * 9));
      });

      frag(body, [read, clock, w.svg,
        note('42,000 a minute is 700 every second — the counter above is running '
           + 'at that rate, in real time. Over the two minutes the timer allows, '
           + 'that comes to 84,000.')]);
      return { kicker: 'Motor', title: 'Seven hundred a second', node: body };
    },

    /* Ninety days, drawn as ninety days, drained on demand. */
    battery: function () {
      var body = el('div', 'demo');
      var read = readout('90', 'days left');
      var grid = el('div', 'demo__grid');
      var cells = [];
      for (var i = 0; i < 90; i++) { var c = el('span', 'demo__cellDot'); grid.appendChild(c); cells.push(c); }

      var used = 0, playing = false, last = null;
      var btn = action('Run the ninety days', function () {
        if (used >= 90) { used = 0; paint(); }
        playing = !playing;
        btn.textContent = playing ? 'Pause' : (used ? 'Keep going' : 'Run the ninety days');
      });

      function paint() {
        read.firstChild.nodeValue = String(90 - Math.floor(used));
        cells.forEach(function (c, i) { c.classList.toggle('is-spent', i < used); });
      }
      every(function (t) {
        if (last === null) last = t;
        var dt = (t - last) / 1000; last = t;
        if (!playing) return;
        used = Math.min(90, used + dt * 18);          // ninety days in five seconds
        if (used >= 90) { playing = false; btn.textContent = 'Run it again'; }
        paint();
      });
      paint();

      frag(body, [read, grid, btn,
        note('One square is one day. A 1500 mAh cell covers about ninety of them '
           + 'at two two-minute sessions a day — roughly 180 brushings between '
           + 'charges. Played here at eighteen days a second.')]);
      return { kicker: 'Battery life', title: 'Ninety days, one square each', node: body };
    },

    /* Eight hours you have to sit through — press and hold. */
    charge: function () {
      var body = el('div', 'demo');
      var read = readout('0h 00', 'of about 8 h');
      var cell = el('div', 'demo__cell');
      var fill = el('div', 'demo__cellFill');
      cell.appendChild(fill);
      var btn = el('button', 'demo__btn demo__btn--hold', 'Hold to charge');
      btn.type = 'button';

      var lamp = el('div', 'demo__charge');
      lamp.innerHTML = '<span class="demo__chargeRing"></span>' +
                       '<span class="demo__chargeCap">the indicator on the handle</span>';

      var mins = 0, holding = false, last = null;
      ['pointerdown'].forEach(function (ev) { btn.addEventListener(ev, function (e) {
        e.preventDefault(); holding = true; btn.classList.add('is-held'); }); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
        btn.addEventListener(ev, function () { holding = false; btn.classList.remove('is-held'); }); });

      every(function (t) {
        if (last === null) last = t;
        var dt = (t - last) / 1000; last = t;
        if (holding && mins < 480) mins = Math.min(480, mins + dt * 80);   // 8 h in 6 s
        var h = Math.floor(mins / 60), m = Math.floor(mins % 60);
        read.firstChild.nodeValue = h + 'h ' + ('0' + m).slice(-2);
        fill.style.width = (mins / 480 * 100) + '%';
        btn.textContent = mins >= 480 ? 'Fully charged' : (holding ? 'Charging…' : 'Hold to charge');
        lamp.classList.toggle('is-on', holding && mins < 480);
        lamp.classList.toggle('is-done', mins >= 480);
      });

      frag(body, [read, cell, lamp, btn,
        note('The light on the handle comes on while it is charging and changes '
           + 'when it is full, so you can tell at a glance without picking it up. '
           + 'A full charge takes about eight hours over USB, into the bottom of '
           + 'the handle. Held down here it runs eighty minutes a second. The bar '
           + 'is time on the cable, not a measured charge level — the manual gives '
           + 'the duration, not a curve.')]);
      return { kicker: 'Charging', title: 'Eight hours on the cable', node: body };
    },

    /* The timer, actually running, pausing at each quadrant the way it does. */
    timer: function () {
      var body = el('div', 'demo');
      var wrap = el('div', 'demo__dial');
      wrap.innerHTML =
        '<svg viewBox="0 0 240 240">' +
        '<circle cx="120" cy="120" r="100" fill="none" stroke="rgba(242,245,244,.12)" stroke-width="12"/>' +
        '<circle class="demo__run" cx="120" cy="120" r="100" fill="none" stroke="currentColor" ' +
          'stroke-width="12" stroke-linecap="round" transform="rotate(-90 120 120)" ' +
          'stroke-dasharray="628" stroke-dashoffset="628"/>' +
        '<g stroke="rgba(242,245,244,.35)" stroke-width="2">' +
        '<line x1="120" y1="8" x2="120" y2="30"/><line x1="232" y1="120" x2="210" y2="120"/>' +
        '<line x1="120" y1="232" x2="120" y2="210"/><line x1="8" y1="120" x2="30" y2="120"/></g>' +
        '<text class="demo__dialRead" x="120" y="132" text-anchor="middle">0:00</text></svg>';
      var ring = wrap.querySelector('.demo__run');
      var face = wrap.querySelector('.demo__dialRead');
      var quarter = readout('Quarter 1', 'of four');

      var secs = 0, running = false, last = null, held = 0;
      var btn = action('Start the two minutes', function () {
        if (secs >= 120) secs = 0;
        running = !running;
        btn.textContent = running ? 'Stop' : 'Keep going';
      });

      every(function (t) {
        if (last === null) last = t;
        var dt = (t - last) / 1000; last = t;
        if (running) {
          /* the handle breaks its rhythm at every thirty-second mark */
          var mark = Math.floor(secs / 30);
          if (secs > 0 && Math.floor((secs + dt * 8) / 30) > mark && held < 0.45) {
            held += dt;
          } else {
            held = 0;
            secs = Math.min(120, secs + dt * 8);      // two minutes in fifteen seconds
          }
          if (secs >= 120) { running = false; btn.textContent = 'Run it again'; }
        }
        var q = Math.min(3, Math.floor(secs / 30));
        face.textContent = Math.floor(secs / 60) + ':' + ('0' + Math.floor(secs % 60)).slice(-2);
        quarter.firstChild.nodeValue = held > 0 ? 'Move on' : 'Quarter ' + (q + 1);
        ring.setAttribute('stroke-dashoffset', String(628 - 628 * (secs / 120)));
        ring.style.opacity = held > 0 ? '0.35' : '1';
      });

      frag(body, [wrap, quarter, btn,
        note('The handle stops itself at two minutes and pauses briefly every '
           + 'thirty seconds — watch the ring dim at each mark, which is your cue '
           + 'to move to the next quarter of your mouth. Run here at eight times speed.')]);
      return { kicker: 'Timer', title: 'Two minutes, four quadrants', node: body };
    },

    /* Modes: no slider — press them, the way you press the button. */
    modes: function () {
      var list = [
        ['Cleaning',     'For normal, everyday cleaning.'],
        ['Bright White', 'For deep cleaning and stain removal.'],
        ['Polishing',    'For polishing front teeth.'],
        ['Nursing',      'For gentle gum care.'],
        ['Cleansing',    'For sensitive teeth and gums.']
      ];
      var body = el('div', 'demo');
      var read = readout(list[0][0], 'press 1');
      var quote = el('p', 'demo__quote', '“' + list[0][1] + '”');

      var lamps = el('div', 'demo__lamps');
      var dots = list.map(function () { var d = el('span', 'demo__lamp'); lamps.appendChild(d); return d; });

      var segs = el('div', 'demo__segs');
      var buttons = list.map(function (m, i) {
        var b = el('button', 'demo__seg', m[0]);
        b.type = 'button';
        b.addEventListener('click', function () { pick(i); });
        segs.appendChild(b);
        return b;
      });

      var at = 0;
      function pick(i) {
        at = i;
        read.firstChild.nodeValue = list[i][0];
        read.querySelector('small').textContent = 'press ' + (i + 1);
        quote.textContent = '“' + list[i][1] + '”';
        buttons.forEach(function (b, k) { b.classList.toggle('is-on', k === i); });
        dots.forEach(function (d, k) { d.classList.toggle('is-lit', k === i); });
      }
      pick(0);

      var next = action('Press the button', function () { pick((at + 1) % 5); });

      frag(body, [read, quote, lamps, segs, next,
        note('One button cycles them in this order, and the handle starts in '
           + 'whichever one you left it in. Pick one, or press through them.')]);
      return { kicker: 'Modes', title: 'Five, on one button', node: body };
    },

    /* Ten heads: retire them one at a time and watch the months add up. */
    heads: function () {
      var body = el('div', 'demo');
      var read = readout('Month 0', 'head 1 of 10');
      var row = el('div', 'demo__heads');
      var pips = [];
      for (var i = 0; i < 10; i++) {
        var p = el('button', 'demo__head');
        p.type = 'button';
        p.setAttribute('aria-label', 'Retire head ' + (i + 1));
        row.appendChild(p);
        pips.push(p);
      }

      var used = 0;
      function paint() {
        read.firstChild.nodeValue = 'Month ' + used * 3;
        read.querySelector('small').textContent = used >= 10
          ? 'all ten spent' : 'head ' + (used + 1) + ' of 10';
        pips.forEach(function (p, i) {
          p.classList.toggle('is-spent', i < used);
          p.classList.toggle('is-now', i === used);
        });
      }
      pips.forEach(function (p, i) {
        p.addEventListener('click', function () { used = i + 1; paint(); });
      });
      paint();

      var reset = action('Back to a fresh box', function () { used = 0; paint(); });

      frag(body, [read, row, reset,
        note('Click a head to wear it out. Dentists ask for a new one every three '
           + 'months, so the ten in the box cover thirty months.')]);
      return { kicker: 'Brush heads', title: 'Ten in the box', node: body };
    },

    /* Density: a straight side-by-side you flip between. */
    bristles: function () {
      var body = el('div', 'demo');
      var read = readout('45%', 'more bristle');
      var stage = el('div', 'demo__tufts');
      var rowA = el('div', 'demo__tuftRow');
      var rowB = el('div', 'demo__tuftRow demo__tuftRow--dense');
      var i;
      for (i = 0; i < 11; i++) rowA.appendChild(el('span', 'demo__tuft'));
      for (i = 0; i < 16; i++) rowB.appendChild(el('span', 'demo__tuft'));
      var capA = el('p', 'demo__caption', 'An ordinary head');
      var capB = el('p', 'demo__caption', 'This head');
      frag(stage, [capA, rowA, capB, rowB]);

      var dense = true;
      var btn = action('Show the ordinary head', function () {
        dense = !dense;
        stage.classList.toggle('is-flat', !dense);
        btn.textContent = dense ? 'Show the ordinary head' : 'Show this head';
        read.firstChild.nodeValue = dense ? '45%' : '—';
        read.querySelector('small').textContent = dense ? 'more bristle' : 'the baseline';
      });

      frag(body, [read, stage, btn,
        note('Kuicur puts the head at 45% greater bristle density, soft and '
           + 'flexible, cut in a U to follow the curve of the teeth. Eleven tufts '
           + 'against sixteen is that ratio drawn out — an illustration of the '
           + 'figure, not a count of the real head.')]);
      return { kicker: 'Bristles', title: 'Forty-five per cent denser', node: body };
    },

    /* The box: unpacked one piece at a time. */
    box: function () {
      var items = [
        ['Handle', 'The Kuicur-White body, one button on the front.'],
        ['Ten brush heads', 'Enough for thirty months at one every three.'],
        ['Travel case', 'Hard shell, sized for the handle and a head.'],
        ['Stand', 'Holds it upright between brushings.'],
        ['USB cable', 'Charges into the bottom of the handle.']
      ];
      var body = el('div', 'demo');
      var read = readout('0', 'of five out');
      var list = el('ol', 'demo__items');
      var rows = items.map(function (it) {
        var li = el('li', 'demo__item');
        li.appendChild(el('b', null, it[0]));
        li.appendChild(el('span', null, it[1]));
        list.appendChild(li);
        return li;
      });

      var out = 0;
      var btn = action('Open the box', function () {
        if (out >= items.length) { out = 0; rows.forEach(function (r) { r.classList.remove('is-out'); }); }
        else { rows[out].classList.add('is-out'); out++; }
        read.firstChild.nodeValue = String(out);
        btn.textContent = out >= items.length ? 'Pack it up again'
                        : out === 0 ? 'Open the box' : 'Next piece';
      });

      frag(body, [read, list, btn,
        note('Five things come in the box. Take them out one at a time.')]);
      return { kicker: 'In the box', title: 'Five pieces', node: body };
    }
  };

  /* --- the dialog ------------------------------------------------------- */

  var mKicker = modal.querySelector('[data-modal-kicker]');
  var mTitle  = modal.querySelector('[data-modal-title]');
  var mBody   = modal.querySelector('[data-modal-body]');

  function open(name) {
    var make = demos[name];
    if (!make) return;
    stopAll();
    var d = make();
    mKicker.textContent = d.kicker;
    mTitle.textContent = d.title;
    mBody.replaceChildren(d.node);
    modal.showModal();
  }

  modal.querySelector('.modal__close').addEventListener('click', function () { modal.close(); });
  modal.addEventListener('close', stopAll);
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });

  board.addEventListener('click', function (e) {
    var frame = e.target.closest('.fr');
    if (frame && frame.dataset.demo) open(frame.dataset.demo);
  });

  /* the motor frame keeps its wave running whenever the strip is on screen */
  if (stripWave) {
    var strip = document.querySelector('.strip');
    var t0 = null, spinning = false;
    function onScreen(el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    }
    function spin(t) {
      if (t0 === null) t0 = t;
      stripWave.setAttribute('d', wavePath(320, 90, 26, 9, (t - t0) / 1000 * 5));
      if (onScreen(strip)) requestAnimationFrame(spin); else spinning = false;
    }
    function kick() { if (!spinning && onScreen(strip)) { spinning = true; requestAnimationFrame(spin); } }
    addEventListener('scroll', kick, { passive: true });
    kick();
  }
})();
