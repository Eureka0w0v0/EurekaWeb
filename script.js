const root = document.documentElement;
const body = document.body;
const themeToggle = document.querySelector("#theme-toggle");
const languageSwitcher = document.querySelector("#language-switcher");
const languageToggle = document.querySelector("#language-toggle");
const languageMenu = document.querySelector("#language-menu");
const languageOptions = document.querySelectorAll("[data-language]");
const tiltCard = document.querySelector("#feature-card");
const welcomeSection = document.querySelector("#welcome-section");
const welcomeWord = document.querySelector("#welcome-word");
const welcomeCanvas = document.querySelector("#welcome-canvas");
const welcomeCtx = welcomeCanvas?.getContext("2d");
const brainWrap = document.querySelector(".brain-wrap");
const brainMount = document.querySelector("#brain-three-mount");
const heroSection = document.querySelector("[data-hero-section]");
const heroCopy = document.querySelector("[data-hero-copy]");
const heroVisual = document.querySelector("[data-hero-visual]");
const languageUniverse = document.querySelector("#language-universe");
const languageStage = document.querySelector(".language-stage");
const languageNetwork = document.querySelector(".language-network");
const languageNodeButtons = document.querySelectorAll(".language-node[data-language-node]");
const languageIndexButtons = document.querySelectorAll(".language-index-item");
const languageInsightTitle = document.querySelector("[data-language-insight-title]");
const languageInsightText = document.querySelector("[data-language-insight-text]");
const languageInsightTags = document.querySelector("[data-language-insight-tags]");
const careerSection = document.querySelector("#career-section");
const careerScene = document.querySelector(".career-scene");
const careerCardStack = document.querySelector(".career-card-stack");
const careerUfo = document.querySelector(".career-ufo");
const careerAlien = document.querySelector(".career-alien");
const careerCardLayers = document.querySelectorAll("[data-career-layer]");
const careerLayerScrollAreas = document.querySelectorAll(".layer-card-scroll");
const photoSection = document.querySelector("#photo-section");
const photoFixedTitle = document.querySelector(".photo-fixed-title");
const photoStage = document.querySelector(".photo-stage");
const photoQueueAnchor = document.querySelector(".photo-queue");
const photoShowAllButton = document.querySelector("#photo-show-all");
const photoFloatingCards = document.querySelectorAll(".photo-floating-card");
const photoQueueCards = document.querySelectorAll(".photo-queue-card");
const photoCarouselCards = [...photoQueueCards, ...photoFloatingCards];
const photoSlotContentMap = new Map();
const photoZoomOverlay = document.querySelector("#photo-zoom-overlay");
const photoZoomImage = document.querySelector("#photo-zoom-image");
const photoZoomCloseButton = document.querySelector("#photo-zoom-close");
const photoZoomLoading = document.querySelector("#photo-zoom-loading");
let photoZoomActive = false;
let photoZoomOpenToken = 0;
let photoZoomTriggerCard = null;
const photoZoomPreloadCache = new Map();
const photoZoomPreloadQueue = [];
let photoZoomPreloadActiveCount = 0;
let photoZoomPreloadLastActiveSlot = 0;
const themeWave = document.querySelector(".theme-wave");
const themeWaveCore = document.querySelector(".theme-wave-core");
const i18nNodes = document.querySelectorAll("[data-i18n]");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
/* The wireframe shell's ellipsoid, in local units before the group's scale.
   These are shared on purpose: the connector lines from the language pills are
   computed from the same numbers that build the mesh, so reshaping the brain
   moves the line endpoints with it. They used to be independent -- the shell
   was reshaped on 2026-08-02 and the connector anchors had been frozen since
   2026-05-03, which left the Python line starting deep inside the sphere and
   three of the others as stubs that never reached it. */
const BRAIN_SHELL = { rx: 5.8, ry: 4.5, rz: 4.2, cy: 0.32 };

const DESKTOP_BRAIN_WRAP_WIDTH = 660;
const DESKTOP_BRAIN_RENDER_WIDTH = Math.round(DESKTOP_BRAIN_WRAP_WIDTH * 1.16);
const DESKTOP_BRAIN_RENDER_HEIGHT = Math.round((DESKTOP_BRAIN_WRAP_WIDTH / 2) * 1.22);

const isDesktopInputDevice = () => (navigator.maxTouchPoints || 0) === 0;

function syncInputDeviceClass() {
  root.classList.toggle("is-desktop-input", isDesktopInputDevice());
}

syncInputDeviceClass();

function initPhotoQueueCards() {
  if (!photoStage) {
    return;
  }

  photoQueueCards.forEach((card) => {
    if (card.parentElement !== photoStage) {
      photoStage.append(card);
    }
  });
}

initPhotoQueueCards();

const themeWaveConfig = {
  EXPAND_DURATION_MS: 560,
  FADE_DURATION_MS: 180,
  EXPAND_EASING: "cubic-bezier(0.22, 1, 0.36, 1)",
  FADE_EASING: "cubic-bezier(0.4, 0, 0.2, 1)",
  SNAPSHOT_DURATION_MS: 720,
  SNAPSHOT_EASING: "cubic-bezier(0.22, 1, 0.36, 1)",
};
const SNAPSHOT_REVEAL_SAFETY_PADDING = 36;

let activeTheme = "light";
let activeLanguage = "zh";
let isThemeTransitioning = false;
let heroParallaxFrame = 0;
let careerFrame = 0;
let careerThemeResumeFrame = 0;
let careerSceneFrozenForTheme = false;
let careerThemeResumeCooldownUntil = 0;
let careerThemeRestorePending = false;
let careerThemeFrozenScrollY = 0;
let careerThemeRequiresScrollResume = false;
let photoFrame = 0;
let photoTargetProgress = 0;
let photoVisualProgress = 0;
let photoProgressVelocity = 0;
let photoLastFrameTime = 0;
const PHOTO_INTRO_PHASES = {
  rawDurationVh: 2.5,
  mobileRawDurationVh: 2.5,
  dropEnd: 0.995,
  insertHoldEnd: 0.995,
  carouselStart: 0.9,
  carouselEnd: 1,
};
const PHOTO_QUEUE_REVEAL_DROP_PROGRESS = {
  desktop: {
    visibleStart: 0.42,
    visibleEnd: 0.64,
    riseStart: 0.16,
    riseEnd: 0.7,
    spreadStart: 0.5,
  },
  mobile: {
    visibleStart: 0.46,
    visibleEnd: 0.7,
    riseStart: 0.18,
    riseEnd: 0.74,
    spreadStart: 0.56,
  },
};
const PHOTO_TITLE_DURATION_RATIO = 1.02;
const PHOTO_TITLE_FADE_OUT_PROGRESS = 0.94;
const PHOTO_AFTER_COMPLETE_SCROLL_PX = 50;
const PHOTO_DROP_EXTRA_DISTANCE_PX = {
  desktop: 220,
  mobile: 280,
};
const PHOTO_QUEUE_VISUAL_LIFT_PX = {
  desktop: 250,
  mobile: 290,
};
const PHOTO_SECTION_EXTRA_HEIGHT_PX = {
  desktop: 520,
  mobile: 620,
};
const getPhotoTitleStartRatio = (isCompact) => (isCompact ? 0.6 : 0.34);
const getPhotoDropStartProgress = (isCompact) => {
  const durationVh = isCompact
    ? PHOTO_INTRO_PHASES.mobileRawDurationVh
    : PHOTO_INTRO_PHASES.rawDurationVh;
  const titleStartRatio = getPhotoTitleStartRatio(isCompact);

  return clamp01(
    (0.72 - titleStartRatio + PHOTO_TITLE_FADE_OUT_PROGRESS * PHOTO_TITLE_DURATION_RATIO) /
      durationVh
  );
};
let photoCarouselEnabled = false;
let photoCarouselTargetIndex = 0;
let photoCarouselVisualIndex = 0;
let photoCarouselPreviousIndex = 0;
let photoCarouselTransitionDirection = 0;
let photoCarouselMinIndex = 0;
let photoCarouselMaxIndex = 0;
let photoCarouselSettling = false;
let photoCarouselHasInteracted = false;
let photoSelectedSlot = null;
const photoCardSlotMap = new Map();
let photoSelectedSourceCard = null;
let photoReinsertActive = false;
let photoAllExpanded = false;
let photoAllExpandedTarget = 0;
let photoAllExpandedProgress = 0;
let photoAllExpandedAnimating = false;
let photoAllExpandedAnimationStart = 0;
let photoAllExpandedAnimationDirection = 0;
let photoAllExpandedDuration = 880;
const photoAllExpandedLayouts = new Map();
let photoExpandedScrollExtraPx = 0;
const photoCardStyleCache = new WeakMap();
const photoElementStyleCache = new WeakMap();
let photoLayoutMetricsCache = null;
let photoCarouselHitRectCache = null;
let photoCarouselWheelDelta = 0;
let photoCarouselWheelDirection = 0;
let photoCarouselLastStepTime = 0;
let photoCarouselBoundaryDelta = 0;
let photoCarouselBoundaryDirection = 0;
let photoCarouselTouchStartX = 0;
let photoCarouselTouchStartY = 0;
let photoCarouselTouchActive = false;
let photoCarouselTouchStartedInside = false;
let photoCarouselTouchLocked = false;
let photoCarouselTouchReleasedToPage = false;
let photoCarouselTouchUnlockTimer = 0;
let welcomeRenderFrame = 0;
let welcomeLayers = [];
let brainSceneController = null;
let themeRenderFrame = 0;
let themeTransitionLiteActive = false;
let languageNetworkFrame = 0;
let activeCareerLayer = 1;
let careerLayerTimer = 0;
let careerWheelUnlockTimer = 0;
let careerTouchStartX = 0;
let careerTouchStartY = 0;
let careerTouchSwitchLocked = false;

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const storageKey = "preferred-theme";
const languageStorageKey = "preferred-language";
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const pageTranslations = {
  zh: {
    documentLang: "zh-CN",
    skipToContent: "跳到主要内容",
    title: "Eureka Web",
    description: "一个具有动态背景、交互卡片、鼠标跟随光效和粒子画布的网页示例。",
    welcomeWord: "欢迎",
    welcomeKicker: "FOR YOU",
    eyebrow: "Eureka Web",
    heroTitle: "你好\n我是尤里卡",
    heroText: "欢迎来到我的网页",
    contactLine: "联系方式:******",
    birthdayLine: "生日:****.06.14",
    addressLine: "住址:火星",
    tagHello: "你好",
    tagName: "尤里卡",
    tagWelcome: "欢迎你",
    tagHere: "来到这里",
    languageEyebrow: "编程语言",
    languageTitle: "我接触过的\n编程语言",
    languageText: "这些语言陪我搭建网页、探索交互，也让我把灵感慢慢变成真实作品。",
    languageInsightKicker: "技能节点",
    languageNodeCppText: "C++ 是一种编译型通用编程语言，强调性能、内存控制和底层系统能力，常用于算法、游戏引擎和高性能软件。",
    languageNodeHtmlText: "HTML 是网页内容的标记语言，用标签描述标题、段落、图片和链接等结构，是浏览器理解页面语义的基础。",
    languageNodeCssText: "CSS 是网页样式语言，负责颜色、排版、布局、响应式适配和视觉动效，让页面从结构变成可感知的界面。",
    languageNodeJsText: "JavaScript 是 Web 的脚本语言，运行在浏览器中，为页面加入交互、状态变化、数据处理和动态内容。",
    languageNodePyText: "Python 是一种解释型通用编程语言，语法简洁、生态丰富，常用于自动化、数据分析、人工智能和后端开发。",
    languageNodeCppTags: ["编译型", "高性能", "系统级"],
    languageNodeHtmlTags: ["标记语言", "语义结构", "网页基础"],
    languageNodeCssTags: ["样式语言", "布局", "响应式"],
    languageNodeJsTags: ["脚本语言", "交互", "动态网页"],
    languageNodePyTags: ["解释型", "数据分析", "自动化"],
    photoEyebrow: "Gallery",
    photoTitle: "照片",
    photoShowAllLabel: "显示全部",
    photoCollapseLabel: "收起",
    careerLayer1Kicker: "第 01 页",
    careerLayer2Kicker: "第 02 页",
    careerLayer3Kicker: "第 03 页",
    careerLayer1Title: "职业",
    careerLayer2Title: "外星人猎人",
    careerLayer3Text: "请你在怀疑我的职业之前先想一下你在生活中有亲眼见到过任何外星人吗？",
    themeToggleLabel: "切换浅色或深色模式",
    languageToggleLabel: "切换语言",
  },
  en: {
    documentLang: "en",
    skipToContent: "Skip to main content",
    title: "Eureka Web",
    description: "A dynamic personal page with animated particles, glass cards, and interactive motion.",
    welcomeWord: "Welcome",
    welcomeKicker: "FOR YOU",
    eyebrow: "Eureka Web",
    heroTitle: "Hello I'm Eureka",
    heroText: "Welcome to my website",
    contactLine: "Contact:******",
    birthdayLine: "Birthday:****.06.14",
    addressLine: "Address:Mars",
    tagHello: "Hello",
    tagName: "there",
    tagWelcome: "Welcome",
    tagHere: "Right Here",
    languageEyebrow: "PROGRAMMING LANGUAGES",
    languageTitle: "Programming Languages",
    languageText: "These languages helped me build websites, explore interaction, and turn ideas into real projects.",
    languageInsightKicker: "Skill Node",
    languageNodeCppText: "C++ is a compiled, general-purpose language focused on performance, memory control, and system-level programming. It is widely used in algorithms, engines, and high-performance software.",
    languageNodeHtmlText: "HTML is the markup language of the web. It describes headings, paragraphs, images, links, and semantic structure so browsers can understand page content.",
    languageNodeCssText: "CSS is the styling language for the web. It controls color, typography, layout, responsive behavior, and motion, turning structure into a visual interface.",
    languageNodeJsText: "JavaScript is the scripting language of the web. It runs in the browser and adds interaction, state changes, data handling, and dynamic content.",
    languageNodePyText: "Python is an interpreted, general-purpose programming language known for clean syntax and a rich ecosystem. It is often used in automation, data analysis, AI, and backend development.",
    languageNodeCppTags: ["Compiled", "Performance", "Systems"],
    languageNodeHtmlTags: ["Markup", "Semantics", "Web Base"],
    languageNodeCssTags: ["Styling", "Layout", "Responsive"],
    languageNodeJsTags: ["Scripting", "Interaction", "Dynamic Web"],
    languageNodePyTags: ["Interpreted", "Data", "Automation"],
    photoEyebrow: "Gallery",
    photoTitle: "Photos",
    photoShowAllLabel: "Show All",
    photoCollapseLabel: "Collapse",
    careerLayer1Kicker: "LAYER 01",
    careerLayer2Kicker: "LAYER 02",
    careerLayer3Kicker: "LAYER 03",
    careerLayer1Title: "Career",
    careerLayer2Title: "Alien Hunter",
    careerLayer3Text: "Before you doubt my job, ask yourself: have you ever seen an alien with your own eyes in everyday life?",
    themeToggleLabel: "Switch between light and dark mode",
    languageToggleLabel: "Switch language",
  },
  ja: {
    documentLang: "ja",
    skipToContent: "本文へスキップ",
    title: "Eureka Web",
    description: "動的な背景、ガラスカード、粒子アニメーションを備えたインタラクティブな個人ページです。",
    welcomeWord: "ようこそ",
    welcomeKicker: "FOR YOU",
    eyebrow: "Eureka Web",
    heroTitle: "こんにちは\nユリカです",
    heroText: "私のホームページへようこそ",
    contactLine: "連絡先:******",
    birthdayLine: "誕生日:****.06.14",
    addressLine: "住所:火星",
    tagHello: "こんにちは",
    tagName: "ユリカです",
    tagWelcome: "ようこそ",
    tagHere: "ここへ",
    languageEyebrow: "プログラミング言語",
    languageTitle: "触れてきたプログラミング言語",
    languageText: "これらの言語は、Web制作やインタラクションの探究を支え、アイデアを実際の作品へ形にしてくれました。",
    languageInsightKicker: "スキルノード",
    languageNodeCppText: "C++はコンパイル型の汎用プログラミング言語です。性能、メモリ制御、システム寄りの処理に強く、アルゴリズムやエンジン、高速なソフトウェアで広く使われます。",
    languageNodeHtmlText: "HTMLはWebページの内容を表すマークアップ言語です。見出し、段落、画像、リンクなどをタグで構造化し、ブラウザに意味を伝えます。",
    languageNodeCssText: "CSSはWebページの見た目を整えるスタイル言語です。色、文字組み、レイアウト、レスポンシブ対応、動きの表現を担います。",
    languageNodeJsText: "JavaScriptはWebのスクリプト言語です。ブラウザ上で動作し、ページにインタラクション、状態変化、データ処理、動的な表示を加えます。",
    languageNodePyText: "Pythonはインタプリタ型の汎用プログラミング言語です。読みやすい文法と豊富なエコシステムが特徴で、自動化、データ分析、AI、バックエンド開発でよく使われます。",
    languageNodeCppTags: ["コンパイル型", "高性能", "システム系"],
    languageNodeHtmlTags: ["マークアップ", "意味構造", "Web基礎"],
    languageNodeCssTags: ["スタイル", "レイアウト", "レスポンシブ"],
    languageNodeJsTags: ["スクリプト", "インタラクション", "動的Web"],
    languageNodePyTags: ["インタプリタ型", "データ分析", "自動化"],
    photoEyebrow: "Gallery",
    photoTitle: "写真",
    photoShowAllLabel: "すべて表示",
    photoCollapseLabel: "閉じる",
    careerLayer1Kicker: "レイヤー 01",
    careerLayer2Kicker: "レイヤー 02",
    careerLayer3Kicker: "レイヤー 03",
    careerLayer1Title: "職業",
    careerLayer2Title: "宇宙人ハンター",
    careerLayer3Text: "私の職業を疑う前に、日常生活で宇宙人を自分の目で見たことがあるか、先に考えてみてください。",
    themeToggleLabel: "ライトモードとダークモードを切り替える",
    languageToggleLabel: "言語を切り替える",
  },
};

const languageNodeInfo = {
  cpp: {
    label: "C++",
    textKey: "languageNodeCppText",
    tagsKey: "languageNodeCppTags",
    fallbackTags: ["Compiled", "Performance", "Systems"],
  },
  html: {
    label: "HTML",
    textKey: "languageNodeHtmlText",
    tagsKey: "languageNodeHtmlTags",
    fallbackTags: ["Markup", "Semantics", "Web Base"],
  },
  css: {
    label: "CSS",
    textKey: "languageNodeCssText",
    tagsKey: "languageNodeCssTags",
    fallbackTags: ["Styling", "Layout", "Responsive"],
  },
  js: {
    label: "JavaScript",
    textKey: "languageNodeJsText",
    tagsKey: "languageNodeJsTags",
    fallbackTags: ["Scripting", "Interaction", "Dynamic Web"],
  },
  py: {
    label: "Python",
    textKey: "languageNodePyText",
    tagsKey: "languageNodePyTags",
    fallbackTags: ["Interpreted", "Data", "Automation"],
  },
};

let activeLanguageNode = "js";

function isDesktopViewport() {
  return window.innerWidth >= 1024;
}

const mobileViewportMedia = window.matchMedia?.("(max-width: 680px), (hover: none) and (pointer: coarse)");
let stableMobileAppHeight = 0;
let stableMobileAppWidth = 0;
let stableMobileOrientation = "";
let lastVisualViewportWidth = 0;
const careerSceneThemeVars = [
  "--career-card-y",
  "--career-card-opacity",
  "--career-card-scale",
  "--career-ufo-y",
  "--career-ufo-opacity",
  "--career-ufo-scale",
  "--career-alien-y",
  "--career-alien-opacity",
  "--career-alien-scale",
];
const careerSceneThemeCache = new Map();
const careerGeometryLockTargets = [];
const careerGeometryLockCache = new Map();

function isMobileViewport() {
  return Boolean(mobileViewportMedia?.matches || window.innerWidth <= 680);
}

function getCareerLayerSwitchDuration() {
  return isMobileViewport() ? 360 : 430;
}

function getViewportOrientationKey() {
  return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
}

function restoreCareerSceneThemeCache() {
  if (!careerSection || !careerSceneThemeCache.size) {
    return;
  }

  careerSceneThemeVars.forEach((propertyName) => {
    const value = careerSceneThemeCache.get(propertyName);
    if (value) {
      careerSection.style.setProperty(propertyName, value);
    }
  });
}

function cacheInlineStyleSnapshot(element) {
  if (!element || careerGeometryLockCache.has(element)) {
    return;
  }

  careerGeometryLockCache.set(element, {
    position: element.style.position,
    left: element.style.left,
    top: element.style.top,
    width: element.style.width,
    height: element.style.height,
    minHeight: element.style.minHeight,
    margin: element.style.margin,
    transform: element.style.transform,
    transformOrigin: element.style.transformOrigin,
    perspective: element.style.perspective,
    transformStyle: element.style.transformStyle,
    opacity: element.style.opacity,
    zIndex: element.style.zIndex,
    pointerEvents: element.style.pointerEvents,
    contain: element.style.contain,
    willChange: element.style.willChange,
  });
}

function lockElementToViewportRect(element, { zIndex = null, contain = "" } = {}) {
  if (!element || !isMobileViewport()) {
    return;
  }

  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  cacheInlineStyleSnapshot(element);
  careerGeometryLockTargets.push(element);

  const computed = getComputedStyle(element);
  const resolvedZIndex = zIndex ?? (computed.zIndex === "auto" ? "" : computed.zIndex);

  element.style.position = "fixed";
  element.style.left = `${rect.left.toFixed(2)}px`;
  element.style.top = `${rect.top.toFixed(2)}px`;
  element.style.width = `${rect.width.toFixed(2)}px`;
  element.style.height = `${rect.height.toFixed(2)}px`;
  element.style.minHeight = `${rect.height.toFixed(2)}px`;
  element.style.margin = "0";
  element.style.transform = "none";
  element.style.zIndex = resolvedZIndex;
  element.style.pointerEvents = "none";
  element.style.contain = contain;
  element.style.willChange = "auto";
}

function lockCareerSceneToViewportForTheme() {
  if (!careerScene || !isMobileViewport()) {
    return false;
  }

  const rect = careerScene.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return false;
  }

  cacheInlineStyleSnapshot(careerScene);
  careerGeometryLockTargets.push(careerScene);

  const computed = getComputedStyle(careerScene);
  const resolvedZIndex = computed.zIndex === "auto" ? "3" : computed.zIndex;

  careerScene.style.position = "fixed";
  careerScene.style.left = `${rect.left.toFixed(2)}px`;
  careerScene.style.top = `${rect.top.toFixed(2)}px`;
  careerScene.style.width = `${rect.width.toFixed(2)}px`;
  careerScene.style.height = `${rect.height.toFixed(2)}px`;
  careerScene.style.minHeight = `${rect.height.toFixed(2)}px`;
  careerScene.style.margin = "0";
  careerScene.style.transformOrigin = "top left";
  careerScene.style.transform = "none";
  careerScene.style.opacity = computed.opacity;
  careerScene.style.zIndex = resolvedZIndex;
  careerScene.style.pointerEvents = "none";
  careerScene.style.willChange = "auto";

  return true;
}

function lockCareerCardStackForTheme() {
  if (!careerCardStack || !isMobileViewport()) {
    return;
  }

  const rect = careerCardStack.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  const computed = getComputedStyle(careerCardStack);
  const layoutWidth = parseFloat(computed.width) || rect.width;
  const layoutHeight = parseFloat(computed.height) || rect.height;
  const visualScale = layoutWidth > 0 ? rect.width / layoutWidth : 1;
  const resolvedZIndex = computed.zIndex === "auto" ? "4" : computed.zIndex;

  cacheInlineStyleSnapshot(careerCardStack);
  careerGeometryLockTargets.push(careerCardStack);

  careerCardStack.style.position = "fixed";
  careerCardStack.style.left = `${rect.left.toFixed(2)}px`;
  careerCardStack.style.top = `${rect.top.toFixed(2)}px`;
  careerCardStack.style.width = `${layoutWidth.toFixed(2)}px`;
  careerCardStack.style.height = `${layoutHeight.toFixed(2)}px`;
  careerCardStack.style.minHeight = `${layoutHeight.toFixed(2)}px`;
  careerCardStack.style.margin = "0";
  careerCardStack.style.transformOrigin = "top left";
  careerCardStack.style.transform = `scale(${visualScale.toFixed(5)})`;
  careerCardStack.style.perspective = computed.perspective;
  careerCardStack.style.transformStyle = "preserve-3d";
  careerCardStack.style.opacity = computed.opacity;
  careerCardStack.style.zIndex = resolvedZIndex;
  careerCardStack.style.pointerEvents = "none";
  careerCardStack.style.willChange = "auto";
}

function lockCareerGeometryForTheme() {
  if (!isMobileViewport()) {
    return;
  }

  if (careerGeometryLockCache.size) {
    return;
  }

  careerGeometryLockTargets.length = 0;
  if (lockCareerSceneToViewportForTheme()) {
    return;
  }

  lockElementToViewportRect(careerUfo);
  lockCareerCardStackForTheme();
  lockElementToViewportRect(careerAlien);
}

function restoreCareerGeometryForTheme() {
  if (!careerGeometryLockCache.size) {
    return;
  }

  careerGeometryLockTargets.forEach((element) => {
    const snapshot = careerGeometryLockCache.get(element);
    if (!snapshot) {
      return;
    }

    Object.entries(snapshot).forEach(([propertyName, value]) => {
      element.style[propertyName] = value;
    });
  });

  careerGeometryLockTargets.length = 0;
  careerGeometryLockCache.clear();
}

function freezeCareerLayerStylesForTheme() {
  if (!careerCardStack || !isMobileViewport()) {
    return;
  }

  careerCardStack.classList.add("is-theme-locking");
  careerCardStack.classList.remove("is-switching-forward", "is-switching-back");

  if (careerLayerTimer) {
    window.clearTimeout(careerLayerTimer);
    careerLayerTimer = 0;
  }
}

function restoreCareerLayerStylesForTheme() {
  if (!careerCardStack) {
    return;
  }

  restoreCareerGeometryForTheme();
}

function freezeCareerSceneForTheme({ lockGeometry = true } = {}) {
  if (!careerSection || !isMobileViewport()) {
    return;
  }

  freezeCareerLayerStylesForTheme();
  if (lockGeometry) {
    lockCareerGeometryForTheme();
  } else {
    careerGeometryLockTargets.length = 0;
    careerGeometryLockCache.clear();
  }

  if (careerFrame) {
    window.cancelAnimationFrame(careerFrame);
    careerFrame = 0;
  }

  if (careerThemeResumeFrame) {
    window.cancelAnimationFrame(careerThemeResumeFrame);
    careerThemeResumeFrame = 0;
  }

  const styles = getComputedStyle(careerSection);
  careerSceneThemeVars.forEach((propertyName) => {
    const value = (
      careerSection.style.getPropertyValue(propertyName) ||
      styles.getPropertyValue(propertyName)
    ).trim();
    careerSceneThemeCache.set(propertyName, value);
    if (value) {
      careerSection.style.setProperty(propertyName, value);
    }
  });

  careerThemeFrozenScrollY = window.scrollY;
  careerThemeResumeCooldownUntil = Number.POSITIVE_INFINITY;
  careerThemeRequiresScrollResume = true;
  careerSceneFrozenForTheme = true;
}

function clearStaleCareerThemeLockBeforeTransition() {
  if (!isMobileViewport() || careerThemeRestorePending || isThemeTransitioning) {
    return;
  }

  const hasStaleLock = Boolean(
    careerGeometryLockCache.size ||
    careerGeometryLockTargets.length ||
    careerCardStack?.classList.contains("is-theme-locking") ||
    careerSceneFrozenForTheme
  );

  if (!hasStaleLock) {
    return;
  }

  if (careerThemeResumeFrame) {
    window.cancelAnimationFrame(careerThemeResumeFrame);
    careerThemeResumeFrame = 0;
  }

  restoreCareerSceneThemeCache();
  restoreCareerLayerStylesForTheme();
  careerCardStack?.classList.remove("is-theme-locking");
  careerSceneFrozenForTheme = false;
  careerThemeRequiresScrollResume = false;
  careerThemeResumeCooldownUntil = 0;
}

