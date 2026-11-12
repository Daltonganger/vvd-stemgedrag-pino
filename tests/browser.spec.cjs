const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('kaartdetail', 'licht'); } catch {}
    window.__pageErrors = [];
    window.addEventListener('error', (e) => window.__pageErrors.push(e.message));
  });
  await page.goto('/');
  await expect(page.locator('#tabel tbody tr')).toHaveCount(58);
});

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.__pageErrors)).toEqual([]);
});

test('HTTP gebruikt de juiste SRI-hashes voor alle drie lokale libraries', async ({ page }) => {
  const crypto = require('node:crypto');
  for (const file of ['leaflet.css', 'leaflet.js', 'chart.umd.min.js']) {
    const content = await fs.readFile(path.resolve('vendor', file));
    const hash = 'sha384-' + crypto.createHash('sha384').update(content).digest('base64');
    const selector = file.endsWith('.css') ? `link[href="vendor/${file}"]` : `script[src="vendor/${file}"]`;
    await expect(page.locator(selector)).toHaveAttribute('integrity', hash);
    await expect(page.locator(selector)).toHaveAttribute('crossorigin', 'anonymous');
  }
});

test('SRI blokkeert een aangepaste library via HTTP', async ({ browser }) => {
  const context = await browser.newContext();
  const target = await context.newPage();
  await target.route('**/vendor/leaflet.js', (route) => route.fulfill({
    contentType: 'text/javascript', body: 'window.tamperedVendorExecuted = true;',
  }));
  await target.goto('http://127.0.0.1:8765/');
  expect(await target.evaluate(() => typeof L)).toBe('undefined');
  expect(await target.evaluate(() => window.tamperedVendorExecuted)).toBeUndefined();
  await context.close();
});

test('alle 459 verkiezing/metric/weergave-combinaties en lege waarden renderen', async ({ page }) => {
  const result = await page.evaluate(() => {
    let checked = 0;
    for (const election of ELECTIONS) {
      huidige = election.id; vulPartijKeuze(); vulKandidaatKeuze();
      for (const option of document.querySelector('#sel-metric').options) {
        metric = option.value; document.querySelector('#sel-metric').value = metric;
        for (const mode of ['gebieden', 'kernen', 'stippen']) {
          weergave = mode; tekenKaart(); checked++;
          if (/Infinity|NaN/.test(document.querySelector('#legend').innerText)) throw Error('Ongeldige legenda');
        }
      }
      tekenSamenvatting(); tekenTabel(); tekenKernOverzicht(); tekenPositieOverzicht(); presVragen();
    }
    return checked;
  });
  expect(result).toBe(459);
});

test('PNG-download werkt voor vlakken, kernen en stippen en bevat gekleurde pixels', async ({ page }) => {
  for (const mode of ['gebieden', 'kernen', 'stippen']) {
    await page.locator(`button[data-w="${mode}"]`).click();
    const canvasResult = await page.evaluate(() => {
      const canvas = maakKaartPng();
      const pixels = canvas.getContext('2d').getImageData(40, 100, 1520, 850).data;
      let orange = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 180 && pixels[i + 1] < 180 && pixels[i + 2] < 130) orange++;
      return { width: canvas.width, height: canvas.height, orange };
    });
    expect(canvasResult.width).toBe(1600); expect(canvasResult.height).toBe(1100);
    expect(canvasResult.orange).toBeGreaterThan(500);
    const downloaded = page.waitForEvent('download');
    await page.locator('#btn-png').click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toContain(mode + '.png');
    const content = await fs.readFile(await download.path());
    expect(content.subarray(1, 4).toString()).toBe('PNG');
  }
});

test('kaartpatroon ligt bovenop de gekleurde vlakken', async ({ page }) => {
  await page.locator('#sel-metric').selectOption('afwijking');
  const result = await page.evaluate(() => {
    const base = gebiedVanSb.values().next().value.getElement();
    const overlay = document.querySelector('path.patroon-pos, path.patroon-neg');
    return { baseFill: getComputedStyle(base).fill, overlayFill: getComputedStyle(overlay).fill, interactive: overlay.classList.contains('leaflet-interactive') };
  });
  expect(result.baseFill).toMatch(/^rgb/);
  expect(result.overlayFill).toContain('url(');
  expect(result.interactive).toBe(false);
});

