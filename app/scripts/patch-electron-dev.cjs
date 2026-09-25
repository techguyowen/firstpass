const { existsSync, copyFileSync, readFileSync, writeFileSync, utimesSync } = require('fs')
const { join, dirname } = require('path')
const { execFileSync } = require('child_process')

function setPlistKey(plistPath, key, value) {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plistPath], {
      stdio: 'pipe'
    })
    return true
  } catch {
    return false
  }
}

function patchPlistXml(plistPath, entries) {
  let xml = readFileSync(plistPath, 'utf8')
  for (const [key, value] of Object.entries(entries)) {
    const pattern = new RegExp(`(<key>${key}<\\/key>\\s*<string>)[^<]*(<\\/string>)`)
    if (pattern.test(xml)) {
      xml = xml.replace(pattern, `$1${value}$2`)
    } else {
      xml = xml.replace(/(<dict>\s*)/, `$1<key>${key}</key>\n\t<string>${value}</string>\n\t`)
    }
  }
  writeFileSync(plistPath, xml)
}

function main() {
  if (process.platform !== 'darwin') {
    process.exit(0)
  }

  const scriptDir = __dirname
  const appDir = dirname(scriptDir)
  const electronApp = join(appDir, 'node_modules/electron/dist/Electron.app')
  const plistPath = join(electronApp, 'Contents/Info.plist')

  if (!existsSync(plistPath)) {
    console.log('[FirstPass] Electron dev bundle Info.plist not found, skipping patch.')
    process.exit(0)
  }

  const entries = {
    CFBundleName: 'FirstPass',
    CFBundleDisplayName: 'FirstPass',
    CFBundleIdentifier: 'com.firstpass.app'
  }

  let patched = true
  for (const [key, value] of Object.entries(entries)) {
    const ok = setPlistKey(plistPath, key, value)
    if (!ok) {
      patched = false
      break
    }
  }
  if (!patched) {
    patchPlistXml(plistPath, entries)
  }

  const iconSrc = join(appDir, 'build/icon.icns')
  const iconDest = join(electronApp, 'Contents/Resources/electron.icns')
  if (existsSync(iconSrc)) {
    try {
      copyFileSync(iconSrc, iconDest)
    } catch (err) {
      console.error('[FirstPass] Failed to copy dev icon:', err)
    }
  }

  try {
    const now = new Date()
    utimesSync(electronApp, now, now)
  } catch {
    // ignore touch failures
  }

  console.log("[FirstPass] Patched Electron development bundle to 'FirstPass'.")
}

main()