function scheduleCareerSceneResumeAfterTheme() {
  if (!careerSection || !careerSceneFrozenForTheme) {
    return;
  }

  careerThemeRestorePending = true;

  if (careerThemeResumeFrame) {
    window.cancelAnimationFrame(careerThemeResumeFrame);
  }

  const resumeWhenThemeWaveSettles = () => {
    if (
      isMobileViewport() &&
      (
        isThemeTransitioning ||
        themeWave?.classList.contains("is-active") ||
        root.classList.contains("theme-snapshot-active") ||
        body.classList.contains("theme-snapshot-active")
      )
    ) {
      careerThemeResumeFrame = window.requestAnimationFrame(resumeWhenThemeWaveSettles);
      return;
    }

    restoreCareerSceneThemeCache();
    careerThemeResumeFrame = window.requestAnimationFrame(() => {
      restoreCareerSceneThemeCache();
      restoreCareerLayerStylesForTheme();
      careerThemeResumeFrame = window.requestAnimationFrame(() => {
        careerThemeResumeFrame = window.requestAnimationFrame(() => {
          careerThemeResumeFrame = 0;
          careerCardStack?.classList.remove("is-theme-locking");
          careerSceneFrozenForTheme = false;
          careerThemeResumeCooldownUntil = performance.now() + 320;
          careerThemeRestorePending = false;
        });
      });
    });
  };

  careerThemeResumeFrame = window.requestAnimationFrame(resumeWhenThemeWaveSettles);
}

function isCareerSceneThemeLocked() {
  if (careerThemeRequiresScrollResume) {
    if (Math.abs(window.scrollY - careerThemeFrozenScrollY) <= 3) {
      return true;
    }

    careerThemeRequiresScrollResume = false;
    careerThemeResumeCooldownUntil = 0;
  }

  const isCoolingDown = (
    performance.now() < careerThemeResumeCooldownUntil &&
    Math.abs(window.scrollY - careerThemeFrozenScrollY) <= 3
  );

  return (
    careerSceneFrozenForTheme ||
    isCoolingDown ||
    isThemeTransitioning ||
    careerThemeRestorePending ||
    themeTransitionLiteActive ||
    root.classList.contains("theme-snapshot-active") ||
    body.classList.contains("theme-snapshot-active")
  );
}

function beginThemeTransitionContext(options = {}) {
  freezeCareerSceneForTheme(options);
  root.classList.add("theme-syncing");
  body.classList.add("theme-syncing");
}

function endThemeTransitionContext() {
  root.classList.remove("theme-syncing");
  body.classList.remove("theme-syncing");
  if (!themeTransitionLiteActive && !root.classList.contains("theme-snapshot-active")) {
    scheduleCareerSceneResumeAfterTheme();
  }
}

async function finishThemeTransitionContext() {
  root.classList.remove("theme-syncing");
  body.classList.remove("theme-syncing");

  if (!careerSceneFrozenForTheme && !careerGeometryLockCache.size) {
    return;
  }

  careerThemeRestorePending = true;

  if (careerThemeResumeFrame) {
    window.cancelAnimationFrame(careerThemeResumeFrame);
    careerThemeResumeFrame = 0;
  }

  restoreCareerSceneThemeCache();
  restoreCareerLayerStylesForTheme();
  careerCardStack?.classList.remove("is-theme-locking");
  careerSceneFrozenForTheme = false;
  careerThemeRequiresScrollResume = false;
  careerThemeResumeCooldownUntil = performance.now() + 320;

  await waitForFrames(2);
  careerThemeRestorePending = false;
}

async function loadSiteConfig() {
  try {
    const response = await fetch("./site-config.json", {
      cache: "no-store",
      signal: AbortSignal.timeout?.(4000),
    });
    if (!response.ok) {
      return { maintenance: false };
    }

    const config = await response.json();
    return config && typeof config === "object" ? config : { maintenance: false };
  } catch (error) {
    console.error("Failed to load site config.", error);
    return { maintenance: false };
  }
}

function syncViewportHeightVar() {
  if (isMobileViewport()) {
    const width = Math.round(window.innerWidth);
    const orientation = getViewportOrientationKey();
    const shouldRefreshStableHeight = (
      stableMobileAppHeight === 0 ||
      stableMobileAppWidth === 0 ||
      Math.abs(width - stableMobileAppWidth) > 2 ||
      orientation !== stableMobileOrientation
    );

    if (shouldRefreshStableHeight) {
      stableMobileAppHeight = Math.round(window.innerHeight);
      stableMobileAppWidth = width;
      stableMobileOrientation = orientation;
      root.style.setProperty("--app-height", `${stableMobileAppHeight}px`);
    }

    return;
  }

  const viewportHeight = Math.max(
    window.innerHeight,
    window.visualViewport?.height || 0
  );
  root.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
}

function handleVisualViewportResize() {
  const currentWidth = Math.round(window.visualViewport?.width || window.innerWidth);
  if (lastVisualViewportWidth === 0 || Math.abs(currentWidth - lastVisualViewportWidth) > 2) {
    lastVisualViewportWidth = currentWidth;
    invalidatePhotoLayoutCaches();
  }

  syncViewportHeightVar();
}

function isElementInViewport(element) {
  if (!element) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const viewportHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, 1);
  return rect.bottom > 0 && rect.top < viewportHeight;
}

function syncThemeSnapshotVisuals(theme) {
  const brainVisible = (
    isElementInViewport(languageUniverse) ||
    isElementInViewport(brainMount)
  );

  if (brainVisible) {
    brainSceneController?.setTheme(theme);
  }

  if (isElementInViewport(welcomeSection)) {
    buildWelcomeCanvas();
    drawWelcome();
  }
}

function runThemeRenderWork(theme) {
  brainSceneController?.setTheme(theme);
  buildWelcomeCanvas();
  drawWelcome();
  requestWelcomeRender();
}

function scheduleThemeRenderWork(theme) {
  if (themeRenderFrame) {
    window.cancelAnimationFrame(themeRenderFrame);
  }

  themeRenderFrame = window.requestAnimationFrame(() => {
    themeRenderFrame = 0;
    brainSceneController?.setTheme(theme);
    const welcomeVisible = isElementInViewport(welcomeSection);
    buildWelcomeCanvas();
    if (welcomeVisible) {
      drawWelcome();
    } else {
      requestWelcomeRender();
    }
  });
}

function syncSystemChromeForTheme(theme) {
  body.style.colorScheme = theme;
  root.style.colorScheme = theme;
  const rootStyles = getComputedStyle(root);
  const themeBg = rootStyles.getPropertyValue("--bg").trim();
  const chromeBg = rootStyles.getPropertyValue("--chrome-bg").trim() || themeBg;
  themeColorMeta?.setAttribute("content", chromeBg);
}

function applyTheme(theme, options = {}) {
  const {
    deferHeavyWork = isMobileViewport(),
    skipHeavyWork = false,
    syncSnapshotVisuals = false,
    deferSystemChrome = false,
  } = options;
  activeTheme = theme;
  root.classList.toggle("theme-dark", theme === "dark");
  body.classList.toggle("theme-dark", theme === "dark");
  const rootStyles = getComputedStyle(root);
  const themeBg = rootStyles.getPropertyValue("--bg").trim();
  const chromeBg = rootStyles.getPropertyValue("--chrome-bg").trim() || themeBg;
  root.style.backgroundColor = chromeBg;
  body.style.backgroundColor = chromeBg;

  if (!deferSystemChrome) {
    syncSystemChromeForTheme(theme);
  }

  if (syncSnapshotVisuals) {
    syncThemeSnapshotVisuals(theme);
  }

  if (skipHeavyWork) {
    return;
  }

  brainSceneController?.setTheme(theme);

  if (deferHeavyWork) {
    scheduleThemeRenderWork(theme);
  } else {
    runThemeRenderWork(theme);
  }
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    /* Storage is unavailable in private/restricted contexts; preference lives for this session only. */
  }
}

function getStoredTheme() {
  return safeStorageGet(storageKey);
}

function getStoredLanguage() {
  return safeStorageGet(languageStorageKey);
}

function getSystemTheme() {
  return mediaQuery.matches ? "dark" : "light";
}

function resolveTheme() {
  return getStoredTheme() || getSystemTheme();
}

function getSystemLanguage() {
  const locale = (navigator.language || "zh").toLowerCase();
  if (locale.startsWith("ja")) {
    return "ja";
  }
  if (locale.startsWith("en")) {
    return "en";
  }
  return "zh";
}

function resolveLanguage() {
  const storedLanguage = getStoredLanguage();
  if (storedLanguage && pageTranslations[storedLanguage]) {
    return storedLanguage;
  }

  return getSystemLanguage();
}

function getActiveCopy() {
  return pageTranslations[activeLanguage] || pageTranslations.zh;
}

function shouldReduceMotion() {
  return reducedMotionQuery.matches;
}

function getScramblePool(language) {
  if (language === "ja") {
    return "アイウエオカキクケコサシスセソタチツテトナニヌネノ";
  }

  if (language === "zh") {
    return "你好欢迎来到这里尤里卡网页语言星光灵感";
  }

  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
}

function isStableCharacter(character) {
  return !character || /\s|[.,:;!?()[\]{}'"“”‘’\-_/\\]/u.test(character);
}

function getReadableScrambleChar(target, index, pool) {
  if (isStableCharacter(target)) {
    return target;
  }

  const code = target?.charCodeAt(0) || 0;
  return pool[(index * 13 + code) % pool.length] || target;
}

function lockLanguageNodeSize(node, targetText) {
  const originalText = node.textContent;
  const originalMinWidth = node.style.minWidth;
  const originalMinHeight = node.style.minHeight;
  const originalMaxWidth = node.style.maxWidth;
  const originalMaxHeight = node.style.maxHeight;
  const rect = node.getBoundingClientRect();

  node.textContent = targetText;
  const targetRect = node.getBoundingClientRect();
  node.textContent = originalText;

  const lockWidth = Math.ceil(Math.max(rect.width, targetRect.width));
  const lockHeight = Math.ceil(Math.max(rect.height, targetRect.height));
  node.style.minWidth = `${lockWidth}px`;
  node.style.minHeight = `${lockHeight}px`;
  node.style.maxWidth = `${lockWidth}px`;
  node.style.maxHeight = `${lockHeight}px`;
  node.classList.add("is-kinetic-language-text");

  return () => {
    node.style.minWidth = originalMinWidth;
    node.style.minHeight = originalMinHeight;
    node.style.maxWidth = originalMaxWidth;
    node.style.maxHeight = originalMaxHeight;
    node.classList.remove("is-kinetic-language-text");
  };
}

function syncLanguageChrome(copy, language) {
  activeLanguage = language;
  document.documentElement.lang = copy.documentLang;
  document.title = copy.title;

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute("content", copy.description);
  }

  languageToggle?.setAttribute("aria-label", copy.languageToggleLabel);
  themeToggle?.setAttribute("aria-label", copy.themeToggleLabel);
  themeToggle?.setAttribute("title", copy.themeToggleLabel);

  languageOptions.forEach((option) => {
    const isActive = option.dataset.language === language;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-pressed", `${isActive}`);
  });
}

function closeLanguageMenu() {
  languageSwitcher?.classList.remove("is-open");
  languageToggle?.setAttribute("aria-expanded", "false");
  languageMenu?.setAttribute("aria-hidden", "true");
}

function toggleLanguageMenu() {
  if (!languageSwitcher || !languageToggle || !languageMenu) {
    return;
  }

  const isOpen = languageSwitcher.classList.toggle("is-open");
  languageToggle.setAttribute("aria-expanded", `${isOpen}`);
  languageMenu.setAttribute("aria-hidden", `${!isOpen}`);
}

function applyLanguage(language) {
  const nextLanguage = pageTranslations[language] ? language : "zh";
  const copy = pageTranslations[nextLanguage];

  syncLanguageChrome(copy, nextLanguage);

  i18nNodes.forEach((node) => {
    const key = node.dataset.i18n;
    if (!key || !(key in copy)) {
      return;
    }

    node.textContent = copy[key];
  });

  syncPhotoShowAllButtonCopy();
  setActiveLanguageNode(activeLanguageNode);
  buildMagneticHeading();
  buildWelcomeCanvas();
  requestWelcomeRender();
  window.requestAnimationFrame(() => {
    updateCareerScene();
    requestCareerSceneUpdate();
  });
}

function getLanguageNodeTags(nodeInfo, copy) {
  const translatedTags = copy[nodeInfo.tagsKey];
  return Array.isArray(translatedTags) && translatedTags.length > 0
    ? translatedTags
    : nodeInfo.fallbackTags;
}

function setActiveLanguageNode(nodeKey) {
  const nodeInfo = languageNodeInfo[nodeKey] || languageNodeInfo.js;
  const copy = getActiveCopy();

  activeLanguageNode = nodeKey in languageNodeInfo ? nodeKey : "js";
  languageUniverse?.classList.remove("active-cpp", "active-html", "active-css", "active-js", "active-py");
  languageUniverse?.classList.add(`active-${activeLanguageNode}`);

  languageNodeButtons.forEach((button) => {
    const isActive = button.dataset.languageNode === activeLanguageNode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", `${isActive}`);
  });

  languageIndexButtons.forEach((button) => {
    const isActive = button.dataset.languageNode === activeLanguageNode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "true" : "false");
  });

  if (languageInsightTitle) {
    languageInsightTitle.textContent = nodeInfo.label;
  }

  if (languageInsightText) {
    languageInsightText.dataset.i18n = nodeInfo.textKey;
    languageInsightText.textContent = copy[nodeInfo.textKey] || "";
  }

  if (languageInsightTags) {
    const fragment = document.createDocumentFragment();
    getLanguageNodeTags(nodeInfo, copy).forEach((tag) => {
      const tagNode = document.createElement("span");
      tagNode.textContent = tag;
      fragment.append(tagNode);
    });
    languageInsightTags.replaceChildren(fragment);
  }

  requestLanguageNetworkSync();
}

function toNetworkPoint(networkRect, x, y) {
  return {
    x: ((x - networkRect.left) / Math.max(networkRect.width, 1)) * 100,
    y: ((y - networkRect.top) / Math.max(networkRect.height, 1)) * 100,
  };
}

function getRectEdgePoint(rect, targetPoint) {
  const center = {
    x: rect.left + rect.width * 0.5,
    y: rect.top + rect.height * 0.5,
  };
  const dx = targetPoint.x - center.x;
  const dy = targetPoint.y - center.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return center;
  }

  const halfWidth = Math.max(rect.width * 0.5, 1);
  const halfHeight = Math.max(rect.height * 0.5, 1);
  const scale = Math.min(
    Math.abs(dx) > 0.001 ? halfWidth / Math.abs(dx) : Number.POSITIVE_INFINITY,
    Math.abs(dy) > 0.001 ? halfHeight / Math.abs(dy) : Number.POSITIVE_INFINITY
  );

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

/* Point where the ray from an ellipse's centre toward a rect's centre crosses
   the ellipse. Normalising by the radii turns the ellipse into a unit circle,
   where the crossing is just the direction vector over its own length. */
function getEllipseEdgePoint(ellipse, nodeRect) {
  const dx = nodeRect.left + nodeRect.width * 0.5 - ellipse.cx;
  const dy = nodeRect.top + nodeRect.height * 0.5 - ellipse.cy;
  const normalized = Math.sqrt((dx / ellipse.rx) ** 2 + (dy / ellipse.ry) ** 2);

  if (normalized <= 0.001) {
    return { x: ellipse.cx, y: ellipse.cy };
  }

  return {
    x: ellipse.cx + dx / normalized,
    y: ellipse.cy + dy / normalized,
  };
}

function getBrainEdgePoint(anchorRect, nodeRect) {
  const isMobileLayout = window.innerWidth <= 680;
  const center = {
    x: anchorRect.left + anchorRect.width * 0.5,
    y: anchorRect.top + anchorRect.height * (isMobileLayout ? 0.54 : 0.58),
  };
  const nodeCenter = {
    x: nodeRect.left + nodeRect.width * 0.5,
    y: nodeRect.top + nodeRect.height * 0.5,
  };
  const dx = nodeCenter.x - center.x;
  const dy = nodeCenter.y - center.y;
  const radiusX = anchorRect.width * (isMobileLayout ? 0.2 : 0.23);
  const radiusY = anchorRect.height * (isMobileLayout ? 0.34 : 0.33);
  const normalizedDistance = Math.sqrt(
    (dx / Math.max(radiusX, 1)) ** 2 + (dy / Math.max(radiusY, 1)) ** 2
  );

  if (normalizedDistance <= 0.001) {
    return center;
  }

  return {
    x: center.x + dx / normalizedDistance,
    y: center.y + dy / normalizedDistance,
  };
}

function syncLanguageNetworkLines() {
  if (!languageNetwork || !brainMount || languageNodeButtons.length === 0) {
    return;
  }

  const networkRect = languageNetwork.getBoundingClientRect();
  const anchorRect = brainWrap?.getBoundingClientRect() || brainMount.getBoundingClientRect();
  const usesMobileAnchors = window.innerWidth <= 680;
  const silhouette = usesMobileAnchors ? null : brainSceneController?.getShellSilhouette?.() || null;
  const anchorWidth = Math.max(anchorRect.width, 1);
  const anchorHeight = Math.max(anchorRect.height, 1);
  const brainAnchors = {
    cpp: { x: 0.26, y: 0.53 },
    html: { x: 0.74, y: 0.53 },
    css: { x: 0.35, y: 0.69 },
    js: { x: 0.65, y: 0.69 },
    py: { x: 0.5, y: 0.42 },
  };

  languageNodeButtons.forEach((button) => {
    const key = button.dataset.languageNode;
    const line = key ? languageNetwork.querySelector(`.line-${key}`) : null;
    if (!line) {
      return;
    }

    const anchor = brainAnchors[key] || { x: 0.5, y: 0.62 };
    const nodeRect = button.getBoundingClientRect();

    let brainEdge;
    if (usesMobileAnchors) {
      brainEdge = getBrainEdgePoint(anchorRect, nodeRect);
    } else if (silhouette) {
      /* Walk from the shell's centre toward the pill and stop on the outline.
         Same ellipse intersection the mobile path has always used, but with
         radii measured off the rendered mesh rather than guessed. */
      brainEdge = getEllipseEdgePoint(silhouette, nodeRect);
    } else {
      /* Only before the scene exists -- three.js is imported lazily when this
         section scrolls into view, and the lines are drawn on the way in. */
      brainEdge = {
        x: anchorRect.left + anchorWidth * anchor.x,
        y: anchorRect.top + anchorHeight * anchor.y,
      };
    }
    const nodeEdge = getRectEdgePoint(nodeRect, brainEdge);
    const from = toNetworkPoint(networkRect, brainEdge.x, brainEdge.y);
    const to = toNetworkPoint(networkRect, nodeEdge.x, nodeEdge.y);

    line.setAttribute("x1", from.x.toFixed(2));
    line.setAttribute("y1", from.y.toFixed(2));
    line.setAttribute("x2", to.x.toFixed(2));
    line.setAttribute("y2", to.y.toFixed(2));
  });
}

function requestLanguageNetworkSync() {
  if (languageNetworkFrame) {
    return;
  }

  languageNetworkFrame = window.requestAnimationFrame(() => {
    languageNetworkFrame = 0;
    syncLanguageNetworkLines();
  });
}

function updateLanguageUniverseParallax(event) {
  if (!languageUniverse || !isDesktopViewport()) {
    return;
  }

  const rect = languageUniverse.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    return;
  }

  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
  const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  languageUniverse.style.setProperty("--universe-x", x.toFixed(3));
  languageUniverse.style.setProperty("--universe-y", y.toFixed(3));
  requestLanguageNetworkSync();
}

function resetLanguageUniverseParallax() {
  languageUniverse?.style.setProperty("--universe-x", "0");
  languageUniverse?.style.setProperty("--universe-y", "0");
  requestLanguageNetworkSync();
}

function revealLanguageUniverse() {
  if (!languageUniverse || shouldReduceMotion()) {
    languageUniverse?.classList.add("is-visible");
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        languageUniverse.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.28 }
  );

  observer.observe(languageUniverse);
}

let isLanguageTransitioning = false;

const languageKineticConfig = {
  DURATION_MS: 520,
  MAX_STAGGER_MS: 140,
  MAX_DESKTOP_CHARS: 180,
  MAX_MOBILE_CHARS: 168,
  MOBILE_BATCH_CHARS: 54,
  DESKTOP_BATCH_CHARS: 90,
  VIEWPORT_MARGIN: 96,
};

function isNodeInAnimationViewport(node) {
  const rect = node.getBoundingClientRect();
  const margin = languageKineticConfig.VIEWPORT_MARGIN;

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= -margin &&
    rect.top <= window.innerHeight + margin &&
    rect.right >= -margin &&
    rect.left <= window.innerWidth + margin
  );
}

function getKineticTextPlan(language) {
  const nextLanguage = pageTranslations[language] ? language : "zh";
  const copy = pageTranslations[nextLanguage];
  const maxChars = isDesktopViewport()
    ? languageKineticConfig.MAX_DESKTOP_CHARS
    : languageKineticConfig.MAX_MOBILE_CHARS;
  let animatedCharCount = 0;
  const animated = [];
  const liteNodes = [];
  const staticNodes = [];

  Array.from(i18nNodes).forEach((node) => {
    const key = node.dataset.i18n;
    if (!key || !(key in copy)) {
      return;
    }

    const toText = copy[key];
    const fromText = node.textContent || "";
    const charCount = Math.max(Array.from(fromText).length, Array.from(toText).length);

    const isVisible = isNodeInAnimationViewport(node);

    if (key === "welcomeWord" || !isVisible) {
      staticNodes.push({ node, key, toText });
      return;
    }

    if (animatedCharCount + charCount > maxChars) {
      liteNodes.push({ node, key, fromText, toText, charCount });
      return;
    }

    animatedCharCount += charCount;
    animated.push({ node, key, fromText, toText, charCount });
  });

  return { copy, nextLanguage, animated, liteNodes, staticNodes };
}

function buildKineticCharacterSpans(fromText, toText, pool) {
  const fromChars = Array.from(fromText);
  const toChars = Array.from(toText);
  const length = Math.max(fromChars.length, toChars.length);
  const fragment = document.createDocumentFragment();
  const spans = [];

  for (let index = 0; index < length; index += 1) {
    const span = document.createElement("span");
    const source = fromChars[index] || "";
    const target = toChars[index] || "";

    span.className = "kinetic-char";
    span.textContent = source || getReadableScrambleChar(target, index, pool) || "\u00A0";
    span.dataset.targetChar = target || "";
    span.dataset.scrambleChar = getReadableScrambleChar(target, index, pool) || "\u00A0";
    fragment.append(span);
    spans.push(span);
  }

  return { fragment, spans };
}

