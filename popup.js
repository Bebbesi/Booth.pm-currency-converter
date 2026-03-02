const currencySelect = document.getElementById('currency');
const customWrap = document.getElementById('customCurrencyWrap');
const customInput = document.getElementById('customCurrency');
const enabledToggle = document.getElementById('enabled');
const saveBtn = document.getElementById('saveBtn');
const rateInfo = document.getElementById('rateInfo');
const status = document.getElementById('status');

// Load saved settings
browser.storage.local.get(['currency', 'enabled', 'customCurrency']).then(settings => {
  const savedCurrency = settings.currency || 'EUR';
  const savedCustom = settings.customCurrency || '';
  enabledToggle.checked = settings.enabled !== false;

  // Find if it's in the list
  const opt = Array.from(currencySelect.options).find(o => o.value === savedCurrency);
  if (opt) {
    currencySelect.value = savedCurrency;
  } else {
    currencySelect.value = 'OTHER';
    customInput.value = savedCurrency;
    customWrap.classList.add('visible');
  }

  showRate(savedCurrency);
});

currencySelect.addEventListener('change', () => {
  const val = currencySelect.value;
  if (val === 'OTHER') {
    customWrap.classList.add('visible');
    rateInfo.textContent = '';
  } else {
    customWrap.classList.remove('visible');
    showRate(val);
  }
});

customInput.addEventListener('input', () => {
  const code = customInput.value.trim().toUpperCase();
  if (code.length >= 3) showRate(code);
});

async function showRate(currency) {
  rateInfo.textContent = 'Loading rate...';
  try {
    const resp = await browser.runtime.sendMessage({ type: 'GET_RATE', currency });
    if (resp.rate) {
      rateInfo.textContent = `1 JPY = ${resp.rate.toFixed(6)} ${currency}`;
    } else {
      rateInfo.textContent = 'Rate unavailable for this currency';
    }
  } catch(e) {
    rateInfo.textContent = 'Could not load rate';
  }
}

saveBtn.addEventListener('click', async () => {
  let currency = currencySelect.value;
  if (currency === 'OTHER') {
    currency = customInput.value.trim().toUpperCase();
    if (currency.length < 3) {
      status.style.color = '#c33';
      status.textContent = 'Enter a valid 3-letter currency code';
      return;
    }
  }

  await browser.storage.local.set({
    currency,
    enabled: enabledToggle.checked,
    customCurrency: currency,
  });

  // Notify the active tab to re-run
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    browser.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' }).catch(() => {});
  }

  status.style.color = '#3a3';
  status.textContent = 'Settings saved!';
  setTimeout(() => status.textContent = '', 2000);
});
