import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface ViewAuditResult {
  view: string;
  switchMs: number;
  screenshotMs: number;
  horizontalOverflowPx: number;
  clippedButtons: number;
  wrappedNavItems: number;
  stuckCalibrating: boolean;
  singularGateText: boolean;
  emptyMainPane: boolean;
  lowContrastTextCount: number;
  canvasMoved: boolean | null;
  backdropBlur2xlCount: number;
}

interface UiUphillReport {
  label: string;
  totalScore: number;
  maxScore: number;
  breakdown: {
    layoutIntegrity_25: number;
    paintAndLatency_20: number;
    statusAndCopy_15: number;
    liveMotionAndReduced_20: number;
    mobileAndOverlayFidelity_15: number;
    zeroConsoleErrors_5: number;
  };
  details: {
    desktopViews: ViewAuditResult[];
    studioOpenMs: number;
    studioScreenshotMs: number;
    studioBackdropBlur2xlCount: number;
    modalOpenOk: boolean;
    mobile: {
      horizontalOverflowPx: number;
      singularGateText: boolean;
      truncatedSessionId: boolean;
      stuckCalibrating: boolean;
      portraitRendered: boolean;
    };
    reducedMotionFreeze: boolean | null;
    consoleErrors: string[];
    pageErrors: string[];
  };
  screenshotsDir: string | null;
}

const SESSION = `ui-eval-${process.pid}`;
const URL = process.env.EVAL_URL || 'http://localhost:3000';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function runPw(args: string[], timeoutMs = 45000): string {
  const res = spawnSync('playwright-cli', [`-s=${SESSION}`, ...args], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`playwright-cli ${args.join(' ')} failed (${res.status}): ${res.stderr || res.stdout}`);
  }
  return res.stdout || '';
}

function closePw(): void {
  try {
    execFileSync('playwright-cli', [`-s=${SESSION}`, 'close'], {
      stdio: 'ignore',
      timeout: 5000,
    });
  } catch {
    // ignore close error
  }
}

function extractResultJson(output: string): unknown {
  const marker = '### Result\n';
  const idx = output.indexOf(marker);
  if (idx === -1) {
    // fallback: find last JSON object/array in output
    const match = output.match(/(\{[\s\S]*\}|\[[\s\S]*\])\s*$/);
    if (!match) throw new Error(`Unable to parse playwright-cli result: ${output.slice(0, 400)}`);
    return JSON.parse(match[1]);
  }
  const rest = output.slice(idx + marker.length);
  const nextSection = rest.indexOf('\n### ');
  const raw = (nextSection === -1 ? rest : rest.slice(0, nextSection)).trim();
  return JSON.parse(raw);
}

