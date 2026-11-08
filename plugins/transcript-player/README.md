# ArtPlayer

把 ArtPlayer 5.4.0 原样放进文件页签。不改它的源码，也不另做控制条、字幕列表或文字稿。

安装时不会预选为默认播放器。在「设置 → 打开方式」里把对应后缀改为 ArtPlayer，关掉已打开的文件后再打开。

```sh
pnpm install
pnpm type-check
pnpm build
```

`dist/` 是可加载的 compiled 目录，ArtPlayer 已打进 `view.js`。
