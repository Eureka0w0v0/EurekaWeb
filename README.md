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

- 开场 intro 动画
- 主题切换（浅色 / 深色波纹过渡）
- 中 / 英 / 日 三语切换
- Welcome 文字 canvas 动效
- 编程语言节点 + Three.js 线框脑模型（进入视野后懒加载）
- 职业卡片滚动层（UFO / 外星人）
- 照片剧场：掉落、轮播、Show All、点击放大
- 玻璃拟态卡片、3D 倾斜、颗粒噪点

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
