# Eureka Web

尤里卡的个人网页，使用原生 HTML、CSS、JavaScript 构建，不依赖 Node 环境。

## 运行方式

### 方式 1：VS Code 任务

运行 `Start Local Web Server` 任务，然后访问：

`http://localhost:5500`

### 方式 2：终端

```bash
python3 -m http.server 5500
```

然后在浏览器中打开：

`http://localhost:5500`

## 当前内置效果

- 开场：幕布沿一条斜缝刀切分开，kicker 就地留下成为正文，Welcome 字从自己的尘埃里凝出来（每个会话只放一次，`?intro` 强制播放）
- 主题切换（浅色 / 深色波纹过渡）
- 中 / 英 / 日 三语切换
- Welcome 文字 canvas 动效（滚动碎裂成尘）
- 编程语言节点 + Three.js 线框脑模型（按真实解剖雕形：纵裂、颞叶、平底、小脑叶片、脑桥；进入视野后懒加载；连接线每帧贴合投影轮廓）
- 职业卡片滚动层（UFO / 外星人）
- 照片剧场：掉落、轮播、Show All、点击放大
- 左上 wordmark、右侧小圆点节导航
- 玻璃拟态卡片、3D 倾斜、颗粒噪点
- `404.html`、1200×630 的 OG 分享图（`images/og-card.png`，由脑模型几何离线渲染）

## 维护脚本

两个脚本都只依赖 Python 3 与 ImageMagick，不引入 Node。

### 缓存版本号（必须）

`netlify.toml` 对 css / js / images 是一年 immutable 缓存，改了文件不换 URL，老访客永远收不到新版本。版本号由内容哈希生成，**改完资源提交前跑一次**：

```bash
python3 tools/stamp-assets.py          # 按内容哈希改写 ?v=
python3 tools/stamp-assets.py --check  # 只检查，过期则退出码 1
```

覆盖三个文件：`index.html`、`404.html`、`manifest.webmanifest`。后两个原来是手写日期戳（404 的 favicon 干脆没戳），`--check` 看不见它们，换个图标就会被 immutable 缓存钉死一年。

`index.html` 引用 `manifest.webmanifest`，而后者自己的戳一改、它的哈希就变了，所以脚本跑的是不动点迭代——改一个图标，一趟就能把 manifest 和 index.html 两层一起收敛。

引用了本地资源却**不带** `?v=` 会以退出码 2 报错。唯一豁免是 `sw.js`：service worker 必须保持固定 URL 才能被替换，所以 `netlify.toml` 单独给它 `no-cache`。

没跑会被 GitHub Actions 拦下（workflow 里有 `--check`）。脚本幂等，没改动的资源不会产生 diff。

不在 CI 里自动改写，是因为 Netlify 无构建命令、直接发布仓库内容 —— 版本号必须落在提交里，否则两个站会不一致。

### 加照片

```bash
python3 tools/add-photo.py ~/Desktop/IMG_1234.HEIC
python3 tools/add-photo.py shot.jpg --name kamakura-beach
```

自动生成 preview / medium / full 三档 WebP（最长边 640 / 1280 / 1920，q92），**剥除 EXIF**（手机照片带 GPS），文件名统一小写，并打印可直接粘贴的 `<article>` 卡片。

卡片只打印不自动插入 —— 照片区的 `data-photo-base` 顺序会被 `script.js` 的滚动编排读取，机器改写容易弄坏动画。粘贴完再跑一次 `stamp-assets.py`。

## 图片资源分层

| 目录 | 用途 | 规格 |
|---|---|---|
| `images/photo-preview/` | 列表预览 | 小图 WebP |
| `images/medium/` | 放大优先档 | ~1280w WebP |
| `images/full/` | 放大高清档 | ~1920w WebP |
| `images/icons/` | 头像 / UFO / 外星人 / favicon | 压缩 WebP/PNG |
| `images/_originals/` | 原始备份，不参与页面引用 | 原始 JPG/PNG |

页面默认只加载预览图；放大时通过 `srcset` 按需取 medium/full。  
`images/_originals/` 仅作本地/仓库备份，Netlify 与 GitHub Pages 部署时会排除。

## 维护模式

配置文件：`site-config.json`

- 正常运行：`"maintenance": false`
- 进入维护页：`"maintenance": true`

## Netlify 发布

- Build command 留空
- Publish directory 填 `.`，或直接使用仓库里的 `netlify.toml`
- 已配置静态资源长缓存与基础安全头
- `.netlifyignore` 会排除 `images/_originals/`

## GitHub Pages 发布

已加入 `.github/workflows/pages.yml`，部署前会自动删掉 `images/_originals/`。发布后地址通常为：

`https://<你的 GitHub 用户名>.github.io/<仓库名>/`

## 部署体积

页面实际需要下载的图片大约：

- preview + medium + full + icons ≈ **11MB**
- 原始备份 `_originals/` ≈ **72MB**（部署排除）

## 许可

代码（HTML / CSS / JS / Python 脚本）以 [MIT License](LICENSE) 开源。

`images/` 下的照片、头像与插画属于个人作品，**不在 MIT 授权范围内**，保留所有权利，未经许可请勿转载或另作他用。`vendor/` 下的 Three.js 遵循其自身的 MIT 许可。
