import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dependencies = process.env.SIDEBAR_DEPENDENCY_ROOT || 'E:/DSH/插件/扩展/node_modules'
const esbuild = await import(pathToFileURL(path.join(dependencies, 'esbuild/lib/main.js')).href)
for (const entry of ['index', 'recovery']) {
  await esbuild.build({ entryPoints: [path.join(root, 'src', entry + '.ts')], outfile: path.join(root, 'lib', entry + '.js'),
    bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external',
    external: ['file://*'], logLevel: 'info', legalComments: 'inline',
  })
}