function animateKineticNode({ node, key, fromText, toText }, pool, nodeIndex) {
  const unlockSize = lockLanguageNodeSize(node, toText);
  const { fragment, spans } = buildKineticCharacterSpans(fromText, toText, pool);
  const animations = [];
  const contentTimers = [];

  node.replaceChildren(fragment);

  spans.forEach((span, index) => {
    const angle = ((index * 47 + nodeIndex * 29) % 360) * (Math.PI / 180);
    const distance = 14 + ((index * 9 + nodeIndex * 5) % 24);
    const direction = index % 2 === 0 ? 1 : -1;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance * 0.82;
    const rotation = (((index * 23 + nodeIndex * 17) % 28) - 14) * direction;
    const delay = Math.min(index * 7 + nodeIndex * 18, languageKineticConfig.MAX_STAGGER_MS);
    const duration = languageKineticConfig.DURATION_MS - delay * 0.34;

    contentTimers.push(window.setTimeout(() => {
      span.textContent = span.dataset.scrambleChar || "\u00A0";
    }, delay + duration * 0.38));
    contentTimers.push(window.setTimeout(() => {
      span.textContent = span.dataset.targetChar || "\u00A0";
    }, delay + duration * 0.58));

    animations.push(span.animate(
      [
        {
          transform: "translate3d(0, 0, 0) rotate(0deg)",
          opacity: 1,
          offset: 0,
        },
        {
          transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotation.toFixed(2)}deg)`,
          opacity: 0.32,
          offset: 0.46,
        },
        {
          transform: `translate3d(${(x * -0.16).toFixed(2)}px, ${(y * -0.16).toFixed(2)}px, 0) rotate(${(rotation * -0.18).toFixed(2)}deg)`,
          opacity: 0.78,
          offset: 0.68,
        },
        {
          transform: "translate3d(0, 0, 0) rotate(0deg)",
          opacity: 1,
          offset: 1,
        },
      ],
      {
        duration,
        delay,
        easing: "cubic-bezier(0.45, 0, 0.18, 1)",
        fill: "both",
      }
    ));
  });

  return Promise.allSettled(animations.map((animation) => animation.finished)).finally(() => {
    contentTimers.forEach((timer) => window.clearTimeout(timer));
    commitKineticText(node, key, toText);
    unlockSize();
  });
}

function buildScrambledText(fromText, toText, pool, seed = 0) {
  const fromChars = Array.from(fromText);
  const toChars = Array.from(toText);
  const length = Math.max(fromChars.length, toChars.length);
  const output = [];

  for (let index = 0; index < length; index += 1) {
    const target = toChars[index] || "";

    if (isStableCharacter(target)) {
      output.push(target || fromChars[index] || "");
      continue;
    }

    output.push(getReadableScrambleChar(target, index + seed, pool));
  }

  return output.join("");
}

/* Guard against stale write-backs: hovering a language node mid-animation
   swaps the insight text's data-i18n key, and the old animation must not
   overwrite the newer copy when it settles. */
function commitKineticText(node, key, text) {
  if (key && node.dataset.i18n !== key) {
    return;
  }

  node.textContent = text;
}

function animateKineticLiteNode({ node, key, fromText, toText }, pool, nodeIndex) {
  const unlockSize = lockLanguageNodeSize(node, toText);
  const timers = [];
  const duration = isMobileViewport() ? 360 : 420;
  const distance = isMobileViewport() ? 8 : 12;
  const direction = nodeIndex % 2 === 0 ? 1 : -1;

  node.textContent = fromText;
  timers.push(window.setTimeout(() => {
    commitKineticText(node, key, buildScrambledText(fromText, toText, pool, nodeIndex * 3));
  }, duration * 0.34));
  timers.push(window.setTimeout(() => {
    commitKineticText(node, key, buildScrambledText(fromText, toText, pool, nodeIndex * 7));
  }, duration * 0.5));
  timers.push(window.setTimeout(() => {
    commitKineticText(node, key, toText);
  }, duration * 0.68));

  const animation = node.animate(
    [
      {
        transform: "translate3d(0, 0, 0)",
        opacity: 1,
        offset: 0,
      },
      {
        transform: `translate3d(${(distance * direction).toFixed(2)}px, ${(-distance * 0.55).toFixed(2)}px, 0)`,
        opacity: 0.46,
        offset: 0.44,
      },
      {
        transform: `translate3d(${(-distance * 0.16 * direction).toFixed(2)}px, ${(distance * 0.12).toFixed(2)}px, 0)`,
        opacity: 0.82,
        offset: 0.72,
      },
      {
        transform: "translate3d(0, 0, 0)",
        opacity: 1,
        offset: 1,
      },
    ],
    {
      duration,
      delay: Math.min(nodeIndex * 14, languageKineticConfig.MAX_STAGGER_MS),
      easing: "cubic-bezier(0.45, 0, 0.18, 1)",
      fill: "both",
    }
  );

  return animation.finished.finally(() => {
    timers.forEach((timer) => window.clearTimeout(timer));
    commitKineticText(node, key, toText);
    unlockSize();
  });
}

function waitForNextAnimationFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(resolve);
  });
}

async function runKineticLanguageBatches(animated, liteNodes, pool) {
  const batchLimit = isMobileViewport()
    ? languageKineticConfig.MOBILE_BATCH_CHARS
    : languageKineticConfig.DESKTOP_BATCH_CHARS;
  const tasks = [
    ...animated.map((item) => ({ ...item, type: "full" })),
    ...liteNodes.map((item) => ({ ...item, type: "lite" })),
  ];
  const running = [];
  let batchChars = 0;

  for (let index = 0; index < tasks.length; index += 1) {
    const item = tasks[index];
    const charCount = Math.max(1, item.charCount || 1);

    if (batchChars > 0 && batchChars + charCount > batchLimit) {
      await waitForNextAnimationFrame();
      batchChars = 0;
    }

    running.push(
      item.type === "full"
        ? animateKineticNode(item, pool, index)
        : animateKineticLiteNode(item, pool, index)
    );
    batchChars += charCount;
  }

  await Promise.all(running);
}

async function switchLanguageWithAnimation(language) {
  const nextLanguage = pageTranslations[language] ? language : "zh";

  if (nextLanguage === activeLanguage) {
    closeLanguageMenu();
    return;
  }

  if (isLanguageTransitioning) {
    return;
  }

  isLanguageTransitioning = true;
  safeStorageSet(languageStorageKey, nextLanguage);
  closeLanguageMenu();

  if (shouldReduceMotion()) {
    applyLanguage(nextLanguage);
    isLanguageTransitioning = false;
    return;
  }

  /* The kinetic pass rewrites each node's children, detaching the per-character
     spans. Drop the references now so the pointer loop is not writing styles
     into orphaned nodes for the length of the animation. */
  magnetChars.length = 0;

  try {
    const { copy, animated, liteNodes, staticNodes } = getKineticTextPlan(nextLanguage);
    const pool = getScramblePool(nextLanguage);

    syncLanguageChrome(copy, nextLanguage);
    staticNodes.forEach(({ node, toText }) => {
      node.textContent = toText;
    });
    syncPhotoShowAllButtonCopy();
    setActiveLanguageNode(activeLanguageNode);
    buildWelcomeCanvas(copy.welcomeWord);
    requestWelcomeRender();

    await runKineticLanguageBatches(animated, liteNodes, pool);
  } catch (error) {
    applyLanguage(nextLanguage);
  } finally {
    isLanguageTransitioning = false;
    buildMagneticHeading();
  }
}

function getWaveEndRadius(originX, originY, safetyPadding = 0) {
  const viewport = window.visualViewport;
  const viewportWidth = Math.max(
    window.innerWidth || 0,
    document.documentElement.clientWidth || 0,
    viewport?.width || 0,
    1
  );
  const viewportHeight = Math.max(
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0,
    viewport?.height || 0,
    1
  );
  const horizontal = Math.max(originX, viewportWidth - originX);
  const vertical = Math.max(originY, viewportHeight - originY);
  return Math.hypot(horizontal, vertical) + safetyPadding;
}

function supportsSnapshotThemeWave() {
  return typeof document.startViewTransition === "function";
}

function isCareerSectionInViewport() {
  if (!careerSection) {
    return false;
  }

  const rect = careerSection.getBoundingClientRect();
  const viewportHeight = isMobileViewport()
    ? Math.max(stableMobileAppHeight || window.innerHeight, 1)
    : Math.max(window.innerHeight, document.documentElement.clientHeight, 1);

  return rect.bottom > 0 && rect.top < viewportHeight;
}

function waitForFrames(count = 1) {
  return new Promise((resolve) => {
    const step = () => {
      count -= 1;
      if (count <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(step);
    };

    window.requestAnimationFrame(step);
  });
}

function waitMilliseconds(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function cancelThemeWaveAnimations() {
  themeWave?.getAnimations?.().forEach((animation) => animation.cancel());
  themeWaveCore?.getAnimations?.().forEach((animation) => animation.cancel());
}

function resetThemeWave() {
  cancelThemeWaveAnimations();
  root.style.removeProperty("--wave-visual-x");
  root.style.removeProperty("--wave-visual-y");
  root.style.removeProperty("--wave-visual-diameter");
  themeWave?.classList.remove(
    "is-active",
    "is-outline",
    "is-mobile-wave",
    "is-mobile-clip-wave",
    "theme-light-wave",
    "theme-dark-wave"
  );

  if (themeWave) {
    themeWave.style.opacity = "";
    themeWave.style.clipPath = "";
  }

  if (themeWaveCore) {
    themeWaveCore.style.opacity = "";
    themeWaveCore.style.transform = "";
    themeWaveCore.style.left = "";
    themeWaveCore.style.top = "";
  }
}

function prepareThemeWave(originX, originY, nextTheme) {
  const endRadius = getWaveEndRadius(originX, originY);
  const waveSafetyPadding = isMobileViewport() ? 160 : 12;
  root.style.setProperty("--wave-x", `${originX}px`);
  root.style.setProperty("--wave-y", `${originY}px`);
  root.style.setProperty("--wave-diameter", `${Math.ceil(endRadius * 2 + waveSafetyPadding)}px`);

  themeWave.classList.remove("theme-light-wave", "theme-dark-wave");
  themeWave.classList.add(nextTheme === "dark" ? "theme-dark-wave" : "theme-light-wave");
  themeWave.classList.add("is-active");
  themeWave.style.opacity = "1";
  themeWaveCore.style.opacity = "1";
  themeWaveCore.style.transform = "translate3d(-50%, -50%, 0) scale(0.001)";
}

function prepareThemeWaveOutline(originX, originY, nextTheme = null, safetyPadding = 0) {
  const endRadius = getWaveEndRadius(originX, originY, safetyPadding);
  root.style.setProperty("--wave-x", `${originX}px`);
  root.style.setProperty("--wave-y", `${originY}px`);
  root.style.setProperty("--wave-diameter", `${Math.ceil(endRadius * 2 + 12)}px`);
  root.style.setProperty("--wave-visual-x", `${originX}px`);
  root.style.setProperty("--wave-visual-y", `${originY}px`);
  root.style.setProperty("--wave-visual-diameter", `${Math.ceil(endRadius * 2 + 12)}px`);

  themeWave.classList.remove("theme-light-wave", "theme-dark-wave");
  if (nextTheme) {
    themeWave.classList.add(nextTheme === "dark" ? "theme-dark-wave" : "theme-light-wave");
  }
  themeWave.classList.add("is-active", "is-outline");
  themeWave.style.opacity = "1";
  themeWaveCore.style.opacity = "0.82";
  themeWaveCore.style.transform = "translate3d(-50%, -50%, 0) scale(0.001)";

  return endRadius;
}

function prepareSnapshotWaveOrigin(originX, originY, safetyPadding = 0) {
  const endRadius = getWaveEndRadius(originX, originY, safetyPadding);
  root.style.setProperty("--wave-x", `${originX}px`);
  root.style.setProperty("--wave-y", `${originY}px`);

  return endRadius;
}

function supportsSnapshotMaskReveal() {
  return Boolean(
    window.CSS?.supports?.(
      "mask-image",
      "radial-gradient(circle at 10px 10px, black 0px, transparent 1px)"
    ) ||
    window.CSS?.supports?.(
      "-webkit-mask-image",
      "radial-gradient(circle at 10px 10px, black 0px, transparent 1px)"
    )
  );
}

function beginSnapshotMaskReveal() {
  root.classList.add("theme-mask-reveal");
  body.classList.add("theme-mask-reveal");
  root.style.setProperty("--snapshot-wave-radius", "0px");
}

function endSnapshotMaskReveal() {
  root.classList.remove("theme-mask-reveal");
  body.classList.remove("theme-mask-reveal");
  root.style.removeProperty("--snapshot-wave-radius");
}

async function commitThemeState(nextTheme, options = {}) {
  beginThemeTransitionContext();
  applyTheme(nextTheme, options);
  await waitForFrames(2);
  endThemeTransitionContext();
}

function beginViewTransitionDomLock() {
  root.classList.add("theme-vt-lock");
  body.classList.add("theme-vt-lock");
}

function endViewTransitionDomLock() {
  root.classList.remove("theme-vt-lock");
  body.classList.remove("theme-vt-lock");
}

function beginSnapshotThemeLiteMode() {
  if (!isMobileViewport()) {
    return false;
  }

  themeTransitionLiteActive = true;
  root.classList.add("theme-snapshot-active");
  body.classList.add("theme-snapshot-active");
  return true;
}

function endSnapshotThemeLiteMode(theme) {
  if (!themeTransitionLiteActive) {
    return;
  }

  themeTransitionLiteActive = false;
  root.classList.remove("theme-snapshot-active");
  body.classList.remove("theme-snapshot-active");
  scheduleCareerSceneResumeAfterTheme();

  window.requestAnimationFrame(() => {
    scheduleThemeRenderWork(theme);
  });
}

async function runMobileThemeWave(originX, originY, nextTheme) {
  if (!themeWave || typeof themeWave.animate !== "function") {
    await runMobileThemeSafetyFade(nextTheme);
    return;
  }

  resetThemeWave();
  const endRadius = getWaveEndRadius(originX, originY);
  root.style.setProperty("--wave-x", `${originX}px`);
  root.style.setProperty("--wave-y", `${originY}px`);
  themeWave.classList.remove("theme-light-wave", "theme-dark-wave");
  themeWave.classList.add(
    "is-active",
    "is-mobile-clip-wave",
    nextTheme === "dark" ? "theme-dark-wave" : "theme-light-wave"
  );
  themeWave.style.opacity = "1";
  themeWave.style.clipPath = `circle(0px at ${originX}px ${originY}px)`;
  const lockCareerGeometry = !(isMobileViewport() && isCareerSectionInViewport());
  beginThemeTransitionContext({ lockGeometry: lockCareerGeometry });
  let didCommit = false;

  try {
    const expandDuration = themeWaveConfig.SNAPSHOT_DURATION_MS;
    const revealAnimation = themeWave.animate(
      {
        clipPath: [
          `circle(0px at ${originX}px ${originY}px)`,
          `circle(${endRadius}px at ${originX}px ${originY}px)`,
        ],
      },
      {
        duration: expandDuration,
        easing: themeWaveConfig.SNAPSHOT_EASING,
        fill: "both",
      }
    );

    const commitThemeAfterWaveLead = waitMilliseconds(Math.round(expandDuration * 0.78)).then(() => {
      if (didCommit) {
        return;
      }

      applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
      didCommit = true;
    });

    await Promise.allSettled([revealAnimation.finished, commitThemeAfterWaveLead]);
    themeWave.style.opacity = "1";
    if (!didCommit) {
      applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
      didCommit = true;
    }
    await waitForFrames(2);
    const fadeAnimation = themeWave.animate(
      { opacity: [1, 0] },
      {
        duration: themeWaveConfig.FADE_DURATION_MS,
        easing: themeWaveConfig.FADE_EASING,
        fill: "forwards",
      }
    );
    await fadeAnimation.finished;
  } catch (error) {
    if (!didCommit) {
      applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
      didCommit = true;
      await waitForFrames(2);
    }
  } finally {
    resetThemeWave();
    endThemeTransitionContext();
    if (didCommit) {
      window.requestAnimationFrame(() => {
        scheduleThemeRenderWork(nextTheme);
      });
    }
  }
}

async function runMobileThemeSafetyFade(nextTheme) {
  if (!themeWave || typeof themeWave.animate !== "function") {
    beginThemeTransitionContext();
    applyTheme(nextTheme, { deferHeavyWork: true });
    await waitForFrames(2);
    endThemeTransitionContext();
    return;
  }

  resetThemeWave();
  if (themeWaveCore) {
    prepareThemeWaveOutline(window.innerWidth / 2, window.innerHeight / 2);
  }
  let didCommit = false;

  try {
    if (themeWaveCore && typeof themeWaveCore.animate === "function") {
      const ripple = themeWaveCore.animate(
        {
          transform: [
            "translate3d(-50%, -50%, 0) scale(0.001)",
            "translate3d(-50%, -50%, 0) scale(1.02)",
          ],
          opacity: [0.72, 0],
        },
        {
          duration: 360,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        }
      );
      window.setTimeout(() => {
        if (!didCommit) {
          beginThemeTransitionContext();
          applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
          didCommit = true;
        }
      }, 80);
      await ripple.finished;
    }

    if (!didCommit) {
      beginThemeTransitionContext();
      applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
      didCommit = true;
    }
    await waitForFrames(2);
  } catch (error) {
    if (!didCommit) {
      beginThemeTransitionContext();
      applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
      didCommit = true;
      await waitForFrames(2);
    }
  } finally {
    endThemeTransitionContext();
    resetThemeWave();
    if (didCommit) {
      window.requestAnimationFrame(() => {
        scheduleThemeRenderWork(nextTheme);
      });
    }
  }
}

async function runFallbackThemeWave(originX, originY, nextTheme) {
  if (!themeWave || !themeWaveCore) {
    await commitThemeState(nextTheme);
    return;
  }

  if (
    typeof themeWave.animate !== "function" ||
    typeof themeWaveCore.animate !== "function"
  ) {
    await commitThemeState(nextTheme);
    return;
  }

  resetThemeWave();
  prepareThemeWave(originX, originY, nextTheme);

  try {
    const expandAnimation = themeWaveCore.animate(
      {
        transform: [
          "translate3d(-50%, -50%, 0) scale(0.001)",
          "translate3d(-50%, -50%, 0) scale(1)",
        ],
        opacity: [0.96, 1],
      },
      {
        duration: themeWaveConfig.EXPAND_DURATION_MS,
        easing: themeWaveConfig.EXPAND_EASING,
        fill: "both",
      }
    );

    await expandAnimation.finished;
    await commitThemeState(nextTheme);

    const fadeAnimation = themeWave.animate(
      {
        opacity: [1, 0],
      },
      {
        duration: themeWaveConfig.FADE_DURATION_MS,
        easing: themeWaveConfig.FADE_EASING,
        fill: "forwards",
      }
    );

    await fadeAnimation.finished;
  } catch (error) {
    await commitThemeState(nextTheme);
  } finally {
    resetThemeWave();
  }
}

async function runSnapshotThemeWave(originX, originY, nextTheme) {
  if (!themeWave || !themeWaveCore) {
    await commitThemeState(nextTheme);
    return;
  }

  const useLiteSnapshot = beginSnapshotThemeLiteMode();
  const useMaskReveal = !useLiteSnapshot && supportsSnapshotMaskReveal();
  resetThemeWave();
  const endRadius = useLiteSnapshot
    ? prepareSnapshotWaveOrigin(originX, originY)
    : prepareSnapshotWaveOrigin(originX, originY, SNAPSHOT_REVEAL_SAFETY_PADDING);
  if (!useLiteSnapshot) {
    beginViewTransitionDomLock();
    if (useMaskReveal) {
      beginSnapshotMaskReveal();
    }
  }
  beginThemeTransitionContext();

  let transition;
  try {
    const snapshotThemeOptions = useLiteSnapshot
      ? { deferHeavyWork: true, skipHeavyWork: true }
      : {
          deferSystemChrome: true,
          deferHeavyWork: true,
          skipHeavyWork: true,
          syncSnapshotVisuals: true,
        };
    transition = document.startViewTransition(() => {
      applyTheme(nextTheme, snapshotThemeOptions);
    });
    await transition.ready;
  } catch (error) {
    endThemeTransitionContext();
    resetThemeWave();
    if (useLiteSnapshot) {
      endSnapshotThemeLiteMode(activeTheme);
    } else {
      if (useMaskReveal) {
        endSnapshotMaskReveal();
      }
      endViewTransitionDomLock();
    }
    throw error;
  }

  if (!useLiteSnapshot) {
    endThemeTransitionContext();
  }

  const snapshotDuration = useLiteSnapshot ? 540 : themeWaveConfig.SNAPSHOT_DURATION_MS;

  const transitionAnimations = [transition.finished];

  if (!useLiteSnapshot) {
    prepareThemeWaveOutline(originX, originY, null, 220);
    const outlineAnimation = themeWaveCore.animate(
      {
        transform: [
          "translate3d(-50%, -50%, 0) scale(0.001)",
          "translate3d(-50%, -50%, 0) scale(1.02)",
        ],
        opacity: [0.82, 0],
      },
      {
        duration: snapshotDuration,
        easing: themeWaveConfig.SNAPSHOT_EASING,
        fill: "forwards",
      }
    );
    transitionAnimations.push(outlineAnimation.finished);
  }

  const revealAnimation = useMaskReveal
    ? root.animate(
        {
          "--snapshot-wave-radius": ["0px", `${endRadius}px`],
        },
        {
          duration: snapshotDuration,
          easing: themeWaveConfig.SNAPSHOT_EASING,
          fill: "both",
          pseudoElement: "::view-transition-new(root)",
        }
      )
    : root.animate(
        {
          clipPath: [
            `circle(0px at ${originX}px ${originY}px)`,
            `circle(${endRadius}px at ${originX}px ${originY}px)`,
          ],
        },
        {
          duration: snapshotDuration,
          easing: themeWaveConfig.SNAPSHOT_EASING,
          fill: "both",
          pseudoElement: "::view-transition-new(root)",
        }
      );

  transitionAnimations.push(revealAnimation.finished);

  await Promise.allSettled(transitionAnimations);
  if (!useLiteSnapshot) {
    syncSystemChromeForTheme(nextTheme);
    scheduleThemeRenderWork(nextTheme);
    await waitForFrames(2);
  }

  if (useLiteSnapshot) {
    endThemeTransitionContext();
  }

  resetThemeWave();
  if (useLiteSnapshot) {
    endSnapshotThemeLiteMode(nextTheme);
  } else {
    if (useMaskReveal) {
      endSnapshotMaskReveal();
    }
    endViewTransitionDomLock();
  }
}

async function runMobileCareerSnapshotThemeWave(originX, originY, nextTheme) {
  if (!supportsSnapshotThemeWave()) {
    await runMobileThemeWave(originX, originY, nextTheme);
    return;
  }

  resetThemeWave();
  const endRadius = prepareSnapshotWaveOrigin(originX, originY);
  beginThemeTransitionContext({ lockGeometry: true });
  await waitForFrames(1);

  let transition;
  try {
    transition = document.startViewTransition(() => {
      applyTheme(nextTheme, {
        deferHeavyWork: true,
        skipHeavyWork: true,
        syncSnapshotVisuals: true,
        deferSystemChrome: true,
      });
    });
    await transition.ready;
  } catch (error) {
    resetThemeWave();
    await finishThemeTransitionContext();
    throw error;
  }

  const revealAnimation = root.animate(
    {
      clipPath: [
        `circle(0px at ${originX}px ${originY}px)`,
        `circle(${endRadius}px at ${originX}px ${originY}px)`,
      ],
    },
    {
      duration: themeWaveConfig.SNAPSHOT_DURATION_MS,
      easing: themeWaveConfig.SNAPSHOT_EASING,
      fill: "both",
      pseudoElement: "::view-transition-new(root)",
    }
  );
  await Promise.allSettled([
    transition.finished,
    revealAnimation.finished,
  ]);
  syncSystemChromeForTheme(nextTheme);
  await waitForFrames(2);
  resetThemeWave();
  await finishThemeTransitionContext();
  window.requestAnimationFrame(() => {
    scheduleThemeRenderWork(nextTheme);
  });
}

async function triggerThemeWave(originX, originY, nextTheme) {
  if (isThemeTransitioning || careerThemeRestorePending) {
    return;
  }

  clearStaleCareerThemeLockBeforeTransition();
  isThemeTransitioning = true;
  closeLanguageMenu();

  try {
    if (isMobileViewport() && isCareerSectionInViewport() && supportsSnapshotThemeWave()) {
      await runMobileCareerSnapshotThemeWave(originX, originY, nextTheme);
    } else if (supportsSnapshotThemeWave()) {
      await runSnapshotThemeWave(originX, originY, nextTheme);
    } else if (isMobileViewport()) {
      await runMobileThemeWave(originX, originY, nextTheme);
    } else {
      await runFallbackThemeWave(originX, originY, nextTheme);
    }
  } catch (error) {
    if (isMobileViewport()) {
      await runMobileThemeSafetyFade(nextTheme);
    } else {
      await runFallbackThemeWave(originX, originY, nextTheme);
    }
  } finally {
    isThemeTransitioning = false;
  }
}

function buildWelcomeLayer(wordElement, canvasElement, context, text) {
  if (!wordElement || !canvasElement || !context) {
    return null;
  }

  const rect = wordElement.getBoundingClientRect();
  const dpr = 1;
  const contentWidth = Math.max(320, Math.round(rect.width));
  const contentHeight = Math.max(160, Math.round(rect.height));
  /* Extra room so crumble particles can fly out without hitting a hard box edge. */
  const padX = Math.round(Math.max(160, contentWidth * 0.55));
  const padY = Math.round(Math.max(140, contentHeight * 0.85));
  const width = contentWidth + padX * 2;
  const height = contentHeight + padY * 2;
  const originX = padX;
  const originY = padY;
  const sampleCanvas = document.createElement("canvas");
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const style = getComputedStyle(wordElement);
  const fontSize = parseFloat(style.fontSize);
  const fontFamily = style.fontFamily;
  const fontWeight = style.fontWeight;
  const letterSpacing = parseFloat(style.letterSpacing);
  const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const textColor = getComputedStyle(body).getPropertyValue("--welcome-text").trim();

  canvasElement.width = Math.round(width * dpr);
  canvasElement.height = Math.round(height * dpr);
  canvasElement.style.width = `${width}px`;
  canvasElement.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  sampleCanvas.width = contentWidth;
  sampleCanvas.height = contentHeight;
  sampleCtx.clearRect(0, 0, contentWidth, contentHeight);
  sampleCtx.font = font;
  sampleCtx.textAlign = "center";
  sampleCtx.textBaseline = "middle";
  sampleCtx.fillStyle = "#000";
  sampleCtx.letterSpacing = `${letterSpacing}px`;
  sampleCtx.fillText(text, contentWidth / 2, contentHeight / 2 + fontSize * 0.05);

  const imageData = sampleCtx.getImageData(0, 0, contentWidth, contentHeight);
  const area = contentWidth * contentHeight;
  const densityScale = area > 220000 ? 1.3 : 1;
  const gap = Math.max(2, Math.round((fontSize / 48) * densityScale));
  const points = [];
  const maxDistance = Math.hypot(contentWidth / 2, contentHeight / 2);

  for (let y = 0; y < contentHeight; y += gap) {
    for (let x = 0; x < contentWidth; x += gap) {
      const alpha = imageData.data[(y * contentWidth + x) * 4 + 3];
      if (alpha > 96) {
        let neighbors = 0;
        const offsets = [
          [-gap, 0],
          [gap, 0],
          [0, -gap],
          [0, gap],
          [-gap, -gap],
          [gap, -gap],
          [-gap, gap],
          [gap, gap],
        ];

        offsets.forEach(([offsetX, offsetY]) => {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= contentWidth || nextY < 0 || nextY >= contentHeight) {
            return;
          }

          const neighborAlpha = imageData.data[(nextY * contentWidth + nextX) * 4 + 3];
          if (neighborAlpha > 96) {
            neighbors += 1;
          }
        });

        const edgeFactor = 1 - neighbors / 8;
        const radialFactor =
          Math.hypot(x - contentWidth / 2, y - contentHeight / 2) / Math.max(maxDistance, 1);
        const baseAngle = Math.atan2(y - contentHeight / 2, x - contentWidth / 2);
        const baseDelay = Math.max(0, (1 - edgeFactor) * 0.48 + radialFactor * 0.22);
        const spawnCount = 2 + Math.floor(Math.random() * 2);
        for (let s = 0; s < spawnCount; s += 1) {
          const angle = baseAngle + (Math.random() - 0.5) * 1.6;
          const force = 60 + Math.random() * 220;
          points.push({
            x: originX + x + (Math.random() - 0.5) * gap,
            y: originY + y + (Math.random() - 0.5) * gap,
            size: 0.6 + Math.random() * 1.4,
            driftX: Math.cos(angle) * force + (Math.random() - 0.5) * 50,
            driftY: Math.sin(angle) * force + (Math.random() - 0.5) * 50 + Math.random() * 20,
            wave: (Math.random() - 0.5) * 5,
            delay: baseDelay + Math.random() * 0.1,
            edgeFactor,
            shimmer: Math.random() * Math.PI * 2,
            orbit: Math.random() * Math.PI * 2,
            spread: 3 + Math.random() * 10,
            gravity: 0.1 + Math.random() * 0.3,
            windResistance: 0.4 + Math.random() * 0.6,
          });
        }
      }
    }
  }

  const textureCanvas = document.createElement("canvas");
  const textureCtx = textureCanvas.getContext("2d");
  textureCanvas.width = width;
  textureCanvas.height = height;
  textureCtx.clearRect(0, 0, width, height);
  textureCtx.font = font;
  textureCtx.textAlign = "center";
  textureCtx.textBaseline = "middle";
  textureCtx.letterSpacing = `${letterSpacing}px`;

  textureCtx.fillStyle = textColor;
  textureCtx.fillText(
    text,
    originX + contentWidth / 2,
    originY + contentHeight / 2 + fontSize * 0.05
  );

  const dustCanvas = document.createElement("canvas");
  dustCanvas.width = width;
  dustCanvas.height = height;
  const dustCtx = dustCanvas.getContext("2d");

  return {
    canvas: canvasElement,
    context,
    width,
    height,
    font,
    fontSize,
    letterSpacing,
    text,
    textColor,
    points,
    texture: textureCanvas,
    dustCanvas,
    dustCtx,
  };
}

function buildWelcomeCanvas(text = getActiveCopy().welcomeWord) {
  welcomeLayers = [];

  const primaryLayer = buildWelcomeLayer(
    welcomeWord,
    welcomeCanvas,
    welcomeCtx,
    text
  );

  if (primaryLayer) {
    welcomeLayers.push({ ...primaryLayer, type: "primary" });
  }
}

function getWelcomeProgress() {
  if (!welcomeSection) {
    return 0;
  }

  const sectionTop = welcomeSection.offsetTop;
  const sectionHeight = welcomeSection.offsetHeight;
  const rawProgress = (window.scrollY - sectionTop) / Math.max(sectionHeight * 0.72, 1);
  return Math.min(Math.max(rawProgress, 0), 1);
}

function drawWelcome() {
  if (welcomeLayers.length === 0) {
    return;
  }

  const progress = getWelcomeProgress();
  const eased = 1 - (1 - progress) * (1 - progress);
  const crumble = Math.min(1, Math.max(0, (progress - 0.06) / 0.9));
  body.style.setProperty("--welcome-progress", `${eased}`);

  welcomeLayers.forEach((layer) => {
    const { context, width, height, texture, points, textColor, type } = layer;
    context.clearRect(0, 0, width, height);

    const textOpacity = Math.max(0, 1 - eased * (type === "primary" ? 1.08 : 1.18));
    const textShiftX = eased * (type === "primary" ? 18 : 10);
    const textShiftY = -eased * (type === "primary" ? 10 : 6);
    context.save();
    context.globalAlpha = textOpacity;
    context.translate(textShiftX, textShiftY);
    context.drawImage(texture, 0, 0);

    context.globalCompositeOperation = "destination-out";
    points.forEach((point) => {
      const threshold = point.delay * 0.78 + (1 - point.edgeFactor) * 0.18;
      const localProgress = Math.max(
        0,
        Math.min(1, (crumble - threshold) / Math.max(1 - threshold, 0.001))
      );
      if (localProgress <= 0) {
        return;
      }

      const cutSize = point.size * (1.1 + localProgress * 2.4);
      const smearX = point.driftX * localProgress * 0.16;
      const smearY = point.driftY * localProgress * 0.12;
      const cutW = cutSize * (0.6 + Math.sin(point.shimmer * 3) * 0.4);
      const cutH = cutSize * (0.6 + Math.cos(point.shimmer * 2) * 0.4);
      context.save();
      context.translate(point.x + smearX, point.y + smearY);
      context.rotate(point.shimmer);
      context.fillRect(-cutW / 2, -cutH / 2, cutW, cutH);
      context.restore();
    });
    context.globalCompositeOperation = "source-over";
    context.restore();

    if (eased < 0.08) {
      return;
    }

    const { dustCanvas, dustCtx } = layer;
    dustCtx.clearRect(0, 0, width, height);
    dustCtx.fillStyle = textColor;

    points.forEach((point) => {
      const localProgress = Math.max(
        0,
        Math.min(1, (crumble - point.delay) / Math.max(1 - point.delay, 0.001))
      );
      if (localProgress <= 0) {
        return;
      }

      const t = 1 - (1 - localProgress) * (1 - localProgress);
      const gravityPull = point.gravity * t * t * 40;
      const sway = Math.sin(t * Math.PI * 1.6 + point.shimmer) * point.wave * (1 - t * 0.5);
      const x = point.x + point.driftX * t * point.windResistance + sway;
      const y = point.y + point.driftY * t * point.windResistance + gravityPull;
      const radius = point.size * (0.8 + t * 1.2);
      const alpha = Math.max(0, (1 - t * 0.7) * 1.0 - eased * 0.04);

      dustCtx.globalAlpha = alpha;
      dustCtx.fillRect(x - radius * 0.5, y - radius * 0.5, radius, radius);
    });

    const blurRadius = Math.min(4, 0.8 + eased * 3.2);
    context.save();
    context.filter = `blur(${blurRadius.toFixed(1)}px)`;
    context.globalAlpha = 1.0;
    context.drawImage(dustCanvas, 0, 0);
    context.filter = "none";
    context.globalAlpha = 0.75;
    context.drawImage(dustCanvas, 0, 0);
    context.restore();
  });
}

function requestWelcomeRender() {
  if (welcomeRenderFrame) {
    return;
  }

  welcomeRenderFrame = window.requestAnimationFrame(() => {
    drawWelcome();
    welcomeRenderFrame = 0;
  });
}

function requestWelcomeScatterUpdate() {
  requestWelcomeRender();
}

function updateHeroParallax() {
  const desktopBoost = isDesktopViewport() ? 1.55 : 1;
  if (heroSection && heroCopy && heroVisual) {
    const heroRect = heroSection.getBoundingClientRect();
    const heroProgress = Math.min(
      1,
      Math.max((window.innerHeight - heroRect.top) / (window.innerHeight * 1.2), 0)
    );
    const heroDepth = heroProgress - 0.4;
    const heroCopyShift = heroDepth * -48 * desktopBoost;
    const heroVisualShift = heroDepth * 42 * desktopBoost;
    const heroCopyScale = 1 - heroProgress * (isDesktopViewport() ? 0.05 : 0.03);
    const heroVisualScale = 1 + heroProgress * (isDesktopViewport() ? 0.04 : 0.025);

    heroCopy.style.transform =
      `translate3d(0, ${heroCopyShift}px, 0) scale(${heroCopyScale})`;
    heroCopy.style.opacity = `${0.75 + (1 - heroProgress) * 0.25}`;
    heroVisual.style.transform =
      `translate3d(0, ${heroVisualShift}px, 0) scale(${heroVisualScale})`;
  }
}

function requestHeroParallaxUpdate() {
  if (heroParallaxFrame) {
    return;
  }

  heroParallaxFrame = window.requestAnimationFrame(() => {
    updateHeroParallax();
    heroParallaxFrame = 0;
  });
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function easeInOut(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(value) {
  const t = 1 - clamp01(value);
  return 1 - t * t * t;
}

function smootherStep(value) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function mapScrollSegment(progress, start, end) {
  return clamp01((progress - start) / Math.max(end - start, 0.001));
}

function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}


function cubicBezierValue(start, controlA, controlB, end, progress) {
  const t = clamp01(progress);
  const inverse = 1 - t;

  return (
    inverse * inverse * inverse * start
    + 3 * inverse * inverse * t * controlA
    + 3 * inverse * t * t * controlB
    + t * t * t * end
  );
}

function interpolateStops(progress, stops, values) {
  const t = clamp01(progress);

  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index];
    const end = stops[index + 1];

    if (t <= end) {
      return interpolate(values[index], values[index + 1], mapScrollSegment(t, start, end));
    }
  }

  return values[values.length - 1];
}

function updateCareerLayerClasses() {
  if (!careerCardStack || isCareerSceneThemeLocked()) {
    return;
  }

  careerCardStack.dataset.activeLayer = String(activeCareerLayer);

  careerCardLayers.forEach((layer) => {
    const layerIndex = Number(layer.dataset.careerLayer);
    layer.classList.toggle("is-active", layerIndex === activeCareerLayer);
    layer.classList.toggle("is-before", layerIndex < activeCareerLayer);
    layer.classList.toggle("is-after", layerIndex > activeCareerLayer);

    if (layerIndex === activeCareerLayer) {
      layer.setAttribute("aria-current", "true");
    } else {
      layer.removeAttribute("aria-current");
    }
  });
}

function resetCareerLayerScroll(layerIndex = activeCareerLayer) {
  const scrollArea = document.querySelector(`.layer-card-scroll[data-career-layer="${layerIndex}"]`);

  if (scrollArea) {
    scrollArea.scrollTop = 0;
  }
}

function setCareerLayer(nextLayer, direction = "forward") {
  if (!careerCardStack || isCareerSceneThemeLocked()) {
    return;
  }

  const clampedLayer = Math.min(Math.max(nextLayer, 1), careerCardLayers.length || 1);

  if (clampedLayer === activeCareerLayer) {
    return;
  }

  activeCareerLayer = clampedLayer;
  resetCareerLayerScroll(clampedLayer);
  const animationDirection = clampedLayer === 3 ? "forward" : direction;
  const switchDuration = getCareerLayerSwitchDuration();
  careerCardStack.dataset.direction = animationDirection;
  careerCardStack.classList.remove("is-switching-forward", "is-switching-back");
  if (!shouldReduceMotion() && !isMobileViewport()) {
    careerCardStack.classList.add(animationDirection === "back" ? "is-switching-back" : "is-switching-forward");
  }
  updateCareerLayerClasses();

  window.clearTimeout(careerLayerTimer);
  careerLayerTimer = window.setTimeout(() => {
    careerCardStack.classList.remove("is-switching-forward", "is-switching-back");
    resetCareerLayerScroll(clampedLayer);
  }, switchDuration);
}

function stepCareerLayer(direction) {
  const layerCount = careerCardLayers.length;

  if (!layerCount) {
    return;
  }

  const nextLayer = direction === "back"
    ? ((activeCareerLayer + layerCount - 2) % layerCount) + 1
    : (activeCareerLayer % layerCount) + 1;
  setCareerLayer(nextLayer, direction);
}

/* The stack is otherwise reachable only by wheel and touch drag, which left
   the second and third cards unreachable without a pointer. Arrows step one
   card, Home/End jump to the ends; at either end we fall through so the key
   still scrolls the page instead of trapping focus. */
function handleCareerLayerKeydown(event) {
  if (!careerCardStack || isCareerSceneThemeLocked()) {
    return;
  }

  const layerCount = careerCardLayers.length;

  if (!layerCount || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  let nextLayer;
  let direction = "forward";

  switch (event.key) {
    case "ArrowDown":
    case "ArrowRight":
    case "PageDown":
      nextLayer = activeCareerLayer + 1;
      break;
    case "ArrowUp":
    case "ArrowLeft":
    case "PageUp":
      nextLayer = activeCareerLayer - 1;
      direction = "back";
      break;
    case "Home":
      nextLayer = 1;
      direction = "back";
      break;
    case "End":
      nextLayer = layerCount;
      break;
    default:
      return;
  }

  if (nextLayer < 1 || nextLayer > layerCount) {
    return;
  }

  event.preventDefault();
  setCareerLayer(nextLayer, direction);
}

function getActiveCareerScrollArea() {
  return document.querySelector(`.layer-card-scroll[data-career-layer="${activeCareerLayer}"]`);
}

function canScrollCareerLayer(scrollArea, deltaY) {
  if (!scrollArea || scrollArea.scrollHeight <= scrollArea.clientHeight + 1) {
    return false;
  }

  const overflowY = window.getComputedStyle(scrollArea).overflowY;
  if (overflowY !== "auto" && overflowY !== "scroll") {
    return false;
  }

  if (!isMobileViewport() && activeCareerLayer === 3) {
    scrollArea.scrollTop = 0;
    return false;
  }

  if (deltaY < 0) {
    return scrollArea.scrollTop > 0;
  }

  return scrollArea.scrollTop + scrollArea.clientHeight < scrollArea.scrollHeight - 1;
}

function stabilizeCareerScrollBoundary(scrollArea) {
  if (!scrollArea || scrollArea.scrollHeight <= scrollArea.clientHeight + 1) {
    return;
  }

  const maxScrollTop = scrollArea.scrollHeight - scrollArea.clientHeight;

  if (scrollArea.scrollTop <= 0) {
    scrollArea.scrollTop = 1;
  } else if (scrollArea.scrollTop >= maxScrollTop) {
    scrollArea.scrollTop = Math.max(maxScrollTop - 1, 0);
  }
}

function stopCareerScrollPropagation(event) {
  event.stopPropagation();
}

function handleCareerLayerWheel(event) {
  if (!careerCardStack || Math.abs(event.deltaY) < 4) {
    return;
  }

  const direction = event.deltaY > 0 ? "forward" : "back";
  const scrollArea = getActiveCareerScrollArea();

  if (canScrollCareerLayer(scrollArea, event.deltaY)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (careerWheelUnlockTimer) {
    return;
  }

  stepCareerLayer(direction);
  const unlockDelay = getCareerLayerSwitchDuration() + 80;
  careerWheelUnlockTimer = window.setTimeout(() => {
    careerWheelUnlockTimer = 0;
  }, unlockDelay);
}

function handleCareerLayerTouchStart(event) {
  event.stopPropagation();
  careerTouchStartX = event.touches?.[0]?.clientX ?? 0;
  careerTouchStartY = event.touches?.[0]?.clientY ?? 0;
  careerTouchSwitchLocked = false;
}

function handleCareerLayerTouchMove(event) {
  if (!careerCardStack) {
    return;
  }

  const touch = event.touches?.[0];
  const currentX = touch?.clientX ?? careerTouchStartX;
  const currentY = touch?.clientY ?? careerTouchStartY;
  const deltaX = currentX - careerTouchStartX;
  const deltaY = careerTouchStartY - currentY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX > 8 && absX > absY * 0.35) {
    event.preventDefault();
    event.stopPropagation();

    if (absY < 34) {
      return;
    }
  }

  if (absY < 34) {
    return;
  }

  const direction = deltaY > 0 ? "forward" : "back";
  const scrollArea = getActiveCareerScrollArea();

  if (canScrollCareerLayer(scrollArea, deltaY)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (careerTouchSwitchLocked) {
    return;
  }

  stepCareerLayer(direction);

  careerTouchStartY = currentY;
  careerTouchSwitchLocked = true;
  window.setTimeout(() => {
    careerTouchSwitchLocked = false;
  }, getCareerLayerSwitchDuration() + 30);
}

function handleCareerLayerTouchEnd(event) {
  event.stopPropagation();
  careerTouchSwitchLocked = false;
}

function updateCareerScene() {
  if (!careerSection || isCareerSceneThemeLocked()) {
    return;
  }

  const rect = careerSection.getBoundingClientRect();
  const viewportHeight = isMobileViewport()
    ? Math.max(stableMobileAppHeight || window.innerHeight, 1)
    : Math.max(window.innerHeight, window.visualViewport?.height || 0, 1);
  const progress = clamp01((viewportHeight * 0.85 - rect.top) / (viewportHeight * 1.05));

  if (shouldReduceMotion()) {
    careerSection.style.setProperty("--career-ufo-y", "0");
    careerSection.style.setProperty("--career-ufo-opacity", "1");
    careerSection.style.setProperty("--career-ufo-scale", "1");
    careerSection.style.setProperty("--career-card-y", "0");
    careerSection.style.setProperty("--career-card-opacity", "1");
    careerSection.style.setProperty("--career-card-scale", "1");
    careerSection.style.setProperty("--career-alien-y", "0");
    careerSection.style.setProperty("--career-alien-opacity", "1");
    careerSection.style.setProperty("--career-alien-scale", "1");
    return;
  }

  const ufoProgress = easeInOut(mapScrollSegment(progress, 0, 0.44));
  const cardProgress = easeInOut(mapScrollSegment(progress, 0.28, 0.66));
  const alienProgress = easeInOut(mapScrollSegment(progress, 0.58, 0.9));

  const ufoY = -116 + ufoProgress * 56;
  const cardY = 180 - cardProgress * 180;
  const alienY = 64 - alienProgress * 64;

  careerSection.style.setProperty("--career-ufo-y", ufoY.toFixed(2));
  careerSection.style.setProperty("--career-ufo-opacity", ufoProgress.toFixed(3));
  careerSection.style.setProperty("--career-ufo-scale", (0.86 + ufoProgress * 0.14).toFixed(3));
  careerSection.style.setProperty("--career-card-y", cardY.toFixed(2));
  careerSection.style.setProperty("--career-card-opacity", cardProgress.toFixed(3));
  careerSection.style.setProperty("--career-card-scale", (0.94 + cardProgress * 0.06).toFixed(3));
  careerSection.style.setProperty("--career-alien-y", alienY.toFixed(2));
  careerSection.style.setProperty("--career-alien-opacity", alienProgress.toFixed(3));
  careerSection.style.setProperty("--career-alien-scale", (0.78 + alienProgress * 0.22).toFixed(3));
}

function requestCareerSceneUpdate() {
  if (isCareerSceneThemeLocked()) {
    return;
  }

  if (careerFrame) {
    return;
  }

  careerFrame = window.requestAnimationFrame(() => {
    updateCareerScene();
    careerFrame = 0;
  });
}

function getPhotoElementStyleCache(element) {
  let cache = photoElementStyleCache.get(element);

  if (!cache) {
    cache = new Map();
    photoElementStyleCache.set(element, cache);
  }

  return cache;
}

function setStylePropertyIfChanged(element, name, value) {
  if (!element) {
    return;
  }

  const cache = getPhotoElementStyleCache(element);

  if (cache.get(name) === value) {
    return;
  }

  element.style.setProperty(name, value);
  cache.set(name, value);
}

function setStyleFieldIfChanged(element, name, value) {
  if (!element) {
    return;
  }

  const cacheKey = `style:${name}`;
  const cache = getPhotoElementStyleCache(element);

  if (cache.get(cacheKey) === value) {
    return;
  }

  element.style[name] = value;
  cache.set(cacheKey, value);
}

function setDataIfChanged(element, name, value) {
  if (!element || element.dataset[name] === value) {
    return;
  }

  element.dataset[name] = value;
}

function setAttributeIfChanged(element, name, value) {
  if (!element || element.getAttribute(name) === value) {
    return;
  }

  element.setAttribute(name, value);
}

function getPhotoLayoutMetrics(isCompact, viewportWidth) {
  const sampleCard = photoQueueCards[0] || photoFloatingCards[0];
  const metricsKey = [
    isCompact ? "compact" : "desktop",
    Math.round(viewportWidth),
    photoQueueCards.length,
    photoFloatingCards.length,
  ].join(":");

  if (photoLayoutMetricsCache?.key === metricsKey) {
    return photoLayoutMetricsCache;
  }

  const fallbackWidth = isCompact ? 88 : 160;
  const sampleStyle = sampleCard ? window.getComputedStyle(sampleCard) : null;
  const styleWidth = Number.parseFloat(sampleStyle?.width || "");
  const styleHeight = Number.parseFloat(sampleStyle?.height || "");
  const cardWidth = styleWidth || sampleCard?.offsetWidth || fallbackWidth;
  const cardHeight = styleHeight || sampleCard?.offsetHeight || cardWidth * 1.375;
  const queueStyle = photoQueueAnchor ? window.getComputedStyle(photoQueueAnchor) : null;
  const gap = Number.parseFloat(queueStyle?.columnGap || queueStyle?.gap || "") || (isCompact ? 4 : 18);

  photoLayoutMetricsCache = {
    key: metricsKey,
    cardWidth,
    cardHeight,
    gap,
  };

  return photoLayoutMetricsCache;
}

function invalidatePhotoLayoutCaches() {
  photoLayoutMetricsCache = null;
  photoCarouselHitRectCache = null;
}

function computePhotoRawProgress(rect, viewportHeight, isCompact = false) {
  const photoIntroStartY = viewportHeight * 0.72;
  const durationVh = isCompact
    ? PHOTO_INTRO_PHASES.mobileRawDurationVh
    : PHOTO_INTRO_PHASES.rawDurationVh;

  return {
    photoIntroStartY,
    rawProgress: (photoIntroStartY - rect.top) / (viewportHeight * durationVh),
  };
}

function applyPhotoSectionScrollHeight(viewportHeight, isCompact) {
  const durationVh = isCompact
    ? PHOTO_INTRO_PHASES.mobileRawDurationVh
    : PHOTO_INTRO_PHASES.rawDurationVh;
  const extraHeight = isCompact
    ? PHOTO_SECTION_EXTRA_HEIGHT_PX.mobile
    : PHOTO_SECTION_EXTRA_HEIGHT_PX.desktop;
  const expandedExtraHeight = Math.max(0, photoExpandedScrollExtraPx);
  const height = viewportHeight * (durationVh + 0.28) + PHOTO_AFTER_COMPLETE_SCROLL_PX;

  setStyleFieldIfChanged(photoSection, "minHeight", `${height.toFixed(2)}px`);
  setStyleFieldIfChanged(photoSection, "paddingBottom", `${(extraHeight + expandedExtraHeight).toFixed(2)}px`);
}

function computePhotoPhaseFrame({
  progress,
  titleProgress,
  cardHeight,
  isCompact,
  reduceMotion,
}) {
  const titleOpacity = reduceMotion
    ? 1
    : interpolateStops(titleProgress, [0, 0.12, 0.82, 0.94, 1], [0, 1, 1, 0, 0]);
  const titleY = reduceMotion
    ? 0
    : interpolateStops(titleProgress, [0, 0.12, 0.82, 0.94], [24, 0, 0, -20]);
  const queueRevealConfig = isCompact
    ? PHOTO_QUEUE_REVEAL_DROP_PROGRESS.mobile
    : PHOTO_QUEUE_REVEAL_DROP_PROGRESS.desktop;
  const dropTravelProgress = reduceMotion
    ? 1
    : mapScrollSegment(progress, getPhotoDropStartProgress(isCompact), PHOTO_INTRO_PHASES.dropEnd);
  const queueSpreadProgress = reduceMotion
    ? 1
    : mapScrollSegment(dropTravelProgress, queueRevealConfig.spreadStart, 1);
  const queueProgress = reduceMotion ? 1 : easeInOut(queueSpreadProgress);
  const queueVisibility = reduceMotion
    ? 1
    : smootherStep(mapScrollSegment(dropTravelProgress, queueRevealConfig.visibleStart, queueRevealConfig.visibleEnd));
  const queueEntryY = cardHeight * (isCompact ? 1.42 : 1.3) + (isCompact ? 44 : 62);
  const queueRiseProgress = reduceMotion
    ? 1
    : mapScrollSegment(dropTravelProgress, queueRevealConfig.riseStart, queueRevealConfig.riseEnd);
  const queueRiseEase = easeInOut(queueRiseProgress);
  const queueY = reduceMotion
    ? 0
    : queueEntryY * (1 - queueRiseEase);
  const queueIntroOffsetY = reduceMotion
    ? 0
    : queueEntryY * (1 - queueRiseEase);
  const insertHoldProgress = reduceMotion
    ? 1
    : mapScrollSegment(progress, PHOTO_INTRO_PHASES.dropEnd, PHOTO_INTRO_PHASES.insertHoldEnd);
  const previewProgress = reduceMotion
    ? 1
    : mapScrollSegment(progress, PHOTO_INTRO_PHASES.carouselStart, PHOTO_INTRO_PHASES.carouselEnd);

  return {
    titleOpacity,
    titleY,
    queueProgress,
    queueVisibility,
    queueY,
    queueOpacity: queueVisibility,
    queueIntroOffsetY,
    insertHoldProgress,
    previewProgress,
    previewEase: reduceMotion ? 1 : easeInOut(previewProgress),
    previewScaleEase: reduceMotion ? 1 : easeInOut(previewProgress),
  };
}

function applyPhotoQueueIntroFrame({ queueY, queueOpacity }) {
  setStylePropertyIfChanged(photoSection, "--photo-queue-y", `${queueY.toFixed(2)}px`);
  setStylePropertyIfChanged(photoSection, "--photo-queue-opacity", queueOpacity.toFixed(3));
}

function applyPhotoTitleFrame({ opacity, y }) {
  photoFixedTitle?.classList.toggle("is-visible", opacity > 0.02);
  setStylePropertyIfChanged(photoFixedTitle, "--photo-fixed-title-opacity", opacity.toFixed(3));
  setStylePropertyIfChanged(photoFixedTitle, "--photo-title-y", `${y.toFixed(2)}px`);
}

function applyPhotoQueueAnchorFrame({ cardHeight, queueBleed, queueProgress }) {
  setStyleFieldIfChanged(photoQueueAnchor, "height", `${cardHeight.toFixed(2)}px`);
  setStyleFieldIfChanged(photoQueueAnchor, "zIndex", "0");
  setStylePropertyIfChanged(photoSection, "--photo-queue-bleed", `${queueBleed.toFixed(2)}px`);
  setStylePropertyIfChanged(photoSection, "--photo-insert-progress", queueProgress.toFixed(3));
}

function getPhotoShowAllLabel(expanded) {
  const copy = getActiveCopy();
  if (expanded) {
    return copy.photoCollapseLabel || pageTranslations.en.photoCollapseLabel || "Collapse";
  }

  return copy.photoShowAllLabel || pageTranslations.en.photoShowAllLabel || "Show All";
}

function syncPhotoShowAllButtonCopy() {
  if (!photoShowAllButton) {
    return;
  }

  const showAllText = getPhotoShowAllLabel(photoAllExpandedTarget > 0.5);
  if (photoShowAllButton.textContent !== showAllText) {
    photoShowAllButton.textContent = showAllText;
  }
}

function applyPhotoShowAllFrame({
  visible,
  expanded,
  x,
  y,
}) {
  if (!photoShowAllButton) {
    return;
  }

  photoShowAllButton.classList.toggle("is-visible", visible);
  setAttributeIfChanged(photoShowAllButton, "aria-expanded", String(expanded));
  const showAllText = getPhotoShowAllLabel(expanded);
  if (photoShowAllButton.textContent !== showAllText) {
    photoShowAllButton.textContent = showAllText;
  }
  setStylePropertyIfChanged(photoShowAllButton, "--photo-show-all-opacity", visible ? "1" : "0");
  setStylePropertyIfChanged(photoShowAllButton, "--photo-show-all-x", `${x.toFixed(2)}px`);
  setStylePropertyIfChanged(photoShowAllButton, "--photo-show-all-y", `${y.toFixed(2)}px`);
}

function readPhotoCardContent(card) {
  const sourceImage = card?.querySelector(".photo-card-image");
  if (!sourceImage) {
    return null;
  }

  const src = sourceImage.getAttribute("data-preview-src") ||
    sourceImage.getAttribute("src") ||
    "";
  const naturalWidth = sourceImage.naturalWidth || 0;
  const naturalHeight = sourceImage.naturalHeight || 0;
  const aspectRatio = naturalWidth > 0 && naturalHeight > 0
    ? naturalWidth / naturalHeight
    : 0;

  return {
    src,
    srcset: sourceImage.getAttribute("srcset") || "",
    sizes: sourceImage.getAttribute("sizes") || "",
    fullSrc: sourceImage.getAttribute("data-full-src") || src,
    fullSrcset: sourceImage.getAttribute("data-full-srcset") || "",
    fullSizes: sourceImage.getAttribute("data-full-sizes") || "",
    label: card.getAttribute("aria-label") || "",
    sourceId: card.dataset.photoBase || card.dataset.photoInsert || card.dataset.photoCloneSource || "",
    aspectRatio,
  };
}

function syncPhotoCardImageContent(targetCard, sourceContent) {
  if (!targetCard || !sourceContent?.src) {
    return;
  }

  let targetImage = targetCard.querySelector(".photo-card-image");
  if (!targetImage) {
    targetImage = document.createElement("img");
    targetImage.className = "photo-card-image";
    targetImage.alt = "";
    targetImage.loading = "eager";
    targetImage.decoding = "async";
    targetImage.draggable = false;
    const shine = targetCard.querySelector(".photo-card-shine");
    targetCard.insertBefore(targetImage, shine || targetCard.firstChild);
  }

  setAttributeIfChanged(targetImage, "loading", "eager");
  setAttributeIfChanged(targetImage, "decoding", "async");

  ["src", "srcset", "sizes"].forEach((attribute) => {
    const value = sourceContent[attribute];
    if (value) {
      setAttributeIfChanged(targetImage, attribute, value);
    } else if (targetImage.hasAttribute(attribute)) {
      targetImage.removeAttribute(attribute);
    }
  });

  [
    ["data-preview-src", sourceContent.src],
    ["data-full-src", sourceContent.fullSrc],
    ["data-full-srcset", sourceContent.fullSrcset],
    ["data-full-sizes", sourceContent.fullSizes],
  ].forEach(([attribute, value]) => {
    if (value) {
      setAttributeIfChanged(targetImage, attribute, value);
    } else if (targetImage.hasAttribute(attribute)) {
      targetImage.removeAttribute(attribute);
    }
  });
}

function ensurePhotoZoomViewer() {
  return Boolean(photoZoomOverlay && photoZoomImage && photoZoomCloseButton && photoZoomLoading);
}

function setPhotoZoomLoading(isLoading) {
  if (!photoZoomOverlay || !photoZoomLoading) {
    return;
  }

  if (isLoading) {
    photoZoomOverlay.classList.remove("is-image-ready");
  }
  photoZoomOverlay.classList.toggle("is-loading", isLoading);
  photoZoomOverlay.setAttribute("aria-busy", isLoading ? "true" : "false");
  photoZoomLoading.setAttribute("aria-hidden", isLoading ? "false" : "true");
}

function setPhotoZoomLoadingFrame(sourceContent) {
  if (!photoZoomOverlay) {
    return;
  }

  const viewportWidth = Math.max(window.innerWidth || document.documentElement.clientWidth || 1, 1);
  const viewportHeight = Math.max(
    stableMobileAppHeight || window.innerHeight || document.documentElement.clientHeight || 1,
    1
  );
  const maxWidth = Math.max(240, viewportWidth - 44);
  const maxHeight = Math.max(240, viewportHeight - 104);
  const aspectRatio = Number.isFinite(sourceContent?.aspectRatio) && sourceContent.aspectRatio > 0
    ? sourceContent.aspectRatio
    : 0.72;
  let loadingWidth = maxHeight * aspectRatio;
  let loadingHeight = maxHeight;

  if (loadingWidth > maxWidth) {
    loadingWidth = maxWidth;
    loadingHeight = loadingWidth / aspectRatio;
  }

  photoZoomOverlay.style.setProperty("--photo-zoom-loading-width", `${loadingWidth.toFixed(2)}px`);
  photoZoomOverlay.style.setProperty("--photo-zoom-loading-height", `${loadingHeight.toFixed(2)}px`);
}

function applyPhotoZoomImageSource({ token, src, srcset = "", sizes = "" }) {
  if (!photoZoomImage || !src) {
    return Promise.resolve(false);
  }

  photoZoomOverlay?.classList.remove("is-image-ready");
  setPhotoZoomLoading(true);
  photoZoomImage.style.opacity = "0";
  photoZoomImage.style.visibility = "hidden";

  if (srcset) {
    setAttributeIfChanged(photoZoomImage, "srcset", srcset);
  } else if (photoZoomImage.hasAttribute("srcset")) {
    photoZoomImage.removeAttribute("srcset");
  }

  if (sizes) {
    setAttributeIfChanged(photoZoomImage, "sizes", sizes);
  } else if (photoZoomImage.hasAttribute("sizes")) {
    photoZoomImage.removeAttribute("sizes");
  }

  setAttributeIfChanged(photoZoomImage, "src", src);

  return decodePhotoZoomElement(photoZoomImage).then(async (decoded) => {
    if (token !== photoZoomOpenToken || !photoZoomActive || !decoded) {
      return false;
    }

    await waitForNextAnimationFrame();

    if (token !== photoZoomOpenToken || !photoZoomActive) {
      return false;
    }

    photoZoomImage.style.visibility = "visible";
    photoZoomImage.style.opacity = "1";
    photoZoomOverlay?.classList.add("is-image-ready");
    setPhotoZoomLoading(false);
    return true;
  });
}

async function recoverFromPhotoZoomFailure(token, sourceContent, failedSrc) {
  if (token !== photoZoomOpenToken || !photoZoomActive) {
    return;
  }

  /* The full-size image failed to load/decode. Fall back to the preview
     that already lives in the browser cache so the spinner never runs
     forever; if even that fails, close the viewer instead of hanging. */
  const previewSrc = sourceContent?.src || "";
  const shown = previewSrc && previewSrc !== failedSrc
    ? await applyPhotoZoomImageSource({ token, src: previewSrc })
    : false;

  if (!shown && token === photoZoomOpenToken && photoZoomActive) {
    closePhotoZoom();
  }
}

function decodePhotoZoomElement(image) {
  if (!image) {
    return Promise.resolve(false);
  }

  if (typeof image.decode === "function") {
    return image.decode().then(() => true).catch(() => false);
  }

  if (image.complete) {
    return Promise.resolve(image.naturalWidth > 0);
  }

  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(true), { once: true });
    image.addEventListener("error", () => resolve(false), { once: true });
  });
}

function getPhotoZoomSourceDescriptor(sourceContent) {
  if (!sourceContent?.src) {
    return null;
  }

  return {
    src: sourceContent.fullSrc || sourceContent.src,
    srcset: sourceContent.fullSrcset || "",
    sizes: sourceContent.fullSizes || "(max-width: 900px) 92vw, min(88vw, 1200px)",
  };
}

function getPhotoZoomPreloadKey(sourceContent) {
  const descriptor = getPhotoZoomSourceDescriptor(sourceContent);
  if (!descriptor?.src) {
    return "";
  }

  return [
    descriptor.src,
    descriptor.srcset,
    descriptor.sizes,
  ].join("|");
}

function getPhotoZoomPreloadLimit() {
  return isMobileViewport() ? 6 : 10;
}

function getPhotoZoomPreloadConcurrency() {
  return isMobileViewport() ? 1 : 2;
}

function prunePhotoZoomPreloadCache(activeSlot = photoZoomPreloadLastActiveSlot) {
  const decodedEntries = [...photoZoomPreloadCache.entries()]
    .filter(([, entry]) => entry.status === "decoded");
  const limit = getPhotoZoomPreloadLimit();

  if (decodedEntries.length <= limit) {
    return;
  }

  decodedEntries
    .sort(([, a], [, b]) => {
      const distanceA = Number.isFinite(a.slot) ? Math.abs(a.slot - activeSlot) : Number.POSITIVE_INFINITY;
      const distanceB = Number.isFinite(b.slot) ? Math.abs(b.slot - activeSlot) : Number.POSITIVE_INFINITY;
      return distanceB - distanceA;
    })
    .slice(0, decodedEntries.length - limit)
    .forEach(([key]) => {
      photoZoomPreloadCache.delete(key);
    });
}

function pumpPhotoZoomPreloadQueue() {
  const concurrency = getPhotoZoomPreloadConcurrency();

  while (photoZoomPreloadActiveCount < concurrency && photoZoomPreloadQueue.length > 0) {
    const preloadTask = photoZoomPreloadQueue.shift();
    const entry = photoZoomPreloadCache.get(preloadTask.key);

    if (!entry || entry.status !== "queued") {
      continue;
    }

    entry.status = "loading";
    photoZoomPreloadActiveCount += 1;

    const image = new Image();
    image.decoding = "async";
    try {
      image.fetchPriority = preloadTask.priority ? "high" : "low";
    } catch (error) {
      // Older browsers may expose fetchPriority as read-only or not at all.
    }
    if (preloadTask.srcset) {
      image.srcset = preloadTask.srcset;
    }
    if (preloadTask.sizes) {
      image.sizes = preloadTask.sizes;
    }
    image.src = preloadTask.src;

    entry.promise = decodePhotoZoomElement(image).then((decoded) => {
      if (decoded) {
        Object.assign(entry, {
          status: "decoded",
          image,
          src: preloadTask.src,
          srcset: preloadTask.srcset,
          sizes: preloadTask.sizes,
        });
        prunePhotoZoomPreloadCache(entry.slot);
        return entry;
      }

      entry.status = "error";
      return null;
    }).finally(() => {
      photoZoomPreloadActiveCount = Math.max(0, photoZoomPreloadActiveCount - 1);
      pumpPhotoZoomPreloadQueue();
    });
  }
}

function preloadPhotoZoomContent(sourceContent, priority = false, slot = null) {
  const descriptor = getPhotoZoomSourceDescriptor(sourceContent);
  const key = getPhotoZoomPreloadKey(sourceContent);

  if (!descriptor?.src || !key) {
    return;
  }

  const existingEntry = photoZoomPreloadCache.get(key);
  if (existingEntry) {
    if (Number.isFinite(slot)) {
      existingEntry.slot = slot;
    }
    if (existingEntry.status === "decoded" || existingEntry.status === "loading") {
      return;
    }
    if (existingEntry.status === "queued") {
      if (priority && !existingEntry.priority) {
        existingEntry.priority = true;
        const queueIndex = photoZoomPreloadQueue.findIndex((task) => task.key === key);
        if (queueIndex > 0) {
          const [task] = photoZoomPreloadQueue.splice(queueIndex, 1);
          task.priority = true;
          photoZoomPreloadQueue.unshift(task);
        }
      }
      return;
    }
  }

  const entry = {
    status: "queued",
    priority,
    slot,
    src: descriptor.src,
    srcset: descriptor.srcset,
    sizes: descriptor.sizes,
    image: null,
    promise: null,
  };
  photoZoomPreloadCache.set(key, entry);

  const preloadTask = {
    key,
    priority,
    slot,
    src: descriptor.src,
    srcset: descriptor.srcset,
    sizes: descriptor.sizes,
  };

  if (priority) {
    photoZoomPreloadQueue.unshift(preloadTask);
  } else {
    photoZoomPreloadQueue.push(preloadTask);
  }

  pumpPhotoZoomPreloadQueue();
}

function preloadNearbyPhotoZoomImages(activeSlot, radius = (isMobileViewport() ? 1 : 2)) {
  if (!Number.isFinite(activeSlot) || photoSlotContentMap.size === 0) {
    return;
  }

  const clampedActiveSlot = clampPhotoCarouselIndex(Math.round(activeSlot));
  photoZoomPreloadLastActiveSlot = clampedActiveSlot;
  const slots = [clampedActiveSlot];

  for (let offset = 1; offset <= radius; offset += 1) {
    slots.push(clampedActiveSlot - offset, clampedActiveSlot + offset);
  }

  slots.forEach((slot) => {
    if (slot < photoCarouselMinIndex || slot > photoCarouselMaxIndex) {
      return;
    }

    const sourceContent = photoSlotContentMap.get(slot);
    if (!sourceContent) {
      return;
    }

    preloadPhotoZoomContent(sourceContent, slot === clampedActiveSlot, slot);
  });
  prunePhotoZoomPreloadCache(clampedActiveSlot);
}

function preloadActivePhotoZoomImage(priority = true) {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01) {
    return;
  }

  const activeSlot = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
  const activeContent = photoSlotContentMap.get(activeSlot);
  if (!activeContent) {
    return;
  }

  preloadPhotoZoomContent(activeContent, priority, activeSlot);
  preloadNearbyPhotoZoomImages(activeSlot, isMobileViewport() ? 1 : 2);
}

function openPhotoZoom(sourceContent) {
  if (!sourceContent?.src) {
    return;
  }

  if (!ensurePhotoZoomViewer()) {
    return;
  }

  const token = ++photoZoomOpenToken;
  const zoomDescriptor = getPhotoZoomSourceDescriptor(sourceContent);
  if (!zoomDescriptor?.src) {
    return;
  }
  const zoomSrc = zoomDescriptor.src;
  const zoomSrcset = zoomDescriptor.srcset;
  const zoomSizes = zoomDescriptor.sizes;
  const zoomAlt = sourceContent.label || "Expanded photo";
  const zoomCacheKey = getPhotoZoomPreloadKey(sourceContent);
  const cachedZoom = photoZoomPreloadCache.get(zoomCacheKey);

  photoZoomImage.style.opacity = "0";
  photoZoomImage.style.visibility = "hidden";
  if (photoZoomImage.hasAttribute("srcset")) {
    photoZoomImage.removeAttribute("srcset");
  }
  if (photoZoomImage.hasAttribute("sizes")) {
    photoZoomImage.removeAttribute("sizes");
  }
  if (photoZoomImage.hasAttribute("src")) {
    photoZoomImage.removeAttribute("src");
  }
  setAttributeIfChanged(photoZoomImage, "alt", zoomAlt);
  setPhotoZoomLoadingFrame(sourceContent);
  photoZoomOverlay.classList.remove("is-image-ready");
  setPhotoZoomLoading(true);

  photoZoomActive = true;
  root.classList.add("is-photo-zoom-open");
  body.classList.add("is-photo-zoom-open");
  photoZoomOverlay.style.opacity = "";
  photoZoomOverlay.style.visibility = "";
  photoZoomOverlay.style.transition = "";
  photoZoomOverlay.style.pointerEvents = "auto";
  photoZoomOverlay.classList.add("is-active");
  photoZoomOverlay.setAttribute("aria-hidden", "false");
  photoZoomCloseButton?.focus({ preventScroll: true });

  if (cachedZoom?.status === "decoded") {
    applyPhotoZoomImageSource({
      token,
      src: cachedZoom.src,
      srcset: cachedZoom.srcset,
      sizes: cachedZoom.sizes,
    }).then((shown) => {
      if (!shown) {
        recoverFromPhotoZoomFailure(token, sourceContent, cachedZoom.src);
      }
    });
    preloadNearbyPhotoZoomImages(clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex)), isMobileViewport() ? 1 : 2);
    return;
  }

  const nextImage = new Image();
  nextImage.decoding = "async";
  nextImage.alt = zoomAlt;
  if (zoomSrcset) {
    nextImage.srcset = zoomSrcset;
  }
  if (zoomSizes) {
    nextImage.sizes = zoomSizes;
  }
  nextImage.src = zoomSrc;

  decodePhotoZoomElement(nextImage).then((decoded) => {
    if (token !== photoZoomOpenToken || !photoZoomActive) {
      return;
    }

    if (!decoded) {
      recoverFromPhotoZoomFailure(token, sourceContent, zoomSrc);
      return;
    }

    applyPhotoZoomImageSource({
      token,
      src: zoomSrc,
      srcset: zoomSrcset,
      sizes: zoomSizes,
    }).then((shown) => {
      if (!shown) {
        recoverFromPhotoZoomFailure(token, sourceContent, zoomSrc);
      }
    });
  });
}

function closePhotoZoom() {
  if (!photoZoomActive || !photoZoomOverlay) {
    return;
  }

  photoZoomOpenToken += 1;
  photoZoomActive = false;
  if (photoZoomImage) {
    photoZoomImage.style.opacity = "0";
    photoZoomImage.style.visibility = "hidden";
  }
  setPhotoZoomLoading(false);
  photoZoomOverlay.classList.remove("is-image-ready");
  root.classList.remove("is-photo-zoom-open");
  body.classList.remove("is-photo-zoom-open");
  photoZoomOverlay.style.transition = "none";
  photoZoomOverlay.style.pointerEvents = "none";
  photoZoomOverlay.style.opacity = "0";
  photoZoomOverlay.style.visibility = "hidden";
  photoZoomOverlay.classList.remove("is-active");
  photoZoomOverlay.setAttribute("aria-hidden", "true");
  photoZoomOverlay.style.removeProperty("--photo-zoom-loading-width");
  photoZoomOverlay.style.removeProperty("--photo-zoom-loading-height");
  if (photoZoomTriggerCard?.isConnected) {
    photoZoomTriggerCard.focus({ preventScroll: true });
  } else {
    photoZoomCloseButton?.blur();
  }
  photoZoomTriggerCard = null;
  requestPhotoSceneUpdate();
  window.requestAnimationFrame(() => {
    if (photoZoomActive || !photoZoomOverlay) {
      return;
    }

    photoZoomOverlay.style.transition = "";
    photoZoomOverlay.style.opacity = "";
    photoZoomOverlay.style.visibility = "";
  });
}

function handlePhotoZoomClosePointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
  closePhotoZoom();
}

function handlePhotoZoomOverlayPointerDown(event) {
  if (event.target === photoZoomOverlay) {
    event.preventDefault();
    event.stopPropagation();
    closePhotoZoom();
  }
}

function stopPhotoZoomScroll(event) {
  if (!photoZoomActive) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
}

function getActivePhotoMainCard() {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01) {
    return null;
  }

  const activeSlot = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
  return photoCardSlotMap.get(activeSlot) || null;
}

function getPhotoCardZoomContent(card, slot) {
  if (!card) {
    return null;
  }

  const safeSlot = Number.isFinite(slot)
    ? slot
    : Number.parseInt(card.dataset.photoSlot, 10);
  const mappedContent = Number.isFinite(safeSlot)
    ? photoSlotContentMap.get(safeSlot)
    : null;
  const liveContent = readPhotoCardContent(card);
  return mappedContent && liveContent
    ? {
        ...mappedContent,
        aspectRatio: liveContent.aspectRatio || mappedContent.aspectRatio || 0,
      }
    : (mappedContent || liveContent);
}

function isPointInsidePhotoCard(card, x, y) {
  if (!card) {
    return false;
  }

  const rect = card.getBoundingClientRect();
  return (
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom
  );
}

function getExpandedPhotoCardContentAtPoint(x, y, target) {
  if (photoAllExpandedTarget <= 0.5 && photoAllExpandedProgress <= 0.5) {
    return null;
  }

  const card = target?.closest?.(".photo-card");
  if (!card || !photoStage?.contains(card) || !isPointInsidePhotoCard(card, x, y)) {
    return null;
  }

  const slot = Number.parseInt(card.dataset.photoSlot, 10);
  const sourceContent = getPhotoCardZoomContent(card, slot);

  return {
    activeCard: card,
    activeSlot: slot,
    sourceContent,
  };
}

function getActivePhotoMainCardContentAtPoint(x, y) {
  const activeCard = getActivePhotoMainCard();
  if (!activeCard || !isPointInsidePhotoCard(activeCard, x, y)) {
    return null;
  }

  const activeSlot = Number.parseInt(activeCard.dataset.photoSlot, 10);
  return {
    activeCard,
    activeSlot,
    sourceContent: getPhotoCardZoomContent(activeCard, activeSlot),
  };
}

function getPhotoZoomHitContentAtPoint(x, y, target) {
  return getExpandedPhotoCardContentAtPoint(x, y, target) ||
    getActivePhotoMainCardContentAtPoint(x, y);
}

function handlePhotoMainCardPreloadAtPoint(x, y, target) {
  const hitContent = getPhotoZoomHitContentAtPoint(x, y, target);
  if (!hitContent?.sourceContent) {
    return;
  }

  preloadPhotoZoomContent(hitContent.sourceContent, true, hitContent.activeSlot);
}

function handlePhotoMainCardPointerPreload(event) {
  if (photoZoomActive || !photoStage || photoShowAllButton?.contains(event.target)) {
    return;
  }

  handlePhotoMainCardPreloadAtPoint(event.clientX, event.clientY, event.target);
}

function handlePhotoMainCardTouchPreload(event) {
  if (photoZoomActive || !photoStage || photoShowAllButton?.contains(event.target) || event.touches.length !== 1) {
    return;
  }

  const touch = event.touches[0];
  handlePhotoMainCardPreloadAtPoint(touch.clientX, touch.clientY, event.target);
}

function navigatePhotoCarouselToSlot(slot) {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01) {
    return false;
  }

  const targetSlot = clampPhotoCarouselIndex(slot);
  const currentSlot = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
  if (targetSlot === currentSlot) {
    return false;
  }

  photoCarouselBoundaryDelta = 0;
  photoCarouselBoundaryDirection = 0;
  photoCarouselPreviousIndex = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
  photoCarouselTargetIndex = targetSlot;
  setPhotoSelectedSlot(targetSlot);
  photoCarouselTransitionDirection = Math.sign(targetSlot - currentSlot);
  photoCarouselHasInteracted = true;
  photoCarouselSettling = false;
  requestPhotoSceneUpdate();
  return true;
}

function getClickedPhotoCardSlot(x, y, target) {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01) {
    return null;
  }

  const card = target?.closest?.(".photo-card");
  if (!card || !photoStage?.contains(card)) {
    return null;
  }

  if (!isPointInsidePhotoCard(card, x, y)) {
    return null;
  }

  const slot = Number.parseInt(card.dataset.photoSlot, 10);
  return Number.isFinite(slot) ? slot : null;
}

function handlePhotoMainCardClick(event) {
  if (photoZoomActive || !photoStage || photoShowAllButton?.contains(event.target)) {
    return;
  }

  const clickedSlot = getClickedPhotoCardSlot(event.clientX, event.clientY, event.target);
  if (clickedSlot !== null) {
    const activeSlot = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
    if (clickedSlot !== activeSlot) {
      event.preventDefault();
      event.stopPropagation();
      navigatePhotoCarouselToSlot(clickedSlot);
      return;
    }
  }

  const hitContent = getPhotoZoomHitContentAtPoint(event.clientX, event.clientY, event.target);
  if (!hitContent?.sourceContent) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  photoZoomTriggerCard = hitContent.activeCard || null;
  openPhotoZoom(hitContent.sourceContent);
}

function handlePhotoCardKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  if (photoZoomActive || !photoStage || photoShowAllButton?.contains(event.target)) {
    return;
  }

  const card = event.target?.closest?.(".photo-card");
  if (!card || !photoStage.contains(card)) {
    return;
  }

  const slot = Number.parseInt(card.dataset.photoSlot, 10);
  if (!Number.isFinite(slot)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (photoCarouselEnabled && photoAllExpandedTarget <= 0 && photoAllExpandedProgress <= 0.01) {
    const activeSlot = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
    if (slot !== activeSlot) {
      navigatePhotoCarouselToSlot(slot);
      return;
    }
  }

  const sourceContent = getPhotoCardZoomContent(card, slot);
  if (!sourceContent?.src) {
    return;
  }

  photoZoomTriggerCard = card;
  openPhotoZoom(sourceContent);
}

function ensurePhotoSlotContentMap({
  finalCount,
  initialCount,
  centerSlot,
}) {
  if (photoSlotContentMap.size > 0 || finalCount <= 0) {
    return;
  }

  const initialFloatingSlots = (() => {
    if (photoFloatingCards.length === 1) {
      return [centerSlot];
    }

    if (photoFloatingCards.length === 3) {
      return [
        Math.max(0, centerSlot - 5),
        centerSlot,
        Math.min(finalCount - 1, centerSlot + 4),
      ];
    }

    return photoFloatingCards.map((_, index) => Math.min(finalCount - 1, centerSlot + index));
  })();
  const initialFloatingSlotSet = new Set(initialFloatingSlots);
  const initialQueueSlots = Array.from({ length: finalCount }, (_, index) => index)
    .filter((slot) => !initialFloatingSlotSet.has(slot))
    .slice(0, initialCount);

  photoQueueCards.forEach((card, index) => {
    const slot = initialQueueSlots[index];
    const content = readPhotoCardContent(card);
    if (Number.isFinite(slot) && content) {
      photoSlotContentMap.set(slot, content);
    }
  });

  photoFloatingCards.forEach((card, index) => {
    const slot = initialFloatingSlots[index];
    const content = readPhotoCardContent(card);
    if (Number.isFinite(slot) && content) {
      photoSlotContentMap.set(slot, content);
    }
  });
}

function applyPhotoCardFrames({
  cardFrames,
  hitRect,
  slotEntries,
  selectedSourceCard,
}) {
  cardFrames.forEach(({ card, layout, options, data = [], attributes = [] }) => {
    data.forEach(([name, value]) => {
      setDataIfChanged(card, name, value);
    });
    attributes.forEach(([name, value]) => {
      setAttributeIfChanged(card, name, value);
    });
    applyPhotoCardStyle(card, layout, options);
  });

  photoCarouselHitRectCache = hitRect;
  photoCardSlotMap.clear();
  slotEntries.forEach(([slot, card]) => {
    photoCardSlotMap.set(slot, card);
  });
  photoSelectedSourceCard = selectedSourceCard || photoSelectedSourceCard;
}

function createPhotoHitRectCollector(stageRect, cardWidth, cardHeight) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let hasRect = false;

  return {
    include(layout, baseX = 0) {
      if (!layout || layout.opacity <= 0.02) {
        return;
      }

      const scale = Math.max(layout.scale || 1, 0.01);
      const radians = ((layout.rotate || 0) * Math.PI) / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));
      const width = cardWidth * scale;
      const height = cardHeight * scale;
      const halfWidth = (width * cos + height * sin) / 2;
      const halfHeight = (width * sin + height * cos) / 2;
      const centerX = stageRect.left + baseX + layout.x + cardWidth / 2;
      const centerY = stageRect.top + layout.y + cardHeight / 2;

      hasRect = true;
      left = Math.min(left, centerX - halfWidth);
      top = Math.min(top, centerY - halfHeight);
      right = Math.max(right, centerX + halfWidth);
      bottom = Math.max(bottom, centerY + halfHeight);
    },
    getRect() {
      return hasRect ? { left, top, right, bottom } : null;
    },
  };
}

function applyPhotoCardStyle(card, layout, options = {}) {
  const useMobilePhotoPerformance = options.mobilePerformance ?? isMobileViewport();
  const transform = `translate3d(${layout.x.toFixed(2)}px, ${layout.y.toFixed(2)}px, 0) rotate(${layout.rotate.toFixed(2)}deg) scale(${layout.scale.toFixed(3)})`;
  const opacity = layout.opacity.toFixed(3);
  const zIndex = String(layout.zIndex);
  const filter = useMobilePhotoPerformance ? "" : (options.filter ?? "");
  const shadowStrength = useMobilePhotoPerformance
    ? "3.20%"
    : (
        options.shadowStrength == null
          ? null
          : `${options.shadowStrength.toFixed(2)}%`
      );
  const cardDepth = useMobilePhotoPerformance
    ? "10.00px"
    : (
        options.cardDepth == null
          ? null
          : `${options.cardDepth.toFixed(2)}px`
      );
  const shineX = useMobilePhotoPerformance
    ? "0.00%"
    : (
        options.shineX == null
          ? null
          : `${options.shineX.toFixed(2)}%`
      );
  let cache = photoCardStyleCache.get(card);

  if (!cache) {
    cache = {};
    photoCardStyleCache.set(card, cache);
  }

  if (cache.transform !== transform) {
    card.style.transform = transform;
    cache.transform = transform;
  }

  if (cache.opacity !== opacity) {
    card.style.opacity = opacity;
    cache.opacity = opacity;
  }

  if (cache.filter !== filter) {
    card.style.filter = filter;
    cache.filter = filter;
  }

  if (cache.zIndex !== zIndex) {
    card.style.zIndex = zIndex;
    cache.zIndex = zIndex;
  }

  if (shadowStrength !== null && cache.shadowStrength !== shadowStrength) {
    card.style.setProperty("--photo-card-shadow-strength", shadowStrength);
    cache.shadowStrength = shadowStrength;
  }

  if (cardDepth !== null && cache.cardDepth !== cardDepth) {
    card.style.setProperty("--photo-card-depth", cardDepth);
    cache.cardDepth = cardDepth;
  }

  if (shineX !== null && cache.shineX !== shineX) {
    card.style.setProperty("--photo-shine-x", shineX);
    cache.shineX = shineX;
  }
}

function updatePhotoScene(timestamp = window.performance.now()) {
  if (!photoSection || !photoStage || !photoQueueAnchor || photoFloatingCards.length === 0 || photoQueueCards.length === 0) {
    return false;
  }

  const isCompact = window.innerWidth <= 680;
  const viewportHeight = isCompact
    ? Math.max(stableMobileAppHeight || window.innerHeight, 1)
    : Math.max(window.innerHeight, window.visualViewport?.height || 0, 1);
  const viewportWidth = isCompact
    ? Math.max(window.innerWidth, 1)
    : Math.max(window.innerWidth, window.visualViewport?.width || 0, 1);

  applyPhotoSectionScrollHeight(viewportHeight, isCompact);

  const rect = photoSection.getBoundingClientRect();
  const photoSectionIsNearViewport = rect.top < viewportHeight * 1.35 && rect.bottom > -viewportHeight * 0.35;
  const photoHasActiveMotion = (
    photoCarouselEnabled ||
    photoCarouselSettling ||
    photoAllExpandedAnimating ||
    photoReinsertActive ||
    Math.abs(photoAllExpandedTarget - photoAllExpandedProgress) > 0.001
  );

  if (!photoSectionIsNearViewport && !photoHasActiveMotion) {
    photoLastFrameTime = timestamp;
    return false;
  }

  const reduceMotion = shouldReduceMotion();
  const { photoIntroStartY, rawProgress } = computePhotoRawProgress(rect, viewportHeight, isCompact);
  let deltaSeconds = 1 / 60;
  const photoDropStartProgress = getPhotoDropStartProgress(isCompact);
  photoTargetProgress = clamp01(rawProgress);

  if (photoTargetProgress <= 0 && rect.top > photoIntroStartY) {
    photoVisualProgress = 0;
    photoProgressVelocity = 0;
  }

  if (reduceMotion) {
    photoVisualProgress = photoTargetProgress;
    photoProgressVelocity = 0;
    photoLastFrameTime = timestamp;
  } else if (!photoLastFrameTime) {
    photoVisualProgress = photoTargetProgress;
    photoProgressVelocity = 0;
    photoLastFrameTime = timestamp;
  } else {
    deltaSeconds = Math.min(Math.max((timestamp - photoLastFrameTime) / 1000, 0.008), 0.05);
    const delta = photoTargetProgress - photoVisualProgress;
    const direction = Math.sign(delta);
    const distance = Math.abs(delta);
    const isReverseExtraction = (
      direction < 0 &&
      photoVisualProgress > photoDropStartProgress &&
      photoVisualProgress <= PHOTO_INTRO_PHASES.carouselEnd
    );
    const isMobileReverseExtraction = isReverseExtraction && isCompact;
    const velocityDirection = Math.sign(photoProgressVelocity);

    if (direction && velocityDirection && direction !== velocityDirection) {
      photoProgressVelocity *= isMobileReverseExtraction ? 0.035 : 0.08;
    }

    const maxSpeed = isMobileReverseExtraction ? 1.16 : (isReverseExtraction ? 1.0 : 0.78);
    const maxAcceleration = isMobileReverseExtraction ? 6.8 : (isReverseExtraction ? 5.2 : 2.85);
    const brakingDistance = isMobileReverseExtraction ? 0.075 : (isReverseExtraction ? 0.1 : 0.2);
    const speedLimitByDistance = maxSpeed * Math.min(1, distance / brakingDistance);
    const desiredVelocity = direction * speedLimitByDistance;
    const velocityDelta = desiredVelocity - photoProgressVelocity;
    const maxVelocityChange = maxAcceleration * deltaSeconds;

    photoProgressVelocity += Math.min(
      Math.max(velocityDelta, -maxVelocityChange),
      maxVelocityChange
    );
    photoVisualProgress += photoProgressVelocity * deltaSeconds;

    if (
      Math.abs(photoTargetProgress - photoVisualProgress) < 0.00005 &&
      Math.abs(photoProgressVelocity) < 0.00005
    ) {
      photoVisualProgress = photoTargetProgress;
      photoProgressVelocity = 0;
    }
    photoLastFrameTime = timestamp;
  }

  const progress = photoVisualProgress;
  const titleStartRatio = getPhotoTitleStartRatio(isCompact);
  const titleDurationRatio = PHOTO_TITLE_DURATION_RATIO;
  const titleProgress = reduceMotion
    ? 1
    : clamp01((viewportHeight * titleStartRatio - rect.top) / (viewportHeight * titleDurationRatio));
  const { cardWidth, cardHeight, gap } = getPhotoLayoutMetrics(isCompact, viewportWidth);
  const photoPhaseFrame = computePhotoPhaseFrame({
    progress,
    titleProgress,
    cardHeight,
    isCompact,
    reduceMotion,
  });
  const {
    titleOpacity,
    titleY,
    queueProgress,
    queueVisibility,
    queueY,
    queueOpacity,
    queueIntroOffsetY,
    insertHoldProgress,
    previewProgress,
    previewEase,
    previewScaleEase,
  } = photoPhaseFrame;
  applyPhotoQueueIntroFrame({ queueY, queueOpacity });
  const gatedTitleOpacity = titleOpacity;
  applyPhotoTitleFrame({ opacity: gatedTitleOpacity, y: titleY });
  const stageRect = photoStage.getBoundingClientRect();
  const queueRect = photoQueueAnchor.getBoundingClientRect();
  const stageHeadroom = Math.max(0, -stageRect.top);
  const titleRect = photoFixedTitle?.getBoundingClientRect();
  const titleDropAnchorY = titleRect
    ? titleRect.top - stageRect.top + titleRect.height * 0.5 - cardHeight * 0.5
    : stageHeadroom + viewportHeight * (isCompact ? 0.12 : 0.1);
  const dropStartBaseY = titleDropAnchorY;
  const queueCenterX = queueRect.left - stageRect.left + queueRect.width / 2;
  const queueVisualTopY = queueRect.top - stageRect.top;
  const dropDistanceExtraY = isCompact
    ? PHOTO_DROP_EXTRA_DISTANCE_PX.mobile
    : PHOTO_DROP_EXTRA_DISTANCE_PX.desktop;
  const queueVisualLiftY = isCompact
    ? PHOTO_QUEUE_VISUAL_LIFT_PX.mobile
    : PHOTO_QUEUE_VISUAL_LIFT_PX.desktop;
  const insertionAnchorY = queueVisualTopY + dropDistanceExtraY - queueVisualLiftY;
  const queueLocalOffsetY = insertionAnchorY;
  const initialCount = photoQueueCards.length;
  const finalCount = initialCount + photoFloatingCards.length;
  const initialStep = cardWidth + gap;
  const finalStep = cardWidth + gap;
  const initialStartX = queueCenterX - ((initialCount - 1) * initialStep) / 2;
  const finalStartX = queueCenterX - ((finalCount - 1) * finalStep) / 2;
  const centerSlot = Math.floor(finalCount / 2);
  const centerInsertSlot = centerSlot;
  const hasSingleFloatingCard = photoFloatingCards.length === 1;
  ensurePhotoSlotContentMap({
    finalCount,
    initialCount,
    centerSlot: centerInsertSlot,
  });
  const hasValidSelectedSlot = (
    Number.isFinite(photoSelectedSlot) &&
    photoSelectedSlot >= 0 &&
    photoSelectedSlot < finalCount
  );
  const selectedSlot = hasValidSelectedSlot ? photoSelectedSlot : centerInsertSlot;
  const contentSlot = Math.min(Math.max(Math.round(selectedSlot), 0), Math.max(finalCount - 1, 0));
  const layoutAnchorSlot = hasSingleFloatingCard
    ? contentSlot
    : centerInsertSlot;
  const insertGapSlots = (() => {
    if (hasSingleFloatingCard) {
      return [contentSlot];
    }

    if (photoFloatingCards.length === 3) {
      return [
        Math.max(0, centerSlot - 5),
        centerSlot,
        Math.min(finalCount - 1, centerSlot + 4),
      ];
    }

    return photoFloatingCards.map((_, index) => Math.min(finalCount - 1, centerSlot + index));
  })();
  // Single-card replay separates identity from layout:
  // - contentSlot is the selected card's identity and becomes the active carousel slot.
  // - insertGapSlots follows contentSlot, so the queue opens around the current active card.
  const insertFinalSlots = hasSingleFloatingCard ? [contentSlot] : insertGapSlots;
  const initialCarouselIndex = hasSingleFloatingCard
    ? contentSlot
    : centerSlot;
  const insertGapSlotSet = new Set(insertGapSlots);
  const floatingSlotSet = new Set(insertFinalSlots);
  const baseFinalSlots = Array.from({ length: finalCount }, (_, index) => index)
    .filter((slot) => !floatingSlotSet.has(slot))
    .slice(0, initialCount);
  const baseInsertSlots = hasSingleFloatingCard
    ? Array.from({ length: finalCount }, (_, index) => index)
      .filter((slot) => !insertGapSlotSet.has(slot))
      .slice(0, initialCount)
    : baseFinalSlots;
  const orderedPhotoSlots = Array.from({ length: finalCount }, (_, slot) => slot);
  const selectedOrderIndex = orderedPhotoSlots.indexOf(contentSlot);
  const reinsertRelativeOffsetBySlot = new Map();
  orderedPhotoSlots.forEach((slot, orderIndex) => {
    if (slot === contentSlot) {
      return;
    }

    reinsertRelativeOffsetBySlot.set(slot, orderIndex - selectedOrderIndex);
  });
  photoCarouselMinIndex = 0;
  photoCarouselMaxIndex = Math.max(photoCarouselCards.length - 1, finalCount - 1, 0);

  const photoSectionIsVisible = rect.top < viewportHeight && rect.bottom > 0;
  const carouselReadyThreshold = 0.975;
  const introComplete = previewProgress >= carouselReadyThreshold;
  const carouselReady = (
    (shouldReduceMotion() || introComplete) &&
    photoSectionIsVisible
  );
  const carouselIntroResetReady = (
    photoSectionIsVisible &&
    progress < photoDropStartProgress &&
    previewProgress < 0.01
  );

  if (carouselReady) {
    if (!photoCarouselEnabled) {
      photoCarouselEnabled = true;
      photoReinsertActive = false;
      if (!photoCarouselHasInteracted && !photoCarouselSettling) {
        photoCarouselTargetIndex = initialCarouselIndex;
        photoCarouselVisualIndex = initialCarouselIndex;
        photoCarouselPreviousIndex = initialCarouselIndex;
        photoCarouselTransitionDirection = 0;
      } else {
        photoCarouselTargetIndex = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
      }
      photoCarouselSettling = false;
      photoCarouselWheelDelta = 0;
      photoCarouselWheelDirection = 0;
      photoCarouselBoundaryDelta = 0;
      photoCarouselBoundaryDirection = 0;
      preloadNearbyPhotoZoomImages(photoCarouselTargetIndex, isCompact ? 1 : 2);
    }
  } else {
    photoCarouselEnabled = false;
    photoCarouselWheelDelta = 0;
    photoCarouselWheelDirection = 0;
    photoCarouselBoundaryDelta = 0;
    photoCarouselBoundaryDirection = 0;
    resetPhotoCarouselTouchState();

    const canReplaySelectedCard = (
      hasSingleFloatingCard &&
      !photoAllExpanded &&
      photoAllExpandedProgress < 0.01 &&
      (photoCarouselHasInteracted || (isCompact && hasValidSelectedSlot))
    );

    if (canReplaySelectedCard && photoSectionIsVisible && !carouselIntroResetReady) {
      photoCarouselSettling = true;
      photoCarouselTargetIndex = isCompact && hasValidSelectedSlot
        ? clampPhotoCarouselIndex(contentSlot)
        : clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
      if (isCompact && hasValidSelectedSlot) {
        photoCarouselVisualIndex = photoCarouselTargetIndex;
      }
      photoReinsertActive = true;
    } else {
      photoCarouselSettling = false;
      photoCarouselHasInteracted = false;
      photoAllExpanded = false;
      photoAllExpandedTarget = 0;
      photoAllExpandedProgress = 0;
      photoAllExpandedAnimating = false;
      photoAllExpandedAnimationStart = 0;
      photoAllExpandedAnimationDirection = 0;
      photoAllExpandedLayouts.clear();
      photoReinsertActive = false;
      photoCarouselTargetIndex = initialCarouselIndex;
      photoCarouselVisualIndex = initialCarouselIndex;
      photoCarouselPreviousIndex = initialCarouselIndex;
      photoCarouselTransitionDirection = 0;
    }
  }

  const photoCarouselLayoutActive = (
    photoCarouselEnabled ||
    photoCarouselSettling ||
    (photoCarouselHasInteracted && photoSectionIsVisible && !carouselIntroResetReady)
  );

  if (photoCarouselEnabled || photoCarouselSettling) {
    const carouselDelta = photoCarouselTargetIndex - photoCarouselVisualIndex;
    const carouselFollowTime = isCompact ? 0.16 : 0.34;
    const carouselFollow = shouldReduceMotion() ? 1 : 1 - Math.exp(-deltaSeconds / carouselFollowTime);
    photoCarouselVisualIndex += carouselDelta * carouselFollow;

    if (Math.abs(photoCarouselTargetIndex - photoCarouselVisualIndex) < 0.001) {
      photoCarouselVisualIndex = photoCarouselTargetIndex;
      photoCarouselPreviousIndex = photoCarouselTargetIndex;
      photoCarouselTransitionDirection = 0;
      setPhotoSelectedSlot(photoCarouselTargetIndex);
      if (photoCarouselSettling) {
        photoCarouselSettling = false;
      }
    }
  }

  if (photoAllExpandedAnimating) {
    const rawAnimationProgress = clamp01((timestamp - photoAllExpandedAnimationStart) / photoAllExpandedDuration);
    const easedAnimationProgress = easeOutCubic(rawAnimationProgress);
    photoAllExpandedProgress = photoAllExpandedAnimationDirection > 0
      ? easedAnimationProgress
      : 1 - easedAnimationProgress;

    if (rawAnimationProgress >= 1) {
      photoAllExpandedAnimating = false;
      photoAllExpandedProgress = photoAllExpandedTarget;
      photoAllExpandedLayouts.clear();
    }
  } else {
    photoAllExpandedProgress = photoAllExpandedTarget;
  }

  const activeIndex = photoCarouselLayoutActive ? photoCarouselVisualIndex : initialCarouselIndex;
  const nearestCenterSlot = isCompact || !photoCarouselLayoutActive
    ? Math.round(activeIndex)
    : Math.round(photoCarouselTargetIndex);
  const getCompressedLineOffset = (slot, centerSlot) => {
    if (slot < centerSlot) {
      return slot - centerSlot + 0.5;
    }

    if (slot > centerSlot) {
      return slot - centerSlot - 0.5;
    }

    return 0;
  };
  const getPhotoInsertStackMetrics = (relativeOffset, asLineLayout = false) => {
    const absOffset = Math.abs(relativeOffset);
    const direction = Math.sign(relativeOffset);
    const centerWeight = Math.max(0, 1 - absOffset);
    const sideScale = 0.94 - Math.min(Math.max(absOffset - 1, 0) * 0.015, 0.06);
    const centerScale = 1.14;
    const mobileLineStep = cardWidth + Math.max(2, gap);
    const mobileGuardX = cardWidth * ((centerScale + sideScale) / 2) + Math.max(4, gap);
    const mobileStackStepX = Math.max(cardWidth * 0.1, 8);
    const lineX = relativeOffset * mobileLineStep;
    const stackX = absOffset <= 1
      ? mobileGuardX * absOffset
      : mobileGuardX + (absOffset - 1) * mobileStackStepX;

    if (asLineLayout) {
      return {
        x: lineX,
        y: 0,
        scale: 1,
        rotate: 0,
        opacity: 1,
        shadowStrength: 3,
        zIndex: 100,
        isCenter: false,
      };
    }

    return {
      x: direction * stackX,
      y: 0,
      scale: interpolate(sideScale, centerScale, centerWeight),
      rotate: 0,
      opacity: 1,
      shadowStrength: interpolate(Math.max(2.2, 4.4 - absOffset * 0.32), 7.2, centerWeight),
      zIndex: Math.max(1, 1040 - absOffset * 18),
      isCenter: centerWeight > 0.999,
    };
  };
  const getPhotoPreviewMetrics = (relativeOffset) => {
    if (isCompact) {
      return getPhotoInsertStackMetrics(relativeOffset);
    }

    const absOffset = Math.abs(relativeOffset);
    const direction = Math.sign(relativeOffset);
    const guardOffset = Math.min(Math.max(cardWidth * 1.7, 240), viewportWidth * 0.24);
    const stackStep = Math.max(34, cardWidth * 0.24);
    const maxStackX = Math.max(guardOffset + stackStep, viewportWidth / 2 - cardWidth * 0.38);
    const desktopStackT = Math.max(absOffset - 1, 0);
    const desktopStackFirstX = Math.min(guardOffset + cardWidth * 1.52, maxStackX);
    const desktopX = absOffset <= 1
      ? interpolate(0, guardOffset, absOffset)
      : (
          desktopStackT <= 1
            ? interpolate(guardOffset, desktopStackFirstX, desktopStackT)
            : Math.min(desktopStackFirstX + (desktopStackT - 1) * stackStep, maxStackX)
        );
    const centerWeight = Math.max(0, 1 - absOffset);
    const centerScale = 1.54;
    const scale = absOffset <= 1
      ? interpolate(centerScale, 1, absOffset)
      : interpolate(1, 0.96, clamp01(absOffset - 1));

    return {
      x: direction * desktopX,
      y: 0,
      scale,
      rotate: 0,
      opacity: 1,
      shadowStrength: interpolate(Math.max(2.2, 4.4 - absOffset * 0.32), 7.2, centerWeight),
      zIndex: Math.max(1, 1000 - absOffset * 10),
      isCenter: centerWeight > 0.999,
    };
  };
  const getPhotoInsertMetrics = (relativeOffset) => {
    if (isCompact) {
      return getPhotoInsertStackMetrics(relativeOffset);
    }

    const absOffset = Math.abs(relativeOffset);
    const centerWeight = Math.max(0, 1 - absOffset);
    const centerScale = 1.54;
    const scale = absOffset <= 1
      ? interpolate(centerScale, 1, absOffset)
      : interpolate(1, 0.96, clamp01(absOffset - 1));

    return {
      x: relativeOffset * finalStep,
      y: 0,
      scale,
      rotate: 0,
      opacity: 1,
      shadowStrength: interpolate(Math.max(2.2, 4.4 - absOffset * 0.32), 7.2, centerWeight),
      zIndex: Math.max(1, 1040 - absOffset * 18),
      isCenter: centerWeight > 0.999,
    };
  };
  const getCarouselMetrics = (
    slot,
    metricsActiveIndex = activeIndex,
    metricsLayerCenter = nearestCenterSlot
  ) => {
    const offset = slot - metricsActiveIndex;
    const absOffset = Math.abs(offset);
    const layerDistance = Math.abs(slot - metricsLayerCenter);
    const sign = Math.sign(offset);
    const guardOffset = Math.min(Math.max(cardWidth * 1.7, 240), viewportWidth * 0.24);
    const stackStep = Math.max(34, cardWidth * 0.24);
    const maxStackX = Math.max(guardOffset + stackStep, viewportWidth / 2 - cardWidth * 0.38);
    const desktopStackT = Math.max(absOffset - 1, 0);
    const desktopStackFirstX = Math.min(guardOffset + cardWidth * 1.52, maxStackX);
    const desktopX = absOffset <= 1
      ? interpolate(0, guardOffset, absOffset)
      : (
          desktopStackT <= 1
            ? interpolate(guardOffset, desktopStackFirstX, desktopStackT)
            : Math.min(desktopStackFirstX + (desktopStackT - 1) * stackStep, maxStackX)
        );
    const centerWeight = Math.max(0, 1 - absOffset);
    const centerScale = isCompact ? 1.14 : 1.54;
    const desktopScale = absOffset <= 1
      ? interpolate(centerScale, 1, absOffset)
      : interpolate(1, 0.96, clamp01(absOffset - 1));
    const insertStackMetrics = isCompact
      ? getPhotoInsertStackMetrics(offset)
      : null;
    const scale = isCompact ? insertStackMetrics.scale : desktopScale;
    const x = isCompact ? insertStackMetrics.x : sign * desktopX;

    return {
      x,
      y: 0,
      scale,
      rotate: 0,
      opacity: 1,
      shadowStrength: isCompact
        ? insertStackMetrics.shadowStrength
        : interpolate(Math.max(2.2, 4.4 - absOffset * 0.32), 7.2, centerWeight),
      zIndex: (() => {
        if (!isCompact || !photoCarouselLayoutActive || metricsActiveIndex !== activeIndex) {
          return Math.max(1, 1000 - layerDistance * 10);
        }

        const targetDistance = Math.abs(slot - photoCarouselTargetIndex);
        const isTransitioning = Math.abs(photoCarouselTargetIndex - photoCarouselVisualIndex) > 0.001;

        if (slot === photoCarouselTargetIndex) {
          return 1100;
        }

        if (isTransitioning && slot === photoCarouselPreviousIndex) {
          return 1080;
        }

        const directionBias = (
          photoCarouselTransitionDirection !== 0 &&
          Math.sign(slot - photoCarouselTargetIndex) === photoCarouselTransitionDirection
        ) ? 2 : 0;

        return Math.max(1, 1000 - targetDistance * 24 + directionBias);
      })(),
      isCenter: centerWeight > 0.999,
    };
  };
  const expandedMix = shouldReduceMotion() ? photoAllExpandedTarget : easeInOut(photoAllExpandedProgress);
  const expandedScale = isCompact ? 0.88 : 1.1;
  const expandedCardWidth = cardWidth * expandedScale;
  const expandedCardHeight = cardHeight * expandedScale;
  const expandedGapX = isCompact ? cardWidth * 0.1 : cardWidth * 0.22;
  const expandedGapY = isCompact ? cardHeight * 0.12 : cardHeight * 0.16;
  const expandedAvailableWidth = Math.max(
    expandedCardWidth * 2,
    Math.min(viewportWidth - (isCompact ? 18 : 88), isCompact ? viewportWidth - 18 : 1120)
  );
  const minExpandedColumns = isCompact ? 2 : 5;
  const maxExpandedColumns = isCompact ? 3 : 7;
  const expandedColumns = Math.max(
    minExpandedColumns,
    Math.min(
      maxExpandedColumns,
      Math.floor((expandedAvailableWidth + expandedGapX) / (expandedCardWidth + expandedGapX)) || minExpandedColumns
    )
  );
  const expandedStepX = expandedCardWidth + expandedGapX;
  const expandedStepY = expandedCardHeight + expandedGapY;
  const expandedGridWidth = (expandedColumns - 1) * expandedStepX + expandedCardWidth;
  const expandedStartX = queueCenterX - expandedGridWidth / 2;
  const activeSlot = clampPhotoCarouselIndex(Math.round(activeIndex));
  const activeMetrics = getCarouselMetrics(activeSlot);
  const queueBottomY = insertionAnchorY + cardHeight;
  const activeCardBottomY = insertionAnchorY + activeMetrics.y + cardHeight * (1 + activeMetrics.scale) / 2;
  const expandedStartY = Math.max(
    queueBottomY + (isCompact ? 28 : 40),
    activeCardBottomY + (isCompact ? 34 : 48)
  );
  const expandedRows = Math.max(1, Math.ceil(finalCount / expandedColumns));
  const expandedGridBottomY = expandedStartY + (expandedRows - 1) * expandedStepY + expandedCardHeight;
  const expandedScrollPadding = isCompact ? 96 : 120;
  const expandedScrollNeeded = Math.max(0, expandedGridBottomY - viewportHeight + expandedScrollPadding);
  const expandedScrollMix = photoAllExpandedTarget > 0.5 ? 1 : photoAllExpandedProgress;
  photoExpandedScrollExtraPx = expandedScrollNeeded * expandedScrollMix;
  applyPhotoSectionScrollHeight(viewportHeight, isCompact);
  const getExpandedMetrics = (slot) => {
    const column = slot % expandedColumns;
    const row = Math.floor(slot / expandedColumns);
    const centerX = expandedStartX + column * expandedStepX + expandedCardWidth / 2;
    const centerY = expandedStartY + row * expandedStepY + expandedCardHeight / 2;

    return {
      centerX,
      centerY,
      scale: expandedScale,
      rotate: 0,
      opacity: 1,
      zIndex: Math.max(1, 900 - slot),
    };
  };
  const activeCardCenterX = queueCenterX + activeMetrics.x;
  const activeCardTopY = insertionAnchorY + activeMetrics.y + cardHeight * (1 - activeMetrics.scale) / 2;
  const expandedButtonX = queueCenterX;
  const expandedButtonY = expandedStartY - (isCompact ? 16 : 20);
  const showAllButtonX = interpolate(activeCardCenterX, expandedButtonX, expandedMix);
  const showAllButtonY = interpolate(activeCardTopY - (isCompact ? 18 : 24), expandedButtonY, expandedMix);
  const showAllVisible = photoCarouselEnabled || photoAllExpandedProgress > 0.001;
  applyPhotoShowAllFrame({
    visible: showAllVisible,
    expanded: photoAllExpandedTarget > 0.5,
    x: showAllButtonX,
    y: showAllButtonY,
  });

  const getExpandedDelay = (slot) => {
    const distanceDelay = Math.abs(slot - activeSlot) * (isCompact ? 26 : 32);
    const orderDelay = Math.abs((slot % expandedColumns) - (activeSlot % expandedColumns)) * 5;
    return Math.min(isCompact ? 210 : 260, distanceDelay + orderDelay);
  };
  const resolveExpandedLayout = (card, slot, carouselLayout, expandedLayout) => {
    if (!photoAllExpandedAnimating) {
      const mix = photoAllExpandedProgress;
      return {
        x: interpolate(carouselLayout.x, expandedLayout.x, mix),
        y: interpolate(carouselLayout.y, expandedLayout.y, mix),
        scale: interpolate(carouselLayout.scale, expandedLayout.scale, mix),
        rotate: interpolate(carouselLayout.rotate, expandedLayout.rotate, mix),
        opacity: interpolate(carouselLayout.opacity, expandedLayout.opacity, mix),
        zIndex: mix > 0.5 ? expandedLayout.zIndex : carouselLayout.zIndex,
      };
    }

    const fromLayout = photoAllExpandedLayouts.get(card) || carouselLayout;
    const toLayout = photoAllExpandedAnimationDirection > 0 ? expandedLayout : carouselLayout;
    const delay = getExpandedDelay(slot);
    const localDuration = Math.max(180, photoAllExpandedDuration - delay);
    const localProgress = clamp01((timestamp - photoAllExpandedAnimationStart - delay) / localDuration);
    const mix = easeOutCubic(localProgress);

    return {
      x: interpolate(fromLayout.x, toLayout.x, mix),
      y: interpolate(fromLayout.y, toLayout.y, mix),
      scale: interpolate(fromLayout.scale, toLayout.scale, mix),
      rotate: interpolate(fromLayout.rotate, toLayout.rotate, mix),
      opacity: interpolate(fromLayout.opacity, toLayout.opacity, mix),
      zIndex: mix > 0.5 ? toLayout.zIndex : fromLayout.zIndex,
    };
  };

  const queueBleed = Math.min(Math.max(viewportHeight * 0.14, 96), 160);

  applyPhotoQueueAnchorFrame({ cardHeight, queueBleed, queueProgress });

  const getPhotoDropPathFrame = ({ index, gapSlot = centerInsertSlot }) => {
    const dropStart = photoDropStartProgress;
    const appearStart = dropStart + index * 0.012;
    const appearEnd = dropStart + 0.09 + index * 0.012;
    const dropEnd = PHOTO_INTRO_PHASES.dropEnd;
    const dropProgress = shouldReduceMotion()
      ? 1
      : mapScrollSegment(progress, dropStart, dropEnd);
    const appearProgress = shouldReduceMotion()
      ? 1
      : mapScrollSegment(progress, appearStart, appearEnd);
    const insertedX = hasSingleFloatingCard ? queueCenterX : finalStartX + gapSlot * finalStep;
    const insertedY = insertionAnchorY;
    const insertedLayout = {
      x: insertedX - cardWidth / 2,
      y: insertedY,
      scale: 1,
      rotate: 0,
      opacity: 1,
    };
    const insertedCenterX = insertedLayout.x + cardWidth / 2;
    const insertedCenterY = insertedLayout.y;
    const compactStartOffset = Math.min(viewportWidth * 0.24, cardWidth * 1.35);
    const startOffset = hasSingleFloatingCard
      ? 0
      : (isCompact ? [-compactStartOffset, 0, compactStartOffset][index] : [-250, 0, 250][index]);
    const startX = insertedCenterX + startOffset;
    const startY = dropStartBaseY + index * (isCompact ? 12 : 16);
    const curveOffset = hasSingleFloatingCard
      ? (isCompact ? 7 : 16)
      : (isCompact ? [10, 6, -10][index] : [24, 14, -24][index]);
    const firstMidX = startX + (insertedCenterX - startX) * 0.3 + curveOffset;
    const secondMidX = startX + (insertedCenterX - startX) * 0.68 + curveOffset * 0.35;
    const firstMidY = startY + (insertedCenterY - startY) * 0.3;
    const secondMidY = startY + (insertedCenterY - startY) * 0.72;
    const droppedX = cubicBezierValue(startX, firstMidX, secondMidX, insertedCenterX, dropProgress);
    const droppedPathY = cubicBezierValue(startY, firstMidY, secondMidY, insertedCenterY, dropProgress);
    const droppedY = droppedPathY;
    const startRotate = isCompact
      ? (hasSingleFloatingCard ? 1.6 : [-2.8, 1.8, 2.8][index])
      : (hasSingleFloatingCard ? 2.2 : [-4, 2, 4][index]);
    const firstMidRotate = isCompact
      ? (hasSingleFloatingCard ? 0.8 : [-1.4, 0.9, 1.4][index])
      : (hasSingleFloatingCard ? 1.1 : [-2, 1, 2][index]);
    const secondMidRotate = isCompact
      ? (hasSingleFloatingCard ? 0.3 : [-0.7, 0, 0.7][index])
      : (hasSingleFloatingCard ? 0.5 : [-1, 0, 1][index]);
    const rotate = cubicBezierValue(startRotate, firstMidRotate, secondMidRotate, 0, dropProgress);
    const dropScale = interpolate(0.96, 1, easeInOut(dropProgress));

    return {
      dropProgress,
      appearProgress,
      insertedLayout,
      insertedCenterX,
      insertedCenterY,
      droppedX,
      droppedY,
      rotate,
      dropScale,
    };
  };

  const computePhotoDropLayout = ({ index, slot, gapSlot = slot }) => {
    const {
      dropProgress,
      appearProgress,
      insertedLayout,
      insertedCenterX,
      insertedCenterY,
      droppedX,
      droppedY,
      rotate,
      dropScale,
    } = getPhotoDropPathFrame({ index, gapSlot });
    const carouselMetrics = photoReinsertActive && hasSingleFloatingCard
      ? getPhotoPreviewMetrics(0)
      : getCarouselMetrics(slot);
    const previewX = queueCenterX + carouselMetrics.x;
    const previewY = insertionAnchorY + carouselMetrics.y;
    const previewScale = carouselMetrics.scale;
    const previewRotate = carouselMetrics.rotate;
    const previewOpacity = carouselMetrics.opacity;
    const heldX = interpolate(droppedX, insertedCenterX, insertHoldProgress);
    const heldY = interpolate(droppedY, insertedCenterY, insertHoldProgress);
    const heldScale = interpolate(dropScale, insertedLayout.scale, insertHoldProgress);
    const heldRotate = interpolate(rotate, insertedLayout.rotate, insertHoldProgress);
    const heldOpacity = interpolate(1, insertedLayout.opacity, insertHoldProgress);
    const settledX = interpolate(heldX, previewX, previewEase);
    const settledY = interpolate(heldY, previewY, previewEase);
    const scale = interpolate(heldScale, previewScale, previewScaleEase);
    const settledRotate = interpolate(heldRotate, previewRotate, previewEase);
    const opacity = appearProgress * interpolate(heldOpacity, previewOpacity, previewEase);
    const blur = (1 - appearProgress) * (isCompact ? 8 : 10);
    const expandedMetrics = getExpandedMetrics(slot);

    const dropZIndex = photoReinsertActive && hasSingleFloatingCard
      ? 1200
      : (previewProgress > 0.01 ? carouselMetrics.zIndex : 25);

    return {
      carouselMetrics,
      blur,
      cardDepth: 8 + dropProgress * 22,
      shineX: -18 + dropProgress * 36,
      carouselLayout: {
        x: settledX - cardWidth / 2,
        y: settledY,
        scale,
        rotate: settledRotate,
        opacity,
        zIndex: dropZIndex,
      },
      expandedLayout: {
        x: expandedMetrics.centerX - cardWidth / 2,
        y: expandedMetrics.centerY - cardHeight / 2,
        scale: expandedMetrics.scale,
        rotate: expandedMetrics.rotate,
        opacity: expandedMetrics.opacity,
        zIndex: expandedMetrics.zIndex,
      },
    };
  };

  const computePhotoQueueInsertLayout = ({ index, slot }) => {
    const isReinsert = photoReinsertActive && hasSingleFloatingCard;
    const insertSlot = baseInsertSlots[index] ?? slot;
    const reinsertVisualOffset = reinsertRelativeOffsetBySlot.get(slot) ?? (slot - contentSlot);
    const lineRelativeOffset = getCompressedLineOffset(insertSlot, layoutAnchorSlot);
    const initialLineMetrics = isCompact
      ? getPhotoInsertStackMetrics(lineRelativeOffset, true)
      : null;
    const insertRelativeOffset = insertSlot - layoutAnchorSlot;
    const relativeOffset = isReinsert ? reinsertVisualOffset : insertRelativeOffset;
    const isMobileReinsert = isCompact && isReinsert;
    const reinsertLineRelativeOffset = reinsertVisualOffset < 0
      ? reinsertVisualOffset + 0.5
      : (
          reinsertVisualOffset > 0
            ? reinsertVisualOffset - 0.5
            : 0
        );
    const reinsertLineMetrics = isMobileReinsert
      ? getPhotoInsertStackMetrics(reinsertLineRelativeOffset, true)
      : null;
    const lineMetrics = isReinsert
      ? null
      : {
          x: initialLineMetrics ? initialLineMetrics.x : initialStartX + index * initialStep - queueCenterX,
          y: 0,
          scale: initialLineMetrics ? initialLineMetrics.scale : 1,
          rotate: initialLineMetrics ? initialLineMetrics.rotate : 0,
          opacity: initialLineMetrics ? initialLineMetrics.opacity : 1,
          shadowStrength: initialLineMetrics ? initialLineMetrics.shadowStrength : 3,
          zIndex: initialLineMetrics ? initialLineMetrics.zIndex : 1,
        };
    const insertMetrics = getPhotoInsertMetrics(relativeOffset);
    const previewMetrics = getPhotoPreviewMetrics(relativeOffset);
    const carouselMetrics = isReinsert
      ? previewMetrics
      : getCarouselMetrics(slot);
    const expandedMetrics = getExpandedMetrics(slot);
    const expandedX = expandedMetrics.centerX - queueCenterX;
    const expandedY = expandedMetrics.centerY - cardHeight / 2 - insertionAnchorY;
    const expandedLayout = {
      x: expandedX - cardWidth / 2,
      y: queueLocalOffsetY + expandedY,
      scale: expandedMetrics.scale,
      rotate: expandedMetrics.rotate,
      opacity: expandedMetrics.opacity,
      zIndex: expandedMetrics.zIndex,
    };

    const insertProgress = queueProgress;
    const effectiveLineMetrics = isMobileReinsert ? reinsertLineMetrics : lineMetrics;
    const shouldInterpolateFromLine = !isReinsert || isMobileReinsert;
    const queuedX = shouldInterpolateFromLine
      ? interpolate(effectiveLineMetrics.x, insertMetrics.x, insertProgress)
      : insertMetrics.x;
    const queuedY = shouldInterpolateFromLine
      ? interpolate(effectiveLineMetrics.y, insertMetrics.y, insertProgress)
      : insertMetrics.y;
    const queuedScale = shouldInterpolateFromLine
      ? interpolate(effectiveLineMetrics.scale, insertMetrics.scale, insertProgress)
      : insertMetrics.scale;
    const queuedRotate = shouldInterpolateFromLine
      ? interpolate(effectiveLineMetrics.rotate, insertMetrics.rotate, insertProgress)
      : insertMetrics.rotate;
    const queuedOpacity = shouldInterpolateFromLine
      ? interpolate(effectiveLineMetrics.opacity, insertMetrics.opacity, insertProgress)
      : insertMetrics.opacity;
    const previewMix = previewEase;
    const previewScaleMix = previewScaleEase;
    const shouldUseCarouselMetrics = (
      photoCarouselEnabled &&
      !photoReinsertActive &&
      previewProgress >= carouselReadyThreshold
    );
    const finalMetrics = shouldUseCarouselMetrics ? carouselMetrics : previewMetrics;
    const x = interpolate(queuedX, finalMetrics.x, previewMix);
    const y = interpolate(queuedY, finalMetrics.y, previewMix);
    const scale = interpolate(queuedScale, finalMetrics.scale, previewScaleMix);
    const rotate = interpolate(queuedRotate, finalMetrics.rotate, previewMix);
    const opacity = interpolate(queuedOpacity, finalMetrics.opacity, previewMix);
    const layerSwitchProgress = isCompact ? 0.42 : 0.04;
    const baseZIndex = shouldInterpolateFromLine && insertProgress <= layerSwitchProgress
      ? effectiveLineMetrics.zIndex
      : insertMetrics.zIndex;
    const queueZIndex = previewMix > 0.5 ? finalMetrics.zIndex : baseZIndex;
    const carouselLayout = {
      x: x - cardWidth / 2,
      y: queueLocalOffsetY + y,
      scale,
      rotate,
      opacity: queueVisibility * opacity,
      zIndex: queueZIndex,
    };
    return {
      carouselMetrics: previewMix > 0.5 ? finalMetrics : insertMetrics,
      carouselLayout,
      expandedLayout,
    };
  };

  const nextPhotoCardSlotMap = new Map();
  const selectedContent = photoSlotContentMap.get(contentSlot);
  const selectedContentCard = photoCardSlotMap.get(contentSlot) || photoSelectedSourceCard;
  const photoHitCollector = createPhotoHitRectCollector(stageRect, cardWidth, cardHeight);
  const queueCardBaseX = stageRect.width / 2;
  const cardFrames = [];
  const photoExpandedFocus = photoAllExpandedTarget > 0.5 || photoAllExpandedProgress > 0.5;
  const keyboardFocusSlot = photoCarouselEnabled && !photoExpandedFocus
    ? clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex))
    : -1;

  photoQueueCards.forEach((card, index) => {
    const slot = baseFinalSlots[index];
    const slotContent = photoSlotContentMap.get(slot);
    if (slotContent) {
      syncPhotoCardImageContent(card, slotContent);
    }
    const queueLayout = computePhotoQueueInsertLayout({ index, slot });
    const layout = resolveExpandedLayout(
      card,
      slot,
      queueLayout.carouselLayout,
      queueLayout.expandedLayout
    );

    nextPhotoCardSlotMap.set(slot, card);
    cardFrames.push({
      card,
      layout,
      data: [["photoSlot", String(slot)]],
      attributes: [
        ["role", "button"],
        ["tabindex", photoExpandedFocus || slot === keyboardFocusSlot ? "0" : "-1"],
      ],
      options: {
        filter: "",
        shadowStrength: queueLayout.carouselMetrics.shadowStrength,
        mobilePerformance: isCompact,
      },
    });
    photoHitCollector.include(
      layout,
      queueCardBaseX
    );
  });

  photoFloatingCards.forEach((card, index) => {
    const slot = insertFinalSlots[index];
    const gapSlot = insertGapSlots[index] ?? slot;
    const dropLayout = computePhotoDropLayout({ index, slot, gapSlot });
    const layout = resolveExpandedLayout(card, slot, dropLayout.carouselLayout, dropLayout.expandedLayout);

    if (hasSingleFloatingCard && selectedContent) {
      syncPhotoCardImageContent(card, selectedContent);
    }

    nextPhotoCardSlotMap.set(slot, card);
    const cardData = [
      ["photoSlot", String(slot)],
      ["photoGapSlot", String(gapSlot)],
    ];
    const cardAttributes = [
      ["role", "button"],
      ["tabindex", photoExpandedFocus || slot === keyboardFocusSlot ? "0" : "-1"],
    ];
    if (hasSingleFloatingCard) {
      cardData.push(["photoContentSlot", String(contentSlot)]);
      const sourceId = selectedContent?.sourceId ||
        selectedContentCard?.dataset.photoCloneSource ||
        selectedContentCard?.dataset.photoBase ||
        selectedContentCard?.dataset.photoInsert;
      if (sourceId) {
        cardData.push(["photoCloneSource", sourceId]);
      }
      const sourceLabel = selectedContent?.label || selectedContentCard?.getAttribute("aria-label");
      if (sourceLabel) {
        cardAttributes.push(["aria-label", sourceLabel]);
      }
    }
    cardFrames.push({
      card,
      layout,
      data: cardData,
      attributes: cardAttributes,
      options: {
        filter: `blur(${dropLayout.blur.toFixed(2)}px)`,
        shadowStrength: dropLayout.carouselMetrics.shadowStrength,
        cardDepth: dropLayout.cardDepth,
        shineX: dropLayout.shineX,
        mobilePerformance: isCompact,
      },
    });
    photoHitCollector.include(layout, 0);
  });

  applyPhotoCardFrames({
    cardFrames,
    hitRect: photoHitCollector.getRect(),
    slotEntries: [...nextPhotoCardSlotMap.entries()],
    selectedSourceCard: selectedContentCard || nextPhotoCardSlotMap.get(contentSlot) || photoSelectedSourceCard,
  });

  return !reduceMotion && photoSectionIsNearViewport && (
    Math.abs(photoTargetProgress - photoVisualProgress) > 0.00005 ||
    Math.abs(photoProgressVelocity) > 0.00005 ||
    ((photoCarouselEnabled || photoCarouselSettling) && Math.abs(photoCarouselTargetIndex - photoCarouselVisualIndex) > 0.001) ||
    Math.abs(photoAllExpandedTarget - photoAllExpandedProgress) > 0.001
  );
}

function requestPhotoSceneUpdate() {
  if (document.hidden) {
    return;
  }

  if (photoFrame) {
    return;
  }

  photoFrame = window.requestAnimationFrame((timestamp) => {
    const shouldContinue = updatePhotoScene(timestamp);
    photoFrame = 0;
    if (shouldContinue) {
      requestPhotoSceneUpdate();
    }
  });
}

function clampPhotoCarouselIndex(index) {
  return Math.min(Math.max(index, photoCarouselMinIndex), photoCarouselMaxIndex);
}

function setPhotoSelectedSlot(slot) {
  const nextSlot = clampPhotoCarouselIndex(Math.round(slot));
  photoSelectedSlot = nextSlot;
  photoSelectedSourceCard = photoCardSlotMap.get(nextSlot) || photoSelectedSourceCard;
  preloadNearbyPhotoZoomImages(nextSlot, isMobileViewport() ? 1 : 2);
}

function beginPhotoCarouselSettle(preferTarget = false) {
  if (photoCarouselCards.length === 0) {
    return;
  }

  const sourceIndex = preferTarget ? photoCarouselTargetIndex : photoCarouselVisualIndex;
  const nearestIndex = clampPhotoCarouselIndex(Math.round(sourceIndex));
  photoCarouselPreviousIndex = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
  photoCarouselTransitionDirection = Math.sign(nearestIndex - photoCarouselVisualIndex);
  photoCarouselTargetIndex = nearestIndex;
  setPhotoSelectedSlot(nearestIndex);
  photoCarouselSettling = true;
  photoCarouselHasInteracted = true;
  requestPhotoSceneUpdate();
}

function getPhotoCardLayoutSnapshot(card) {
  const style = window.getComputedStyle(card);
  const transform = style.transform;
  let x = 0;
  let y = 0;
  let scale = 1;
  let rotate = 0;

  if (transform && transform !== "none") {
    try {
      const matrix = new DOMMatrixReadOnly(transform);
      x = matrix.m41;
      y = matrix.m42;
      scale = Math.hypot(matrix.a, matrix.b) || 1;
      rotate = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
    } catch (error) {
      x = 0;
      y = 0;
      scale = 1;
      rotate = 0;
    }
  }

  return {
    x,
    y,
    scale,
    rotate,
    opacity: Number.parseFloat(style.opacity) || 1,
    zIndex: Number.parseInt(style.zIndex, 10) || 1,
  };
}

function capturePhotoAllExpandedLayouts() {
  photoAllExpandedLayouts.clear();
  photoCarouselCards.forEach((card) => {
    photoAllExpandedLayouts.set(card, getPhotoCardLayoutSnapshot(card));
  });
}

function togglePhotoAllExpanded() {
  if (!photoCarouselEnabled && !photoCarouselSettling && photoAllExpandedProgress < 0.001) {
    return;
  }

  capturePhotoAllExpandedLayouts();
  photoAllExpanded = !photoAllExpanded;
  photoAllExpandedTarget = photoAllExpanded ? 1 : 0;
  photoAllExpandedProgress = photoAllExpanded ? 0 : 1;
  photoAllExpandedAnimating = true;
  photoAllExpandedAnimationStart = window.performance.now();
  photoAllExpandedAnimationDirection = photoAllExpanded ? 1 : -1;
  photoAllExpandedDuration = photoAllExpanded ? 920 : 780;
  syncPhotoShowAllButtonCopy();
  photoCarouselWheelDelta = 0;
  photoCarouselWheelDirection = 0;
  photoCarouselBoundaryDelta = 0;
  photoCarouselBoundaryDirection = 0;
  resetPhotoCarouselTouchState();
  requestPhotoSceneUpdate();
}

function canStepPhotoCarousel(direction) {
  if (!photoCarouselEnabled || !direction) {
    return false;
  }

  const target = clampPhotoCarouselIndex(photoCarouselTargetIndex);
  return direction > 0 ? target < photoCarouselMaxIndex : target > photoCarouselMinIndex;
}

function stepPhotoCarousel(direction) {
  if (!canStepPhotoCarousel(direction)) {
    return false;
  }

  photoCarouselBoundaryDelta = 0;
  photoCarouselBoundaryDirection = 0;
  photoCarouselPreviousIndex = photoCarouselTargetIndex;
  photoCarouselTargetIndex = clampPhotoCarouselIndex(photoCarouselTargetIndex + direction);
  setPhotoSelectedSlot(photoCarouselTargetIndex);
  photoCarouselTransitionDirection = direction;
  photoCarouselHasInteracted = true;
  photoCarouselSettling = false;
  requestPhotoSceneUpdate();
  return true;
}

function resetPhotoCarouselTouchState() {
  photoCarouselTouchActive = false;
  photoCarouselTouchStartedInside = false;
  photoCarouselTouchLocked = false;
  photoCarouselTouchReleasedToPage = false;
  if (photoCarouselTouchUnlockTimer) {
    window.clearTimeout(photoCarouselTouchUnlockTimer);
    photoCarouselTouchUnlockTimer = 0;
  }
}

function getPhotoCarouselHitRect() {
  if (!photoCarouselEnabled || photoCarouselCards.length === 0) {
    return null;
  }

  if (photoCarouselHitRectCache) {
    return photoCarouselHitRectCache;
  }

  return photoQueueAnchor?.getBoundingClientRect() || null;
}

function isPointInPhotoCarousel(x, y) {
  const rect = getPhotoCarouselHitRect();

  if (!rect) {
    return false;
  }

  const isCompact = window.innerWidth <= 680;
  const hitSlopX = isCompact ? 28 : 48;
  const hitSlopY = isCompact ? 58 : 96;

  return (
    x >= rect.left - hitSlopX &&
    x <= rect.right + hitSlopX &&
    y >= rect.top - hitSlopY &&
    y <= rect.bottom + hitSlopY
  );
}

function handlePhotoCarouselWheel(event) {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01) {
    return;
  }

  if (!isPointInPhotoCarousel(event.clientX, event.clientY)) {
    photoCarouselWheelDelta = 0;
    photoCarouselWheelDirection = 0;
    photoCarouselBoundaryDelta = 0;
    photoCarouselBoundaryDirection = 0;
    return;
  }

  const absWheelX = Math.abs(event.deltaX);
  const absWheelY = Math.abs(event.deltaY);
  const horizontalIntent = absWheelX > absWheelY * 1.15;

  if (!horizontalIntent) {
    photoCarouselWheelDelta = 0;
    photoCarouselWheelDirection = 0;
    photoCarouselBoundaryDelta = 0;
    photoCarouselBoundaryDirection = 0;
    return;
  }

  const delta = event.deltaX;

  if (Math.abs(delta) < 3) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const direction = delta > 0 ? 1 : -1;
  const now = window.performance.now();

  const canStep = canStepPhotoCarousel(direction);

  if (!canStep) {
    if (photoCarouselBoundaryDirection !== direction) {
      photoCarouselBoundaryDelta = 0;
      photoCarouselBoundaryDirection = direction;
    }

    photoCarouselBoundaryDelta += Math.abs(delta);
    photoCarouselWheelDelta = 0;
    photoCarouselWheelDirection = 0;

    if (photoCarouselBoundaryDelta >= 240) {
      photoCarouselBoundaryDelta = 0;
      photoCarouselBoundaryDirection = 0;
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  photoCarouselBoundaryDelta = 0;
  photoCarouselBoundaryDirection = 0;

  if (now - photoCarouselLastStepTime < 680) {
    return;
  }

  if (photoCarouselWheelDirection !== direction) {
    photoCarouselWheelDelta = 0;
    photoCarouselWheelDirection = direction;
  }

  photoCarouselWheelDelta += Math.abs(delta);

  if (photoCarouselWheelDelta < 52) {
    return;
  }

  stepPhotoCarousel(direction);
  photoCarouselWheelDelta = 0;
  photoCarouselLastStepTime = now;
}

function handlePhotoCarouselTouchStart(event) {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01 || event.touches.length !== 1) {
    resetPhotoCarouselTouchState();
    return;
  }

  const touch = event.touches[0];

  if (!isPointInPhotoCarousel(touch.clientX, touch.clientY)) {
    resetPhotoCarouselTouchState();
    return;
  }

  photoCarouselTouchStartX = touch.clientX;
  photoCarouselTouchStartY = touch.clientY;
  photoCarouselTouchActive = true;
  photoCarouselTouchStartedInside = true;
  photoCarouselTouchLocked = false;
  photoCarouselTouchReleasedToPage = false;
}

function handlePhotoCarouselTouchMove(event) {
  if (
    !photoCarouselEnabled ||
    photoAllExpandedTarget > 0 ||
    photoAllExpandedProgress > 0.01 ||
    !photoCarouselTouchActive ||
    !photoCarouselTouchStartedInside ||
    photoCarouselTouchReleasedToPage ||
    event.touches.length !== 1
  ) {
    return;
  }

  const touch = event.touches[0];
  const deltaX = touch.clientX - photoCarouselTouchStartX;
  const deltaY = touch.clientY - photoCarouselTouchStartY;

  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const carouselIsSwitching = (
    photoCarouselSettling ||
    Math.abs(photoCarouselTargetIndex - photoCarouselVisualIndex) > 0.001
  );

  const verticalPageIntent = absY > 28 && absY > absX * 1.35;

  if (!photoCarouselTouchLocked && verticalPageIntent) {
    photoCarouselTouchReleasedToPage = true;
    if (carouselIsSwitching) {
      beginPhotoCarouselSettle(true);
    }
    return;
  }

  if (!photoCarouselTouchLocked && absX < 10 && absY < 10) {
    return;
  }

  if (!photoCarouselTouchLocked && absX < absY * 1.08) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (photoCarouselTouchLocked) {
    return;
  }

  if (absX < 24 && absY < 24) {
    return;
  }

  const direction = absX >= absY
    ? (deltaX < 0 ? 1 : -1)
    : (deltaY > 0 ? -1 : 1);

  if (!canStepPhotoCarousel(direction)) {
    photoCarouselTouchLocked = true;
    photoCarouselTouchUnlockTimer = window.setTimeout(() => {
      photoCarouselTouchLocked = false;
      photoCarouselTouchUnlockTimer = 0;
    }, 460);
    return;
  }

  photoCarouselTouchLocked = true;
  stepPhotoCarousel(direction);
  photoCarouselTouchUnlockTimer = window.setTimeout(() => {
    photoCarouselTouchLocked = false;
    photoCarouselTouchUnlockTimer = 0;
  }, 460);
}

function handlePhotoCarouselTouchEnd(event) {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01 || !photoCarouselTouchActive || !photoCarouselTouchStartedInside) {
    resetPhotoCarouselTouchState();
    return;
  }

  const touch = event.changedTouches?.[0];

  if (!touch) {
    resetPhotoCarouselTouchState();
    return;
  }

  const deltaX = touch.clientX - photoCarouselTouchStartX;
  const deltaY = touch.clientY - photoCarouselTouchStartY;

  if (!photoCarouselTouchLocked && Math.abs(deltaX) >= 42 && Math.abs(deltaX) >= Math.abs(deltaY) * 1.18) {
    const direction = deltaX < 0 ? 1 : -1;
    stepPhotoCarousel(direction);
  }

  if (
    photoCarouselHasInteracted ||
    photoCarouselTouchLocked ||
    Math.abs(photoCarouselTargetIndex - photoCarouselVisualIndex) > 0.001
  ) {
    beginPhotoCarouselSettle(true);
  }

  resetPhotoCarouselTouchState();
}

let pointerMoveFrame = 0;
let lastPointerMoveEvent = null;

function handlePointerMove(event) {
  lastPointerMoveEvent = event;
  if (pointerMoveFrame) {
    return;
  }

  pointerMoveFrame = window.requestAnimationFrame(() => {
    pointerMoveFrame = 0;
    applyPointerMove(lastPointerMoveEvent);
  });
}

function applyPointerMove(event) {
  if (!tiltCard || !isDesktopViewport() || event.pointerType !== "mouse") {
    updateLanguageUniverseParallax(event);
    return;
  }

  const bounds = tiltCard.getBoundingClientRect();
  const tiltHitSlop = 24;
  const isInsideTiltArea = (
    event.clientX >= bounds.left - tiltHitSlop &&
    event.clientX <= bounds.right + tiltHitSlop &&
    event.clientY >= bounds.top - tiltHitSlop &&
    event.clientY <= bounds.bottom + tiltHitSlop
  );

  if (!isInsideTiltArea) {
    resetTilt();
    updateLanguageUniverseParallax(event);
    return;
  }

  const rotateY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 14;
  const rotateX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -14;

  tiltCard.style.transform = `perspective(1100px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  updateLanguageUniverseParallax(event);
}

function resetTilt() {
  if (tiltCard) {
    tiltCard.style.transform = "perspective(1100px) rotateX(0deg) rotateY(0deg)";
  }
}

function createSeededRandom(seed = 42) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

async function createBrainWireframeScene(mount) {
  if (!mount) {
    return null;
  }

  try {
    /* Vendored rather than pulled from unpkg. r185 ships as two files -- this
       one and the ./three.core.min.js it imports -- so the CDN version cost
       two cross-origin requests on a host that is unreliable from China, and
       a failure meant the brain silently never appeared. Same-origin now, and
       covered by the one-year immutable cache netlify.toml gives *.js.
       Still lazy: this runs when the language section scrolls into view. */
    const THREE = await import("./vendor/three.module.min.js?v=0.185.1");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1000);
    camera.position.set(0, 0.15, window.innerWidth < 720 ? 15.8 : 16.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const random = createSeededRandom(20260427);
    const pts = [];
    const edgeSet = new Set();
    const isCompact = window.innerWidth < 720;

    function addEdge(set, a, b) {
      if (a === b) return;
      set.add(`${Math.min(a, b)}_${Math.max(a, b)}`);
    }

    function p(x, y, z, part, ring = -1, seg = -1) {
      return { p: new THREE.Vector3(x, y, z), part, ring, seg };
    }

    function connectRows(rows, extraMin = 24, extraEvery = 8) {
      for (let r = 0; r < rows.length; r += 1) {
        const row = rows[r];
        const n = row.length;

        if (n > 1) {
          for (let j = 0; j < n; j += 1) {
            addEdge(edgeSet, row[j], row[(j + 1) % n]);
            if (n >= extraMin && j % extraEvery === 0) {
              addEdge(edgeSet, row[j], row[(j + 2) % n]);
            }
          }
        }

        if (r >= rows.length - 1) continue;

        const next = rows[r + 1];
        const m = next.length;

        if (n === 1) {
          for (let j = 0; j < m; j += 1) addEdge(edgeSet, row[0], next[j]);
        } else if (m === 1) {
          for (let j = 0; j < n; j += 1) addEdge(edgeSet, row[j], next[0]);
        } else {
          for (let j = 0; j < n; j += 1) {
            const k = Math.round((j * m) / n) % m;
            addEdge(edgeSet, row[j], next[k]);
            addEdge(edgeSet, row[j], next[(k + (j % 2 === 0 ? 1 : -1) + m) % m]);
          }
        }
      }
    }

    const latCount = 30;
    const lonBase = 44;
    const brainRows = [];

    pts.push(p(0, 4.62, 0, "brain", 0, 0));
    brainRows.push([0]);

    for (let i = 1; i < latCount; i += 1) {
      const row = [];
      const phi = (Math.PI * i) / latCount;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      let localLon = lonBase;

      if (i === 1 || i === latCount - 1) localLon = 18;
      else if (i === 2 || i === latCount - 2) localLon = 28;
      else if (i === 3 || i === latCount - 3) localLon = 36;

      for (let j = 0; j < localLon; j += 1) {
        const theta = (Math.PI * 2 * j) / localLon + (i % 2) * 0.055;
        let x = s * Math.cos(theta) * BRAIN_SHELL.rx;
        let y = c * BRAIN_SHELL.ry + BRAIN_SHELL.cy;
        let z = s * Math.sin(theta) * BRAIN_SHELL.rz;
        const upper = Math.max(0, y - 0.15);

        x *= 1 + upper * 0.007;
        z *= 1 + upper * 0.01;
        if (y < -2.2 && x < -2.25) y += 0.48;
        if (y < -2.6 && x > 1.95) y += 0.22;
        if (x > 4.0) y -= 0.1;

        const nearPole = i <= 3 || i >= latCount - 3;
        const jitter = nearPole ? 0.014 : 0.065;
        x += Math.sin(y * 1.25 + z * 0.3) * 0.1 + (random() - 0.5) * jitter;
        y += Math.sin(x * 0.55) * 0.075 + (random() - 0.5) * jitter * 0.7;
        z += Math.sin(x * 0.78 + y * 0.22) * 0.12 + (random() - 0.5) * jitter;

        const idx = pts.length;
        pts.push(p(x, y, z, "brain", i, j));
        row.push(idx);
      }

      brainRows.push(row);
    }

    const bottomPole = pts.length;
    pts.push(p(0, -3.9, 0, "brain", latCount, 0));
    brainRows.push([bottomPole]);
    connectRows(brainRows, 36, 4);

    const innerStart = pts.length;
    for (let i = 0; i < 260; i += 1) {
      let x = 0;
      let y = 0;
      let z = 0;
      let ok = false;
      for (let k = 0; k < 20 && !ok; k += 1) {
        x = (random() - 0.5) * 11.4;
        y = (random() - 0.5) * 7.2 + 0.35;
        z = (random() - 0.5) * 6.1;
        ok = (x / 5.45) ** 2 + ((y - 0.32) / 4.05) ** 2 + (z / 3.72) ** 2 < 0.78 && y > -2.85;
      }
      if (ok) pts.push(p(x, y, z, "inner"));
    }

    const cereStart = pts.length;
    const cLat = 12;
    const cLonBase = 24;
    const cereRows = [];
    const cereCenterX = 3.45;
    const cereCenterY = -2.75;
    const cereCenterZ = 0.35;

    for (let i = 0; i <= cLat; i += 1) {
      const row = [];
      const phi = (Math.PI * i) / cLat;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      let localLon = cLonBase;

      if (i === 0 || i === cLat) localLon = 8;
      else if (i === 1 || i === cLat - 1) localLon = 12;
      else if (i === 2 || i === cLat - 2) localLon = 18;

      for (let j = 0; j < localLon; j += 1) {
        const theta = (Math.PI * 2 * j) / localLon + (i % 2) * 0.06;
        let x = cereCenterX + s * Math.cos(theta) * 1.92;
        let y = cereCenterY + c * 1.1;
        let z = cereCenterZ + s * Math.sin(theta) * 1.45;

        if (i === 0 || i === cLat) {
          const radius = i === 0 ? 0.22 : 0.2;
          x = cereCenterX + Math.cos(theta) * radius;
          y = cereCenterY + (i === 0 ? 1.1 : -1.1) + Math.sin(theta * 2) * 0.01;
          z = cereCenterZ + Math.sin(theta) * radius * 0.78;
        }

        const nearPole = i <= 2 || i >= cLat - 2;
        const jitter = nearPole ? 0.016 : 0.06;
        x += (random() - 0.5) * jitter;
        y += (random() - 0.5) * jitter * 0.8;
        z += (random() - 0.5) * jitter;

        const idx = pts.length;
        pts.push(p(x, y, z, "cerebellum", i, j));
        row.push(idx);
      }

      cereRows.push(row);
    }

    connectRows(cereRows, 18, 4);
    const cereEnd = pts.length;

    const stemRows = [];
    const stemRingCount = 9;
    const stemSegCount = 10;

    for (let i = 0; i < stemRingCount; i += 1) {
      const row = [];
      const t = i / (stemRingCount - 1);
      const cx = 1.28 + t * 0.92;
      const cy = -2.75 - t * 2.4;
      const cz = 0.18 - t * 0.1;
      const rx = 0.68 * (1 - t * 0.38);
      const rz = 0.78 * (1 - t * 0.42);

      for (let j = 0; j < stemSegCount; j += 1) {
        const angle = (Math.PI * 2 * j) / stemSegCount + i * 0.18;
        const idx = pts.length;
        pts.push(
          p(
            cx + Math.cos(angle) * rx + (random() - 0.5) * 0.045,
            cy + (random() - 0.5) * 0.05,
            cz + Math.sin(angle) * rz + (random() - 0.5) * 0.045,
            "stem",
            i,
            j
          )
        );
        row.push(idx);
      }

      stemRows.push(row);
    }

    connectRows(stemRows, 999, 8);

    function closeStemRingSmooth(row, dy, scale) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      row.forEach((idx) => {
        cx += pts[idx].p.x;
        cy += pts[idx].p.y;
        cz += pts[idx].p.z;
      });
      cx /= row.length;
      cy = cy / row.length + dy;
      cz /= row.length;

      const cap = [];
      row.forEach((idx, j) => {
        const base = pts[idx].p;
        const capIdx = pts.length;
        pts.push(p(cx + (base.x - cx) * scale, cy + (random() - 0.5) * 0.018, cz + (base.z - cz) * scale, "stem", -1, j));
        cap.push(capIdx);
      });

      for (let j = 0; j < row.length; j += 1) {
        addEdge(edgeSet, cap[j], cap[(j + 1) % cap.length]);
        addEdge(edgeSet, row[j], cap[j]);
        if (j % 2 === 0) addEdge(edgeSet, row[j], cap[(j + 1) % cap.length]);
      }
    }

    closeStemRingSmooth(stemRows[0], 0.04, 0.42);
    closeStemRingSmooth(stemRows[stemRows.length - 1], -0.08, 0.36);

    function nearestEdges(fromStart, fromEnd, toStart, toEnd, maxDistance, maxCount) {
      for (let i = fromStart; i < fromEnd; i += 1) {
        const neighbors = [];
        for (let j = toStart; j < toEnd; j += 1) {
          const distance = pts[i].p.distanceTo(pts[j].p);
          if (distance < maxDistance) neighbors.push({ j, distance });
        }
        neighbors
          .sort((a, b) => a.distance - b.distance)
          .slice(0, maxCount)
          .forEach((neighbor) => addEdge(edgeSet, i, neighbor.j));
      }
    }

    nearestEdges(cereStart, cereEnd, 0, innerStart, 1.02, 2);
    nearestEdges(stemRows[0][0], pts.length, 0, innerStart, 0.98, 1);

    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const neighbors = [];
      let maxDistance = 1.08;
      let maxCount = 3;

      if (a.part === "brain") {
        maxDistance = 1.18;
        maxCount = 4;
      } else if (a.part === "inner") {
        maxDistance = 1.15;
        maxCount = 2;
      } else if (a.part === "cerebellum") {
        maxDistance = 1.12;
        maxCount = 4;
      } else if (a.part === "stem") {
        maxDistance = 1.08;
        maxCount = 3;
      }

      for (let j = 0; j < pts.length; j += 1) {
        if (i === j) continue;
        const b = pts[j];
        if (a.part === "inner" && b.part === "inner") continue;
        if (a.part === "inner" && b.part !== "brain") continue;

        const distance = a.p.distanceTo(b.p);
        if (distance < maxDistance) neighbors.push({ j, distance });
      }

      neighbors
        .sort((aNode, bNode) => aNode.distance - bNode.distance)
        .slice(0, maxCount)
        .forEach((neighbor) => addEdge(edgeSet, i, neighbor.j));
    }

    const pointPositions = [];
    pts.forEach((point) => {
      pointPositions.push(point.p.x, point.p.y, point.p.z);
    });

    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(pointPositions, 3)
    );
    const nodeMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.045,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const glowMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.14,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    group.add(new THREE.Points(pointGeometry, nodeMaterial));
    group.add(new THREE.Points(pointGeometry, glowMaterial));

    const linePositions = [];
    edgeSet.forEach((key) => {
      const [a, b] = key.split("_").map(Number);
      linePositions.push(pts[a].p.x, pts[a].p.y, pts[a].p.z, pts[b].p.x, pts[b].p.y, pts[b].p.z);
    });

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePositions, 3)
    );

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    group.add(new THREE.LineSegments(lineGeometry, lineMaterial));
    group.rotation.set(0.08, -0.22, 0);
    group.scale.setScalar(isCompact ? 0.68 : 0.78);
    group.position.y = -0.18;

    const dustPositions = [];
    for (let i = 0; i < 30; i += 1) {
      dustPositions.push((random() - 0.5) * 22, (random() - 0.5) * 10, (random() - 0.5) * 8 - 1.5);
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(dustPositions, 3)
    );
    const dustMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.025,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Points(dustGeometry, dustMaterial));

    function setBrainTheme(theme) {
      const isDark = theme === "dark";
      const color = isDark ? 0xffffff : 0x050505;
      const blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;

      nodeMaterial.color.setHex(color);
      glowMaterial.color.setHex(color);
      lineMaterial.color.setHex(color);
      dustMaterial.color.setHex(color);

      nodeMaterial.blending = blending;
      glowMaterial.blending = blending;
      lineMaterial.blending = blending;
      dustMaterial.blending = blending;

      nodeMaterial.opacity = isDark ? 0.78 : 0.86;
      glowMaterial.opacity = isDark ? 0.05 : 0.025;
      lineMaterial.opacity = isDark ? 0.55 : 0.64;
      dustMaterial.opacity = isDark ? 0.14 : 0.08;

      nodeMaterial.needsUpdate = true;
      glowMaterial.needsUpdate = true;
      lineMaterial.needsUpdate = true;
      dustMaterial.needsUpdate = true;
      render();
    }

    setBrainTheme(activeTheme);

    let time = 0;
    let frameId = 0;
    let isRunning = false;
    let lastBrainRenderWidth = 0;
    let lastBrainRenderHeight = 0;

    function resize() {
      const lockDesktopRenderSize = isDesktopInputDevice();
      const width = lockDesktopRenderSize
        ? DESKTOP_BRAIN_RENDER_WIDTH
        : Math.max(mount.clientWidth, 1);
      const height = lockDesktopRenderSize
        ? DESKTOP_BRAIN_RENDER_HEIGHT
        : Math.max(mount.clientHeight, 1);
      const widthChanged = Math.abs(width - lastBrainRenderWidth) > 1;
      const heightChanged = Math.abs(height - lastBrainRenderHeight) > 1;

      if (lastBrainRenderWidth && !widthChanged && (!heightChanged || isMobileViewport())) {
        return;
      }

      lastBrainRenderWidth = width;
      lastBrainRenderHeight = height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function render() {
      renderer.render(scene, camera);
    }

    function animate() {
      if (!isRunning) {
        return;
      }

      frameId = window.requestAnimationFrame(animate);
      time += 0.01;

      if (!shouldReduceMotion()) {
        const isDark = activeTheme === "dark";
        group.rotation.y += 0.00115;
        group.position.y = -0.18 + Math.sin(time) * 0.1;
        group.position.x = Math.sin(time * 0.62) * 0.05;
        nodeMaterial.size = 0.045 + Math.sin(time * 2.0) * 0.004;
        glowMaterial.opacity = (isDark ? 0.045 : 0.018) + Math.sin(time * 1.65) * (isDark ? 0.018 : 0.008);
        lineMaterial.opacity = isDark ? 0.55 : 0.64;
      }

      render();
    }

    function start() {
      if (isRunning) {
        return;
      }

      isRunning = true;
      animate();
    }

    function stop() {
      isRunning = false;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }
    }

    function dispose() {
      stop();
      pointGeometry.dispose();
      lineGeometry.dispose();
      dustGeometry.dispose();
      nodeMaterial.dispose();
      glowMaterial.dispose();
      lineMaterial.dispose();
      dustMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    }

    /* Where the shell actually lands on screen, in viewport pixels, so the
       connector lines can end on its outline instead of at fractions of the
       wrapper guessed by hand.

       Offsets are taken along world X and Y, which are the camera's own axes
       here (it has no roll), so they stay screen-aligned and share the centre's
       depth -- that makes the projection exact rather than an approximation.

       The horizontal radius uses the smaller of rx and rz on purpose. The group
       spins about Y forever, so the silhouette's width breathes between those
       two -- a 38% swing at the current 5.8/4.2. Taking the minimum means a
       line always terminates on or just inside the outline at every angle,
       instead of being correct at one rotation and floating or buried at the
       rest. */
    function getShellSilhouette() {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return null;
      }

      group.updateMatrixWorld();

      const scale = group.scale.x;
      const center = group.localToWorld(new THREE.Vector3(0, BRAIN_SHELL.cy, 0));
      const toViewport = (vector) => {
        const ndc = vector.clone().project(camera);
        return {
          x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-ndc.y * 0.5 + 0.5) * rect.height,
        };
      };

      const middle = toViewport(center);
      const side = toViewport(
        center.clone().add(new THREE.Vector3(Math.min(BRAIN_SHELL.rx, BRAIN_SHELL.rz) * scale, 0, 0))
      );
      const top = toViewport(center.clone().add(new THREE.Vector3(0, BRAIN_SHELL.ry * scale, 0)));

      const rx = Math.abs(side.x - middle.x);
      const ry = Math.abs(top.y - middle.y);
      if (!(rx > 1) || !(ry > 1)) {
        return null;
      }

      return { cx: middle.x, cy: middle.y, rx, ry };
    }

    resize();
    render();
    start();

    return {
      resize,
      start,
      stop,
      setTheme: setBrainTheme,
      getShellSilhouette,
      dispose,
    };
  } catch (error) {
    console.warn("Failed to initialize the Three.js brain model.", error);
    return null;
  }
}

