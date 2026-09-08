/* ===========================================================================
   Kuicur — one scroll loop.

   Every animated section carries data-progress. Each frame we work out how far
   that section has travelled and write the result to it as --p (0 → 1). CSS
   reads --p and does the moving, so this file never writes style properties in
   a loop. The handle tour is the one thing that needs more than a number.
   =========================================================================== */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /** Tall sections report how far their sticky stage has travelled; short ones
   *  report their pass through the viewport. */
  function progressOf(el) {
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight;
    if (r.height > vh + 1) return clamp(-r.top / (r.height - vh), 0, 1);
    return clamp((vh - r.top) / (vh + r.height), 0, 1);
  }

  /** data-range="a,b" trims the useful part of a section's travel. */
  function remap(p, range) {
    if (!range) return p;
    return clamp((p - range[0]) / (range[1] - range[0]), 0, 1);
  }

  /* --- word splitting --------------------------------------------------- */

  Array.prototype.forEach.call(document.querySelectorAll('[data-words]'), function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    el.style.setProperty('--n', words.length);
    words.forEach(function (word, i) {
      var span = document.createElement('span');
      span.className = 'w';
      span.style.setProperty('--i', i);
      span.textContent = word;
      el.appendChild(span);
      el.appendChild(document.createTextNode(' '));
    });
  });

  /* --- the tour --------------------------------------------------------- */

  var panels    = document.querySelectorAll('.panel');
  var tourDots  = document.querySelectorAll('.tour__dot');
  var tourStage = document.querySelector('.tour__sticky');

  var BEATS     = panels.length;   /* head, button, five presses, the charge mark */
  var FIRST_LIT = 1;               /* beats before the first light comes on */
  var lastBeat  = -1;

  var sections = Array.prototype.map.call(
    document.querySelectorAll('[data-progress]'),
    function (el) {
      var raw = el.getAttribute('data-range');
      return {
        el: el,
        range: raw ? raw.split(',').map(Number) : null,
        name: el.className.split(' ')[0]
      };
    }
  );

  var tourProgress = 0;

  function measure() {
    sections.forEach(function (s) {
      var p = remap(progressOf(s.el), s.range);
      if (p !== s.last) {
        s.last = p;
        s.el.style.setProperty('--p', p.toFixed(4));
      }
      if (s.name === 'tour') tourProgress = p;
    });

    /* Beat 0 frames the head; beat 1 frames the lower handle and rings the
       button; from beat 2 on, each beat is one press, lighting a single
       indicator and putting out the one before it. The topmost hole in the
       column is not a mode light, so the first one to come on is the second. */
    if (BEATS) {
      var beat = clamp(Math.floor(tourProgress * (BEATS + 0.5) - 0.25), 0, BEATS - 1);
      if (beat !== lastBeat) {
        lastBeat = beat;
        Array.prototype.forEach.call(panels, function (el, i) {
          el.classList.toggle('is-on', i === beat);
        });
        Array.prototype.forEach.call(tourDots, function (el, i) {
          el.classList.toggle('is-lit', i === beat - FIRST_LIT - 1);
        });
        if (tourStage) {
          tourStage.setAttribute('data-shot',
            beat === 0 ? 'head'
              : beat === 1 ? 'button'
              : beat === BEATS - 1 ? 'charge' : 'modes');
          tourStage.setAttribute('data-beat', beat);
        }
      }
    }
  }

  /* Pressing the button on the handle steps to the next mode, the same way
     pressing the real one does: it scrolls to where that beat begins, so the
     scroll position and what is on screen never disagree. */
  var tourSection = document.querySelector('.tour');
  var key = document.querySelector('[data-next-beat]');
  if (key && tourSection) {
    key.addEventListener('click', function () {
      /* the button steps through the modes and stops. The mark at the foot of
         the handle is reached by scrolling, never by pressing. */
      if (lastBeat >= BEATS - 2) return;
      var r = tourSection.getBoundingClientRect();
      var top = r.top + window.scrollY;

      /* land in the middle of the next beat's band, away from either edge */
      var band = (lastBeat + 1.5) / (BEATS + 0.5) + 0.25 / (BEATS + 0.5);
      var target = top + band * (r.height - window.innerHeight);
      window.scrollTo({ top: target, behavior: reduced.matches ? 'auto' : 'smooth' });
    });
  }

  /** No motion: every panel shown at once, and the photograph left as it was
   *  taken. Only one indicator ever lights on the real handle, so lighting
   *  five here would be a picture of something that cannot happen. */
  function still() {
    measure();
    Array.prototype.forEach.call(panels, function (el) { el.classList.add('is-on'); });
    if (tourStage) tourStage.setAttribute('data-shot', 'modes');
  }

  if (reduced.matches) {
    still();
  } else {
    addEventListener('scroll', measure, { passive: true });
    addEventListener('resize', measure);
    measure();
  }
})();
