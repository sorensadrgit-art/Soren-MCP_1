import fs from "node:fs";
import path from "node:path";

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
  }
];

const SKILL_ROOT = path.resolve(process.cwd(), "skills");
const terms = value => [...new Set(String(value || "").toLowerCase().replace(/[^a-z0-9.+-]+/g," ").split(/\s+/).filter(s => s.length >= 2))];

export function readSkill(name) {
  const entry = SKILLS.find(skill => skill.name === name);
  if (!entry) return null;
  const filename = path.resolve(SKILL_ROOT, entry.name, "SKILL.md");
  if (!filename.startsWith(SKILL_ROOT + path.sep)) return null;
  try { return fs.readFileSync(filename, "utf8"); } catch { return null; }
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

export function routeTask(task, runtime="generic", {preferredSkills=[],unavailableSkills=[]}={}) {
  const eligible=ranked(task).filter(x=>!unavailableSkills.includes(x.skill.name));
  const chosen=eligible.filter(x=>preferredSkills.includes(x.skill.name)).map(x=>({...x,score:Math.max(3,x.score),reasons:['Explicit approved skill choice',...x.reasons]}));
  const selected=[...chosen,...eligible.filter(x=>x.score>0&&!preferredSkills.includes(x.skill.name))].slice(0,3).map(x=>({...x.skill,score:x.score,reasons:x.reasons}));
  return {task:String(task).slice(0,500),runtime:String(runtime).slice(0,60),primary:selected[0] || null,recommendations:selected,policy:"Read-only curated skills; no automatic install or execution."};
}
