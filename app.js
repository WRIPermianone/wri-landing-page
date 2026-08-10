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
  const API = 'port/8000'.startsWith('__') ? 'http://localhost:8000' : 'port/8000';

  const overlay = document.getElementById('deckModalOverlay');
  const closeBtn = document.getElementById('deckModalClose');
  const form = document.getElementById('deckForm');
  const errorEl = document.getElementById('deckFormError');
  const submitBtn = document.getElementById('deckSubmitBtn');

  const panelForm = document.getElementById('deckModalPanelForm');
  const panelAccredited = document.getElementById('deckModalPanelAccredited');
  const panelDeclined = document.getElementById('deckModalPanelDeclined');
  const downloadLink = document.getElementById('deckDownloadLink');

  if (!overlay || !form) return;

  let lastFocused = null;

  function showPanel(panel) {
    [panelForm, panelAccredited, panelDeclined].forEach((p) => {
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
    const first = form.querySelector('#df-first');
    if (first) first.focus();
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  document.querySelectorAll('[data-open-deck-modal]').forEach((btn) => {
    btn.addEventListener('click', openModal);
  });

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const fd = new FormData(form);
    const goals = fd.getAll('goals');

    const requiredSingle = ['first_name', 'last_name', 'email', 'phone', 'accredited', 'investment_size', 'prior_experience', 'timeline', 'wants_call'];
    for (const key of requiredSingle) {
      if (!fd.get(key)) {
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

    const payload = {
      first_name: fd.get('first_name'),
      last_name: fd.get('last_name'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      accredited: fd.get('accredited'),
      investment_size: fd.get('investment_size'),
      prior_experience: fd.get('prior_experience'),
      timeline: fd.get('timeline'),
      goals,
      wants_call: fd.get('wants_call'),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Opening your email…';

    // Compose a pre-filled email to Dalton with all form data
    const subject = `Deck Request — WRI Permian 1 — ${payload.first_name} ${payload.last_name}`;
    const body = [
      `New deck request from the WRI Permian 1 landing page:`,
      ``,
      `Name: ${payload.first_name} ${payload.last_name}`,
      `Email: ${payload.email}`,
      `Phone: ${payload.phone}`,
      `Accredited Investor: ${payload.accredited}`,
      `Typical Investment Size: ${payload.investment_size}`,
      `Prior Oil & Gas Experience: ${payload.prior_experience}`,
      `Investment Timeline: ${payload.timeline}`,
      `Investment Goals: ${payload.goals.join(', ')}`,
      `Wants a Call: ${payload.wants_call}`,
      ``,
      `---`,
      `Sent from warriorraceinvestments.com`,
    ].join('\n');

    const mailto = `mailto:info@warriorraceinvestments.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Open the user's email client with the pre-filled message
    window.location.href = mailto;

    // Show the appropriate panel based on accreditation answer
    setTimeout(() => {
      if (payload.accredited === 'YES') {
        showPanel(panelAccredited);
      } else {
        showPanel(panelDeclined);
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
    }, 800);
  });
})();
