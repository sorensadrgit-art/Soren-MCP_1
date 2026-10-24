import test from "node:test";
import assert from "node:assert/strict";
import { SKILLS, searchSkills, routeTask, readSkill } from "../lib/catalog.mjs";

test("catalog entries have distinct names and valid skill files", () => {
  assert.ok(SKILLS.length >= 4);
  assert.equal(new Set(SKILLS.map(s => s.name)).size, SKILLS.length);
  for (const skill of SKILLS) {
    const content = readSkill(skill.name);
    assert.match(content, new RegExp("^---\\nname: " + skill.name + "\\n"));
    assert.match(content, /\ndescription:/);
  }
});

test("motion-related tasks route to motion systems", () => {
  const result = routeTask("Build a cinematic Three.js WebGL experience with GSAP scroll camera animation");
  assert.equal(result.primary?.name, "motion-systems");
  assert.ok(result.primary?.reasons.length > 0);
});

test("accessibility searches find the WCAG skill", () => {
  assert.equal(searchSkills("keyboard ARIA WCAG").at(0)?.name, "accessibility");
});

test("search is bounded and invalid read names are rejected", () => {
  assert.ok(searchSkills("design", 2).length <= 2);
  assert.equal(readSkill("../../.factory/mcp.json"), null);
  assert.equal(readSkill("not-present"), null);
});

test("agent routing does not execute arbitrary skills", () => {
  const r = routeTask("configure secure remote mcp client with streamable http");
  assert.equal(r.primary?.name, "mcp-integration");
  assert.ok(r.recommendations.length <= 3);
});

test("MinerU 4 is curated, readable, and routes PDF OCR/Markdown jobs", () => {
  const skill = SKILLS.find(s => s.name === "mineru");
  assert.ok(skill, "MinerU must be explicitly registered");
  assert.match(readSkill("mineru"), /^---\nname: mineru\n/);
  assert.equal(searchSkills("OCR scanned PDF lecture slides to Markdown")[0]?.name, "mineru");
  assert.equal(routeTask("Convert scanned PDF lecture slides to Markdown with MinerU").primary?.name, "mineru");
});
