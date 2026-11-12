// Visual check of a realistic handover: 1 human + 4 bots, 5 stations, seasickness every minute.
// Captures the human either covering for a bot or being seasick themselves.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3100';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const page = async (w, h, name) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  return p;
};
const setSlider = (p, label, value) =>
  p.evaluate(([label, value]) => {
    for (const row of document.querySelectorAll('.set-row')) {
      if (row.querySelector('span')?.textContent === label) {
        const input = row.querySelector('input[type=range]');
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }, [label, value]);

const screen = await page(1600, 900, 'screen');
await screen.goto(BASE);
await screen.getByText('Create a new voyage').click();
await screen.waitForSelector('.code span');
const code = (await screen.locator('.code').innerText()).replace(/\s/g, '');
await screen.screenshot({ path: 'shots/20-lobby.png' });

const crew = await page(1440, 900, 'crew');
await crew.goto(`${BASE}/#${code}`);
await crew.fill('input[placeholder="Your name"]', 'Jakub');
await crew.getByText('Come aboard').click();
await crew.waitForSelector('.welcome');
for (let i = 0; i < 4; i++) await screen.getByText('Add test bot').click();
// Five stations so everyone has exactly one.
await screen.locator('.set-row', { hasText: 'Galley' }).locator('input').uncheck();
await setSlider(screen, 'First sickness after', 20);
await setSlider(screen, 'Seasickness every', 60);
await setSlider(screen, 'Sick for', 30);
await setSlider(screen, 'Training time', 30);
await screen.waitForTimeout(500);
await screen.screenshot({ path: 'shots/21-lobby-configured.png' });
await screen.getByText('Start training').click();
await crew.waitForSelector('.rules');
await crew.getByText("I'm ready, let's sail").dispatchEvent('pointerdown');
await crew.waitForSelector('.crew[data-phase="voyage"]', { timeout: 10000 });

const state = await crew.waitForFunction(
  () => (document.querySelector('.cover-banner.on') ? 'cover' : null),
  null,
  { timeout: 260000, polling: 500 },
);
const what = await state.jsonValue();
await crew.waitForTimeout(800);
await crew.screenshot({ path: `shots/22-crew-${what}.png` });
await screen.screenshot({ path: `shots/23-screen-${what}.png` });
console.log('captured', what);
console.log(errors.length ? errors.join('\n') : 'No page errors');
await browser.close();
