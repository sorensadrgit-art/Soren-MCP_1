import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {loadApprovedFoundrySkills} from "./foundry/registry.mjs";

export const SKILLS = [
  {
    "name": "accessibility",
    "description": "Audit and build accessible interfaces with WCAG 2.2, keyboard focus, ARIA, and screen-reader checks.",
    "tags": [
      "accessibility",
      "aria",
      "wcag",
      "keyboard",
      "screen reader",
      "focus",
      "contrast",
      "inclusive",
      "audit"
    ],
    "status": "curated",
    "uri": "skill://accessibility/SKILL.md"
  },
  {
    "name": "motion-systems",
    "description": "Architect cinematic motion-first WebGL, React Three Fiber, GSAP ScrollTrigger, and responsive animation systems.",
    "tags": [
      "gsap",
      "webgl",
      "three.js",
      "threejs",
      "3d",
      "cinematic",
      "scroll",
      "camera",
      "animation",
      "motion",
      "web design",
      "react three fiber",
      "r3f",
      "framer motion"
    ],
    "status": "curated",
    "uri": "skill://motion-systems/SKILL.md"
  },
  {
    "name": "mcp-integration",
    "description": "Configure secure shared remote MCP servers and multiple agent clients using Streamable HTTP.",
    "tags": [
      "mcp",
      "model context protocol",
      "remote",
      "streamable http",
      "server",
      "client",
      "connector",
      "plugin",
      "agent",
      "tools",
      "skill directory",
      "integrate",
      "authentication"
    ],
    "status": "curated",
    "uri": "skill://mcp-integration/SKILL.md"
  },
  {
    "name": "skill-orchestration",
    "description": "Route tasks to relevant approved agent skills with deterministic ranking and progressive disclosure.",
    "tags": [
      "router",
      "routing",
      "orchestration",
      "skills",
      "catalog",
      "skill",
      "agents",
      "registry",
      "index",
      "search",
      "discover",
      "select",
      "team"
    ],
    "status": "curated",
    "uri": "skill://skill-orchestration/SKILL.md"
  },
  {
    "name": "mineru",
    "description": "Read, OCR, parse, and convert PDF, scanned lecture slides, images and Office documents to Markdown with MinerU 4.x and stable page/block locators.",
    "tags": [
      "mineru", "pdf", "ocr", "scanned pdf", "pdf to markdown",
      "markdown", "lecture slides", "document parsing", "document conversion",
      "document reading", "document search", "office documents", "docx", "pptx",
      "figures", "tables", "formulas", "math", "citations", "page locator"
    ],
    "status": "curated",
    "uri": "skill://mineru/SKILL.md"
  },
  {
    "name": "soren-universal-deployment",
    "description": "Detect project builds, fix deployment failures, validate preview deployments and safely release to Vercel or other hosting providers.",
    "tags": [
      "deploy",
      "deployment",
      "deploying",
      "publish",
      "publishing",
      "vercel",
      "hosting",
      "host",
      "ci/cd",
      "devops",
      "pipeline",
      "preview",
      "production",
      "release",
      "rollback",
      "redeploy",
      "install command",
      "dependencies",
      "package manager",
      "npm",
      "pnpm",
      "yarn",
      "bun",
      "vite",
      "next.js",
      "nextjs",
      "cloud deployment",
      "tsc",
      "git integration",
      "deploy to vercel"
    ],
    "status": "curated",
    "uri": "skill://soren-universal-deployment/SKILL.md"
  },
  {
    "name": "21st-ui-components",
    "description": "Search official 21st.dev component, theme and template references and integrate reviewed React UI components.",
    "tags": [
      "21st.dev",
      "21st",
      "21st mcp",
      "21st ui",
      "21st components",
      "ui components",
      "shadcn",
      "component inspiration",
      "component catalog",
      "react ui library"
    ],
    "status": "curated",
    "uri": "skill://21st-ui-components/SKILL.md"
  },
  {
    "name": "motionsites-design",
    "description": "Find premium cinematic website style prompts and design direction through MotionSites MCP.",
    "tags": [
      "motionsites",
      "motionsites mcp",
      "motionsites.ai",
      "design prompts",
      "cinematic landing page",
      "website design prompts",
      "animated website inspiration",
      "motionsites design"
    ],
    "status": "curated",
    "uri": "skill://motionsites-design/SKILL.md"
  },
  {
    "name": "playwright-browser-qa",
    "description": "Run agent-native Microsoft Playwright MCP browser, accessibility snapshot and end-to-end QA workflows.",
    "tags": [
      "playwright mcp",
      "playwright",
      "browser e2e",
      "browser qa",
      "accessibility snapshots",
      "e2e tests",
      "end-to-end testing",
      "test browser",
      "browser automation"
    ],
    "status": "curated",
    "uri": "skill://playwright-browser-qa/SKILL.md"
  },
  {
    "name": "superpowers-engineering",
    "description": "Use Superpowers-inspired brainstorming, worktrees, implementation planning and test-driven engineering.",
    "tags": [
      "superpowers",
      "using superpowers",
      "brainstorming",
      "test-driven development",
      "subagent-driven development",
      "writing plans",
      "superpowers workflow",
      "red green refactor"
    ],
    "status": "curated",
    "uri": "skill://superpowers-engineering/SKILL.md"
  },
  {
    "name": "react-three-fiber",
    "description": "Build version-compatible React Three Fiber and Drei scenes, interactions and optimized 3D canvases.",
    "tags": [
      "react three fiber",
      "r3f",
      "react-three-fiber",
      "@react-three/fiber",
      "drei",
      "useframe",
      "useframe drei",
      "usethree",
      "r3f scene",
      "interactive 3d",
      "r3f canvas",
      "drei environment",
      "orbit controls"
    ],
    "status": "curated",
    "uri": "skill://react-three-fiber/SKILL.md"
  },
  {
    "name": "threejs-production",
    "description": "Build optimized Three.js renderers, scene graphs, shaders, geometry, lighting and production asset pipelines.",
    "tags": [
      "three.js renderer",
      "threejs renderer",
      "three.js scene",
      "threejs scene",
      "shader material",
      "materials geometry shaders",
      "threejs geometry",
      "pbr materials",
      "three.js assets",
      "webgl renderer"
    ],
    "status": "curated",
    "uri": "skill://threejs-production/SKILL.md"
  },
  {
    "name": "gsap-motion",
    "description": "Engineer GSAP timelines, ScrollTrigger, useGSAP, matchMedia and reliable accessible animation cleanup.",
    "tags": [
      "gsap",
      "scrolltrigger",
      "timeline",
      "usegsap",
      "matchmedia",
      "animation cleanup",
      "responsive timeline",
      "scoped motion context"
    ],
    "status": "curated",
    "uri": "skill://gsap-motion/SKILL.md"
  },
  {
    "name": "agentic-design-to-code",
    "description": "Orchestrate design references, design tokens, responsive UX, component architecture and tested UI implementation.",
    "tags": [
      "design-to-code",
      "agentic design",
      "agentic workflow",
      "responsive ux",
      "ux components",
      "component tokens",
      "design references to code",
      "agentic ui implementation",
      "design references",
      "react components"
    ],
    "status": "curated",
    "uri": "skill://agentic-design-to-code/SKILL.md"
  },
  {
    "name": "agentic-coding",
    "description": "Coordinate repository-first agentic coding, implementation plans, TDD, reviews, isolated worktrees and verification.",
    "tags": [
      "agentic coding",
      "implementation plan",
      "coding agent workflow",
      "agentic software engineering",
      "tdd code review",
      "code review implementation",
      "red green refactor",
      "agentic developer workflow"
    ],
    "status": "curated",
    "uri": "skill://agentic-coding/SKILL.md"
  },
  {
    "name": "shader-material-lab",
    "description": "Author and debug GLSL/TSL shaders and physically based three.js materials, lighting, color management and tone mapping.",
    "tags": [
      "glsl",
      "shader",
      "custom shader",
      "fragment shader",
      "vertex shader",
      "shader compile",
      "precision",
      "shadermaterial",
      "node material",
      "tsl",
      "pbr",
      "clearcoat",
      "car paint",
      "photorealistic",
      "tone mapping",
      "color management",
      "image-based lighting",
      "holographic"
    ],
    "status": "curated",
    "uri": "skill://shader-material-lab/SKILL.md"
  },
  {
    "name": "webgpu-progressive-rendering",
    "description": "Ship WebGPU with capability detection, WebGL2 and static-poster fallbacks, and device or context loss handling.",
    "tags": [
      "webgpu",
      "webgpurenderer",
      "webgl2 fallback",
      "webgl2",
      "webgpu fallback",
      "static poster",
      "degrade gracefully",
      "device lost",
      "context loss",
      "navigator.gpu",
      "tsl",
      "progressive rendering"
    ],
    "status": "curated",
    "uri": "skill://webgpu-progressive-rendering/SKILL.md"
  },
  {
    "name": "gltf-asset-pipeline",
    "description": "Inspect, compress, simplify and validate glTF/GLB assets with glTF Transform and the Khronos validator, with matching runtime decoders.",
    "tags": [
      "gltf",
      "glb",
      "gltf-transform",
      "meshopt",
      "draco",
      "ktx2",
      "webp",
      "compress",
      "compression",
      "texture compression",
      "texture sizes",
      "validate gltf",
      "gltf validator",
      "lod",
      "lods",
      "simplify",
      "gltfloader",
      "transcoder",
      "asset pipeline"
    ],
    "status": "curated",
    "uri": "skill://gltf-asset-pipeline/SKILL.md"
  },
  {
    "name": "blender-to-r3f",
    "description": "Prepare, bake and export Blender scenes to GLB and load them in React Three Fiber with disposal-safe components.",
    "tags": [
      "blender",
      "blender model",
      "blender assets",
      "bake",
      "baking",
      "procedural materials",
      "export",
      "gltfjsx",
      "blender to r3f",
      "bpy",
      "blender lab"
    ],
    "status": "curated",
    "uri": "skill://blender-to-r3f/SKILL.md"
  },
  {
    "name": "graphics-performance-qa",
    "description": "Measure draw calls, frame time, GPU memory, leaks and screenshots for 3D web scenes in real Chromium with renderer labels.",
    "tags": [
      "draw calls",
      "frame rate",
      "fps",
      "gpu memory",
      "memory leak",
      "memory leaks",
      "leaks",
      "profile",
      "instancing",
      "on demand",
      "renders on demand",
      "renderer.info",
      "screenshots",
      "chromium",
      "webgl scene",
      "performance budget",
      "stutter",
      "jank",
      "swiftshader"
    ],
    "status": "curated",
    "uri": "skill://graphics-performance-qa/SKILL.md"
  },
  {
    "name": "nextjs-runtime-engineering",
    "description": "Diagnose and fix Next.js 16+ App Router runtime and build issues with bundled docs and the dev server MCP endpoint.",
    "tags": [
      "next.js",
      "nextjs",
      "next.js 16",
      "app router",
      "hydration",
      "hydration errors",
      "runtime errors",
      "server components",
      "caching",
      "next-devtools",
      "next-devtools-mcp",
      "dev server",
      "build errors",
      "upgrading",
      "turbopack",
      "proxy.ts"
    ],
    "status": "curated",
    "uri": "skill://nextjs-runtime-engineering/SKILL.md"
  },
  {
    "name": "spline-to-web",
    "description": "Design or edit Spline scenes with the Spline MCP and embed them with lazy loading, fallbacks or GLB export to R3F.",
    "tags": [
      "spline",
      "spline scene",
      "spline mcp",
      "splinecode",
      "@splinetool/react-spline",
      "react-spline",
      "spline embed"
    ],
    "status": "curated",
    "uri": "skill://spline-to-web/SKILL.md"
  },
  {
    "name": "agent-capability-navigation",
    "description": "Use SOREN V3 planning, knowledge search and setup guides to choose skills, docs and MCP connections honestly.",
    "tags": [
      "context7",
      "serena",
      "version-matched",
      "official docs",
      "library documentation",
      "up-to-date",
      "semantic code navigation",
      "code navigation",
      "mcp servers",
      "capability profile",
      "plan toolchain",
      "toolchain",
      "knowledge sources",
      "firecrawl"
    ],
    "status": "curated",
    "uri": "skill://agent-capability-navigation/SKILL.md"
  },
  {
    "name": "soren-learning-loop",
    "description": "Recall prior solved problems and capture scoped lessons with evidence-backed, human-reviewed skill candidates in Codex.",
    "tags": ["soren-learning-loop", "learning loop", "solved problems", "persistent learning", "skill candidates", "failure lessons"],
    "status": "curated",
    "uri": "skill://soren-learning-loop/SKILL.md"
  }
];

