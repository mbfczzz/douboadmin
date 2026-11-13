import { test, expect } from "@playwright/test";
import { openCodes } from "./provider-code-fixture";

for (const width of [1440, 390]) {
  test(`share poster preview and PNG download at ${width}`, async ({ page }) => {
    await page.setViewportSize({width,height:1000});
    const { dialog } = await openCodes(page);
    const poster=dialog.locator('.share-poster');
    await expect(poster).toHaveAttribute('alt', /华东分公司.*分享卡片/);
    await expect.poll(()=>poster.evaluate((i:HTMLImageElement)=>i.naturalWidth)).toBe(720);
    expect(await poster.evaluate((i:HTMLImageElement)=>i.naturalHeight)).toBe(1060);
    expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
    await poster.screenshot({path:`../.runtime/invite-poster-${width}.png`});
    const downloadPromise=page.waitForEvent('download');
    await dialog.getByRole('link',{name:'下载分享卡片'}).click();
    const download=await downloadPromise;
    expect(download.suggestedFilename()).toContain('华东分公司');
    await download.saveAs(`../.runtime/invite-poster-export-${width}.png`);
  });
}
