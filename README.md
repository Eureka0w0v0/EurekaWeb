# Dynamic Playground

一个已经配置好的动态交互网页模板，使用原生 HTML、CSS、JavaScript 构建，不依赖 Node 环境。

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
