import type { ElementNode, RootNode, TemplateChildNode } from '@vue/compiler-core'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compileScript, parse } from 'vue/compiler-sfc'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
const GLOBAL_COMPONENTS = new Set(['KeepAlive', 'RouterLink', 'RouterView', 'Suspense', 'Teleport', 'Transition', 'TransitionGroup', 'component', 'slot', 'template'])
const ELEMENT_NODE = 1
const COMPONENT_TAG = 1

function camelize(value: string) {
  return value.replace(/-(\w)/g, (_, char: string) => char.toUpperCase())
}

function pascalize(value: string) {
  const camel = camelize(value)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

function listVueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : listVueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

function collectComponentTags(node: RootNode | TemplateChildNode, tags: Set<string>) {
  if (node.type === ELEMENT_NODE && (node as ElementNode).tagType === COMPONENT_TAG)
    tags.add((node as ElementNode).tag)
  if ('children' in node) {
    for (const child of node.children) {
      if (typeof child === 'object')
        collectComponentTags(child as TemplateChildNode, tags)
    }
  }
}

/** Component tags the template renders without any import, registration or global provider behind them. */
function findUnresolvedComponents(source: string, filename: string): string[] {
  const { descriptor } = parse(source, { filename })
  if (!descriptor.template?.ast)
    return []
  const declared = new Set<string>()
  if (descriptor.script || descriptor.scriptSetup)
    Object.keys(compileScript(descriptor, { id: filename }).bindings ?? {}).forEach(name => declared.add(name))
  const optionsScript = descriptor.script?.content ?? ''
  const selfName = pascalize(basename(filename, '.vue'))
  const tags = new Set<string>()
  collectComponentTags(descriptor.template.ast, tags)
  return [...tags].filter((tag) => {
    const name = tag.split('.')[0]!
    return !GLOBAL_COMPONENTS.has(name)
      && !GLOBAL_COMPONENTS.has(pascalize(name))
      && ![name, camelize(name), pascalize(name)].some(candidate => declared.has(candidate))
      && pascalize(name) !== selfName
      && !new RegExp(`\\b${pascalize(name)}\\b`).test(optionsScript)
  })
}

describe('vue component resolution', () => {
  it('reports a component the template renders without importing it', () => {
    const missing = '<script setup lang="ts">\nimport Known from \'./Known.vue\'\n</script>\n<template><Known /><Orphan /><router-link /></template>'
    expect(findUnresolvedComponents(missing, 'Host.vue')).toEqual(['Orphan'])
  })

  it('leaves no template rendering a component that was never imported', () => {
    const unresolved = listVueFiles(sourceRoot).flatMap(file =>
      findUnresolvedComponents(readFileSync(file, 'utf8'), file).map(tag => `${relative(sourceRoot, file)}: <${tag}>`),
    )
    expect(unresolved).toEqual([])
  })
})
