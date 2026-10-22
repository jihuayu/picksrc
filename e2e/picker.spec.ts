import { test, expect } from '@playwright/test';
test('selects a Vue component by pointer and keyboard and restores its original callsite source', async ({ page }) => {
  await page.goto('/'); const target=page.getByRole('button',{name:'Save fixture'}); await target.hover(); await expect(page.locator('#selected')).toHaveText('button');
  const result=await page.evaluate(() => (window as any).picksrc.confirm());
  expect(result.component.framework).toBe('vue'); expect(result.component.callsite.role).toBe('component-callsite'); expect(result.component.callsite.precision).toBe('exact-range');
  expect(result.evidence[0].confidence).toBe('hint');
  await page.locator('#confirm').click(); await expect(page.locator('#source')).toContainText('<SaveButton />');
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#selected')).toHaveText('main');
});
