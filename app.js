// Scroll-reveal animation for section content. Respects prefers-reduced-motion via CSS.
(function () {
  const revealEls = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || revealEls.length === 0) {
    revealEls.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
  );
  revealEls.forEach((el) => io.observe(el));
})();

// ============================== DECK REQUEST MODAL ==============================
(function () {
  var DECK_URL = './assets/WRI-Permian-1-Investor-Deck.pdf';

  var overlay = document.getElementById('deckModalOverlay');
  var closeBtn = document.getElementById('deckModalClose');
  var form = document.getElementById('deckForm');
  var errorEl = document.getElementById('deckFormError');
  var submitBtn = document.getElementById('deckSubmitBtn');

  var panelForm = document.getElementById('deckModalPanelForm');
  var panelAccredited = document.getElementById('deckModalPanelAccredited');
  var panelDeclined = document.getElementById('deckModalPanelDeclined');
  var downloadLink = document.getElementById('deckDownloadLink');

  if (!overlay || !form) return;

  var lastFocused = null;

  function showPanel(panel) {
    [panelForm, panelAccredited, panelDeclined].forEach(function (p) {
      if (p) p.hidden = p !== panel;
    });
  }

  function openModal() {
    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    showPanel(panelForm);
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
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) closeModal();
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorEl.hidden = true;

    var fd = new FormData(form);
    var goals = fd.getAll('goals');

    var requiredSingle = ['first_name', 'last_name', 'email', 'phone', 'accredited', 'investment_size', 'prior_experience', 'timeline', 'wants_call'];
    for (var i = 0; i < requiredSingle.length; i++) {
      if (!fd.get(requiredSingle[i])) {
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

    var payload = {
      first_name: fd.get('first_name'),
      last_name: fd.get('last_name'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      accredited: fd.get('accredited'),
      investment_size: fd.get('investment_size'),
      prior_experience: fd.get('prior_experience'),
      timeline: fd.get('timeline'),
      goals: goals,
      wants_call: fd.get('wants_call'),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    // Send email notification to Dalton with all form data
    var subject = 'Deck Request — WRI Permian 1 — ' + payload.first_name + ' ' + payload.last_name;
    var body = [
      'New deck request from the WRI Permian 1 landing page:',
      '',
      'Name: ' + payload.first_name + ' ' + payload.last_name,
      'Email: ' + payload.email,
      'Phone: ' + payload.phone,
      'Accredited Investor: ' + payload.accredited,
      'Typical Investment Size: ' + payload.investment_size,
      'Prior Oil & Gas Experience: ' + payload.prior_experience,
      'Investment Timeline: ' + payload.timeline,
      'Investment Goals: ' + payload.goals.join(', '),
      'Wants a Call: ' + payload.wants_call,
      '',
      '---',
      'Sent from wripermianone.github.io',
    ].join('\n');

    var mailto = 'mailto:info@warriorraceinvestments.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

    // Open email client with notification
    window.location.href = mailto;

    // After a short delay, show the appropriate panel
    setTimeout(function () {
      if (payload.accredited === 'YES') {
        // Update the download link to point to the actual PDF
        if (downloadLink) {
          downloadLink.href = DECK_URL;
          downloadLink.setAttribute('download', 'WRI-Permian-1-Investor-Deck.pdf');
          downloadLink.textContent = 'Download the Investment Deck';
        }
        showPanel(panelAccredited);
      } else {
        showPanel(panelDeclined);
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
    }, 800);
  });
})();