function runAudit(captureDir: string | null, prefix = ''): UiUphillReport['details'] {
  if (captureDir) {
    fs.mkdirSync(captureDir, { recursive: true });
  }

  runPw(['open', '--browser=chromium', URL], 30000);
  runPw(['resize', '1440', '900'], 15000);

  // Dismiss first-run onboarding modal if present & wait for portrait assets ready
  runPw(
    [
      'run-code',
      `async (page) => {
        await page.waitForSelector('[data-testid="home-character-overview"]', { timeout: 15000 });
        const skipBtn = page.getByRole('button', { name: 'Skip', exact: true });
        if (await skipBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
          await skipBtn.click({ force: true });
          await page.waitForTimeout(220);
        }
        await page.waitForFunction(() => {
          const canvases = Array.from(document.querySelectorAll('[data-testid="ascii-portrait-canvas"]'));
          return canvases.some((c) => {
            const r = c.getBoundingClientRect();
            return r.width > 10 && c.getAttribute('data-portrait-status') === 'ready';
          });
        }, { timeout: 12000 });
      }`,
    ],
    25000
  );

  // Audit helper executed cleanly inside single run-code steps per view so timeouts stay crisp
  const viewConfigs: Array<{ id: string; clickCode: string; waitSel: string; shotName: string }> = [
    {
      id: 'Home',
      clickCode: `await page.getByRole('button', { name: 'Home', exact: true }).click({ force: true, timeout: 8000 });`,
      waitSel: '[data-testid="home-character-overview"]',
      shotName: 'home.png',
    },
    {
      id: 'Canvas',
      clickCode: `await page.getByRole('button', { name: 'Canvas', exact: true }).click({ force: true, timeout: 8000 });`,
      waitSel: '[data-testid="braille-sessions-canvas"]',
      shotName: 'canvas.png',
    },
    {
      id: 'Thread',
      clickCode: `await page.getByRole('button', { name: 'Thread', exact: true }).click({ force: true, timeout: 8000 });`,
      waitSel: '[data-testid="active-hermes-session-id"]',
      shotName: 'thread.png',
    },
    {
      id: 'Queue',
      clickCode: `await page.getByRole('button', { name: /^Queue/ }).first().click({ force: true, timeout: 8000 });`,
      waitSel: '[data-testid="hermes-operations-panel"]',
      shotName: 'queue.png',
    },
    {
      id: 'CLI',
      clickCode: `await page.getByRole('button', { name: 'CLI', exact: true }).click({ force: true, timeout: 8000 });`,
      waitSel: '[data-testid="terminal-stream"]',
      shotName: 'cli.png',
    },
  ];

  const desktopViews: ViewAuditResult[] = [];

  for (const cfg of viewConfigs) {
    const shotPath = captureDir ? path.join(captureDir, `${prefix}${cfg.shotName}`) : `.playwright-cli/ui-eval-${cfg.shotName}`;
    const out = runPw(
      [
        'run-code',
        `async (page) => {
          const t0 = Date.now();
          ${cfg.clickCode}
          await page.waitForSelector('${cfg.waitSel}', { timeout: 10000 });
          await page.waitForTimeout(260);
          const switchMs = Date.now() - t0;

          // Measure canvas frame pixel delta across two animation ticks on visible center canvas region
          const canvasMoved = await page.evaluate(async () => {
            const canvases = Array.from(document.querySelectorAll('canvas'));
            const target = canvases.find((c) => {
              const r = c.getBoundingClientRect();
              return r.width > 80 && r.height > 80;
            });
            if (!target) return null;
            const snap = (c) => {
              try {
                const ctx = c.getContext('2d');
                if (!ctx) return '';
                const w = Math.min(c.width, 96);
                const h = Math.min(c.height, 96);
                const sx = Math.max(0, Math.floor((c.width - w) / 2));
                const sy = Math.max(0, Math.floor((c.height - h) / 2));
                const d = ctx.getImageData(sx, sy, w, h).data;
                let acc = 0;
                for (let i = 0; i < d.length; i += 4) acc = (acc * 31 + d[i] + d[i+1] + d[i+2] + d[i+3]) | 0;
                return String(acc);
              } catch { return ''; }
            };
            const s1 = snap(target);
            await new Promise((r) => setTimeout(r, 280));
            const s2 = snap(target);
            return s1 !== '' && s1 !== s2;
          });

          const audit = await page.evaluate(() => {
            const overflow = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
            let clippedButtons = 0;
            let wrappedNavItems = 0;
            for (const btn of Array.from(document.querySelectorAll('button'))) {
              const r = btn.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              if (r.height > 120) continue;
              if (btn.scrollWidth > btn.clientWidth + 4) clippedButtons++;
              if (btn.textContent && ['Home','Canvas','Thread','CLI'].includes(btn.textContent.trim())) {
                if (r.height > 44) wrappedNavItems++;
              }
            }
            const bodyText = document.body.innerText || '';
            const stuckCalibrating = bodyText.includes('Calibrating');
            const singularGateText = /\\b[2-9]\\s+gate\\b/.test(bodyText);

            const stage = document.querySelector('main') || document.body;
            const emptyMainPane = (stage.innerText || '').trim().length < 20;

            let blur2xlCount = 0;
            for (const el of Array.from(document.querySelectorAll('*'))) {
              const cls = typeof el.className === 'string' ? el.className : '';
              if (cls.includes('backdrop-blur-2xl')) blur2xlCount++;
            }

            return { overflow, clippedButtons, wrappedNavItems, stuckCalibrating, singularGateText, emptyMainPane, blur2xlCount };
          });

          const s0 = Date.now();
          let screenshotMs = 15000;
          try {
            await page.screenshot({ path: '${shotPath}', timeout: 14000 });
            screenshotMs = Date.now() - s0;
          } catch {
            screenshotMs = 15000;
          }

          return {
            view: '${cfg.id}',
            switchMs: Number(switchMs.toFixed(1)),
            screenshotMs: Number(screenshotMs.toFixed(1)),
            horizontalOverflowPx: audit.overflow,
            clippedButtons: audit.clippedButtons,
            wrappedNavItems: audit.wrappedNavItems,
            stuckCalibrating: audit.stuckCalibrating,
            singularGateText: audit.singularGateText,
            emptyMainPane: audit.emptyMainPane,
            lowContrastTextCount: 0,
            canvasMoved,
            backdropBlur2xlCount: audit.blur2xlCount,
          };
        }`,
      ],
      60000
    );

    const parsed = extractResultJson(out) as ViewAuditResult;
    desktopViews.push(parsed);
  }

  // Test UI Customizer Studio drawer opening & screenshot latency (was timing out at 15s before)
  const studioShot = captureDir ? path.join(captureDir, `${prefix}studio.png`) : `.playwright-cli/ui-eval-studio.png`;
  const studioOut = runPw(
    [
      'run-code',
      `async (page) => {
        await page.getByRole('button', { name: 'Home', exact: true }).click({ force: true, timeout: 8000 });
        await page.waitForSelector('[data-testid="home-character-overview"]', { timeout: 8000 });
        const t0 = Date.now();
        await page.getByTestId('ui-studio-trigger').first().click({ force: true, timeout: 8000 });
        await page.waitForSelector('[data-testid="ui-studio-drawer"]', { timeout: 8000 });
        await page.waitForTimeout(240);
        const studioOpenMs = Date.now() - t0;

        const studioBackdropBlur2xlCount = await page.evaluate(() => {
          let count = 0;
          for (const el of Array.from(document.querySelectorAll('*'))) {
            const cls = typeof el.className === 'string' ? el.className : '';
            if (cls.includes('backdrop-blur-2xl')) count++;
          }
          return count;
        });

        const s0 = Date.now();
        let studioScreenshotMs = 15000;
        try {
          await page.screenshot({ path: '${studioShot}', timeout: 14000 });
          studioScreenshotMs = Date.now() - s0;
        } catch {
          studioScreenshotMs = 15000;
        }

        // Switch to Stage tab where "Calm / reduced motion" lives & verify reduced-motion parity
        let reducedMotionFreeze = null;
        try {
          const stageTab = page.getByTestId('studio-tab-stage');
          if (await stageTab.isVisible()) {
            await stageTab.click({ force: true, timeout: 6000 });
            await page.waitForTimeout(140);
          }
          const reducedBtn = page.getByRole('switch', { name: /Calm \\/ reduced motion/i }).first();
          if (await reducedBtn.isVisible()) {
            await reducedBtn.click({ force: true, timeout: 6000 });
            await page.waitForTimeout(160);
            reducedMotionFreeze = await page.evaluate(() => {
              return document.documentElement.getAttribute('data-ui-motion') === 'reduced';
            });
            // Revert to normal so subsequent tests see standard motion
            await reducedBtn.click({ force: true, timeout: 6000 });
          }
        } catch {
          reducedMotionFreeze = null;
        }

        await page.getByTestId('ui-studio-close').click({ force: true, timeout: 6000 });
        return {
          studioOpenMs: Number(studioOpenMs.toFixed(1)),
          studioScreenshotMs: Number(studioScreenshotMs.toFixed(1)),
          studioBackdropBlur2xlCount,
          reducedMotionFreeze,
        };
      }`,
    ],
    45000
  );
  const studioRes = extractResultJson(studioOut) as {
    studioOpenMs: number;
    studioScreenshotMs: number;
    studioBackdropBlur2xlCount: number;
    reducedMotionFreeze: boolean | null;
  };

  // Test Canvas Add Session Modal open/close cleanly
  const modalOut = runPw(
    [
      'run-code',
      `async (page) => {
        await page.getByRole('button', { name: 'Canvas', exact: true }).click({ force: true, timeout: 8000 });
        await page.waitForSelector('[data-testid="braille-sessions-canvas"]', { timeout: 8000 });
        const addBtn = page.getByTestId('canvas-add-button').first();
        if (!(await addBtn.isVisible())) return false;
        await addBtn.click({ force: true, timeout: 8000 });
        await page.waitForSelector('#add-braille-session-title', { timeout: 8000 });
        await page.waitForTimeout(180);
        const visible = await page.locator('#add-braille-session-title').isVisible();
        const closeBtn = page.getByRole('button', { name: 'Close add session dialog' });
        await closeBtn.click({ force: true, timeout: 6000 });
        return visible;
      }`,
    ],
    45000
  );
  const modalOpenOk = Boolean(extractResultJson(modalOut));

  // Return to desktop Home first before mobile resize so Canvas loops unmount cleanly
  runPw(
    [
      'run-code',
      `async (page) => {
        await page.getByRole('button', { name: 'Home', exact: true }).click({ force: true, timeout: 8000 });
        await page.waitForSelector('[data-testid="home-character-overview"]', { timeout: 8000 });
      }`,
    ],
    25000
  );

  // Mobile 390x844 Home audit
  runPw(['resize', '390', '844'], 15000);
  const mobileShot = captureDir ? path.join(captureDir, `${prefix}mobile.png`) : `.playwright-cli/ui-eval-mobile.png`;
  const mobileOut = runPw(
    [
      'run-code',
      `async (page) => {
        await page.waitForTimeout(320);
        const audit = await page.evaluate(() => {
          const overflow = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
          const bodyText = document.body.innerText || '';
          const singularGateText = /\\b[2-9]\\s+gate\\b/.test(bodyText);
          const stuckCalibrating = bodyText.includes('Calibrating');

          const sessionIdNodes = Array.from(document.querySelectorAll('*')).filter(
            (el) => el.childElementCount === 0 && (el.textContent || '').includes('hermes-general')
          );
          const truncatedSessionId = sessionIdNodes.some((el) => el.scrollWidth > el.clientWidth + 2);

          const readyCanvas = Array.from(document.querySelectorAll('[data-testid="ascii-portrait-canvas"]')).some((c) => {
            const r = c.getBoundingClientRect();
            return r.width > 100 && c.getAttribute('data-portrait-status') === 'ready';
          });

          return { overflow, singularGateText, truncatedSessionId, stuckCalibrating, portraitRendered: readyCanvas };
        });
        try {
          await page.screenshot({ path: '${mobileShot}', timeout: 14000 });
        } catch {}
        return audit;
      }`,
    ],
    45000
  );
  const mobileRes = extractResultJson(mobileOut) as UiUphillReport['details']['mobile'] & {
    overflow: number;
  };

  // Console error check (ignore Playwright CLI summary lines like "Total messages: ..." / "Returning 0 messages...")
  const consoleOut = runPw(['console', 'error'], 10000);
  const errorLines = consoleOut
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !l.startsWith('###') &&
        !l.startsWith('Total messages:') &&
        !/^Returning \d+ messages/.test(l) &&
        !l.includes('favicon.ico') &&
        !l.includes('[vite]')
    );

  return {
    desktopViews,
    studioOpenMs: studioRes.studioOpenMs,
    studioScreenshotMs: studioRes.studioScreenshotMs,
    studioBackdropBlur2xlCount: studioRes.studioBackdropBlur2xlCount,
    modalOpenOk,
    mobile: {
      horizontalOverflowPx: mobileRes.overflow ?? 0,
      singularGateText: mobileRes.singularGateText,
      truncatedSessionId: mobileRes.truncatedSessionId,
      stuckCalibrating: mobileRes.stuckCalibrating,
      portraitRendered: mobileRes.portraitRendered,
    },
    reducedMotionFreeze: studioRes.reducedMotionFreeze,
    consoleErrors: errorLines,
    pageErrors: [],
  };
}

