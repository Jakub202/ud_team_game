// Visual smoke test: drives a main screen + one crew laptop in headless Chromium and saves screenshots.
// Usage: node scripts/shots.mjs [baseUrl]   (server must be running)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3100';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const watch = (page, name) => {
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] console: ${m.text()}`));
};
const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', name);
};
const setSlider = (page, label, value) =>
  page.evaluate(
    ([label, value]) => {
      for (const row of document.querySelectorAll('.set-row')) {
        if (row.querySelector('span')?.textContent === label) {
          const input = row.querySelector('input[type=range]');
          input.value = String(value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
      }
      return false;
    },
    [label, value],
  );

const screenCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const screen = await screenCtx.newPage();
watch(screen, 'screen');
await screen.goto(BASE);
await shot(screen, '01-landing');
await screen.getByText('Create a new voyage').click();
await screen.waitForSelector('.code span');
const code = (await screen.locator('.code').innerText()).replace(/\s/g, '');
console.log('room', code);

const crewCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const crew = await crewCtx.newPage();
watch(crew, 'crew');
await crew.goto(`${BASE}/#${code}`);
await crew.fill('input[placeholder="Your name"]', 'Jakub');
await crew.getByText('Come aboard').click();
await crew.waitForSelector('.welcome');

for (let i = 0; i < 4; i++) await screen.getByText('Add test bot').click();
await screen.waitForTimeout(400);
await shot(screen, '02-screen-lobby');
await shot(crew, '03-crew-lobby');

// Give every station to the human so we can see all six minigames in training.
const selects = screen.locator('.assign-row select');
const n = await selects.count();
for (let i = 0; i < n; i++) {
  const sel = screen.locator('.assign-row select').nth(i);
  const value = await sel.locator('option', { hasText: 'Jakub' }).getAttribute('value');
  await sel.selectOption(value);
  await screen.waitForTimeout(150);
}
await setSlider(screen, 'First sickness after', 20);
await setSlider(screen, 'Seasickness every', 60);
await setSlider(screen, 'Storm every', 60);
await screen.waitForTimeout(400);
await screen.getByText('Start training').click();
await crew.waitForSelector('.rules');
await shot(screen, '04-screen-training');

const tabs = crew.locator('.tab');
const tabCount = await tabs.count();
for (let i = 0; i < tabCount; i++) {
  await crew.locator('.tab').nth(i).dispatchEvent('pointerdown');
  await crew.waitForTimeout(300);
  const name = (await crew.locator('.station-panel.active h2').innerText()).toLowerCase().replace(/\s+/g, '-');
  await shot(crew, `05-train-${i}-${name}`);
}
// Make a deliberate mistake on the helm so we can see the training hint.
await crew.locator('.tab').nth(0).dispatchEvent('pointerdown');
await crew.waitForTimeout(200);
await crew.locator('.station-panel.active .btn', { hasText: '⟳ Starboard' }).click();
await crew.locator('.station-panel.active .btn', { hasText: '⟳ Starboard' }).click();
await crew.locator('.station-panel.active .btn', { hasText: '⟳ Starboard' }).click();
await crew.locator('.station-panel.active .btn', { hasText: '⟳ Starboard' }).click();
await crew.locator('.station-panel.active .btn', { hasText: '⟳ Starboard' }).click();
await crew.locator('.station-panel.active .btn', { hasText: '⟳ Starboard' }).click();
await crew.locator('.station-panel.active .btn', { hasText: '⟳ Starboard' }).click();
await crew.locator('.station-panel.active .btn', { hasText: 'Set course' }).click();
await shot(crew, '06-train-hint');

// Hand stations back to the bots so the voyage is realistic, then sail.
await screen.getByText('Set sail now').click();
await crew.waitForTimeout(3000);
await shot(screen, '07-screen-voyage');
await shot(crew, '08-crew-voyage');

// Wait for the first seasickness (20s in).
await screen.waitForSelector('.banner.on', { timeout: 40000 });
await shot(screen, '09-screen-sick');
await shot(crew, '10-crew-during-sickness');

// Wait for a storm.
await screen.waitForFunction(() => document.querySelector('.meters .chip.storm'), null, { timeout: 90000 });
await screen.waitForTimeout(5000);
await shot(screen, '11-screen-storm');
await shot(crew, '12-crew-storm');

await screen.locator('button[title="End voyage"]').evaluate((b) => {
  window.confirm = () => true;
  b.click();
});
await screen.waitForSelector('.debrief');
await shot(screen, '13-screen-debrief');
await shot(crew, '14-crew-debrief');

console.log(errors.length ? `\nErrors:\n${errors.join('\n')}` : '\nNo page errors');
await browser.close();
