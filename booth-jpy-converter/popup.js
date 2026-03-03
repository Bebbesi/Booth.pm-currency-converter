const STORAGE_KEY_CURRENCY = 'preferredCurrency';
const STORAGE_KEY_RATE = 'cachedRate';
const STORAGE_KEY_RATE_TIME = 'cachedRateTime';
const STORAGE_KEY_ENABLED = 'conversionEnabled';

const currencySelect = document.getElementById('currencySelect');
const enabledToggle = document.getElementById('enabledToggle');
const rateText = document.getElementById('rateText');
const rateNote = document.getElementById('rateNote');
const statusDot = document.getElementById('statusDot');
const refreshBtn = document.getElementById('refreshBtn');

let currentCurrency = 'EUR';
let isEnabled = true;

async function loadSettings() {
  const data = await browser.storage.local.get([
    STORAGE_KEY_CURRENCY,
    STORAGE_KEY_RATE,
    STORAGE_KEY_RATE_TIME,
    STORAGE_KEY_ENABLED
  ]);

  currentCurrency = data[STORAGE_KEY_CURRENCY] || 'EUR';
  isEnabled = data[STORAGE_KEY_ENABLED] !== false;

  currencySelect.value = currentCurrency;
  enabledToggle.checked = isEnabled;

  const rate = data[STORAGE_KEY_RATE];
  const time = data[STORAGE_KEY_RATE_TIME];

  if (rate) {
    showRate(rate, time);
  } else {
    rateText.textContent = 'No rate cached yet';
    statusDot.className = 'status-dot error';
  }
}

function showRate(rate, timestamp) {
  const symbol = currencySelect.options[currencySelect.selectedIndex]?.text.split('–')[0].trim() || currentCurrency;
  rateText.innerHTML = `1 JPY = <span class="rate-value">${rate.toFixed(6)} ${currentCurrency}</span>`;
  statusDot.className = 'status-dot active';
  
  if (timestamp) {
    const ago = Math.round((Date.now() - timestamp) / 60000);
    rateNote.textContent = ago < 1 ? 'Updated just now' : `Updated ${ago}m ago`;
  }
}

async function applySettings(forceFetch = false) {
  const newCurrency = currencySelect.value;
  const newEnabled = enabledToggle.checked;

  const currencyChanged = newCurrency !== currentCurrency;
  currentCurrency = newCurrency;
  isEnabled = newEnabled;

  await browser.storage.local.set({
    [STORAGE_KEY_CURRENCY]: currentCurrency,
    [STORAGE_KEY_ENABLED]: isEnabled
  });

  if (currencyChanged || forceFetch) {
    // Clear cached rate when currency changes
    await browser.storage.local.remove([STORAGE_KEY_RATE, STORAGE_KEY_RATE_TIME]);
    rateText.textContent = 'Fetching rate...';
    statusDot.className = 'status-dot';
  }

  // Send message to active tab
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  for (const tab of tabs) {
    try {
      await browser.tabs.sendMessage(tab.id, {
        type: 'UPDATE_SETTINGS',
        currency: currentCurrency,
        enabled: isEnabled
      });
    } catch (e) {
      // Tab may not have content script
    }
  }

  // If currency changed, wait and reload rate display
  if (currencyChanged || forceFetch) {
    setTimeout(async () => {
      const data = await browser.storage.local.get([STORAGE_KEY_RATE, STORAGE_KEY_RATE_TIME]);
      if (data[STORAGE_KEY_RATE]) {
        showRate(data[STORAGE_KEY_RATE], data[STORAGE_KEY_RATE_TIME]);
      } else {
        rateText.textContent = 'Could not fetch rate';
        statusDot.className = 'status-dot error';
      }
    }, 2000);
  }
}

currencySelect.addEventListener('change', () => applySettings(true));
enabledToggle.addEventListener('change', () => applySettings(false));

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Refreshing...';
  await browser.storage.local.remove([STORAGE_KEY_RATE, STORAGE_KEY_RATE_TIME]);
  await applySettings(true);
  setTimeout(() => {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '↻ Refresh Rate';
  }, 2500);
});

loadSettings();
