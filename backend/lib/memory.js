import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { ensureVault } from './vault.js';
import { chatOnce } from './ollama.js';
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
    const prompt = `You are a memory extraction system. Your task is to extract a brief title, 3-5 tags, and a summary from the following important information.
    
Important info: "${userMessage.content}"

You MUST respond ONLY with a valid JSON object matching this exact schema:
{
  "title": "A short, descriptive title",
  "tags": ["tag1", "tag2", "tag3"],
  "summary": "A clear, concise summary of the information"
}`;

    let extracted;
    try {
      const rawResponse = await chatOnce({
        model: config.models.text,
        messages: [{ role: 'user', content: prompt }],
        format: 'json',
        temperature: 0.1,
      });

      extracted = JSON.parse(rawResponse);
      
      // Basic validation
      if (!extracted.title || !extracted.tags || !extracted.summary) {
        throw new Error('Missing required fields in JSON response');
      }
    } catch (error) {
      console.error('[Memory] Failed to extract or parse JSON from model:', error.message);
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

    // Removed buildIndex() to prevent swapping to the embedding model mid-conversation.
    // Index will be rebuilt on server boot or manual reindex.
  } catch (error) {
    console.error('Supermemory extraction failed:', error);
  }
}
