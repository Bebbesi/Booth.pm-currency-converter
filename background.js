const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

async function fetchExchangeRate(targetCurrency) {
  if (targetCurrency === 'JPY') return 1;

  const cacheKey = 'rate_' + targetCurrency;
  const cacheTimeKey = 'rate_time_' + targetCurrency;

  const result = await browser.storage.local.get([cacheKey, cacheTimeKey]);
  const now = Date.now();

  if (result[cacheKey] && result[cacheTimeKey] && (now - result[cacheTimeKey]) < CACHE_DURATION) {
    return result[cacheKey];
  }

  // Primary API
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/JPY');
    const data = await response.json();
    const rate = data.rates[targetCurrency];
    if (rate) {
      await browser.storage.local.set({ [cacheKey]: rate, [cacheTimeKey]: now });
      return rate;
    }
  } catch(e) {}

  // Fallback API
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/JPY');
    const data = await response.json();
    const rate = data.rates[targetCurrency];
    if (rate) {
      await browser.storage.local.set({ [cacheKey]: rate, [cacheTimeKey]: now });
      return rate;
    }
  } catch(e) {}

  return result[cacheKey] || null;
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'GET_RATE') {
    return fetchExchangeRate(message.currency).then(rate => ({ rate }));
  }
});
