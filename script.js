const body = document.body;
const themeToggle = document.querySelector("#theme-toggle");
const pulseTrigger = document.querySelector("#pulse-trigger");
const tiltCard = document.querySelector("#feature-card");
const statNumbers = document.querySelectorAll(".stat-number");
const revealItems = document.querySelectorAll(".reveal");
const welcomeSection = document.querySelector("#welcome-section");
const welcomeWord = document.querySelector("#welcome-word");
const welcomeCanvas = document.querySelector("#welcome-canvas");
const welcomeCtx = welcomeCanvas?.getContext("2d");
const themeWave = document.querySelector(".theme-wave");
const canvas = document.querySelector("#particle-canvas");
const ctx = canvas.getContext("2d");

const particles = [];
const particleCount = 64;
let animationFrame = 0;
let activeTheme = "light";
let isThemeTransitioning = false;
let particleDotColor = "rgba(19, 32, 51, 0.42)";
let particleLineRgb = "19, 32, 51";
let particleLineOpacity = 0.11;
let scrollFrame = 0;
let welcomeRenderFrame = 0;
let welcomeLayers = [];

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const storageKey = "preferred-theme";

function syncThemeRenderState() {
  const styles = getComputedStyle(body);
  particleDotColor = styles.getPropertyValue("--particle-dot").trim();
  particleLineRgb = styles.getPropertyValue("--particle-line-rgb").trim();
  particleLineOpacity = Number(styles.getPropertyValue("--particle-line").trim());
}

function applyTheme(theme) {
  activeTheme = theme;
  body.classList.toggle("theme-dark", theme === "dark");
  body.style.colorScheme = theme;
  syncThemeRenderState();
}

function getStoredTheme() {
  return window.localStorage.getItem(storageKey);
}

function getSystemTheme() {
  return mediaQuery.matches ? "dark" : "light";
}

function resolveTheme() {
  return getStoredTheme() || getSystemTheme();
}

function getWaveEndRadius(originX, originY) {
  const horizontal = Math.max(originX, window.innerWidth - originX);
  const vertical = Math.max(originY, window.innerHeight - originY);
  return Math.hypot(horizontal, vertical);
}

function runFallbackThemeWave(originX, originY, nextTheme) {
  if (!themeWave) {
    applyTheme(nextTheme);
    return Promise.resolve();
  }

  isThemeTransitioning = true;
  body.classList.add("theme-transitioning");
  body.style.setProperty("--wave-x", `${originX}px`);
  body.style.setProperty("--wave-y", `${originY}px`);
  themeWave.classList.remove("is-active");
  themeWave.classList.remove("theme-light-wave", "theme-dark-wave");
  themeWave.classList.add(
    nextTheme === "dark" ? "theme-dark-wave" : "theme-light-wave"
  );

  // Restart the animation cleanly for consecutive clicks.
  void themeWave.offsetWidth;
  themeWave.classList.add("is-active");

  window.setTimeout(() => {
    applyTheme(nextTheme);
    themeWave.classList.remove("is-active");
    window.requestAnimationFrame(() => {
      isThemeTransitioning = false;
      body.classList.remove("theme-transitioning");
    });
  }, 700);

  return Promise.resolve();
}

async function triggerThemeWave(originX, originY, nextTheme) {
  if (!document.startViewTransition) {
    return runFallbackThemeWave(originX, originY, nextTheme);
  }

  if (isThemeTransitioning) {
    return Promise.resolve();
  }

  isThemeTransitioning = true;
  body.classList.add("theme-transitioning");

  const endRadius = getWaveEndRadius(originX, originY);
  document.documentElement.style.setProperty("--wave-x", `${originX}px`);
  document.documentElement.style.setProperty("--wave-y", `${originY}px`);
  document.documentElement.style.setProperty("--wave-end-radius", `${endRadius}px`);

  const transition = document.startViewTransition(() => {
    applyTheme(nextTheme);
  });

  try {
    await transition.ready;
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${originX}px ${originY}px)`,
          `circle(${endRadius}px at ${originX}px ${originY}px)`,
        ],
      },
      {
        duration: 780,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
        pseudoElement: "::view-transition-new(root)",
      }
    );

    await transition.finished;
  } catch (error) {
    applyTheme(nextTheme);
  } finally {
    isThemeTransitioning = false;
    body.classList.remove("theme-transitioning");
  }
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function createParticles() {
  particles.length = 0;

  for (let index = 0; index < particleCount; index += 1) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      radius: Math.random() * 2.2 + 1,
    });
  }
}

function drawParticles() {
  if (isThemeTransitioning) {
    animationFrame = window.requestAnimationFrame(drawParticles);
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];
    particle.x += particle.vx;
    particle.y += particle.vy;

    if (particle.x <= 0 || particle.x >= canvas.width) {
      particle.vx *= -1;
    }

    if (particle.y <= 0 || particle.y >= canvas.height) {
      particle.vy *= -1;
    }

    ctx.beginPath();
    ctx.fillStyle = particleDotColor;
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();

    for (let j = i + 1; j < particles.length; j += 1) {
      const peer = particles[j];
      const dx = particle.x - peer.x;
      const dy = particle.y - peer.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 120) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${particleLineRgb},${particleLineOpacity - distance / 1200})`;
        ctx.lineWidth = 1;
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(peer.x, peer.y);
        ctx.stroke();
      }
    }
  }

  animationFrame = window.requestAnimationFrame(drawParticles);
}

