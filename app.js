// Scroll-reveal animation. Respects prefers-reduced-motion through CSS.
(function () {
  var revealEls = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || revealEls.length === 0) {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  revealEls.forEach(function (el) { io.observe(el); });
})();

// Deck request modal and standard FormSubmit submission flow.
(function () {
  var MATERIALS_URL = 'https://wripermianone.github.io/wri-landing-page/materials.html';
  var DECLINED_URL = 'https://wripermianone.github.io/wri-landing-page/request-received.html';
  var DECK_URL = 'https://drive.google.com/file/d/1rbmBQQQSaQBEpiOK1rYxz8hz9wroz4TD/view';
  var CIM_URL = 'https://drive.google.com/file/d/1u27Ub1kVZCG09bGdVoWpXK7gF2aGLzZ9/view?usp=sharing';
  var APPLICATION_URL = 'https://drive.google.com/file/d/1hMGcugzjGRrS6I6qRr5MQdXeE9OCGEwc/view?usp=sharing';
  var CALENDAR_URL = 'https://calendar.app.google/gRdJZqdeFKwtAd9HA';

  var overlay = document.getElementById('deckModalOverlay');
  var closeBtn = document.getElementById('deckModalClose');
  var form = document.getElementById('deckForm');
  var errorEl = document.getElementById('deckFormError');
  var submitBtn = document.getElementById('deckSubmitBtn');
  var panelForm = document.getElementById('deckModalPanelForm');
  var panelAccredited = document.getElementById('deckModalPanelAccredited');
  var panelDeclined = document.getElementById('deckModalPanelDeclined');
  var autoresponseInput = document.getElementById('deckAutoresponse');
  var subjectInput = document.getElementById('deckEmailSubject');
  var nextInput = document.getElementById('deckNextUrl');

  if (!overlay || !form) return;

  var lastFocused = null;

  function showFormPanel() {
    if (panelForm) panelForm.hidden = false;
    if (panelAccredited) panelAccredited.hidden = true;
    if (panelDeclined) panelDeclined.hidden = true;
  }

  function openModal() {
    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    showFormPanel();
    errorEl.hidden = true;
    form.reset();
    var first = form.querySelector('#df-first');
    if (first) first.focus();
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  document.querySelectorAll('[data-open-deck-modal]').forEach(function (btn) {
    btn.addEventListener('click', openModal);
  });

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) closeModal();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !overlay.hidden) closeModal();
  });

  function accreditedMessage(firstName) {
    return [
      'Hello ' + firstName + ',',
      '',
      'Thank you for your interest in WRI Permian 1. As requested, the confidential Investor Deck, Confidential Information Memorandum, and Application Agreement are available at the links below for your review.',
      '',
      'WRI Permian 1 at a glance:',
      '',
      'Offering: $3,000,000; 30 units at $100,000 each ($50,000 minimum)',
      'Assets: 5 development projects across the Permian Basin (Midland and Delaware Basins)',
      'Wells: 36 gross wells across 4 established operators: ConocoPhillips, Mewbourne, Exxon (XTO)/Pioneer, and SM Energy/Civitas',
      'Day-One Production: 3 PDP producing wells at the Dreadnaught asset',
      'Independent Engineering: MIDAS methodology by Quantum Field Partners',
      'Terms: 1% carried interest; no mark-ups',
      'Potential Tax Treatment: Estimated 70-90% IDC deduction in Year 1, 7-year TDC depreciation, and 15% depletion allowance, subject to the offering documents and your individual circumstances. Consult your tax advisor.',
      '',
      'Investor Deck:',
      DECK_URL,
      '',
      'WRI Permian 1 Confidential Information Memorandum:',
      CIM_URL,
      '',
      'WRI Permian 1 Application Agreement:',
      APPLICATION_URL,
      '',
      'I would welcome the opportunity to walk you through the materials and answer your questions. Schedule a brief call here:',
      CALENDAR_URL,
      '',
      'You can also contact me directly.',
      '',
      'Best regards,',
      '',
      'Dalton Ortiz',
      'Founder / Managing Partner',
      '214-427-5197',
      '469-822-0942',
      'dalton@warriorraceinvestments.com',
      'https://dalton143.wixsite.com/warrior-race-investm',
      '',
      'Accredited investors only. Confidential. Summary only, not an offer to sell or a solicitation to buy any security. Any offering will be made only pursuant to definitive offering documents. Oil and gas investments involve a high degree of risk, including potential loss of the entire investment. WRI is not a registered investment advisor, broker-dealer, or tax advisor. Consult your own legal, tax, and financial advisors before investing.',
      '',
      'These materials are confidential and may not be reproduced or redistributed except to your legal, tax, or financial advisors.'
    ].join('\n');
  }

  function declinedMessage(firstName) {
    return [
      'Hello ' + firstName + ',',
      '',
      'Thank you for your interest in WRI Permian 1. Based on the information submitted, the confidential offering materials are not available for automatic delivery.',
      '',
      'If you believe this is incorrect or would like to discuss a future Warrior Race Investments opportunity, contact Dalton Ortiz at dalton@warriorraceinvestments.com or 469-822-0942.',
      '',
      'Best regards,',
      '',
      'Dalton Ortiz',
      'Founder / Managing Partner',
      'Warrior Race Investments, LLC'
    ].join('\n');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorEl.hidden = true;

    var formData = new FormData(form);
    var goals = formData.getAll('goals');
    var required = [
      'first_name',
      'last_name',
      'email',
      'phone',
      'accredited',
      'investment_size',
      'prior_experience',
      'timeline',
      'wants_call'
    ];

    for (var i = 0; i < required.length; i += 1) {
      if (!formData.get(required[i])) {
        errorEl.textContent = 'Please complete every question before submitting.';
        errorEl.hidden = false;
        return;
      }
    }

    if (goals.length === 0) {
      errorEl.textContent = 'Please select at least one investment goal.';
      errorEl.hidden = false;
      return;
    }

    var firstName = String(formData.get('first_name')).trim();
    var lastName = String(formData.get('last_name')).trim();
    var accredited = formData.get('accredited') === 'YES';

    subjectInput.value = 'WRI Permian 1 Materials Request: ' + firstName + ' ' + lastName;
    autoresponseInput.value = accredited ? accreditedMessage(firstName) : declinedMessage(firstName);
    nextInput.value = accredited ? MATERIALS_URL : DECLINED_URL;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    // FormSubmit's autoresponse works only through a standard form submission,
    // not through AJAX. Native submit avoids rerunning this handler.
    HTMLFormElement.prototype.submit.call(form);
  });
})();
