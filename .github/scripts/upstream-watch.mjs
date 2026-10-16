import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

// 按 AGENTS.md「集成上游到 XTLaw」预备分支：只做可以机械判断的部分，
// 遇到需要判断的提交就停下，把原因写进报告，由人接手。
const baselineFile = process.env.BASELINE_FILE ?? 'docs/upstream-baseline.json'
const upstreamRef = process.env.UPSTREAM_REF ?? 'upstream/master'
const outDir = process.env.OUT_DIR ?? join(tmpdir(), 'upstream-watch')
const repository = process.env.GITHUB_REPOSITORY ?? 'QAyong/XTLaw'
const maxFiles = 100
const maxPendingAssessed = 60

const versionFilePattern = /(?:^|\/)(?:package\.json|Cargo\.toml|Cargo\.lock|buddy\.version\.json|CHANGELOG[^/]*)$/
const versionLinePattern = /^\s*"?(?:version|sourceDateEpoch)"?\s*[:=]/

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trimEnd()
}

function tryGit(args) {
  try {
    return { ok: true, out: git(args) }
  }
  catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() }
  }
}

function lines(text) {
  return text.split('\n').filter(Boolean)
}

function inspect(sha) {
  const subject = git(['show', '-s', '--format=%s', sha])
  const files = lines(git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha]))
  const patch = git(['show', '--format=', '-U0', sha])
  const changed = []
  const brandFiles = new Set()
  let current = ''
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ b/')) {
      current = line.slice(6)
    }
    else if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
      changed.push({ file: current, text: line.slice(1) })
      if (line.startsWith('+') && /\bLexora\b/.test(line))
        brandFiles.add(current)
    }
  }
  const releaseOnly = /release|发布|版本/i.test(subject)
    && files.length > 0
    && files.every(file => versionFilePattern.test(file))
    && changed.every(item => /(?:^|\/)CHANGELOG/.test(item.file) || versionLinePattern.test(item.text))

  const reasons = []
  if (files.some(file => file.startsWith('.github/workflows/')))
    reasons.push('改动 .github/workflows（Actions 令牌无权推送）')
  if (files.some(file => /migrat/i.test(file) && !/__tests__|\.spec\./.test(file)))
    reasons.push('涉及迁移')
  if (files.some(file => /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/.test(file)))
    reasons.push('依赖或包配置变更')
  if (files.some(file => /^apps\/buddy\/(?:native|platform\/native)\//.test(file) || /\.rs$|(?:^|\/)Cargo\./.test(file)))
    reasons.push('原生代码变更')
  if (files.length > maxFiles)
    reasons.push(`文件数 ${files.length} 超过 ${maxFiles}（大功能，单独成轮）`)
  if (brandFiles.size > 0)
    reasons.push(`新增行含 Lexora 字样，需检查品牌：${[...brandFiles].slice(0, 5).join('、')}`)
  return { sha, short: sha.slice(0, 8), subject, files, releaseOnly, reasons }
}

function buildMessage(info) {
  const author = git(['show', '-s', '--format=%an <%ae>', info.sha])
  const match = /^(\w+)(?:\(([^)]+)\))?!?: ?(.*)$/.exec(info.subject)
  const english = match
    ? `Port upstream ${info.short}: ${match[1]}${match[2] ? `(${match[2]})` : ''} change`
    : `Port upstream ${info.short}`
  const chinese = `移植上游 ${info.short}：${match ? match[3] : info.subject}`
  return { author, text: `${english} (${chinese})\n\n(cherry picked from commit ${info.sha})` }
}

function conflictCount(info, tip) {
  const result = tryGit(['merge-tree', '--write-tree', `--merge-base=${info.sha}^`, tip, info.sha])
  if (result.ok)
    return 0
  return result.out.split('\n').filter(line => line.startsWith('CONFLICT')).length
}

mkdirSync(outDir, { recursive: true })
const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'))
const upstreamHead = git(['rev-parse', upstreamRef])
const range = `${baseline.lastChecked}..${upstreamRef}`
const commits = lines(git(['rev-list', '--reverse', '--topo-order', '--no-merges', range]))

