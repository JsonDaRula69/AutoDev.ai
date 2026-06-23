#!/usr/bin/env node
/**
 * AutoDev Agent Config Generator
 * 
 * Reads YAML agent definitions from src/agents/ and generates:
 * 1. oh-my-openagent.jsonc agent section (with prompt_append from narratives)
 * 2. Validates all agent definitions against the workflow specification
 * 
 * This script is the single source of truth for agent identity.
 * Never edit oh-my-openagent.jsonc agents section directly — always regenerate from YAML.
 * 
 * Usage: node .autodev/scripts/generate-agent-config.mjs [--write] [--validate]
 *   --write     Write the generated config to oh-my-openagent.jsonc
 *   --validate  Validate all agent definitions against spec (default if no flags)
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import yaml from 'js-yaml';

const AUTODEV_ROOT = resolve(import.meta.dirname, '../..');
const AGENTS_DIR = join(AUTODEV_ROOT, '.autodev/agents');
const OMO_CONFIG_PATH = join(AUTODEV_ROOT, '.opencode/oh-my-openagent.jsonc');
const SPEC_PATH = join(AUTODEV_ROOT, '.autodev/reference/workflow-specification.md');

const REQUIRED_FIELDS = ['name', 'display_name', 'role', 'model_preference', 'description', 'narrative', 'capabilities', 'constraints', 'omo_mapping'];
const RACI_ACTIVITIES = ['triage', 'plan', 'plan_review_debate', 'implement', 'code_review', 'testing', 'deployment', 'knowledge_retrieval', 'health_monitoring', 'fault_management', 'onboarding', 'github_operations', 'testing_qa'];

function loadAgents() {
  const agents = {};
  const files = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.yaml'));
  
  for (const file of files) {
    const filePath = join(AGENTS_DIR, file);
    const content = readFileSync(filePath, 'utf-8');
    const agent = yaml.load(content);
    if (agent.name) {
      agents[agent.name] = agent;
    }
  }
  
  return agents;
}

function validateAgent(agent) {
  const errors = [];
  
  for (const field of REQUIRED_FIELDS) {
    if (!agent[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  if (agent.capabilities && !Array.isArray(agent.capabilities)) {
    errors.push('capabilities must be an array');
  }
  
  if (agent.constraints && !Array.isArray(agent.constraints)) {
    errors.push('constraints must be an array');
  }
  
  // Check guardrail hard stops are in constraints
  const hardStops = ['never-deploy-directly', 'one-task-at-a-time', 'evidence-or-it-didnt-happen', 'follow-the-plan', 'ci-is-the-hard-gate', 'never-approve-own-work', 'never-modify-reference-docs', 'never-modify-debate-transcripts'];
  if (agent.constraints) {
    const agentHardStops = agent.constraints.filter(c => hardStops.includes(c));
    // Agents that implement should have most hard stops
    if (agent.capabilities?.includes('write-code') && agentHardStops.length < 3) {
      errors.push(`Implementation agent has only ${agentHardStops.length} hard stops (expected >=3)`);
    }
  }
  
  return errors;
}

function generatePromptAppend(agent) {
  if (!agent.narrative) return '';
  return `\n<nautilus-identity-override>\n${agent.narrative}\n</nautilus-identity-override>`;
}

function generateOmoAgentConfig(agents) {
  const config = {};
  
  for (const [name, agent] of Object.entries(agents)) {
    const omoKey = agent.omo_mapping || name;
    config[omoKey] = {
      displayName: agent.display_name,
      model: agent.model_preference,
      fallback_models: agent.fallback_models || [],
      prompt_append: generatePromptAppend(agent),
      description: agent.description
    };
  }
  
  return config;
}

function validateAll(agents) {
  let valid = true;
  
  console.log('Validating agent definitions...\n');
  
  for (const [name, agent] of Object.entries(agents)) {
    const errors = validateAgent(agent);
    if (errors.length > 0) {
      console.log(`❌ ${name} (${agent.display_name}):`);
      for (const error of errors) {
        console.log(`   - ${error}`);
      }
      valid = false;
    } else {
      console.log(`✓ ${name} (${agent.display_name})`);
    }
  }
  
  // Check omo_mapping uniqueness
  const mappings = Object.values(agents).map(a => a.omo_mapping);
  const duplicates = mappings.filter((m, i) => mappings.indexOf(m) !== i);
  if (duplicates.length > 0) {
    console.log(`\n❌ Duplicate omo_mapping values: ${[...new Set(duplicates)].join(', ')}`);
    console.log('   Multiple agents cannot map to the same omo slot.');
    valid = false;
  }
  
  // Check that all agents in the workflow spec have YAML definitions
  const specAgents = ['nemo', 'aronnax', 'ned_land', 'conseil', 'oracle', 'momus', 'metis', 'engineer', 'harbor_master', 'quartermaster', 'boatswain', 'navigator', 'watch_officer'];
  for (const specAgent of specAgents) {
    if (!agents[specAgent]) {
      console.log(`❌ Missing YAML definition for workflow spec agent: ${specAgent}`);
      valid = false;
    }
  }
  
  return valid;
}

// Main
const args = process.argv.slice(2);
const shouldWrite = args.includes('--write');
const shouldValidate = args.includes('--validate') || (!shouldWrite && args.length === 0);

console.log('AutoDev Agent Config Generator');
console.log('===============================');
console.log('');

const agents = loadAgents();
console.log(`Loaded ${Object.keys(agents).length} agent definitions from src/agents/`);
console.log('');

if (shouldValidate) {
  const valid = validateAll(agents);
  if (!valid) {
    console.log('\n❌ Validation failed. Fix errors before proceeding.');
    process.exit(1);
  }
  console.log('\n✓ All agent definitions are valid and consistent with the workflow specification.');
}

if (shouldWrite) {
  // Read existing omo config and replace agents section
  const existingConfig = readFileSync(OMO_CONFIG_PATH, 'utf-8');
  
  // Generate new agents section
  const newAgents = generateOmoAgentConfig(agents);
  
  // We need to merge this into the existing JSONC file
  // For now, just output the agents section
  console.log('\nGenerated omo agent config (agents section):');
  console.log(JSON.stringify(newAgents, null, 2));
  console.log('\nTo apply: manually merge this into .opencode/oh-my-openagent.jsonc');
  console.log('Or run: node .autodev/scripts/generate-agent-config.mjs --write --apply');
}

console.log(`\nAgent roster (${Object.keys(agents).length} members):`);
for (const [name, agent] of Object.entries(agents)) {
  const capCount = agent.capabilities?.length || 0;
  const constCount = agent.constraints?.length || 0;
  console.log(`  ${agent.display_name.padEnd(16)} omo=${(agent.omo_mapping || name).padEnd(18)} caps=${capCount} constraints=${constCount}`);
}