function runIntroAnimation() {
  const overlay = document.querySelector("#intro-overlay");
  const textContainer = document.querySelector("#intro-text");
  const topContainer = document.querySelector("#intro-top");
  const bottomContainer = document.querySelector("#intro-bottom");

  if (!overlay) {
    return Promise.resolve();
  }

  if (shouldReduceMotion()) {
    overlay.remove();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const rng = createSeededRandom(7788);

    const letters = "FOR YOU";
    for (let i = 0; i < letters.length; i++) {
      const char = letters[i];
      if (char === " ") {
        const spacer = document.createElement("span");
        spacer.style.width = "0.35em";
        spacer.style.display = "inline-block";
        textContainer.appendChild(spacer);
        continue;
      }
      const span = document.createElement("span");
      span.className = "intro-letter";
      span.textContent = char;
      span.style.setProperty("--from-x", ((rng() - 0.5) * 50) + "px");
      span.style.setProperty("--from-y", ((rng() - 0.5) * 35) + "px");
      span.style.setProperty("--from-r", ((rng() - 0.5) * 25) + "deg");
      span.style.setProperty("--to-x", ((rng() - 0.5) * 280) + "px");
      span.style.setProperty("--to-y", ((rng() - 0.5) * 200) + "px");
      span.style.setProperty("--to-r", ((rng() - 0.5) * 50) + "deg");
      span.style.setProperty("--delay", (i * 45) + "ms");
      span.style.setProperty("--scatter-delay", (i * 20) + "ms");
      textContainer.appendChild(span);
    }

    const isCompact = window.innerWidth <= 680;
    const barCount = isCompact ? 10 : 20;
    const barDelays = [];
    for (let i = 0; i < barCount; i++) {
      const center = (barCount - 1) / 2;
      const maxDelay = isCompact ? 260 : 350;
      barDelays.push(Math.abs(i - center) / center * maxDelay + rng() * (isCompact ? 50 : 80));
    }

    for (let i = 0; i < barCount; i++) {
      const topBar = document.createElement("div");
      topBar.className = "intro-bar";
      topBar.style.setProperty("--bar-delay", barDelays[i] + "ms");
      topContainer.appendChild(topBar);

      const bottomBar = document.createElement("div");
      bottomBar.className = "intro-bar";
      bottomBar.style.setProperty("--bar-delay", barDelays[i] + "ms");
      bottomContainer.appendChild(bottomBar);
    }

    root.classList.add("intro-active");
    body.classList.add("intro-active");

    requestAnimationFrame(() => {
      textContainer.classList.add("is-gathering");
    });

    setTimeout(() => {
      textContainer.classList.remove("is-gathering");
      textContainer.classList.add("is-scattering");

      setTimeout(() => {
        textContainer.style.display = "none";
        topContainer.classList.add("is-revealing");
        bottomContainer.classList.add("is-revealing");

        setTimeout(() => {
          overlay.classList.add("is-done");

          setTimeout(() => {
            overlay.remove();
            root.classList.remove("intro-active");
            body.classList.remove("intro-active");
            resolve();
          }, 400);
        }, 1200);
      }, 500);
    }, 1400);
  });
}

