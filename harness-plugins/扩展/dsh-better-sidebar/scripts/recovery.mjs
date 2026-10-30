/** Local utility; never launches the Harness or invokes a model. */
import { listWorkspaceRecovery, restoreWorkspaceRecovery } from '../lib/recovery.js'
const [action, cwd, id] = process.argv.slice(2)
if (!cwd || !['list', 'restore'].includes(action) || (action === 'restore' && !id)) {
  console.error('Usage: node scripts/recovery.mjs list <workspace> | restore <workspace> <recovery-id>')
  process.exitCode = 2
} else {
  try {
    const value = action === 'list' ? await listWorkspaceRecovery(cwd) : await restoreWorkspaceRecovery(cwd, id)
    console.log(JSON.stringify(value, null, 2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
