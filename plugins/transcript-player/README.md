# ArtPlayer

把 ArtPlayer 5.4.0 原样放进文件页签。不改它的源码，也不另做控制条、字幕列表或文字稿。全屏、网页全屏和截图不打开。视图不允许进入全屏，也不能把截图存下来。底栏左侧可以手动加载 SRT、VTT 或 ASS，右侧 CC 开关画面字幕。加载字幕需要本地文件权限。

点击音视频会像 Office 一样在工作台单独开一页，不嵌进文件管理器。文件页里的预览仍是内置播放器。如果「设置 → 打开方式」里该后缀的「独立打开」已经选了别的播放器，改回 ArtPlayer 后再打开。

```sh
pnpm install
pnpm type-check
pnpm build
```

`dist/` 是可加载的 compiled 目录，ArtPlayer 已打进 `view.js`。