// Only human-approved, exact-hash-verified Foundry skills are discoverable.
// Pending/unreviewed imports never participate in routing.
SKILLS.push(...loadApprovedFoundrySkills(SKILLS));

const SKILL_ROOT = path.resolve(process.cwd(), "skills");
const terms = value => [...new Set(String(value || "").toLowerCase().replace(/[^a-z0-9.+-]+/g," ").split(/\s+/).filter(s => s.length >= 2))];

export function readSkill(name) {
  const entry = SKILLS.find(skill => skill.name === name);
  if (!entry) return null;
  const filename = path.resolve(SKILL_ROOT, entry.name, "SKILL.md");
  if (!filename.startsWith(SKILL_ROOT + path.sep)) return null;
  try {
    const content=fs.readFileSync(filename, "utf8");
    // Pin the exact reviewed bytes even if a local file changes after startup.
    if(entry.origin==='skill-foundry-core-v3'&&
      createHash('sha256').update(content).digest('hex')!==entry.contentSha256)return null;
    return content;
  } catch { return null; }
}

function ranked(query) {
  const q = String(query || "").toLowerCase();
  const words = terms(q);
  return SKILLS.map(skill => {
    const matches = skill.tags.filter(tag => terms(tag).every(word=>words.includes(word)));
    const distinct = [...new Set(matches)];
    const exact = skill.tags.filter(tag => tag.length > 3 && q.includes(tag)).length;
    return {skill, score: distinct.length + 2 * exact, reasons: distinct.slice(0,4).map(tag => "Matched: " + tag)};
  }).sort((a,b) => b.score-a.score || a.skill.name.localeCompare(b.skill.name));
}