/* ═══════════════════════════════════════════════════════════════
   Magnetic hero heading
   ═══════════════════════════════════════════════════════════════ */

const MAGNET_RADIUS = 280;
const magnetChars = [];
let magnetFrame = 0;
let magnetPointerX = -99999;
let magnetPointerY = -99999;
let magnetActive = false;

function supportsMagneticHeading() {
  return (
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !shouldReduceMotion()
  );
}

/* Positions are captured once, with every glyph at rest, and kept in page
   coordinates, so that a frame never has to read layout back. Subtracting
   scroll each frame keeps them correct.

   Since the effect became stroke-only these positions are also stable by
   construction -- stroke does not change advance width, so a glyph under the
   pointer no longer moves itself or anything after it. Clearing the stroke
   before measuring is belt-and-braces for the case where a rebuild lands
   mid-effect. */
function measureMagnetChars() {
  for (let i = 0; i < magnetChars.length; i += 1) {
    magnetChars[i].el.style.webkitTextStrokeWidth = "";
  }

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  for (let i = 0; i < magnetChars.length; i += 1) {
    const rect = magnetChars[i].el.getBoundingClientRect();
    magnetChars[i].pageX = rect.left + rect.width / 2 + scrollX;
    magnetChars[i].pageY = rect.top + rect.height / 2 + scrollY;
  }
}