function buildWelcomeLayer(wordElement, canvasElement, context, text) {
  if (!wordElement || !canvasElement || !context) {
    return null;
  }

  const rect = wordElement.getBoundingClientRect();
  const dpr = 1;
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(160, Math.round(rect.height));
  const sampleCanvas = document.createElement("canvas");
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const style = getComputedStyle(wordElement);
  const fontSize = parseFloat(style.fontSize);
  const fontFamily = style.fontFamily;
  const fontWeight = style.fontWeight;
  const letterSpacing = parseFloat(style.letterSpacing);
  const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const primaryColor = getComputedStyle(body).getPropertyValue("--primary").trim();
  const textColor = getComputedStyle(body).getPropertyValue("--welcome-text").trim();
  const secondaryColor = getComputedStyle(body).getPropertyValue("--welcome-grain").trim();

  canvasElement.width = Math.round(width * dpr);
  canvasElement.height = Math.round(height * dpr);
  canvasElement.style.width = `${width}px`;
  canvasElement.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  sampleCanvas.width = width;
  sampleCanvas.height = height;
  sampleCtx.clearRect(0, 0, width, height);
  sampleCtx.font = font;
  sampleCtx.textAlign = "center";
  sampleCtx.textBaseline = "middle";
  sampleCtx.fillStyle = "#000";
  sampleCtx.letterSpacing = `${letterSpacing}px`;
  sampleCtx.fillText(text, width / 2, height / 2 + fontSize * 0.05);

  const imageData = sampleCtx.getImageData(0, 0, width, height);
  const area = width * height;
  const densityScale = area > 220000 ? 1.3 : 1;
  const gap = Math.max(5, Math.round((fontSize / 24) * densityScale));
  const points = [];
  const maxDistance = Math.hypot(width / 2, height / 2);

  for (let y = 0; y < height; y += gap) {
    for (let x = 0; x < width; x += gap) {
      const alpha = imageData.data[(y * width + x) * 4 + 3];
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
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
            return;
          }

          const neighborAlpha = imageData.data[(nextY * width + nextX) * 4 + 3];
          if (neighborAlpha > 96) {
            neighbors += 1;
          }
        });

        const centerBias = (x - width / 2) / width;
        const edgeFactor = 1 - neighbors / 8;
        const radialFactor =
          Math.hypot(x - width / 2, y - height / 2) / Math.max(maxDistance, 1);
        const shardness = Math.min(1, edgeFactor * 0.78 + radialFactor * 0.42 + Math.random() * 0.12);
        points.push({
          x,
          y,
          size: 0.7 + Math.random() * 1.9,
          driftX:
            centerBias * (74 + Math.random() * 110) +
            (Math.random() - 0.5) * 160,
          driftY: (Math.random() - 0.5) * 170 + (Math.random() - 0.65) * 34,
          wave: (Math.random() - 0.5) * 24,
          delay: Math.max(0, shardness * 0.34 - 0.08 + Math.random() * 0.04),
          edgeFactor,
          shimmer: Math.random() * Math.PI * 2,
          orbit: Math.random() * Math.PI * 2,
          spread: 10 + Math.random() * 26,
        });
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
  textureCtx.fillText(text, width / 2, height / 2 + fontSize * 0.05);

  return {
    canvas: canvasElement,
    context,
    width,
    height,
    font,
    fontSize,
    letterSpacing,
    text,
    baselineY: height / 2 + fontSize * 0.05,
    glowColor: primaryColor,
    textColor,
    secondaryColor,
    points,
    texture: textureCanvas,
  };
}

