// Keep @deepseek-ai/dsh-typert-protocol module-instance-identical with the
// dsh host. The plugin is loaded by `dsh web` from the global install; if our
// workspace resolves its OWN pnpm copy of dsh-typert-protocol, the Typert
// Remote marker class differs from the host's and every /api/freeroute/*
// endpoint silently fails to register (client sees HTTP 404).
//
// Fix (same as dsh-refine): symlink the workspace copy onto the physical
// directory inside the global dsh install, so both sides load one instance.
// pnpm recreates its own symlink on every install, so this runs postinstall.
import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const link = join(root, 'node_modules', '@deepseek-ai', 'dsh-typert-protocol')

// Locate the global dsh install: same layout as `which dsh` → lib/node_modules/@deepseek-ai/dsh
function globalDshTypert() {
  for (const exec of [process.execPath]) {
    const nodeDir = dirname(dirname(exec)) // .../node-v24.15.0/bin -> .../node-v24.15.0
    const candidate = join(nodeDir, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-typert-protocol')
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return null
}

const target = globalDshTypert()
if (!target) {
  console.log('[link-host-typert] global dsh install not found - leaving workspace resolution untouched')
} else {
  let current = null
  try {
    current = realpathSync(link)
  } catch { /* missing */ }
  const wanted = realpathSync(target)
  if (current === wanted) {
    console.log('[link-host-typert] already identical:', wanted)
  } else {
    // Remove whatever occupies the slot (pnpm symlink or real dir); keep a
    // one-time backup of a real directory, mirroring dsh-refine's practice.
    const st = lstatSync(link)
    if (st.isDirectory() && !st.isSymbolicLink()) {
      const backup = link + '.rc6-realdir-backup'
      console.log('[link-host-typert] backing up real dir to', backup)
      rmSync(backup, { recursive: true, force: true })
      const { renameSync } = await import('node:fs')
      renameSync(link, backup)
    } else {
      rmSync(link)
    }
    symlinkSync(target, link)
    console.log('[link-host-typert] relinked ->', target)
  }
  // Sanity: versions must be readable through the link.
  const v = JSON.parse(readFileSync(join(link, 'package.json'), 'utf8')).version
  console.log('[link-host-typert] resolved version:', v)
}
