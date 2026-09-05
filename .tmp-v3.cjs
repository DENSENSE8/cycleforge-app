const { chromium } = require('/home/michaelgarisek/Projects/cycleforge-app/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=${process.argv[2]}`] });
  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
    extraHTTPHeaders:{'x-tenant-slug':'usav'}, permissions:['camera'] });
  await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => {
    const el=document.createElement('style'); el.textContent='nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}'; document.head.appendChild(el); }); });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3050/m/signin', { waitUntil:'commit', timeout:90000 });
  await page.waitForTimeout(3000);
  await page.evaluate(async () => { await fetch('/api/auth/signin',{method:'POST',headers:{'Content-Type':'application/json','x-tenant-slug':'usav'},body:JSON.stringify({staffId:1,deviceKind:'personal',persistent:true})}); });
  await page.goto('http://localhost:3050/m/scan-out', { waitUntil:'commit', timeout:90000 });
  await page.waitForSelector('time', { timeout: 60000 });
  await page.waitForTimeout(11000);
  const t = await page.getByRole('button', { name: /Type the label instead/i }).boundingBox();
  const pill = await page.locator('[role="status"]').last().boundingBox();
  console.log('T button:', JSON.stringify({x:Math.round(t.x), y:Math.round(t.y), w:Math.round(t.width), h:Math.round(t.height)}));
  console.log('status pill:', JSON.stringify({x:Math.round(pill.x), y:Math.round(pill.y)}));
  console.log('same rail (y within 4px):', Math.abs((t.y+t.height/2) - (pill.y+pill.height/2)) < 20);
  const imgs = await page.evaluate(() => [...document.querySelectorAll('img')].map(i => i.getAttribute('src')).filter(Boolean).slice(0,4));
  console.log('row images:', JSON.stringify(imgs));
  const marks = await page.evaluate(() => document.querySelectorAll('[data-identity-mark], [class*="rounded-full"][style*="background"]').length);
  console.log('identity marks:', marks);
  await page.screenshot({ path: '/tmp/final-ux.png' });
  await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
