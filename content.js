// Content script: finds all JPY prices on booth.pm and inserts converted amounts

const CONVERTED_ATTR = 'data-jpy-converted';
let currentRate = null;
let currentCurrency = null;
let debounceTimer = null;

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return currency + ' ' + amount.toFixed(2);
  }
}

function parseJPY(text) {
  const match = text.match(/([\d,]+)\s*JPY/);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ''), 10);
}

// Convert a single element - fast, no DOM search
function convertElement(el) {
  if (el.getAttribute(CONVERTED_ATTR)) return;
  const text = el.textContent.trim();
  const jpy = parseJPY(text);
  if (!jpy || isNaN(jpy)) return;

  el.setAttribute(CONVERTED_ATTR, 'true');

  const badge = document.createElement('div');
  badge.className = 'booth-jpy-converted';
  badge.style.cssText = 'font-size:0.82em;color:#888;margin-top:2px;line-height:1.2;font-weight:normal;white-space:nowrap';
  badge.textContent = '\u2248 ' + formatCurrency(jpy * currentRate, currentCurrency);

  if (el.nextSibling) {
    el.parentNode.insertBefore(badge, el.nextSibling);
  } else {
    el.parentNode.appendChild(badge);
  }
}

// Scan only a subtree (used for new nodes), or the full body on init
function scanSubtree(root) {
  if (!currentRate) return;

  // Known selectors first (fast)
  root.querySelectorAll('.variation-price, .price, .item-card__price').forEach(el => {
    if (el.textContent.includes('JPY') && !el.getAttribute(CONVERTED_ATTR)) {
      convertElement(el);
    }
  });

  // Text node scan for Tailwind-style prices
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        // Skip already-converted parent, skip injected badges, skip non-visible tags
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.getAttribute(CONVERTED_ATTR)) return NodeFilter.FILTER_REJECT;
        if (p.classList.contains('booth-jpy-converted')) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT'].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        return node.textContent.match(/[\d,]+\s*JPY/)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => convertElement(node.parentElement));
}

// Full reset + rescan.
function fullRescan() {
  document.querySelectorAll('.booth-jpy-converted').forEach(el => el.remove());
  document.querySelectorAll('[' + CONVERTED_ATTR + ']').forEach(el => el.removeAttribute(CONVERTED_ATTR));
  scanSubtree(document.body);
}

// Debounced handler for MutationObserver - only process actually added nodes
function onMutations(mutations) {
  if (!currentRate) return;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    for (const mutation of mutations) {
      if (!mutation.addedNodes.length) continue;
      for (const node of mutation.addedNodes) {
        // Skip text nodes and our own injected badges
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.classList && node.classList.contains('booth-jpy-converted')) continue;
        // Only scan the newly added subtree, not the whole page
        scanSubtree(node);
      }
    }
  }, 300); // 300ms debounce - catches bursts of DOM changes as one operation
}

async function init() {
  const settings = await browser.storage.local.get(['currency', 'enabled']);
  const enabled = settings.enabled !== false;
  const currency = settings.currency || 'EUR';

  if (!enabled || currency === 'JPY') return;

  try {
    const resp = await browser.runtime.sendMessage({ type: 'GET_RATE', currency });
    if (!resp || !resp.rate) {
      console.warn('[Booth Converter] Could not get exchange rate for', currency);
      return;
    }
    currentRate = resp.rate;
    currentCurrency = currency;
  } catch(e) {
    console.warn('[Booth Converter] Error fetching rate', e);
    return;
  }

  fullRescan();

  // Watch for new content only - childList on body subtree, but debounced
  const observer = new MutationObserver(onMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    // Do NOT observe attributes or characterData - those fire constantly
  });
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'SETTINGS_UPDATED') {
    currentRate = null;
    currentCurrency = null;
    init();
  }
});

init();