function renderMagnetFrame() {
  magnetFrame = 0;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  for (let i = 0; i < magnetChars.length; i += 1) {
    const char = magnetChars[i];
    const dx = char.pageX - scrollX - magnetPointerX;
    const dy = char.pageY - scrollY - magnetPointerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const linear = Math.max(0, 1 - distance / MAGNET_RADIUS);
    const influence = linear * linear * (3 - 2 * linear);

    /* Stroke only, deliberately. This used to also sweep font-weight 300..900,
       which was the whole bug: weight changes a glyph's advance width, every
       char is inline-block, so each one that thickened widened and shoved its
       neighbours along. With the pointer moving, the entire heading reflowed
       continuously -- measured at 76px -> 83px for a single char going 300 ->
       700. The old comment called that sideways nudge "the magnetic push";
       on screen it reads as the line coming apart.

       Stroke is the right lever anyway. It thickens outward from the glyph
       outline and leaves the advance width untouched, so nothing reflows, and
       unlike weight it works on every script here -- weight needs a variable
       face, so CJK falling back to static PingFang ignored it entirely and
       only ever got the stroke. Losing weight costs Latin a little contrast,
       which is what the raised ceiling below pays back.

       Neither property disturbs the line box, which still matters: the heading
       runs 96px on a ~0.92 line-height and the two lines already touch at
       rest, so any vertical growth would drive line one into line two. */
    char.el.style.webkitTextStrokeWidth = `${(influence * 2.4).toFixed(2)}px`;
  }
}

