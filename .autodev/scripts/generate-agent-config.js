#!/usr/bin/env node
/**
 * AutoDev Agent Config Generator
 * 
 * Reads YAML agent definitions from src/agents/ and generates:
 * 1. oh-my-openagent.jsonc agent configuration (with prompt_append from narratives)
 * 2. Capability/constraint manifests for the guardrail engine
 * 
 * Usage: node .autodev/scripts/generate-agent-config.js
 * 
 * This script is the single source of truth for agent identity.
 * Never edit oh-my-openagent.jsonc agents section directly — always regenerate from YAML.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const AUTODEV_ROOT = resolve(import.meta.dirname, '../..');
const AGENTS_DIR = join(AUTODEV_ROOT, '.autodev/agents');
const OMO_CONFIG_PATH = join(AUTODEV_ROOT, '.opencode/oh-my-openagent.jsonc');
const GUARDRAILS_PATH = join(AUTODEV_ROOT, '.autodev/config/guardrails.yaml');

// Simple YAML parser (no external deps needed)
function parseYAML(content) {
  const lines = content.split('\n');
  const result = {};
  let currentKey = null;
  let currentValue = [];
  let inMultiline = false;
  let multilineKey = null;
  let multilineIndent = 0;
  
  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') {
      if (inMultiline && multilineKey) {
        result[multilineKey] = currentValue.join('\n').trim();
        inMultiline = false;
        multilineKey = null;
        currentValue = [];
      }
      continue;
    }
    
    // Handle multiline values (>-prefixed)
    if (inMultiline) {
      if (line.trim() === '' || line.startsWith(' '.repeat(multilineIndent + 2))) {
        currentValue.push(line.replace(/^(\s*)/, ''));
      } else {
        result[multilineKey] = currentValue.join('\n').trim();
        inMultiline = false;
        multilineKey = null;
        currentValue = [];
        // Re-process this line as a new key
      }
    }
    
    if (!inMultiline) {
      const match = line.match(/^(\w[\w_]*):\s*(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();
        
        if (value === '>' || value === '|') {
          multilineKey = key;
          multilineIndent = line.search(/\S/);
          currentValue = [];
          inMultiline = true;
        } else if (value.startsWith('[')) {
          // Array value
          try {
            result[key] = JSON.parse(value.replace(/'/g, '"'));
          } catch {
            result[key] = value;
          }
        } else if (value && !value.startsWith('-')) {
          result[key] = value;
        }
      }
      
      // Handle list items
      const listMatch = line.match(/^\s+-\s+(.+)$/);
      if (listMatch && currentKey) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        result[currentKey].push(listMatch[1].replace(/^["']|["']$/g, ''));
      }
    }
  }
  
  // Close any remaining multiline
  if (inMultiline && multilineKey) {
    result[multilineKey] = currentValue.join('\n').trim();
  }
  
  return result;
}

// Better YAML parser using line-by-line state machine
function parseYamlFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const result = {};
  const stack = [{ obj: result, indent: -1 }];
  let currentKey = null;
  
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('#') || line.trim() === '') continue;
    
    const indent = line.search(/\S/);
    const trimmed = line.trim();
    
    // Pop stack to find parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;
    
    // List item
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();
      if (currentKey && !Array.isArray(parent[currentKey])) {
        parent[currentKey] = [];
      }
      if (currentKey && Array.isArray(parent[currentKey])) {
        parent[currentKey].push(value.replace(/^["']|["']$/g, ''));
      }
      continue;
    }
    
    // Key-value pair
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    
    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();
    
    if (value === '' || value === '|' || value === '>') {
      // Multiline or nested
      parent[key] = value === '|' || value === '>' ? '' : {};
      if (value !== '|' && value !== '>') {
        stack.push({ obj: parent[key], indent });
      }
      currentKey = key;
      continue;
    }
    
    // Parse value
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^\d+$/.test(value)) value = parseInt(value);
    else value = value.replace(/^["']|["']$/g, '');
    
    parent[key] = value;
    currentKey = key;
  }
  
  return result;
}

// Load all agent definitions
function loadAgents() {
  const agents = {};
  const files = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.yaml'));
  
  for (const file of files) {
    const filePath = join(AGENTS_DIR, file);
    const agent = parseYamlFile(filePath);
    if (agent.name) {
      agents[agent.name] = agent;
    }
  }
  
  return agents;
}

// Generate prompt_append from narrative
function generatePromptAppend(agent) {
  if (!agent.narrative) return '';
  return `\n<nautilus-identity-override>\n${agent.narrative}\n</nautilus-identity-override>`;
}

// Generate omo agent config from YAML
function generateOmoAgentConfig(agents) {
  const config = {};
  
  for (const [name, agent] of Object.entries(agents)) {
    config[agent.omo_mapping || name] = {
      displayName: agent.display_name,
      model: agent.model_preference,
      fallback_models: agent.fallback_models || [],
      prompt_append: generatePromptAppend(agent),
      description: agent.description
    };
  }
  
  return config;
}

// Main
console.log('AutoDev Agent Config Generator');
console.log('=============================');
console.log('');

const agents = loadAgents();
console.log(`Loaded ${Object.keys(agents).length} agent definitions:`);
for (const [name, agent] of Object.entries(agents)) {
  console.log(`  ${name} → ${agent.omo_mapping} (${agent.display_name})`);
}
console.log('');

// Generate omo config
const omoConfig = generateOmoAgentConfig(agents);
console.log('Generated omo agent config:');
console.log(JSON.stringify(omoConfig, null, 2));

console.log('');
console.log('Agent definitions are ready. Next step: integrate with oh-my-openagent.jsonc.');
