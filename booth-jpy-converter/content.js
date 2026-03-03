// Content script: finds all JPY prices on booth.pm and inserts converted amounts

const CONVERTED_ATTR = 'data-jpy-converted';

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function parseJPY(text) {
  const match = text.match(/([\d,]+)\s*JPY/);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ''), 10);
}

function convertElement(el, rate, currency) {
  if (el.getAttribute(CONVERTED_ATTR)) return;
  el.setAttribute(CONVERTED_ATTR, 'true');

  const text = el.textContent.trim();
  const jpy = parseJPY(text);
  if (!jpy || isNaN(jpy)) return;

  const converted = jpy * rate;
  const formatted = formatCurrency(converted, currency);

  const badge = document.createElement('div');
  badge.className = 'booth-jpy-converted';
  badge.style.cssText = [
    'font-size:0.85em',
    'color:#888',
    'margin-top:2px',
    'line-height:1.2',
    'font-weight:normal',
    'white-space:nowrap',
  ].join(';');
  badge.textContent = '\u2248 ' + formatted;

  if (el.nextSibling) {
    el.parentNode.insertBefore(badge, el.nextSibling);
  } else {
    el.parentNode.appendChild(badge);
  }
}

function findAndConvertPrices(rate, currency) {
  // Remove stale injected labels
  document.querySelectorAll('.booth-jpy-converted').forEach(el => el.remove());
  document.querySelectorAll('[' + CONVERTED_ATTR + ']').forEach(el => el.removeAttribute(CONVERTED_ATTR));

  // Known selectors
  const selectors = ['.variation-price', '.price', '.item-card__price'];
  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (el.textContent.includes('JPY')) convertElement(el, rate, currency);
    });
  });

  // Broad text-node scan for Tailwind-class prices
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return node.textContent.match(/[\d,]+\s*JPY/)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(node => {
    const parent = node.parentElement;
    if (!parent) return;
    if (
      parent.getAttribute(CONVERTED_ATTR) ||
      parent.classList.contains('booth-jpy-converted') ||
      ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT'].includes(parent.tagName)
    ) return;
    convertElement(parent, rate, currency);
  });
}

async function init() {
  const settings = await browser.storage.local.get(['currency', 'enabled']);
  const enabled = settings.enabled !== false;
  const currency = settings.currency || 'EUR';

  if (!enabled || currency === 'JPY') return;

  let rate = null;
  try {
    const resp = await browser.runtime.sendMessage({ type: 'GET_RATE', currency });
    rate = resp.rate;
  } catch(e) {}

  if (!rate) {
    console.warn('[Booth Converter] Could not get exchange rate for', currency);
    return;
  }

  findAndConvertPrices(rate, currency);

  const observer = new MutationObserver(() => findAndConvertPrices(rate, currency));
  observer.observe(document.body, { childList: true, subtree: true });
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'SETTINGS_UPDATED') {
    document.querySelectorAll('.booth-jpy-converted').forEach(el => el.remove());
    document.querySelectorAll('[' + CONVERTED_ATTR + ']').forEach(el => el.removeAttribute(CONVERTED_ATTR));
    init();
  }
});

init();