function finish(result, report) {
  writeFileSync(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(join(outDir, 'report.md'), report)
  console.log(JSON.stringify(result))
}

if (commits.length === 0) {
  finish({ status: 'up-to-date', upstreamHead, picked: [], skipped: [], pending: [] }, '上游没有新的提交。\n')
  process.exit(0)
}

const picked = []
const skipped = []
let stopped = null
let lastHandled = baseline.lastChecked
let index = 0

for (; index < commits.length; index++) {
  const info = inspect(commits[index])
  if (info.releaseOnly) {
    skipped.push({ ...info, why: '发版提交，只改版本号' })
    lastHandled = info.sha
    continue
  }
  if (info.reasons.length > 0) {
    stopped = { ...info, conflicts: conflictCount(info, 'HEAD') }
    break
  }
  const attempt = tryGit(['cherry-pick', '--no-commit', info.sha])
  if (!attempt.ok) {
    const conflictFiles = lines(git(['diff', '--name-only', '--diff-filter=U']))
    tryGit(['reset', '--hard', 'HEAD'])
    stopped = { ...info, reasons: [`cherry-pick 冲突 ${conflictFiles.length} 个文件`], conflictFiles }
    break
  }
  if (tryGit(['diff', '--cached', '--quiet']).ok) {
    tryGit(['reset', '--hard', 'HEAD'])
    skipped.push({ ...info, why: '本地已包含等价改动，无新增内容' })
    lastHandled = info.sha
    continue
  }
  const message = buildMessage(info)
  git(['commit', '--author', message.author, '-m', message.text])
  picked.push(info)
  lastHandled = info.sha
}

const pending = commits.slice(stopped ? index + 1 : index).map((sha, order) => {
  if (order >= maxPendingAssessed)
    return { sha, short: sha.slice(0, 8), subject: git(['show', '-s', '--format=%s', sha]), files: [], reasons: [], conflicts: null }
  const info = inspect(sha)
  const reasons = info.releaseOnly ? ['发版提交，只改版本号，届时自动跳过'] : info.reasons
  return { ...info, reasons, conflicts: conflictCount(info, 'HEAD') }
})

const compareBase = `https://github.com/${repository}/commit`
const link = info => `[\`${info.short}\`](${compareBase}/${info.sha})`
const report = []
report.push(`上游检查范围：\`${baseline.lastChecked.slice(0, 8)}..${upstreamHead.slice(0, 8)}\`，共 ${commits.length} 个新提交。`)
report.push('')
report.push(`- 已按顺序移植：${picked.length} 个`)
report.push(`- 自动跳过：${skipped.length} 个`)
report.push(`- 停下待人工处理：${stopped ? `1 个（${stopped.short}）` : '无'}`)
report.push(`- 停下后未处理：${pending.length} 个`)

if (picked.length > 0) {
  report.push('', '## 已移植（等你审查）', '')
  report.push('| 上游提交 | 说明 | 文件数 |', '|---|---|---|')
  for (const info of picked)
    report.push(`| ${link(info)} | ${info.subject} | ${info.files.length} |`)
}
if (skipped.length > 0) {
  report.push('', '## 自动跳过', '')
  report.push('| 上游提交 | 说明 | 原因 |', '|---|---|---|')
  for (const info of skipped)
    report.push(`| ${link(info)} | ${info.subject} | ${info.why} |`)
}
if (stopped) {
  report.push('', '## 停在这里，需要人工', '')
  report.push(`${link(stopped)} ${stopped.subject}`, '')
  for (const reason of stopped.reasons)
    report.push(`- ${reason}`)
  if (stopped.conflictFiles?.length)
    report.push(`- 冲突文件：${stopped.conflictFiles.slice(0, 10).join('、')}`)
  if (stopped.conflicts)
    report.push(`- 试合并冲突数：${stopped.conflicts}`)
  report.push('', '后面的提交可能依赖它，所以不再往下自动处理。处理完后更新 `docs/upstream-baseline.json`。')
}
if (pending.length > 0) {
  report.push('', '## 停下后未处理（仅预评估，不保证可按序移植）', '')
  report.push('| 上游提交 | 说明 | 试合并冲突 | 需关注 |', '|---|---|---|---|')
  for (const info of pending) {
    const conflicts = info.conflicts == null ? '未评估' : String(info.conflicts)
    report.push(`| ${link(info)} | ${info.subject} | ${conflicts} | ${info.reasons.join('；') || '—'} |`)
  }
}

let branch = ''
if (picked.length > 0) {
  branch = `codex/upstream-auto-${lastHandled.slice(0, 8)}`
  const date = new Date().toISOString().slice(0, 10)
  const docPath = `docs/upstream-auto-${date.replaceAll('-', '')}-integration.md`
  writeFileSync(docPath, `# ${date} 上游自动预备\n\n${report.join('\n')}\n`)
  writeFileSync(baselineFile, `${JSON.stringify({ ...baseline, lastChecked: lastHandled }, null, 2)}\n`)
  git(['add', docPath, baselineFile])
  git(['commit', '-m', 'Record upstream auto-preparation and advance baseline (记录上游自动预备并推进基线)'])
  git(['switch', '-c', branch])
  report.push('', `分支：\`${branch}\`，[对比 master](https://github.com/${repository}/compare/master...${branch})`)
  report.push('', process.env.HAS_BOT_TOKEN === 'true'
    ? '合并前：等 PR 上的 CI 通过，并在本地按规则跑类型检查与相关测试。'
    : '合并前：未配置 UPSTREAM_BOT_TOKEN，PR 不会自动跑 CI；请在 PR 上先关闭再重新打开一次触发 CI，并在本地按规则跑类型检查与相关测试。')
}

const status = picked.length > 0 ? 'prepared' : stopped ? 'blocked' : 'skipped-only'
finish({
  status,
  upstreamHead,
  branch,
  picked: picked.map(info => info.short),
  skipped: skipped.map(info => info.short),
  stoppedAt: stopped?.short ?? '',
  pending: pending.map(info => info.short),
  signature: `${upstreamHead}:${stopped?.sha ?? ''}`,
}, `${report.join('\n')}\n`)
