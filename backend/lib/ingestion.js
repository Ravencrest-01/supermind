import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { embed, chatOnce } from './ollama.js';
import { config } from '../config.js';

// Get the root for collections
const COLLECTIONS_ROOT = path.join(config.vaultPath, 'collections');

export async function processPipelineA(filePath, workspace, eventEmitter) {
  eventEmitter('log', { message: `[Pipeline A] Started processing PDF: ${path.basename(filePath)} in workspace ${workspace}` });
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    const text = data.text;
    eventEmitter('log', { message: `[Pipeline A] Extracted ${text.length} characters from PDF.` });

    // Vector Indexing - just calling embed for the first chunk for demonstration 
    // (full indexing could be added to embeddings.js buildIndex)
    eventEmitter('log', { message: `[Pipeline A] Generating semantic vector index...` });
    try {
      const vector = await embed(text.slice(0, 4000)); 
      eventEmitter('log', { message: `[Pipeline A] Generated vector of length ${vector?.length}.` });
    } catch (e) {
      eventEmitter('log', { message: `[Pipeline A] Vector indexing failed (model not loaded?): ${e.message}` });
    }

    eventEmitter('log', { message: `[Pipeline A] Running Deep Context Analysis via Qwen 3.5...` });
    const prompt = `Analyze this document and provide a complex logic extraction and summary:\n\n${text.slice(0, 10000)}`;
    const summary = await chatOnce({
      model: 'huihui_ai/qwen3.5-abliterated:4B',
      messages: [{ role: 'user', content: prompt }]
    });

    eventEmitter('log', { message: `[Pipeline A] Synthesis Complete. Summary:\n${summary}` });
  } catch (error) {
    eventEmitter('log', { message: `[Pipeline A] Error: ${error.message}` });
  }
}

export async function processPipelineB(filePath, workspace, eventEmitter) {
  eventEmitter('log', { message: `[Pipeline B] Started processing Image: ${path.basename(filePath)} in workspace ${workspace}` });
  try {
    const dataBuffer = await fs.readFile(filePath);
    const base64 = dataBuffer.toString('base64');
    eventEmitter('log', { message: `[Pipeline B] Visual Token Mapping complete.` });

    eventEmitter('log', { message: `[Pipeline B] Executing Vision Inference...` });
    const extraction = await chatOnce({
      model: config.models.vision || 'qwen2.5vl:3b',
      messages: [{ role: 'user', content: 'Extract complex charts, structural diagrams, or data tables from this image.', images: [base64] }]
    });

    eventEmitter('log', { message: `[Pipeline B] Extraction Complete:\n${extraction}` });
  } catch (error) {
    eventEmitter('log', { message: `[Pipeline B] Error: ${error.message}` });
  }
}

export async function ingestFile(file, workspaceName, eventEmitter) {
  // Sanitize workspace
  let workspace = (workspaceName || '').trim().replace(/\s+/g, '_');
  if (!workspace) workspace = 'generalized';

  const isPdf = file.mimetype === 'application/pdf';
  const isImage = file.mimetype.startsWith('image/');
  
  if (!isPdf && !isImage) {
    eventEmitter('log', { message: `Skipping ${file.originalname}: Unsupported type ${file.mimetype}` });
    return;
  }

  const baseFolder = isPdf ? 'pdf' : 'images';
  const targetDir = path.join(COLLECTIONS_ROOT, baseFolder, workspace);

  // Ensure disk directory exists
  await fs.mkdir(targetDir, { recursive: true });

  const timestamp = Date.now();
  const ext = path.extname(file.originalname) || '';
  const base = path.basename(file.originalname, ext);
  const targetPath = path.join(targetDir, `${base}_${timestamp}${ext}`);

  await fs.rename(file.path, targetPath);
  eventEmitter('log', { message: `Saved ${file.originalname} to ${targetPath}` });

  // Async processing
  if (isPdf) {
    processPipelineA(targetPath, workspace, eventEmitter).catch(console.error);
  } else if (isImage) {
    processPipelineB(targetPath, workspace, eventEmitter).catch(console.error);
  }
}
