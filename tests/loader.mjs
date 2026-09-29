import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const projectRoot = process.cwd();

function resolveFile(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath;
  }
  if (fs.existsSync(basePath + '.ts')) {
    return basePath + '.ts';
  }
  if (fs.existsSync(basePath + '.js')) {
    return basePath + '.js';
  }
  const indexPath = path.join(basePath, 'index.ts');
  if (fs.existsSync(indexPath)) {
    return indexPath;
  }
  const indexJs = path.join(basePath, 'index.js');
  if (fs.existsSync(indexJs)) {
    return indexJs;
  }
  return basePath;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    const resolved = path.join(projectRoot, 'lib/security/server-only.ts');
    return nextResolve(pathToFileURL(resolved).href, context);
  }

  if (specifier.startsWith('@/')) {
    const subpath = specifier.slice(2);
    const target = path.join(projectRoot, subpath);
    const resolved = resolveFile(target);
    return nextResolve(pathToFileURL(resolved).href, context);
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentDir = context.parentURL ? path.dirname(new URL(context.parentURL).pathname) : projectRoot;
    const target = path.resolve(parentDir, specifier);
    const resolved = resolveFile(target);
    if (resolved !== target) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }

  return nextResolve(specifier, context);
}
