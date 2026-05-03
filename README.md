# Dynamic Playground

一个已经配置好的动态交互网页模板，使用原生 HTML、CSS、JavaScript 构建，不依赖 Node 环境。

## Netlify 发布

项目已经加入 `Netlify` 发布配置，适合直接部署为免费静态站点。

在 Netlify 中导入这个项目后：

- Build command 留空
- Publish directory 填 `.`，或者直接使用仓库里的 `netlify.toml`
- 站点名可以尝试设置为 `EurekaWeb`

如果这个站点名可用，默认网址通常会是：

`https://eurekaweb.netlify.app`

如果不可用，Netlify 会要求换一个未占用的名字。

## 维护模式

项目内已经加入维护模式开关，配置文件在 `site-config.json`。

- 正常运行：`"maintenance": false`
- 进入维护页：`"maintenance": true`

当维护模式开启时：

- 访问 `index.html` 会自动跳转到 `maintenance/index.html`
- 维护页关闭后会自动跳回主页

## GitHub Pages 发布

项目已经加入 GitHub Pages 工作流，推荐仓库名使用 `EurekaWeb`。

发布后的默认地址通常会是：

`https://<你的 GitHub 用户名>.github.io/EurekaWeb/`

如果仓库名就是 `<你的 GitHub 用户名>.github.io`，那么地址会变成根域：

`https://<你的 GitHub 用户名>.github.io/`

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

- Canvas 粒子连线背景
- 鼠标跟随光晕
- 玻璃拟态悬浮卡片
- 3D 倾斜交互
- 主题切换
- 数字计数动画
- 滚动 reveal 动画

## 后续适合扩展

- 添加导航栏和多页面结构
- 接入表单、弹窗、轮播、时间轴
- 升级为 React / Vue 工程
