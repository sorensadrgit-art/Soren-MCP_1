/** V3 advisory tools stay off unless an operator sets SOREN_V3_TOOLS to exactly "1". */
export function v3ToolsEnabled(env=process.env){
  return env?.SOREN_V3_TOOLS==='1';
}
