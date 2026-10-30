import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {ensureBrowser,renderMedia,renderStill,selectComposition} from '@remotion/renderer';
import {renderJob} from './render-job.mjs';
const runtimeRoot=path.dirname(fileURLToPath(import.meta.url));
const result=await renderJob(JSON.parse(fs.readFileSync(0,'utf8')),{runtimeRoot,bundle,ensureBrowser,renderMedia,renderStill,selectComposition});
console.log(JSON.stringify(result));
