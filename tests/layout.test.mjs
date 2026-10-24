import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import jsxRuntime from 'react/jsx-runtime';

function loadLayoutModule() {
  const fileContent = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const cleanedContent = fileContent.replace(/import\s+['"].*\.css['"];?/g, '');

  const transpiled = ts.transpileModule(cleanedContent, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const customRequire = (moduleName) => {
    if (moduleName === 'react') return React;
    if (moduleName === 'react/jsx-runtime' || moduleName === 'react/jsx-dev-runtime') {
      return jsxRuntime;
    }
    return require(moduleName);
  };

  const moduleObj = { exports: {} };
  const runModule = new Function('exports', 'require', 'module', transpiled.outputText);
  runModule(moduleObj.exports, customRequire, moduleObj);

  return moduleObj.exports;
}

test('root layout exports correct metadata', () => {
  const { metadata } = loadLayoutModule();

  assert.ok(metadata, 'metadata should be defined');
  assert.equal(typeof metadata.title, 'string');
  assert.equal(metadata.title, 'Soren Universal Skill Router');
  assert.equal(typeof metadata.description, 'string');
  assert.equal(
    metadata.description,
    'Federated MCP skill discovery and review across external providers'
  );
});

test('root layout renders children wrapped in html (lang="en") and body tags', () => {
  const layoutExports = loadLayoutModule();
  const Layout = layoutExports.default;

  assert.equal(typeof Layout, 'function', 'Default export must be a Layout component function');

  const testChild = React.createElement('div', { id: 'test-child-node' }, 'Test Content');
  const element = Layout({ children: testChild });

  assert.ok(element, 'Layout should return a React element');
  assert.equal(element.type, 'html');
  assert.equal(element.props.lang, 'en');

  const bodyChild = element.props.children;
  assert.ok(bodyChild, 'html should have children (body)');
  assert.equal(bodyChild.type, 'body');

  const innerChildren = bodyChild.props.children;
  assert.equal(innerChildren, testChild);
});