function buildWelcomeCanvas() {
  welcomeLayers = [];

  const primaryLayer = buildWelcomeLayer(
    welcomeWord,
    welcomeCanvas,
    welcomeCtx,
    "Welcome"
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
    const { context, width, height, texture, points, textColor, secondaryColor, type } = layer;
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
      context.save();
      context.translate(point.x + smearX, point.y + smearY);
      context.beginPath();
      context.arc(0, 0, cutSize * 0.68, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });
    context.globalCompositeOperation = "source-over";
    context.restore();

    if (eased < 0.08) {
      return;
    }

    points.forEach((point, index) => {
      const localProgress = Math.max(
        0,
        Math.min(1, (crumble - point.delay) / Math.max(1 - point.delay, 0.001))
      );
      if (localProgress <= 0) {
        return;
      }

      const particleEase = 1 - (1 - localProgress) * (1 - localProgress);
      const sway =
        Math.sin(particleEase * Math.PI * 2.8 + point.shimmer + index * 0.07) * point.wave;
      const orbitX =
        Math.cos(point.orbit + particleEase * 4.2) * point.spread * particleEase * 0.24;
      const orbitY =
        Math.sin(point.orbit + particleEase * 3.6) * point.spread * particleEase * 0.24;
      const x = point.x + point.driftX * particleEase + orbitX;
      const y = point.y + point.driftY * particleEase + sway + orbitY;
      const radius =
        point.size * (type === "primary" ? 0.72 + particleEase * 0.88 : 0.62 + particleEase * 0.72);
      const alpha =
        Math.max(0, particleEase * (type === "primary" ? 0.72 : 0.58) - eased * 0.05);
      const shimmerAlpha = 0.2 + Math.sin(point.shimmer + crumble * 12) * 0.08;

      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = textColor;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = Math.max(0, alpha * shimmerAlpha);
      context.fillStyle = secondaryColor;
      context.beginPath();
      context.arc(x - radius * 0.14, y - radius * 0.14, radius * 0.22, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });
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
  if (scrollFrame) {
    return;
  }

  scrollFrame = window.requestAnimationFrame(() => {
    requestWelcomeRender();
    scrollFrame = 0;
  });
}

function animateNumbers() {
  statNumbers.forEach((element) => {
    const target = Number(element.dataset.target);
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 36));

    const tick = () => {
      current += step;

      if (current >= target) {
        element.textContent = `${target}${target === 100 ? "%" : "+"}`;
        return;
      }

      element.textContent = current;
      window.requestAnimationFrame(tick);
    };

    tick();
  });
}

function handlePointerMove(event) {
  const x = `${(event.clientX / window.innerWidth) * 100}%`;
  const y = `${(event.clientY / window.innerHeight) * 100}%`;
  body.style.setProperty("--cursor-x", x);
  body.style.setProperty("--cursor-y", y);

  if (!tiltCard) {
    return;
  }

  const bounds = tiltCard.getBoundingClientRect();
  const rotateY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 14;
  const rotateX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -14;

  tiltCard.style.transform = `perspective(1100px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
}

function resetTilt() {
  if (tiltCard) {
    tiltCard.style.transform = "perspective(1100px) rotateX(0deg) rotateY(0deg)";
  }
}

function setupReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function activatePulse() {
  body.classList.remove("pulse-active");
  window.setTimeout(() => body.classList.add("pulse-active"), 10);
  window.setTimeout(() => body.classList.remove("pulse-active"), 760);
}

themeToggle?.addEventListener("click", async (event) => {
  const nextTheme = activeTheme === "dark" ? "light" : "dark";
  const rect = event.currentTarget.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  window.localStorage.setItem(storageKey, nextTheme);
  await triggerThemeWave(originX, originY, nextTheme);
});

pulseTrigger?.addEventListener("click", activatePulse);
window.addEventListener("pointermove", handlePointerMove);
tiltCard?.addEventListener("mouseleave", resetTilt);
window.addEventListener("resize", () => {
  resizeCanvas();
  createParticles();
  buildWelcomeCanvas();
  requestWelcomeRender();
});
window.addEventListener("scroll", requestWelcomeScatterUpdate, { passive: true });

resizeCanvas();
createParticles();
applyTheme(resolveTheme());
buildWelcomeCanvas();
drawParticles();
animateNumbers();
setupReveal();
drawWelcome();

mediaQuery.addEventListener("change", (event) => {
  if (getStoredTheme()) {
    return;
  }

  applyTheme(event.matches ? "dark" : "light");
  buildWelcomeCanvas();
  requestWelcomeRender();
});

window.addEventListener("beforeunload", () => {
  window.cancelAnimationFrame(animationFrame);
  window.cancelAnimationFrame(scrollFrame);
  window.cancelAnimationFrame(welcomeRenderFrame);
});
