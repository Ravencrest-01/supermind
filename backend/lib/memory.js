import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { ensureVault } from './vault.js';
import { streamChat } from './ollama.js';
import { buildIndex } from './embeddings.js';

export async function extractMemory(convo, userMessage) {
  if (!config.memoryEnabled) return;
  const msgContent = userMessage.content.toLowerCase();
  
  // Triggers
  const cues = [
    'remember this', 'important', 'note this', 
    "don't forget", 'keep in mind', 'for future reference', 'save this'
  ];
  if (!cues.some(cue => msgContent.includes(cue))) return;

  try {
    await ensureVault();
    const memoriesDir = path.join(config.vaultPath, config.files.memoriesDir);
    const hubPath = path.join(config.vaultPath, config.files.memoryHub);

    // Call LLM to extract tags and summary
    const prompt = `Extract a brief title, 3-5 tags, and a summary of the following important information to remember.\n\n` +
      `Important info: "${userMessage.content}"\n\n` +
      `Output JSON format strictly:\n{"title": "Brief Title", "tags": ["tag1", "tag2"], "summary": "Detailed summary"}`;

    const rawResponse = await streamChat({
      model: config.models.text,
      messages: [{ role: 'user', content: prompt }],
      onToken: () => {},
    });

    let extracted;
    try {
      const match = rawResponse.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(match ? match[0] : rawResponse);
    } catch {
      // Fallback
      extracted = {
        title: userMessage.content.slice(0, 30).trim() + '...',
        tags: ['memory'],
        summary: userMessage.content
      };
    }

    const tagsLine = extracted.tags.map(t => `#${t.replace(/\\s+/g, '-')}`).join(' ');
    const noteContent = 
`---
tags: ${JSON.stringify(extracted.tags)}
created: ${new Date().toISOString()}
---
# ${extracted.title}

${tagsLine}

**Summary:** ${extracted.summary}

**Original Message:** 
> ${userMessage.content.replace(/\\n/g, '\n> ')}

**Context Links:**
[[${path.basename(config.files.memoryHub, '.md')}]]
`;

    // Save Memory Note
    const safeTitle = extracted.title.replace(/[^a-zA-Z0-9_-]/g, ' ').trim() || `Memory-${Date.now()}`;
    const filename = `${safeTitle}.md`;
    await fs.writeFile(path.join(memoriesDir, filename), noteContent, 'utf8');

    // Create Hub Note if not exists
    try {
      await fs.access(hubPath);
    } catch {
      await fs.writeFile(hubPath, `# Supermind Memory Hub\n\nCentral hub for all supermemory nodes.\n`, 'utf8');
    }

    // Append link to Hub Note
    await fs.appendFile(hubPath, `\n- [[${safeTitle}]]`, 'utf8');

    // Automatically rebuild the index so the new memory is immediately retrievable
    await buildIndex();

  } catch (error) {
    console.error('Supermemory extraction failed:', error);
  }
}
