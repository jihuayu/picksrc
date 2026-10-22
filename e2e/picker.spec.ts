import { test, expect } from '@playwright/test';
test('selects a Vue component by pointer and keyboard and restores its original callsite source', async ({ page }) => {
  const sourceMethods:string[]=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/__picksrc/source')sourceMethods.push(request.method());});
  await page.goto('/'); const target=page.getByRole('button',{name:'Save fixture'}); await target.hover(); await expect(page.locator('#selected')).toHaveText('button');
  const result=await page.evaluate(() => (window as any).picksrc.confirm());
  expect(result.component.framework).toBe('vue'); expect(result.component.callsite.role).toBe('component-callsite'); expect(result.component.callsite.precision).toBe('exact-range');
  expect(result.evidence[0].confidence).toBe('hint');
  expect(sourceMethods).toEqual([]);
  const unconfirmedRead=await page.evaluate(async()=>{const id=(window as any).picksrc.getSelected().getAttribute('data-picksrc-node');return (await fetch(`/__picksrc/source?node=${encodeURIComponent(id)}`)).status;});
  expect(unconfirmedRead).toBe(403);
  await page.locator('#confirm').click(); await expect(page.locator('#source')).toContainText('<SaveButton />');
  expect(sourceMethods).toContain('POST');
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#selected')).toHaveText('main');
});

test('picks through an open shadow root using its composed event path', async ({ page }) => {
  await page.goto('/');
  const selected = await page.evaluate(async () => {
    const { createPicker } = await import('/src/picker.ts');
    const host = document.createElement('div'); document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' }); const button = document.createElement('button'); button.textContent = 'shadow target'; shadow.append(button);
    const picker = createPicker({ root: document, scope: { projectId:'p',appScopeId:'shadow',buildId:'b',scopeGeneration:0,moduleGeneration:0 } });
    picker.start(); button.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,composed:true}));
    const result = picker.getSelected() === button; picker.stop(); host.remove(); return result;
  });
  expect(selected).toBe(true);
});

test('picks in a same-origin iframe when the host installs a picker in that document', async ({ page }) => {
  await page.goto('/');
  const selected = await page.evaluate(async () => {
    const { createPicker, createOverlay } = await import('/src/picker.ts');
    const frame = document.createElement('iframe'); frame.srcdoc = '<button id="target">iframe target</button>'; document.body.append(frame);
    await new Promise<void>(resolve => frame.addEventListener('load',() => resolve(),{once:true}));
    const target = frame.contentDocument!.querySelector('#target')!;
    const overlay=createOverlay(frame.contentDocument!);
    const picker = createPicker({ root: frame.contentDocument!, scope: { projectId:'p',appScopeId:'frame',buildId:'b',scopeGeneration:0,moduleGeneration:0 } },element=>overlay.render(element));
    picker.start(); target.dispatchEvent(new frame.contentWindow!.PointerEvent('pointermove',{bubbles:true,composed:true}));
    const rect=target.getBoundingClientRect(),box=frame.contentDocument!.querySelector<HTMLElement>('[data-picksrc-overlay]');
    const result = picker.getSelected() === target && box?.style.left===`${rect.left}px` && box?.style.top===`${rect.top}px`; picker.stop();overlay.destroy();frame.remove(); return result;
  });
  expect(selected).toBe(true);
});
