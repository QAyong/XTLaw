# Bug：DOCX、PPTX 收起功能区后，标签行下面留着两个空按钮

**日期**：2026-11-03
**优先级**：低（P3。只是显示问题，收起后多出两个没有图标的空按钮；展开后布局也会错位。不丢数据，不影响编辑）
**状态**：已修复（2026-11-03），DOCX 0.1.16、PPTX 0.4.20。只在 WSL 的无头 Chromium 里用真实的编辑器包加模拟宿主验证过，没有在桌面应用里实测；“验证到哪一步”一节写明范围。
**范围**：Office DOCX、Office PPTX。Office PDF 在 0.1.2 就修过同一问题（见 `docs/specs/feature-042-office-pdf-plugin.md` 3.1 节），这次复查确认仍然正常。Office XLSX 的功能区不是同一套结构，早先单独处理过，这次没有重新测。

## 现象

点击当前分类标签收起功能区后，标签行下面出现两个并排的小方框，没有图标；再展开，命令行也不再是单行分页的样子，功能区变高，两个方框跟在命令行后面。

在测试里，第一次收起是好的，之后的展开、收起都不对，所以不容易稳定复现。

## 原因

三个编辑器（DOCX、PPTX、PDF）的功能区根节点都是这样渲染的：`className={"ribbon " + rootClass}`，`rootClass` 在收起、展开、紧凑模式切换时会变。React 在 `className` 变化时把整个 `class` 属性重写一遍，分页脚本（`office-toolbar-navigation.js`）加在根节点上的 `pi-office-toolbar-host`、`pi-office-ribbon-collapsed` 因此被清掉。

- 收起时编辑器只用 `display: none` 藏起命令行，不增删子节点；脚本的观察器只盯子节点变化，收不到这次 `class` 改写，也就不会补回类名。
- `vendor-overrides.css`、`slides-overrides.css` 里分页相关的规则都按 `.ribbon.pi-office-toolbar-host` 匹配。类名一丢，网格布局、箭头样式、“收起时隐藏箭头”这几条规则全部失效，而脚本追加到功能区里的两个箭头按钮还在，成了没有样式的空按钮。

测试里第一次收起是好的（类名随后被补回来了），具体是什么触发了那次刷新没有查清；之后展开、收起时没有人补回类名。

## 修复方案（已实施）

做法与 PDF 插件一致：规则改为按“没有被改写的东西”匹配，不再依赖脚本加的类名。

- 分页布局、箭头样式、隐藏原收起按钮的规则：`.ribbon.pi-office-toolbar-host` 改为 `.ribbon:has(> .pi-office-toolbar-nav)`，也就是“功能区里有脚本追加的箭头元素”。
- 收起时的规则：`.ribbon.pi-office-toolbar-host.pi-office-ribbon-collapsed` 改为 `.ribbon.ribbon-collapsed:has(> .pi-office-toolbar-nav)`，用编辑器自己的 `ribbon-collapsed` 类，收起时隐藏命令行和两个箭头，并把网格收成一行。
- 改的是 `plugins/office/vendor-overrides.css` 和 `plugins/office-pptx/slides-overrides.css`，选择器的优先级与原来相同，没有动脚本和编辑器包。
- 版本：DOCX 0.1.15 → 0.1.16，PPTX 0.4.19 → 0.4.20，两个插件的 README 各加一条说明。

没有改成让脚本监听 `class` 变化再补类名：那样要多一轮观察器回调，期间仍有一帧样式错误，而且脚本四个插件共用一份，改动面更大。

### 验证到哪一步

- 无头 Chromium（`chrome-headless-shell`）里，用各插件真实的编辑器包加一个模拟宿主（空白 PPTX、没有文件的 DOCX，无真实文件系统和授权）。每个插件依次做：初始 → 点当前分类收起 → 点别的分类展开 → 再收起 → 再展开，记录功能区高度和两个箭头的显示状态。
- 修复前（旧样式）：DOCX、PPTX 第一次收起正常；之后展开，功能区变成 `display: block`、高 101px，两个箭头是 16×25 的普通按钮；再收起，高 57px，两个按钮还在。收起状态的截图与用户报告一致。
- 修复后：DOCX、PPTX 每一步都正常，展开时网格布局、高 76px、箭头 32×44；收起时高 32px、箭头 `display: none`。
- Office PDF（未改动）同样跑了一遍：展开高 80px、收起高 36px，箭头收起时隐藏，展开后恢复。
- `apps/buddy/__tests__` 下 8 个 Office 相关 spec（62 个用例）通过，但它们不覆盖这两个样式文件，改动本身没有自动测试。`pnpm market:check` 报 office、office-pptx 与市场仓库不一致，是还没执行 `pnpm market:sync` 的预期结果。没有在桌面应用里实测，没有测 XLSX。

## 验收

- DOCX、PPTX：点当前分类标签收起，标签行下面没有任何多余按钮；再点任意分类标签展开，命令行回到单行、左右有翻页箭头；反复收起、展开几次，都一样。
- 展开状态下命令行太长时，翻页箭头仍可用。
- 在 Windows 预览里装新包验证（插件要重新打包成 `.lexora-extension` 放到 `D:\dev\`，见 `AGENTS.md`）。

## 相关记录

- 同一个根因最早在 PDF 插件里发现并修复，见 `docs/specs/feature-042-office-pdf-plugin.md` 3.1 节。当时判断“其他三个插件不受影响”，只对了脚本的另一项改动（`tabPressExpands`），样式这一项 DOCX、PPTX 同样受影响，这次补上。
- 分页脚本 `office-toolbar-navigation.js` 四个插件共用，这次没有改。