function scoreUiReport(details: UiUphillReport['details']): UiUphillReport['breakdown'] {
  const views = details.desktopViews;
  const maxOverflow = Math.max(0, ...views.map((v) => v.horizontalOverflowPx), details.mobile.horizontalOverflowPx);
  const totalClipped = views.reduce((a, v) => a + v.clippedButtons + v.wrappedNavItems, 0);
  const emptyCount = views.filter((v) => v.emptyMainPane).length;
  const layoutIntegrity_25 = Number(
    clamp(
      25 - Math.min(12, maxOverflow * 0.5) - Math.min(8, totalClipped * 2.5) - emptyCount * 6,
      0,
      25
    ).toFixed(2)
  );

  const avgSwitchMs = views.reduce((a, v) => a + v.switchMs, 0) / Math.max(1, views.length);
  const maxShotMs = Math.max(...views.map((v) => v.screenshotMs), details.studioScreenshotMs);
  const switchScore = clamp01((900 - avgSwitchMs) / (900 - 300)) * 10;
  const shotScore = clamp01((10000 - maxShotMs) / (10000 - 1500)) * 10;
  const paintAndLatency_20 = Number(clamp(switchScore + shotScore, 0, 20).toFixed(2));

  const calibratingHits = views.filter((v) => v.stuckCalibrating).length + (details.mobile.stuckCalibrating ? 1 : 0);
  const singularHits = views.filter((v) => v.singularGateText).length + (details.mobile.singularGateText ? 1 : 0);
  const statusAndCopy_15 = Number(
    clamp(15 - calibratingHits * 3.5 - singularHits * 3.5, 0, 15).toFixed(2)
  );

  const canvasViews = views.filter((v) => v.canvasMoved !== null);
  const movingRatio =
    canvasViews.length > 0
      ? canvasViews.filter((v) => v.canvasMoved === true).length / canvasViews.length
      : 1;
  const heavyBlurPenalty = Math.min(
    6,
    (details.studioBackdropBlur2xlCount + views.reduce((a, v) => a + v.backdropBlur2xlCount, 0)) * 3
  );
  const reducedBonus = details.reducedMotionFreeze === true ? 4 : 0;
  const liveMotionAndReduced_20 = Number(
    clamp(movingRatio * 16 + reducedBonus - heavyBlurPenalty, 0, 20).toFixed(2)
  );

  const studioOk = details.studioScreenshotMs < 8000 ? 6 : 0;
  const modalOk = details.modalOpenOk ? 3 : 0;
  const mobileClean =
    (details.mobile.horizontalOverflowPx === 0 ? 2 : 0) +
    (!details.mobile.truncatedSessionId ? 2 : 0) +
    (details.mobile.portraitRendered ? 2 : 0);
  const mobileAndOverlayFidelity_15 = Number(clamp(studioOk + modalOk + mobileClean, 0, 15).toFixed(2));

  const errCount = details.consoleErrors.length + details.pageErrors.length;
  const zeroConsoleErrors_5 = errCount === 0 ? 5 : Number(Math.max(0, 5 - errCount * 2).toFixed(2));

  return {
    layoutIntegrity_25,
    paintAndLatency_20,
    statusAndCopy_15,
    liveMotionAndReduced_20,
    mobileAndOverlayFidelity_15,
    zeroConsoleErrors_5,
  };
}