export function searchSkills(query, limit=10) {
  const count = Number.isFinite(limit) ? Math.max(1,Math.min(25,Math.trunc(limit))) : 10;
  if (!String(query || "").trim()) return SKILLS.slice(0,count);
  return ranked(query).filter(x=>x.score>0).slice(0,count).map(x=>({...x.skill,score:x.score,reasons:x.reasons}));
}

/**
 * Adjust local routing for task intent; it is advisory and does not install,
 * trust, connect to or execute any skill. Search and discovery ranking remain
 * unchanged; only route_task receives these scoped intent adjustments.
 */
function intentAdjustedCandidates(task, unavailableSkills, preferredSkills) {
  const q=String(task||'').toLowerCase();
  const accessibleUi=/\baccessible\b|\b(?:wcag|aria|keyboard|screen reader)\b/.test(q);
  const reviewsExternalCandidate=/\b(?:provider|external)\s+(?:skill\s+)?candidate\b/.test(q)
    && /\b(?:named|review|inspect|verify|trust|trusting|approval)\b/.test(q);
  const namedAccessibilityCandidate=reviewsExternalCandidate && /\bnamed accessibility\b/.test(q);
  const rankingSkills=/\b(?:rank|compare|select|choose)\b/.test(q)
    && /\b(?:skills?|catalogs?)\b/.test(q);
  const routesMcpTasks=/\broute\b/.test(q) && /\b(?:tasks?|workflows?)\b/.test(q)
    && /\b(?:remote|mcp|connector|server)\b/.test(q);
  const genericInfrastructureAudit=/\baudit\b/.test(q)
    && /\b(?:tools?|authentication|catalog)\b/.test(q)
    && !accessibleUi && !/\baccessibility\b/.test(q);
  const mcpDocumentationFallback=unavailableSkills.includes('mcp-integration')
    && /\bmcp\b/.test(q) && /\b(?:remote|streamable|http|connector|server)\b/.test(q);
  const skillNavigationFallback=unavailableSkills.includes('skill-orchestration') && rankingSkills;
  const threeJsFallback=unavailableSkills.includes('motion-systems')
    && /\b(?:three\.js|threejs|webgl)\b/.test(q)
    && /\b(?:animation|cinematic|rendering|shader)\b/.test(q);

  return ranked(task).filter(x=>!unavailableSkills.includes(x.skill.name)).map(item=>{
    const name=item.skill.name;
    const suppressUnrelatedAccessibility=name==='accessibility' &&
      (genericInfrastructureAudit || (namedAccessibilityCandidate && !accessibleUi)) &&
      !preferredSkills.includes(name);
    if(suppressUnrelatedAccessibility)return null;
    let bonus=0;
    let explanation='';
    if(name==='accessibility' && accessibleUi) {
      bonus=12;explanation='Accessible interface requirement';
    } else if(name==='skill-orchestration' && reviewsExternalCandidate) {
      bonus=12;explanation='Review provider candidate before trust';
    } else if(name==='skill-orchestration' && rankingSkills) {
      bonus=12;explanation='Task explicitly ranks or selects skills';
    } else if(name==='skill-orchestration' && routesMcpTasks) {
      bonus=5;explanation='Task combines remote MCP with routing';
    } else if(name==='mcp-integration' && routesMcpTasks) {
      bonus=5;explanation='Remote MCP configuration remains primary';
    } else if(name==='agent-capability-navigation' && (mcpDocumentationFallback || skillNavigationFallback)) {
      bonus=8;explanation='Advisory documentation fallback, not a replacement for execution';
    } else if(name==='threejs-production' && threeJsFallback) {
      bonus=8;explanation='Available reviewed Three.js specialty fallback';
    }
    return bonus ? {...item,score:item.score+bonus,reasons:[explanation,...item.reasons]} : item;
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.skill.name.localeCompare(b.skill.name));
}

export function routeTask(task, runtime="generic", {preferredSkills=[],unavailableSkills=[]}={}) {
  const eligible=intentAdjustedCandidates(task,unavailableSkills,preferredSkills);
  const chosen=eligible.filter(x=>preferredSkills.includes(x.skill.name)).map(x=>({...x,score:Math.max(3,x.score),reasons:['Explicit approved skill choice',...x.reasons]}));
  const selected=[...chosen,...eligible.filter(x=>x.score>0&&!preferredSkills.includes(x.skill.name))].slice(0,3).map(x=>({...x.skill,score:x.score,reasons:x.reasons}));
  return {task:String(task).slice(0,500),runtime:String(runtime).slice(0,60),primary:selected[0] || null,recommendations:selected,policy:"Read-only curated skills; no automatic install or execution."};
}