function requestMagnetFrame() {
  if (magnetFrame || !magnetChars.length) {
    return;
  }

  magnetFrame = window.requestAnimationFrame(renderMagnetFrame);
}

function handleMagnetPointerMove(event) {
  magnetPointerX = event.clientX;
  magnetPointerY = event.clientY;
  requestMagnetFrame();
}

function releaseMagnet() {
  magnetPointerX = -99999;
  magnetPointerY = -99999;
  requestMagnetFrame();
}

/* Called after every language switch: applyLanguage writes textContent, which
   destroys the per-character spans. */
function buildMagneticHeading() {
  const heading = document.querySelector(".hero-copy h1");

  magnetChars.length = 0;

  if (!heading) {
    return;
  }

  if (!supportsMagneticHeading()) {
    heading.classList.remove("has-magnet");
    return;
  }

  const text = heading.textContent;
  const fragment = document.createDocumentFragment();

  /* Characters are grouped into word wrappers before being made inline-block.
     Without the wrapper every glyph becomes its own break opportunity and the
     browser happily wraps mid-word — "Hello I'm" split after the apostrophe. */
  let word = null;

  const closeWord = () => {
    word = null;
  };

  for (const character of text) {
    if (character === "\n") {
      closeWord();
      fragment.appendChild(document.createElement("br"));
      continue;
    }

    if (character === " ") {
      closeWord();
      fragment.appendChild(document.createTextNode(" "));
      continue;
    }

    if (!word) {
      word = document.createElement("span");
      word.className = "magnet-word";
      fragment.appendChild(word);
    }

    const span = document.createElement("span");
    span.className = "magnet-char";
    span.textContent = character;
    word.appendChild(span);
    magnetChars.push({ el: span, pageX: 0, pageY: 0 });
  }

  heading.textContent = "";
  heading.appendChild(fragment);
  heading.classList.add("has-magnet");
  measureMagnetChars();

  if (!magnetActive) {
    magnetActive = true;
    window.addEventListener("pointermove", handleMagnetPointerMove, { passive: true });
    document.addEventListener("pointerleave", releaseMagnet, { passive: true });
  }
}

