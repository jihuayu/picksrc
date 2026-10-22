import {test,expect} from '@playwright/test';
for(const framework of ['react','solid']) test(`${framework}: real render and exact original source on confirmation`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let requests=0;page.on('request',r=>{if(r.url().includes(`/__picksrc/${framework}/source`))requests++;});
 await page.goto(`/demo/${framework}/`);const target=page.locator('#target');await expect(target).toHaveAttribute('data-picksrc-node',/^[a-f0-9]{32}$/);await target.hover();expect(requests).toBe(0);await target.click();await expect(target).toContainText('save 1');await page.locator('#inspect').click();await expect(page.locator('#output')).toContainText('exact-range');
 const result=JSON.parse((await page.locator('#output').textContent())!);expect(result.source.record.position.role).toBe('element-declaration');expect(result.source.snippet.content).toContain('<button');expect(result.source.snippet.content).toContain('id="target"');expect(result.source.record.componentDefinition.role).toBe('component-definition');expect(result.runtime.component.framework).toBe(framework);expect(errors).toEqual([]);
});