test('gedeelde partij- en kandidaatkeuze blijven na herladen behouden', async ({ page }) => {
  await page.locator('#sel-metric').selectOption('vspartij');
  await page.locator('#sel-partij').selectOption({ label: 'D66' });
  await page.reload(); await expect(page.locator('#sel-partij')).toHaveValue('D66');
  await page.locator('#sel-metric').selectOption('kandidaat');
  await page.locator('#sel-kandidaat').selectOption('2');
  await page.locator('#niveau-filter input[value="EP"]').uncheck();
  await page.reload();
  await expect(page.locator('#sel-kandidaat')).toHaveValue('2');
  await expect(page.locator('#niveau-filter input[value="EP"]')).not.toBeChecked();
  expect(new URL(page.url()).hash).toContain('kandidaat=2');
});

test('hashnavigatie en ongeldige metric veroorzaken geen verkeerde selectie of crash', async ({ page }) => {
  await page.evaluate(() => location.hash = 'v=TK2010&m=positie&w=stippen&sb=01');
  await expect(page.locator('#sel-verkiezing')).toHaveValue('TK2010');
  await expect(page.locator('#sel-metric')).toHaveValue('positie');
  await expect(page.locator('button[data-w="stippen"]')).toHaveClass(/actief/);
  await page.evaluate(() => location.hash = 'v=GR2026&m=%22%5D%5B%22');
  await expect(page.locator('#sel-verkiezing')).toHaveValue('GR2026');
  await expect(page.locator('#tabel tbody tr')).toHaveCount(58);
});

test('presentatie beschrijft werkelijke verliezen en negatieve lokale verschillen', async ({ page }) => {
  await page.locator('#sel-verkiezing').selectOption('EP2019');
  await page.locator('#btn-presentatie').click(); await page.locator('#pres-next').click();
  await expect(page.locator('#pres-slide')).toContainText('geen dalers');
  await page.keyboard.press('Escape');
  await page.locator('#sel-verkiezing').selectOption('GR2026');
  await page.locator('#btn-presentatie').click();
  await page.locator('#pres-next').click(); await page.locator('#pres-next').click();
  await expect(page.locator('#pres-slide')).toContainText('negatieve waarden zijn een achterstand');
  await expect(page.locator('#pres-slide')).not.toContainText('+-');
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#presentatie'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-presentatie')).toBeFocused();
});

test('positiekleur is onafhankelijk van de actieve kaartmaat', async ({ page }) => {
  const readColor = () => page.locator('#tabel tbody tr[data-sb="01"] td').last().evaluate((e) => e.style.backgroundColor);
  const initial = await readColor();
  await page.locator('#sel-metric').selectOption('afwijking');
  await page.locator('#tabel thead th').first().click();
  expect(await readColor()).toBe(initial);
  await expect(page.locator('#positie-body')).toContainText('dekking 65%');
  await expect(page.locator('#positie-body')).not.toContainText('verkiezingen samen');
});

test('oude verkiezingen tonen onbekende opkomst en volledige vaste kernindeling', async ({ page }) => {
  for (const election of ['EP2009', 'TK2010', 'TK2012']) {
    await page.locator('#sel-verkiezing').selectOption(election);
    await expect(page.locator('#summary-body')).toContainText('onbekend');
    await page.locator('button[data-w="kernen"]').click();
    expect(await page.evaluate(() => cellen().filter((c) => !kernVan(sbById.get(c.sb))).length)).toBe(0);
    await expect(page.locator('#kern-body')).toContainText('100.0%');
  }
});

test('dubbelklikken op index werkt offline met kaart, grafiek en export', async ({ page }) => {
  const remote = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await expect(page.locator('#tabel tbody tr')).toHaveCount(58);
  for (const file of ['leaflet.css', 'leaflet.js', 'chart.umd.min.js']) {
    const selector = file.endsWith('.css') ? `link[href="vendor/${file}"]` : `script[src="vendor/${file}"]`;
    await expect(page.locator(selector)).not.toHaveAttribute('integrity');
    await expect(page.locator(selector)).not.toHaveAttribute('crossorigin');
  }
  await page.locator('#tabel tbody tr[data-sb="01"]').click();
  expect(await page.evaluate(() => !!chart)).toBe(true);
  expect(await page.evaluate(() => maakKaartPng().toDataURL().startsWith('data:image/png'))).toBe(true);
  expect(remote).toEqual([]);
});

test('mobiel gebruikt de lichte kaart zonder pagina-overloop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem('kaartdetail'));
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.evaluate(() => document.querySelector('script[src*="basemap"]').src)).toContain('basemap.lite.js');
});