/* ═══════════════════════════════════════════════════════════════
   Effect 5: Cinematic Scroll Parallax
   ═══════════════════════════════════════════════════════════════ */

function initCinematicParallax() {
  const sections = document.querySelectorAll("[data-theme-section]");
  if (!sections.length) return;

  /* An allowlist, deliberately down to one section. Scaling and fading every
     section on scroll is the dated "everything drifts in" look, and it was
     also doing real damage: hero already runs updateHeroParallax over its own
     children, so the container scale compounded with it, and welcome carries
     the sand canvas which is motion enough on its own. career and photo were
     never eligible — they measure themselves with getBoundingClientRect and an
     external scale() skews those coordinates. */
  const CINEMATIC_SECTIONS = new Set(["language"]);
  const parallaxSections = Array.from(sections)
    .filter((s) => CINEMATIC_SECTIONS.has(s.getAttribute("data-theme-section")))
    .map((sec) => ({
      sec,
      eyebrow: sec.querySelector(".eyebrow"),
      heading: sec.querySelector("h1, h2"),
    }));

  let cinematicFrame = 0;

  function updateCinematicParallax() {
    const vh = window.innerHeight;
    const center = vh / 2;
    const mobile = isMobileViewport();
    const strength = mobile ? 0.5 : 1.0;

    /* Measure everything first, then write. Interleaving the two forced a
       synchronous layout per section on every scroll frame. */
    for (let i = 0; i < parallaxSections.length; i++) {
      const entry = parallaxSections[i];
      const rect = entry.sec.getBoundingClientRect();
      entry.secCenter = rect.top + rect.height / 2;
    }

    for (let i = 0; i < parallaxSections.length; i++) {
      const { sec, eyebrow, heading, secCenter } = parallaxSections[i];
      const dist = Math.abs(secCenter - center);
      const proximity = 1 - Math.min(dist / vh, 1);

      const s = 1 + proximity * 0.02 * strength;
      const o = 0.92 + proximity * 0.08;

      sec.style.transform = "scale(" + s + ")";
      sec.style.opacity = o;

      /* Eyebrow & heading get a slightly faster parallax rate */
      if (eyebrow) {
        const shift = (secCenter - center) * -0.015 * strength;
        eyebrow.style.transform = "translate3d(0," + shift + "px,0)";
      }
      if (heading && heading !== eyebrow) {
        const shift = (secCenter - center) * -0.01 * strength;
        heading.style.transform = "translate3d(0," + shift + "px,0)";
      }
    }
  }

  function requestCinematicUpdate() {
    if (cinematicFrame) return;
    cinematicFrame = requestAnimationFrame(() => {
      cinematicFrame = 0;
      updateCinematicParallax();
    });
  }

  window.addEventListener("scroll", requestCinematicUpdate, { passive: true });
  updateCinematicParallax();
}

/* ═══════════════════════════════════════════════════════════════
   Effect 2: Scroll Velocity Grain / Distortion
   ═══════════════════════════════════════════════════════════════ */

function initGrainCanvas() {
  const canvas = document.getElementById("grain-canvas");
  if (!canvas) return;

  /* Skip on mobile & reduced-motion */
  if (isMobileViewport() || shouldReduceMotion()) {
    canvas.style.display = "none";
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const GRAIN_W = 128;
  const GRAIN_H = 128;
  canvas.width = GRAIN_W;
  canvas.height = GRAIN_H;
  /* Scale up via CSS for pixelated grain */
  canvas.style.imageRendering = "pixelated";

  let lastScrollY = window.scrollY;
  let scrollVelocity = 0;
  let currentOpacity = 0.03;
  const BASE_OPACITY = 0.03;
  const MAX_OPACITY = 0.12;
  const DECAY = 0.92;
  let grainRunning = false;
  let grainFrame = 0;
  let lastGrainTime = 0;
  const GRAIN_INTERVAL = 50; /* ~20fps */

  /* Allocated once. Re-creating this buffer every frame churned roughly
     1.3 MB/s of garbage for as long as the page stayed visible. */
  const grainImageData = ctx.createImageData(GRAIN_W, GRAIN_H);
  const grainPixels = grainImageData.data;

  function renderGrain(timestamp) {
    if (!grainRunning) return;
    grainFrame = requestAnimationFrame(renderGrain);

    if (timestamp - lastGrainTime < GRAIN_INTERVAL) return;
    lastGrainTime = timestamp;

    const isDark = activeTheme === "dark";
    const base = isDark ? 200 : 40;

    for (let i = 0; i < grainPixels.length; i += 4) {
      const v = base + ((Math.random() * 55) | 0);
      grainPixels[i] = v;
      grainPixels[i + 1] = v;
      grainPixels[i + 2] = v;
      grainPixels[i + 3] = 255;
    }
    ctx.putImageData(grainImageData, 0, 0);

    /* Decay velocity toward base */
    currentOpacity = currentOpacity * DECAY + BASE_OPACITY * (1 - DECAY);
    if (currentOpacity < BASE_OPACITY + 0.001) currentOpacity = BASE_OPACITY;
    canvas.style.opacity = currentOpacity;
  }

  function onScroll() {
    const nowY = window.scrollY;
    scrollVelocity = Math.abs(nowY - lastScrollY);
    lastScrollY = nowY;
    currentOpacity = Math.min(MAX_OPACITY, BASE_OPACITY + scrollVelocity * 0.003);
    canvas.style.opacity = currentOpacity;
  }

  function start() {
    if (grainRunning) return;
    grainRunning = true;
    grainFrame = requestAnimationFrame(renderGrain);
  }

  function stop() {
    grainRunning = false;
    if (grainFrame) {
      cancelAnimationFrame(grainFrame);
      grainFrame = 0;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });

  start();
}

/* ═══════════════════════════════════════════════════════════════
   Effect 3: Photo Card Hover Glow (JS portion)
   ═══════════════════════════════════════════════════════════════ */

function initPhotoCardHoverGlow() {
  if (isMobileViewport()) return; /* No cursor tracking on touch devices */
  const stage = document.querySelector(".photo-stage");
  if (!stage) return;

  /* Inject glow overlay divs into every photo card that doesn't already have one */
  const cards = stage.querySelectorAll(".photo-card");
  cards.forEach((card) => {
    if (card.querySelector(".photo-card-hover-glow")) return;
    const glow = document.createElement("div");
    glow.className = "photo-card-hover-glow";
    glow.setAttribute("aria-hidden", "true");
    card.appendChild(glow);
  });

  /* Track mouse position to update CSS vars on the hovered card */
  stage.addEventListener("mousemove", (e) => {
    const card = e.target.closest(".photo-card");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty("--hover-x", x + "%");
    card.style.setProperty("--hover-y", y + "%");
  });
}

function scheduleBrainSceneLoad() {
  if (!brainMount || brainSceneController || shouldReduceMotion()) {
    return;
  }

  let loading = false;

  const loadBrain = async () => {
    if (loading || brainSceneController || shouldReduceMotion()) {
      return;
    }

    loading = true;
    try {
      brainSceneController = await createBrainWireframeScene(brainMount);
      if (brainSceneController && activeTheme) {
        brainSceneController.setTheme?.(activeTheme);
      }
    } finally {
      loading = false;
    }
  };

  const target = languageUniverse || brainMount;

  if (typeof IntersectionObserver === "function" && target) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        observer.disconnect();
        loadBrain();
      },
      {
        root: null,
        rootMargin: "220px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(target);
    return;
  }

  const idle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 900));
  idle(() => {
    loadBrain();
  });
}

async function initApp() {
  const siteConfig = await loadSiteConfig();
  if (siteConfig.maintenance) {
    window.location.replace("./maintenance/index.html");
    return;
  }

  const introPromise = runIntroAnimation();

  languageToggle?.addEventListener("click", () => {
    toggleLanguageMenu();
  });

  languageOptions.forEach((option) => {
    option.addEventListener("click", async () => {
      const nextLanguage = option.dataset.language || "zh";
      await switchLanguageWithAnimation(nextLanguage);
    });
  });

  languageNodeButtons.forEach((button) => {
    button.addEventListener("mouseenter", () => {
      setActiveLanguageNode(button.dataset.languageNode || "js");
    });
    button.addEventListener("focus", () => {
      setActiveLanguageNode(button.dataset.languageNode || "js");
    });
    button.addEventListener("click", () => {
      setActiveLanguageNode(button.dataset.languageNode || "js");
    });
    button.addEventListener("transitionend", requestLanguageNetworkSync);
  });

  languageIndexButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveLanguageNode(button.dataset.languageNode || "js");
    });
  });

  languageUniverse?.addEventListener("mouseleave", resetLanguageUniverseParallax);

  revealLanguageUniverse();

  themeToggle?.addEventListener("click", async (event) => {
    /* Mirror the guard inside triggerThemeWave so the stored preference
       never flips while the wave silently refuses to run. */
    if (isThemeTransitioning || careerThemeRestorePending) {
      return;
    }

    const nextTheme = activeTheme === "dark" ? "light" : "dark";
    const rect = event.currentTarget.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    safeStorageSet(storageKey, nextTheme);
    await triggerThemeWave(originX, originY, nextTheme);
  });

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("click", (event) => {
    if (!languageSwitcher?.contains(event.target)) {
      closeLanguageMenu();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (photoZoomActive) {
        closePhotoZoom();
        return;
      }
      closeLanguageMenu();
    }
  });
  tiltCard?.addEventListener("mouseleave", resetTilt);
  window.addEventListener("resize", () => {
    syncInputDeviceClass();
    invalidatePhotoLayoutCaches();
    syncViewportHeightVar();
    buildWelcomeCanvas();
    requestWelcomeRender();
    updateHeroParallax();
    requestCareerSceneUpdate();
    requestPhotoSceneUpdate();
    brainSceneController?.resize();
    requestLanguageNetworkSync();
  });
  window.visualViewport?.addEventListener("resize", handleVisualViewportResize);
  window.addEventListener("scroll", requestWelcomeScatterUpdate, { passive: true });
  window.addEventListener("scroll", requestHeroParallaxUpdate, { passive: true });
  window.addEventListener("scroll", requestCareerSceneUpdate, { passive: true });
  window.addEventListener("scroll", requestPhotoSceneUpdate, { passive: true });
  window.addEventListener("scroll", requestLanguageNetworkSync, { passive: true });
  window.addEventListener("hashchange", requestCareerSceneUpdate);
  window.addEventListener("load", requestLanguageNetworkSync);
  careerCardStack?.addEventListener("wheel", handleCareerLayerWheel, { passive: false, capture: true });
  careerCardStack?.addEventListener("touchstart", handleCareerLayerTouchStart, { passive: true, capture: true });
  careerCardStack?.addEventListener("touchmove", handleCareerLayerTouchMove, { passive: false, capture: true });
  careerCardStack?.addEventListener("touchend", handleCareerLayerTouchEnd, { passive: true, capture: true });
  photoStage?.addEventListener("pointerover", handlePhotoMainCardPointerPreload);
  photoStage?.addEventListener("touchstart", handlePhotoMainCardTouchPreload, { passive: true });
  photoStage?.addEventListener("click", handlePhotoMainCardClick);
  photoStage?.addEventListener("keydown", handlePhotoCardKeydown);
  photoZoomCloseButton?.addEventListener("pointerdown", handlePhotoZoomClosePointerDown);
  photoZoomCloseButton?.addEventListener("mousedown", handlePhotoZoomClosePointerDown);
  photoZoomCloseButton?.addEventListener("touchstart", handlePhotoZoomClosePointerDown, { passive: false });
  photoZoomCloseButton?.addEventListener("click", handlePhotoZoomClosePointerDown);
  photoZoomOverlay?.addEventListener("pointerdown", handlePhotoZoomOverlayPointerDown);
  photoZoomOverlay?.addEventListener("mousedown", handlePhotoZoomOverlayPointerDown);
  photoZoomOverlay?.addEventListener("touchstart", handlePhotoZoomOverlayPointerDown, { passive: false });
  photoZoomOverlay?.addEventListener("click", handlePhotoZoomOverlayPointerDown);
  photoZoomOverlay?.addEventListener("wheel", stopPhotoZoomScroll, { passive: false });
  photoZoomOverlay?.addEventListener("touchmove", stopPhotoZoomScroll, { passive: false });
  photoShowAllButton?.addEventListener("click", togglePhotoAllExpanded);
  photoSection?.addEventListener("wheel", handlePhotoCarouselWheel, { passive: false, capture: true });
  photoSection?.addEventListener("touchstart", handlePhotoCarouselTouchStart, { passive: true, capture: true });
  photoSection?.addEventListener("touchmove", handlePhotoCarouselTouchMove, { passive: false, capture: true });
  photoSection?.addEventListener("touchend", handlePhotoCarouselTouchEnd, { passive: true, capture: true });
  photoSection?.addEventListener("touchcancel", handlePhotoCarouselTouchEnd, { passive: true, capture: true });
  careerLayerScrollAreas.forEach((scrollArea) => {
    scrollArea.addEventListener("wheel", stopCareerScrollPropagation, { passive: false });
    scrollArea.addEventListener("touchmove", stopCareerScrollPropagation, { passive: false });
  });
  careerCardStack?.addEventListener("keydown", handleCareerLayerKeydown);
  window.addEventListener("resize", measureMagnetChars, { passive: true });
  document.fonts?.ready?.then(requestLanguageNetworkSync);

  syncViewportHeightVar();
  applyLanguage(resolveLanguage());
  setActiveLanguageNode(activeLanguageNode);
  updateCareerLayerClasses();
  await commitThemeState(resolveTheme());
  scheduleBrainSceneLoad();
  drawWelcome();
  updateHeroParallax();
  updateCareerScene();
  updatePhotoScene();
  requestLanguageNetworkSync();

  /* Initialize visual effects */
  initCinematicParallax();
  initGrainCanvas();
  initPhotoCardHoverGlow();

  /* Bound before the intro is awaited. The intro runs ~3.5s, and until these
     exist a backgrounded tab keeps the photo rAF and the brain scene running;
     anything throwing above would have skipped them entirely. */
  mediaQuery.addEventListener("change", (event) => {
    if (getStoredTheme()) {
      return;
    }

    commitThemeState(event.matches ? "dark" : "light").then(() => {
      updateHeroParallax();
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (photoFrame) {
        window.cancelAnimationFrame(photoFrame);
        photoFrame = 0;
      }
      brainSceneController?.stop();
    } else {
      brainSceneController?.start();
      requestPhotoSceneUpdate();
    }
  });

  await introPromise;
}

initApp().catch((error) => {
  console.error("[EurekaWeb] initApp failed:", error);
});
