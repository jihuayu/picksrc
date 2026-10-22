import { test, expect } from '@playwright/test';
test('selects DOM elements with pointer and keyboard and degrades without source metadata', async ({ page }) => {
  await page.goto('/'); await page.locator('#target').hover(); await expect(page.locator('#selected')).toHaveText('button');
  const result=await page.evaluate(() => (window as any).picksrc.confirm());
  expect(result.status).toBe('unavailable'); expect(result.requestedTarget.tagName).toBe('button');
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#selected')).toHaveText('main');
  const again=await page.evaluate(() => (window as any).picksrc.confirm()); expect(again.resolvedTarget.tagName).toBe('main');
});
