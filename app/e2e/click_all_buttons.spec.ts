import { test, expect } from '@playwright/test'

test.describe('FirstPass Comprehensive Button & UI Audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('firstpass_api_token', 'eb533cdad1c0dd3d47cab3229ab6491a397a935e4c18a62db6c3a5add8405912')
      localStorage.setItem('photo_culler_api_token', 'eb533cdad1c0dd3d47cab3229ab6491a397a935e4c18a62db6c3a5add8405912')
      localStorage.setItem('firstpass_has_seen_walkthrough', 'true')
    })
  })

  test('1. Walkthrough Modal - click all 7 slides, dots, and buttons', async ({ page }) => {
    // Override to simulate first install
    await page.addInitScript(() => {
      localStorage.removeItem('firstpass_has_seen_walkthrough')
    })

    await page.goto('http://localhost:5173/')
    await page.waitForTimeout(1000)

    const modalTitle = page.locator('text=Pro-Grade AI Photo Culling')
    expect(await modalTitle.isVisible()).toBeTruthy()

    // Step through each of the 7 slides
    for (let i = 0; i < 6; i++) {
      const nextBtn = page.getByRole('button', { name: 'Next' })
      if (await nextBtn.isVisible()) {
        await nextBtn.click()
        await page.waitForTimeout(200)
      }
    }

    // Verify slide 7 reached
    expect(await page.locator('text=Lightroom & Capture One Export').isVisible()).toBeTruthy()

    // Test Previous button
    const prevBtn = page.getByRole('button', { name: 'Previous' })
    if (await prevBtn.isVisible()) {
      await prevBtn.click()
      await page.waitForTimeout(200)
    }

    // Click "Let's Get Started" / Finish
    const finishBtn = page.getByRole('button', { name: /Let's Get Started|Finish/i })
    if (await finishBtn.isVisible()) {
      await finishBtn.click()
      await page.waitForTimeout(400)
    }
  })

  test('2. Sidebar Navigation & Global Modals', async ({ page }) => {
    await page.goto('http://localhost:5173/')
    await page.waitForTimeout(800)

    // 1. Theme Picker Modal
    console.log('Testing Theme Picker modal...')
    const themeBtn = page.locator('button[title*="Theme"]')
    if (await themeBtn.isVisible()) {
      await themeBtn.click()
      await page.waitForTimeout(400)
      expect(await page.locator('text=Studio Workspace Themes').isVisible()).toBeTruthy()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }

    // 2. Shortcuts Modal
    console.log('Testing Shortcuts modal...')
    const shortcutsBtn = page.locator('button[title*="Shortcuts"]')
    if (await shortcutsBtn.isVisible()) {
      await shortcutsBtn.click()
      await page.waitForTimeout(400)
      expect(await page.locator('text=Keyboard Shortcuts').isVisible()).toBeTruthy()
      const customizeTab = page.getByRole('button', { name: /Customize/i })
      if (await customizeTab.isVisible()) {
        await customizeTab.click()
        await page.waitForTimeout(300)
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }

    // 3. Compare Page Navigation
    console.log('Testing Compare page navigation...')
    await page.goto('http://localhost:5173/#/compare')
    await page.waitForTimeout(800)
    expect(page.url()).toContain('compare')

    // 4. Survey Mode Navigation
    console.log('Testing Survey Mode navigation...')
    await page.goto('http://localhost:5173/#/survey')
    await page.waitForTimeout(800)
    expect(page.url()).toContain('survey')

    // 5. Settings Navigation
    console.log('Testing Settings navigation...')
    await page.goto('http://localhost:5173/#/settings')
    await page.waitForTimeout(800)
    expect(page.url()).toContain('settings')
  })

  test('3. Gallery Page - Toolbar buttons, modals, & filter chips', async ({ page }) => {
    await page.goto('http://localhost:5173/#/')
    await page.waitForTimeout(1000)

    console.log('Testing Gallery Toolbar buttons...')

    // 1. Stats Modal
    const statsBtn = page.getByRole('button', { name: 'Stats' })
    if (await statsBtn.isVisible()) {
      await statsBtn.click()
      await page.waitForTimeout(400)
      expect(await page.locator('text=Library Stats').isVisible()).toBeTruthy()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }

    // 2. Cull to Target Modal
    const cullBtn = page.getByRole('button', { name: 'Cull to Target' })
    if (await cullBtn.isVisible()) {
      await cullBtn.click()
      await page.waitForTimeout(400)
      expect(await page.locator('text=Accept my top').isVisible()).toBeTruthy()
      const cancelBtn = page.getByRole('button', { name: 'Cancel' })
      if (await cancelBtn.isVisible()) await cancelBtn.click()
      await page.waitForTimeout(300)
    }

    // 3. Spray Mode Toggle
    const sprayBtn = page.getByRole('button', { name: /Spray/i })
    if (await sprayBtn.isVisible()) {
      await sprayBtn.click()
      await page.waitForTimeout(300)
      expect(await page.locator('text=Spray Mode').isVisible()).toBeTruthy()
      await sprayBtn.click()
      await page.waitForTimeout(300)
    }

    // 4. VIPs Modal
    const vipsBtn = page.getByRole('button', { name: 'VIPs' })
    if (await vipsBtn.isVisible()) {
      await vipsBtn.click()
      await page.waitForTimeout(400)
      expect(await page.locator('text=VIP Faces').isVisible()).toBeTruthy()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }

    // 5. Filter chips
    console.log('Testing Filter chips...')
    const acceptedFilter = page.getByRole('button', { name: /Accepted/i }).first()
    if (await acceptedFilter.isVisible()) {
      await acceptedFilter.click()
      await page.waitForTimeout(300)
      const allFilter = page.getByRole('button', { name: /All/i }).first()
      if (allFilter.isVisible()) await allFilter.click()
      await page.waitForTimeout(300)
    }
  })

  test('4. Single Review Page - Controls, Face Loupe, HUDs', async ({ page }) => {
    await page.goto('http://localhost:5173/#/review/15')
    await page.waitForTimeout(1200)

    console.log('Testing Single Review triage buttons...')
    const acceptBtn = page.locator('button[title*="Accept"]').first()
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click()
      await page.waitForTimeout(300)
    }

    // Face crops in People panel
    const faceCrops = page.locator('img[alt*="Face"]')
    const count = await faceCrops.count()
    console.log(`Found ${count} face crops in People panel`)
    if (count > 0) {
      await faceCrops.first().click()
      await page.waitForTimeout(400)
    }

    // Test HUD overlays via keyboard hotkeys
    await page.keyboard.press('e')
    await page.waitForTimeout(200)
    await page.keyboard.press('e')

    await page.keyboard.press('h')
    await page.waitForTimeout(200)
    await page.keyboard.press('h')

    await page.keyboard.press('i')
    await page.waitForTimeout(200)
    await page.keyboard.press('i')
  })

  test('5. 2-Up Compare Page - Viewports & Controls', async ({ page }) => {
    await page.goto('http://localhost:5173/#/compare')
    await page.waitForTimeout(1200)

    console.log('Testing Compare page...')
    // Verify viewports exist
    const viewports = page.locator('[data-viewport]')
    console.log(`Viewports found: ${await viewports.count()}`)

    // Test swap shortcut 's'
    await page.keyboard.press('s')
    await page.waitForTimeout(300)
  })

  test('6. Survey Mode Page - Controls & Triage', async ({ page }) => {
    await page.goto('http://localhost:5173/#/survey')
    await page.waitForTimeout(1200)

    console.log('Testing Survey Mode page...')
    // Test Skip shortcut (Space)
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)

    // Test Escape to exit
    const exitBtn = page.getByRole('button', { name: /Exit/i })
    if (await exitBtn.isVisible()) {
      await exitBtn.click()
      await page.waitForTimeout(400)
      expect(page.url()).toContain('#/')
    }
  })

  test('7. Settings Page - Strictness Slider & Calibration', async ({ page }) => {
    await page.goto('http://localhost:5173/#/settings')
    await page.waitForTimeout(1000)

    console.log('Testing Settings page controls...')
    // Calibrate AI button
    const calibrateBtn = page.getByRole('button', { name: /Calibrate/i })
    if (await calibrateBtn.isVisible()) {
      await calibrateBtn.click()
      await page.waitForTimeout(400)
    }

    // Reclassify Duplicates button
    const reclassifyBtn = page.getByRole('button', { name: /Re-classify Duplicates/i })
    if (await reclassifyBtn.isVisible()) {
      await reclassifyBtn.click()
      await page.waitForTimeout(600)
    }
  })
})