function main() {
  const args = process.argv.slice(2);
  let label = 'gen';
  let baselinePath: string | null = null;
  let captureDir: string | null = null;
  let prefix = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--label' && args[i + 1]) label = args[++i];
    else if (args[i] === '--baseline' && args[i + 1]) baselinePath = args[++i];
    else if (args[i] === '--capture-dir' && args[i + 1]) captureDir = args[++i];
    else if (args[i] === '--prefix' && args[i + 1]) prefix = args[++i];
  }

  let details: UiUphillReport['details'];
  try {
    details = runAudit(captureDir, prefix);
  } finally {
    closePw();
  }

  const breakdown = scoreUiReport(details);
  const totalScore = Number(
    Object.values(breakdown)
      .reduce((a, b) => a + b, 0)
      .toFixed(2)
  );

  const repoRoot = process.cwd();
  const dataDir = path.join(repoRoot, 'blueprint-out', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, `ui-uphill-${label}.json`);

  const report: UiUphillReport = {
    label,
    totalScore,
    maxScore: 100,
    breakdown,
    details,
    screenshotsDir: captureDir,
  };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  let comparison: Record<string, unknown> | null = null;
  if (baselinePath && fs.existsSync(baselinePath)) {
    const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as UiUphillReport;
    const deltaTotal = Number((totalScore - base.totalScore).toFixed(2));
    comparison = {
      baseline: base.label,
      baseScore: base.totalScore,
      deltaTotal,
      verdict: deltaTotal > 0.25 ? `UPHILL (+${deltaTotal}) -> KEEP` : `FLAT/REGRESSION (${deltaTotal}) -> REVERT`,
    };
  }

  console.log(JSON.stringify({ reportPath: outPath, totalScore, breakdown, comparison, details }, null, 2));
}

main();
