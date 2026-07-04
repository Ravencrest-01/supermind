import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const COLLECTIONS_ROOT = path.join(config.vaultPath, 'collections');

async function getSubdirectories(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

export async function auditFilesystem() {
  const result = {
    pdf: {},
    images: {}
  };

  try {
    const pdfDir = path.join(COLLECTIONS_ROOT, 'pdf');
    const pdfWorkspaces = await getSubdirectories(pdfDir);
    for (const ws of pdfWorkspaces) {
      const files = await fs.readdir(path.join(pdfDir, ws));
      result.pdf[ws] = files.length;
    }
  } catch (e) {
    // Ignore if not exists
  }

  try {
    const imagesDir = path.join(COLLECTIONS_ROOT, 'images');
    const imageWorkspaces = await getSubdirectories(imagesDir);
    for (const ws of imageWorkspaces) {
      const files = await fs.readdir(path.join(imagesDir, ws));
      result.images[ws] = files.length;
    }
  } catch (e) {
    // Ignore if not exists
  }

  return result;
}
