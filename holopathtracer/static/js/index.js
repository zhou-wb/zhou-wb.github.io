document.addEventListener("DOMContentLoaded", function () {
  var burger = document.querySelector(".navbar-burger");
  var menu = document.querySelector(".navbar-menu");

  if (burger && menu) {
    burger.addEventListener("click", function () {
      burger.classList.toggle("is-active");
      menu.classList.toggle("is-active");
      burger.setAttribute("aria-expanded", burger.classList.contains("is-active"));
    });
  }

  document.querySelectorAll(".navbar-menu a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (burger && menu) {
        burger.classList.remove("is-active");
        menu.classList.remove("is-active");
        burger.setAttribute("aria-expanded", "false");
      }
    });
  });

  initDynamicResultViewer();
  initOverviewVideo();
  initReconstructionViewer();
});

function initOverviewVideo() {
  var root = document.querySelector("[data-overview-video]");
  if (!root) {
    return;
  }

  var video = root.querySelector("[data-overview-video-player]");
  var progressRail = root.querySelector(".overview-progress-rail");
  var timelineFill = root.querySelector("[data-overview-progress-fill]");
  var chapterButtons = Array.prototype.slice.call(root.querySelectorAll("[data-overview-chapter-button]"));
  var progressMarkers = Array.prototype.slice.call(root.querySelectorAll("[data-overview-marker]"));
  var timelineSections = Array.prototype.slice.call(root.querySelectorAll(".overview-timeline-section"));
  var splitTime = Number(root.getAttribute("data-split-time")) || 35;
  var expandedTimelineScale = null;
  var lastMediaHeight = 0;

  if (!video) {
    return;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function videoDuration() {
    return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  }

  function overviewSplit() {
    var duration = videoDuration();
    return duration > 0 ? clamp(splitTime, 0, duration) : splitTime;
  }

  function syncMediaHeight() {
    var rect = video.getBoundingClientRect();
    if (rect.height <= 0 || Math.abs(rect.height - lastMediaHeight) < 0.5) {
      return;
    }

    lastMediaHeight = rect.height;
    expandedTimelineScale = null;
    root.style.setProperty("--overview-media-height", rect.height.toFixed(1) + "px");
  }

  function chapterStart(button) {
    return Number(button.getAttribute("data-overview-jump")) || 0;
  }

  function positionInRail(element) {
    if (!progressRail || !element) {
      return 0;
    }

    var railRect = progressRail.getBoundingClientRect();
    var elementRect = element.getBoundingClientRect();
    var position = elementRect.top + elementRect.height / 2 - railRect.top;
    return clamp(position, 0, railRect.height);
  }

  function chapterPosition(button) {
    return positionInRail(button);
  }

  function railHeight() {
    return progressRail ? progressRail.getBoundingClientRect().height : 0;
  }

  function canMeasureExpandedTimeline() {
    return !!progressRail;
  }

  function fallbackTimelineScale(duration, safeSplit) {
    var height = railHeight();
    return {
      height: height,
      points: [
        { time: 0, position: 0 },
        { time: duration > 0 ? duration : Math.max(safeSplit, 0), position: height }
      ],
      splitPosition: duration > 0 ? clamp(safeSplit / duration, 0, 1) * height : 0
    };
  }

  function buildExpandedTimelineScale(duration, safeSplit) {
    if (!progressRail) {
      return expandedTimelineScale || fallbackTimelineScale(duration, safeSplit);
    }

    var height = railHeight();
    if (height <= 0) {
      return expandedTimelineScale || fallbackTimelineScale(duration, safeSplit);
    }

    var points = [];

    chapterButtons.forEach(function (button) {
      var start = chapterStart(button);
      points.push({
        time: start,
        position: chapterPosition(button)
      });
    });

    var splitPosition = duration > 0 ? clamp(safeSplit / duration, 0, 1) * height : 0;
    points.push({
      time: duration > 0 ? duration : Math.max(safeSplit, 0),
      position: height
    });
    points.sort(function (a, b) {
      return a.time - b.time;
    });

    expandedTimelineScale = {
      height: height,
      points: points,
      splitPosition: splitPosition
    };
    root.style.setProperty("--overview-expanded-rail-height", height.toFixed(1) + "px");

    return expandedTimelineScale;
  }

  function timelineScale(duration, safeSplit) {
    if (canMeasureExpandedTimeline()) {
      return buildExpandedTimelineScale(duration, safeSplit);
    }

    return expandedTimelineScale || fallbackTimelineScale(duration, safeSplit);
  }

  function interpolateTimelinePosition(points, current, height) {
    if (!points.length) {
      return 0;
    }

    if (current <= points[0].time) {
      return points[0].position;
    }

    for (var index = 0; index < points.length - 1; index += 1) {
      var from = points[index];
      var to = points[index + 1];
      if (current <= to.time) {
        var span = Math.max(0.01, to.time - from.time);
        var ratio = clamp((current - from.time) / span, 0, 1);
        return from.position + (to.position - from.position) * ratio;
      }
    }

    return clamp(points[points.length - 1].position, 0, height);
  }

  function setFillPosition(position) {
    if (!timelineFill) {
      return;
    }

    var height = expandedTimelineScale ? expandedTimelineScale.height : railHeight();
    timelineFill.style.height = clamp(position, 0, height).toFixed(1) + "px";
  }

  function timelinePositionForTime(current, duration, safeSplit) {
    if (!progressRail) {
      return 0;
    }

    var scale = timelineScale(duration, safeSplit);
    return interpolateTimelinePosition(scale.points, current, scale.height);
  }

  function updateChapterProgress(current, duration) {
    if (!chapterButtons.length) {
      return;
    }

    var activeIndex = 0;

    chapterButtons.forEach(function (button, index) {
      if (current >= chapterStart(button)) {
        activeIndex = index;
      }
    });

    chapterButtons.forEach(function (button, index) {
      var isActive = index === activeIndex;
      var isComplete = index <= activeIndex;
      button.classList.toggle("is-active", isActive);
      button.classList.toggle("is-complete", isComplete);
      button.setAttribute("aria-current", isActive ? "true" : "false");
    });

    progressMarkers.forEach(function (marker, index) {
      var chapterButton = chapterButtons[index];
      if (!chapterButton) {
        return;
      }

      var markerStart = chapterStart(marker);
      marker.style.top = chapterPosition(chapterButton).toFixed(1) + "px";
      marker.classList.toggle("is-active", index === activeIndex);
      marker.classList.toggle("is-complete", current >= markerStart);
    });

    var activePhase = chapterButtons[activeIndex].getAttribute("data-overview-phase");

    timelineSections.forEach(function (section) {
      section.classList.toggle("is-active-section", section.getAttribute("data-overview-section") === activePhase);
    });

    setFillPosition(timelinePositionForTime(current, duration, overviewSplit()));
  }

  function updateOverviewTimeline() {
    syncMediaHeight();

    var duration = videoDuration();
    var current = duration > 0 ? clamp(video.currentTime, 0, duration) : 0;

    updateChapterProgress(current, duration);
  }

  function seekTo(seconds) {
    var duration = videoDuration();
    var target = duration > 0 ? clamp(seconds, 0, duration) : Math.max(0, seconds);
    video.currentTime = target;
    updateOverviewTimeline();
  }

  function playVideo() {
    var playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(function () {});
    }
  }

  function seekAndPlay(seconds) {
    seekTo(seconds);
    playVideo();
  }

  chapterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      seekAndPlay(Number(button.getAttribute("data-overview-jump")) || 0);
    });
  });

  progressMarkers.forEach(function (marker) {
    marker.addEventListener("click", function () {
      seekAndPlay(Number(marker.getAttribute("data-overview-jump")) || 0);
    });
  });

  video.addEventListener("loadedmetadata", updateOverviewTimeline);
  video.addEventListener("durationchange", updateOverviewTimeline);
  video.addEventListener("timeupdate", updateOverviewTimeline);
  video.addEventListener("seeked", updateOverviewTimeline);
  window.addEventListener("resize", function () {
    expandedTimelineScale = null;
    updateOverviewTimeline();
  });
  if (window.ResizeObserver) {
    var overviewVideoResizeObserver = new ResizeObserver(function () {
      expandedTimelineScale = null;
      updateOverviewTimeline();
    });
    overviewVideoResizeObserver.observe(video);
  }
  updateOverviewTimeline();
}

function initDynamicResultViewer() {
  var root = document.querySelector("[data-dynamic-result-viewer]");
  if (!root) {
    return;
  }

  var focusImage = root.querySelector("[data-dynamic-focus-image]");
  var viewImage = root.querySelector("[data-dynamic-view-image]");
  var viewFocusInput = root.querySelector("[data-dynamic-view-focus]");
  var focusPlayButton = root.querySelector("[data-dynamic-focus-play]");
  var sceneButtons = Array.prototype.slice.call(root.querySelectorAll("[data-dynamic-scene-option]"));
  if (!focusImage || !viewImage) {
    return;
  }

  var scenes = {
    staircase_lens: "Crystal Ball&Archway",
    lego_mirror: "Lego&Mirror",
    classroom_1000_1200: "Classroom",
    coffee_tea: "Glass Teapot"
  };
  var viewPerimeter = [];
  var cache = Object.create(null);
  var state = {
    scene: "staircase_lens",
    focusDist: 0,
    focusDirection: 1,
    viewDist: 2,
    viewIndex: 0
  };
  var focusTimer = null;
  var viewTimer = null;
  var focusPlaying = true;
  var focusFrameInterval = (900 / 4) / 1.5;
  var viewFrameInterval = (1000 / 13.6) / 1.3;
  var currentFocusPath = "";
  var currentViewPath = "";

  for (var topX = 1; topX <= 7; topX += 1) {
    viewPerimeter.push([topX, 1]);
  }
  for (var rightY = 2; rightY <= 7; rightY += 1) {
    viewPerimeter.push([7, rightY]);
  }
  for (var bottomX = 6; bottomX >= 1; bottomX -= 1) {
    viewPerimeter.push([bottomX, 7]);
  }
  for (var leftY = 6; leftY >= 2; leftY -= 1) {
    viewPerimeter.push([1, leftY]);
  }

  function imagePath(scene, viewX, viewY, dist) {
    return "./static/images/reconstruction/full/" + scene + "/recon_amp_view_" +
      viewX + "_" + viewY + "_dist_" + dist + "_tm_24.jpg";
  }

  function preloadPath(path) {
    if (cache[path]) {
      return;
    }
    cache[path] = new Image();
    cache[path].src = path;
  }

  function preloadScene(scene) {
    for (var dist = 0; dist <= 4; dist += 1) {
      preloadPath(imagePath(scene, 0, 0, dist));
      viewPerimeter.forEach(function (view) {
        preloadPath(imagePath(scene, view[0], view[1], dist));
      });
    }
  }

  function setImages() {
    var view = viewPerimeter[state.viewIndex];
    var sceneLabel = scenes[state.scene];
    var nextFocusPath = imagePath(state.scene, 0, 0, state.focusDist);
    var nextViewPath = imagePath(state.scene, view[0], view[1], state.viewDist);

    if (currentFocusPath !== nextFocusPath) {
      focusImage.src = nextFocusPath;
      currentFocusPath = nextFocusPath;
    }
    focusImage.alt = "HoloPathTracer-Full focal sweep reconstruction of the " +
      sceneLabel + " scene at focus distance " + state.focusDist + ".";
    if (currentViewPath !== nextViewPath) {
      viewImage.src = nextViewPath;
      currentViewPath = nextViewPath;
    }
    viewImage.alt = "HoloPathTracer-Full clockwise view-dependent reconstruction of the " +
      sceneLabel + " scene at view " + view[0] + ", " + view[1] +
      " and focus distance " + state.viewDist + ".";
  }

  function advanceFocus() {
    if (state.focusDist >= 4) {
      state.focusDirection = -1;
    } else if (state.focusDist <= 0) {
      state.focusDirection = 1;
    }

    state.focusDist += state.focusDirection;
    setImages();
  }

  function advanceView() {
    state.viewIndex = (state.viewIndex + 1) % viewPerimeter.length;
    setImages();
  }

  function setScene(scene) {
    if (!scenes[scene]) {
      return;
    }

    state.scene = scene;
    state.focusDist = 0;
    state.focusDirection = 1;
    state.viewIndex = 0;
    if (viewFocusInput) {
      state.viewDist = Number(viewFocusInput.value);
    }
    sceneButtons.forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-dynamic-scene-option") === scene);
    });
    setImages();
    preloadScene(scene);
  }

  function updateFocusPlayControl() {
    if (!focusPlayButton) {
      return;
    }

    focusPlayButton.classList.toggle("is-active", focusPlaying);
    focusPlayButton.setAttribute("aria-pressed", focusPlaying ? "true" : "false");
    focusPlayButton.setAttribute("aria-label", focusPlaying ? "Pause Natural Defocus" : "Play Natural Defocus");
  }

  function startFocusTimer() {
    if (focusPlaying && !focusTimer) {
      focusTimer = window.setInterval(advanceFocus, focusFrameInterval);
    }
  }

  function stopFocusTimer() {
    if (focusTimer) {
      window.clearInterval(focusTimer);
      focusTimer = null;
    }
  }

  function startViewTimer() {
    if (!viewTimer) {
      viewTimer = window.setInterval(advanceView, viewFrameInterval);
    }
  }

  function stopViewTimer() {
    if (viewTimer) {
      window.clearInterval(viewTimer);
      viewTimer = null;
    }
  }

  function startTimers() {
    startFocusTimer();
    startViewTimer();
  }

  function stopTimers() {
    stopFocusTimer();
    stopViewTimer();
  }

  sceneButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setScene(button.getAttribute("data-dynamic-scene-option"));
    });
  });

  if (viewFocusInput) {
    viewFocusInput.addEventListener("input", function () {
      state.viewDist = Number(viewFocusInput.value);
      setImages();
    });
  }

  if (focusPlayButton) {
    focusPlayButton.addEventListener("click", function () {
      focusPlaying = !focusPlaying;
      if (focusPlaying) {
        startFocusTimer();
      } else {
        stopFocusTimer();
      }
      updateFocusPlayControl();
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopTimers();
    } else {
      startTimers();
    }
  });
  window.addEventListener("pagehide", stopTimers);

  updateFocusPlayControl();
  setScene(state.scene);
  startTimers();
}

function initReconstructionViewer() {
  var root = document.querySelector("[data-reconstruction-viewer]");
  if (!root) {
    return;
  }

  var image = root.querySelector("#reconstruction-image");
  var pad = root.querySelector("[data-view-pad]");
  var eye = root.querySelector("[data-view-eye]");
  var focusLens = root.querySelector("[data-focus-lens]");
  var zSlider = root.querySelector("[data-view-z-slider]");
  var autoPlayButton = root.querySelector("[data-auto-play]");
  var autoModeSelector = root.querySelector(".auto-mode-selector");
  var autoModeButtons = Array.prototype.slice.call(root.querySelectorAll("[data-auto-mode]"));
  var depthControl = root.querySelector("[data-depth-control]");
  var focusDiagramMain = root.querySelector(".focus-diagram-main");
  var focusEyeStatic = root.querySelector(".focus-eye-static");
  var diagramLens = root.querySelector("[data-diagram-lens]");
  var focusPoint = root.querySelector("[data-focus-point]");
  var focusAssistTop = root.querySelector("[data-focus-assist-top]");
  var focusAssistBottom = root.querySelector("[data-focus-assist-bottom]");
  var eyeRayLeftTop = root.querySelector("[data-eye-ray-left-top]");
  var eyeRayLeftBottom = root.querySelector("[data-eye-ray-left-bottom]");
  var methodButtons = Array.prototype.slice.call(root.querySelectorAll("[data-method-option]"));
  var sceneButtons = Array.prototype.slice.call(root.querySelectorAll("[data-scene-option]"));
  var xLabel = root.querySelector("[data-view-x]");
  var yLabel = root.querySelector("[data-view-y]");
  var methods = {
    full: {
      label: "HoloPathTracer-Full (Ours)",
      prefix: "recon_amp_view_",
      suffix: "_tm_24.jpg"
    },
    fast: {
      label: "HoloPathTracer-Fast (Ours)",
      prefix: "recon_amp_view_",
      suffix: "_tm_24.jpg"
    },
    focalstack: {
      label: "Image-based (Focalstack)",
      prefix: "recon_amp_view_",
      suffix: ".jpg"
    },
    mitsuba: {
      label: "GT (Mitsuba renderer)",
      prefix: "render_view_",
      suffix: ".jpg"
    }
  };
  var scenes = {
    lego_mirror: "Lego&Mirror",
    coffee_tea: "Glass Teapot",
    bathroom_1000_1200_f27: "Bathroom",
    staircase_lens: "Crystal Ball&Archway",
    classroom_1000_1200: "Classroom"
  };
  var cache = Object.create(null);
  var preloadedScenes = Object.create(null);
  var state = { method: "full", scene: "lego_mirror", x: 0, y: 0, z: 0 };
  var currentImagePath = "";
  var dragging = false;
  var depthDragging = false;
  var wheelAccumulator = 0;
  var focusNearX = 0;
  var focusFarX = 100;
  var autoMode = "default";
  var autoPlaying = true;
  var autoFrameId = null;
  var autoTimelineStart = 0;
  var autoFocusRangeDuration = 900;
  var autoSquareHalfSize = 3;
  var autoSquarePerimeter = autoSquareHalfSize * 8;
  var autoEyeSpeed = 13.6;
  var autoIntroSegments = [];
  var autoIntroDuration = 0;
  var autoCycleSegments = [];
  var autoCycleDuration = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function quantize(value, min, max) {
    return clamp(Math.round(value), min, max);
  }

  function angleLabel(value) {
    return (value / 6).toFixed(2) + "\u00b0";
  }

  function imagePathForFile(method, scene, fileX, fileY, dist) {
    var methodConfig = methods[method];
    return "./static/images/reconstruction/" + method + "/" + scene + "/" +
      methodConfig.prefix + fileX + "_" + fileY + "_dist_" + dist + methodConfig.suffix;
  }

  function imagePath(method, scene, x, y, z) {
    var fileX = quantize(x, -3, 3) + 4;
    var fileY = quantize(y, -3, 3) + 4;
    var dist = quantize(z, -2, 2) + 2;
    return imagePathForFile(method, scene, fileX, fileY, dist);
  }

  function updateEyeFocus(z) {
    var nearRatio = 1 - ((z + 2) / 4);
    var controlWidth = 52.8;
    var cx = 56;
    var cy = 28;
    var halfHeight = (10 + nearRatio * 8) * 1.5;
    var top = cy - halfHeight;
    var bottom = cy + halfHeight;

    focusLens.setAttribute(
      "d",
      "M " + cx + " " + top.toFixed(1) +
      " C " + (cx + controlWidth).toFixed(1) + " " + (top + 6).toFixed(1) +
      " " + (cx + controlWidth).toFixed(1) + " " + (bottom - 6).toFixed(1) +
      " " + cx + " " + bottom.toFixed(1) +
      " C " + (cx - controlWidth).toFixed(1) + " " + (bottom - 6).toFixed(1) +
      " " + (cx - controlWidth).toFixed(1) + " " + (top + 6).toFixed(1) +
      " " + cx + " " + top.toFixed(1) + " Z"
    );
  }

  function focusXForZ(z) {
    return focusNearX + ((z + 2) / 4) * (focusFarX - focusNearX);
  }

  function focusTextForZ(z) {
    if (z <= -2) {
      return "Near focus";
    }
    if (z >= 2) {
      return "Far focus";
    }
    return z < 0 ? "Near-middle focus" : z > 0 ? "Far-middle focus" : "Middle focus";
  }

  function updateDepthDiagram(z) {
    if (!depthControl || !diagramLens || !focusPoint) {
      return;
    }

    var focusX = focusXForZ(z);
    var nearRatio = 1 - ((z + 2) / 4);
    var lensRadiusX = 16 + nearRatio * 12;
    var lensLeft = 316.5 - lensRadiusX;
    var lensRight = 316.5 + lensRadiusX;

    focusPoint.style.left = focusX.toFixed(1) + "%";
    diagramLens.setAttribute("rx", lensRadiusX.toFixed(1));
    if (eyeRayLeftTop && eyeRayLeftBottom) {
      eyeRayLeftTop.setAttribute("d", "M71.5 196.21193L" + lensLeft.toFixed(1) + " 147.21193");
      eyeRayLeftBottom.setAttribute("d", "M71.5 196.21193L" + lensLeft.toFixed(1) + " 246.21193");
    }
    if (focusAssistTop && focusAssistBottom && focusDiagramMain && focusEyeStatic) {
      var mainRect = focusDiagramMain.getBoundingClientRect();
      var eyeRect = focusEyeStatic.getBoundingClientRect();
      var controlRect = depthControl.getBoundingClientRect();

      if (mainRect.width && mainRect.height && eyeRect.width && eyeRect.height && controlRect.width) {
        var svgWidth = 430;
        var svgHeight = 378.7717;
        var focusTargetX = ((controlRect.left - mainRect.left + (focusX / 100) * controlRect.width) / mainRect.width) * 100;
        var focusTargetY = ((controlRect.top - mainRect.top + controlRect.height / 2) / mainRect.height) * 100;

        function svgXToMain(x) {
          return ((eyeRect.left - mainRect.left + (x / svgWidth) * eyeRect.width) / mainRect.width) * 100;
        }

        function svgYToMain(y) {
          return ((eyeRect.top - mainRect.top + (y / svgHeight) * eyeRect.height) / mainRect.height) * 100;
        }

        function point(x, y) {
          return x.toFixed(1) + " " + y.toFixed(1);
        }

        var lensRightX = svgXToMain(lensRight);
        var lensTopY = svgYToMain(147.21193);
        var lensBottomY = svgYToMain(246.21193);

        focusAssistTop.setAttribute(
          "d",
          "M" + point(lensRightX, lensTopY) +
            "L" + point(focusTargetX, focusTargetY)
        );
        focusAssistBottom.setAttribute(
          "d",
          "M" + point(lensRightX, lensBottomY) +
            "L" + point(focusTargetX, focusTargetY)
        );
      }
    }
    depthControl.setAttribute("aria-valuenow", String(z));
    depthControl.setAttribute("aria-valuetext", focusTextForZ(z));
  }

  function zFromFocusPointer(event) {
    if (!depthControl) {
      return state.z;
    }

    var rect = depthControl.getBoundingClientRect();
    var localX = clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100;
    var ratio = clamp((localX - focusNearX) / (focusFarX - focusNearX), 0, 1);
    return Math.round(ratio * 4) - 2;
  }

  function setDepthFromPointer(event) {
    setState({ x: state.x, y: state.y, z: zFromFocusPointer(event) });
  }

  function preloadPath(path) {
    if (cache[path]) {
      return;
    }
    cache[path] = new Image();
    cache[path].src = path;
  }

  function preload(x, y, z) {
    preloadPath(imagePath(state.method, state.scene, x, y, z));
  }

  function preloadScene(method, scene) {
    var preloadKey = method + ":" + scene;
    if (preloadedScenes[preloadKey]) {
      return;
    }
    preloadedScenes[preloadKey] = "loading";
    var paths = [];

    for (var dist = 0; dist <= 4; dist += 1) {
      paths.push(imagePathForFile(method, scene, 0, 0, dist));
      for (var fileX = 1; fileX <= 7; fileX += 1) {
        for (var fileY = 1; fileY <= 7; fileY += 1) {
          paths.push(imagePathForFile(method, scene, fileX, fileY, dist));
        }
      }
    }

    var index = 0;
    function loadBatch() {
      var end = Math.min(index + 12, paths.length);
      for (; index < end; index += 1) {
        preloadPath(paths[index]);
      }

      if (index < paths.length) {
        window.setTimeout(loadBatch, 25);
      } else {
        preloadedScenes[preloadKey] = true;
      }
    }

    window.setTimeout(loadBatch, 0);
  }

  function preloadNeighbors() {
    var baseX = quantize(state.x, -3, 3);
    var baseY = quantize(state.y, -3, 3);
    var baseZ = quantize(state.z, -2, 2);
    var candidates = [
      [baseX, baseY, baseZ],
      [baseX - 1, baseY, baseZ],
      [baseX + 1, baseY, baseZ],
      [baseX, baseY - 1, baseZ],
      [baseX, baseY + 1, baseZ],
      [baseX, baseY, baseZ - 1],
      [baseX, baseY, baseZ + 1]
    ];

    candidates.forEach(function (candidate) {
      var x = candidate[0];
      var y = candidate[1];
      var z = candidate[2];
      if (x >= -3 && x <= 3 && y >= -3 && y <= 3 && z >= -2 && z <= 2) {
        preload(x, y, z);
      }
    });
  }

  function gridCenterPercent(value) {
    return (((3 - value) + 0.5) / 7) * 100;
  }

  function setState(next) {
    state.x = clamp(next.x, -3, 3);
    state.y = clamp(next.y, -3, 3);
    state.z = clamp(next.z, -2, 2);

    var nextImagePath = imagePath(state.method, state.scene, state.x, state.y, state.z);
    if (currentImagePath !== nextImagePath) {
      image.src = nextImagePath;
      currentImagePath = nextImagePath;
    }
    image.alt = "Interactive holographic reconstruction of the " +
      scenes[state.scene] + " scene using " + methods[state.method].label + ".";
    eye.style.left = gridCenterPercent(state.x) + "%";
    eye.style.top = gridCenterPercent(state.y) + "%";
    updateEyeFocus(state.z);
    updateDepthDiagram(state.z);
    if (zSlider) {
      zSlider.value = state.z;
    }
    xLabel.textContent = angleLabel(state.x);
    yLabel.textContent = angleLabel(state.y);
    preloadNeighbors();
  }

  function autoSquarePathForState() {
    var side = autoSquareHalfSize * 2;
    var screenX = -state.x;
    var screenY = -state.y;
    var maxMagnitude = Math.max(Math.abs(screenX), Math.abs(screenY));
    if (maxMagnitude < 0.1) {
      return autoSquareHalfSize;
    }

    var scale = autoSquareHalfSize / maxMagnitude;
    var x = clamp(screenX * scale, -autoSquareHalfSize, autoSquareHalfSize);
    var y = clamp(screenY * scale, -autoSquareHalfSize, autoSquareHalfSize);
    var epsilon = 0.001;

    if (Math.abs(y + autoSquareHalfSize) < epsilon) {
      return x + autoSquareHalfSize;
    }
    if (Math.abs(x - autoSquareHalfSize) < epsilon) {
      return side + y + autoSquareHalfSize;
    }
    if (Math.abs(y - autoSquareHalfSize) < epsilon) {
      return side * 2 + autoSquareHalfSize - x;
    }
    return side * 3 + autoSquareHalfSize - y;
  }

  function autoSquareStateForDistance(distance) {
    var side = autoSquareHalfSize * 2;
    var pathDistance = ((distance % autoSquarePerimeter) + autoSquarePerimeter) % autoSquarePerimeter;
    var screenX;
    var screenY;

    if (pathDistance < side) {
      screenX = -autoSquareHalfSize + pathDistance;
      screenY = -autoSquareHalfSize;
    } else if (pathDistance < side * 2) {
      screenX = autoSquareHalfSize;
      screenY = -autoSquareHalfSize + (pathDistance - side);
    } else if (pathDistance < side * 3) {
      screenX = autoSquareHalfSize - (pathDistance - side * 2);
      screenY = autoSquareHalfSize;
    } else {
      screenX = -autoSquareHalfSize;
      screenY = autoSquareHalfSize - (pathDistance - side * 3);
    }

    return {
      x: -screenX,
      y: -screenY
    };
  }

  function distanceXY(from, to) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function durationForTransition(from, to) {
    var xyDuration = (distanceXY(from, to) / autoEyeSpeed) * 1000;
    var focusDuration = (Math.abs(to.z - from.z) / 4) * autoFocusRangeDuration;
    return Math.max(xyDuration, focusDuration);
  }

  function cloneState(value) {
    return { x: value.x, y: value.y, z: value.z };
  }

  function addLinearSegment(segments, from, to) {
    var start = cloneState(from);
    var end = cloneState(to);
    var duration = durationForTransition(start, end);

    if (duration > 0) {
      segments.push({
        duration: duration,
        from: start,
        kind: "linear",
        to: end
      });
    }

    return end;
  }

  function addSquareSegment(segments, from, laps) {
    var startPath = autoSquarePathForState();
    if (from.x !== state.x || from.y !== state.y) {
      var screenX = -from.x;
      var screenY = -from.y;
      var side = autoSquareHalfSize * 2;
      if (Math.abs(screenY + autoSquareHalfSize) < 0.001) {
        startPath = screenX + autoSquareHalfSize;
      } else if (Math.abs(screenX - autoSquareHalfSize) < 0.001) {
        startPath = side + screenY + autoSquareHalfSize;
      } else if (Math.abs(screenY - autoSquareHalfSize) < 0.001) {
        startPath = side * 2 + autoSquareHalfSize - screenX;
      } else {
        startPath = side * 3 + autoSquareHalfSize - screenY;
      }
    }
    var travel = autoSquarePerimeter * laps;
    var endXY = autoSquareStateForDistance(startPath + travel);
    var end = { x: endXY.x, y: endXY.y, z: from.z };

    segments.push({
      duration: (travel / autoEyeSpeed) * 1000,
      kind: "square",
      startPath: startPath,
      travel: travel,
      z: from.z
    });

    return end;
  }

  function addFocusRoundTrips(segments, from, finalZ) {
    var current = addLinearSegment(segments, from, { x: from.x, y: from.y, z: -2 });

    current = addLinearSegment(segments, current, { x: current.x, y: current.y, z: 2 });
    current = addLinearSegment(segments, current, { x: current.x, y: current.y, z: -2 });
    current = addLinearSegment(segments, current, { x: current.x, y: current.y, z: 2 });
    current = addLinearSegment(segments, current, { x: current.x, y: current.y, z: -2 });

    return addLinearSegment(segments, current, { x: current.x, y: current.y, z: finalZ });
  }

  function segmentDuration(segments) {
    return segments.reduce(function (sum, segment) {
      return sum + segment.duration;
    }, 0);
  }

  function stateForSegment(segment, progress) {
    if (segment.kind === "square") {
      var xy = autoSquareStateForDistance(segment.startPath + segment.travel * progress);
      return { x: xy.x, y: xy.y, z: segment.z };
    }

    return {
      x: segment.from.x + (segment.to.x - segment.from.x) * progress,
      y: segment.from.y + (segment.to.y - segment.from.y) * progress,
      z: segment.from.z + (segment.to.z - segment.from.z) * progress
    };
  }

  function stateForSegments(segments, elapsed) {
    var remaining = elapsed;

    for (var index = 0; index < segments.length; index += 1) {
      var segment = segments[index];
      if (remaining <= segment.duration) {
        return stateForSegment(segment, clamp(remaining / segment.duration, 0, 1));
      }
      remaining -= segment.duration;
    }

    if (!segments.length) {
      return cloneState(state);
    }

    return stateForSegment(segments[segments.length - 1], 1);
  }

  function buildDefaultTimeline() {
    var intro = [];
    var current = addLinearSegment(intro, state, { x: 0, y: 0, z: -2 });
    var cycle = [];

    current = { x: 0, y: 0, z: -2 };
    current = addLinearSegment(cycle, current, { x: 0, y: 3, z: current.z });
    current = addSquareSegment(cycle, current, 2);
    current = addLinearSegment(cycle, current, { x: 0, y: 0, z: current.z });
    current = addFocusRoundTrips(cycle, current, 0);

    current = addLinearSegment(cycle, current, { x: 0, y: 3, z: current.z });
    current = addSquareSegment(cycle, current, 2);
    current = addLinearSegment(cycle, current, { x: 0, y: 0, z: current.z });
    current = addFocusRoundTrips(cycle, current, 2);

    current = addLinearSegment(cycle, current, { x: 0, y: 3, z: current.z });
    current = addSquareSegment(cycle, current, 2);
    current = addLinearSegment(cycle, current, { x: 0, y: 0, z: current.z });
    addLinearSegment(cycle, current, { x: 0, y: 0, z: -2 });

    autoIntroSegments = intro;
    autoIntroDuration = segmentDuration(intro);
    autoCycleSegments = cycle;
    autoCycleDuration = segmentDuration(cycle);
  }

  function buildViewTimeline() {
    var intro = [];
    var startPath = autoSquarePathForState();
    var startXY = autoSquareStateForDistance(startPath);
    var current = addLinearSegment(intro, state, { x: startXY.x, y: startXY.y, z: state.z });
    var cycle = [];

    addSquareSegment(cycle, current, 1);

    autoIntroSegments = intro;
    autoIntroDuration = segmentDuration(intro);
    autoCycleSegments = cycle;
    autoCycleDuration = segmentDuration(cycle);
  }

  function buildFocusTimeline() {
    var intro = [];
    var targetZ = state.z >= 1.95 ? -2 : 2;
    var current = addLinearSegment(intro, state, { x: 0, y: 0, z: state.z });
    current = addLinearSegment(intro, current, { x: 0, y: 0, z: targetZ });
    var oppositeZ = targetZ > 0 ? -2 : 2;
    var cycle = [];

    current = addLinearSegment(cycle, current, { x: current.x, y: current.y, z: oppositeZ });
    addLinearSegment(cycle, current, { x: current.x, y: current.y, z: targetZ });

    autoIntroSegments = intro;
    autoIntroDuration = segmentDuration(intro);
    autoCycleSegments = cycle;
    autoCycleDuration = segmentDuration(cycle);
  }

  function buildAutoTimeline() {
    if (autoMode === "view") {
      buildViewTimeline();
    } else if (autoMode === "focus") {
      buildFocusTimeline();
    } else {
      buildDefaultTimeline();
    }
  }

  function updateAutoControls() {
    if (autoModeSelector) {
      autoModeSelector.setAttribute("data-mode", autoMode);
    }
    autoModeButtons.forEach(function (button) {
      var isActive = button.getAttribute("data-auto-mode") === autoMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    if (autoPlayButton) {
      autoPlayButton.classList.toggle("is-active", autoPlaying);
      autoPlayButton.setAttribute("aria-pressed", autoPlaying ? "true" : "false");
      autoPlayButton.setAttribute("aria-label", autoPlaying ? "Pause Auto Play" : "Start Auto Play");
    }
  }

  function requestAutoFrame() {
    if (!autoFrameId) {
      autoFrameId = window.requestAnimationFrame(autoTick);
    }
  }

  function startAutoPlayback() {
    autoPlaying = true;
    autoTimelineStart = performance.now();
    buildAutoTimeline();
    updateAutoControls();
    requestAutoFrame();
  }

  function stopAutoPlayback() {
    autoPlaying = false;
    if (autoFrameId) {
      window.cancelAnimationFrame(autoFrameId);
      autoFrameId = null;
    }
    updateAutoControls();
  }

  function autoTick(now) {
    autoFrameId = null;
    if (!autoPlaying) {
      return;
    }

    var elapsed = now - autoTimelineStart;
    var next;

    if (elapsed < autoIntroDuration) {
      next = stateForSegments(autoIntroSegments, elapsed);
    } else if (autoCycleDuration > 0) {
      next = stateForSegments(autoCycleSegments, (elapsed - autoIntroDuration) % autoCycleDuration);
    } else {
      next = cloneState(state);
    }

    setState(next);
    requestAutoFrame();
  }

  function setXYFromPointer(event) {
    var rect = pad.getBoundingClientRect();
    var localX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    var localY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    var column = clamp(Math.floor(localX * 7), 0, 6);
    var row = clamp(Math.floor(localY * 7), 0, 6);
    setState({
      x: 3 - column,
      y: 3 - row,
      z: state.z
    });
  }

  autoModeButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var mode = button.getAttribute("data-auto-mode");
      if (!mode || mode === autoMode) {
        return;
      }
      autoMode = mode;
      if (autoPlaying) {
        startAutoPlayback();
      } else {
        updateAutoControls();
      }
    });
  });

  if (autoPlayButton) {
    autoPlayButton.addEventListener("click", function () {
      if (autoPlaying) {
        stopAutoPlayback();
      } else {
        startAutoPlayback();
      }
    });
  }

  pad.addEventListener("pointerdown", function (event) {
    stopAutoPlayback();
    dragging = true;
    pad.setPointerCapture(event.pointerId);
    setXYFromPointer(event);
    event.preventDefault();
  });

  pad.addEventListener("pointermove", function (event) {
    if (!dragging) {
      return;
    }
    setXYFromPointer(event);
    event.preventDefault();
  });

  pad.addEventListener("pointerup", function (event) {
    dragging = false;
    pad.releasePointerCapture(event.pointerId);
  });

  pad.addEventListener("pointercancel", function () {
    dragging = false;
  });

  pad.addEventListener("wheel", function (event) {
    stopAutoPlayback();
    wheelAccumulator += event.deltaY;

    if (Math.abs(wheelAccumulator) >= 60) {
      var direction = wheelAccumulator > 0 ? 1 : -1;
      setState({ x: state.x, y: state.y, z: state.z + direction });
      wheelAccumulator = 0;
    }

    event.preventDefault();
  }, { passive: false });

  eye.addEventListener("keydown", function (event) {
    var next = { x: state.x, y: state.y, z: state.z };
    if (event.key === "ArrowLeft") next.x += 1;
    if (event.key === "ArrowRight") next.x -= 1;
    if (event.key === "ArrowUp") next.y += 1;
    if (event.key === "ArrowDown") next.y -= 1;
    if (event.key === "PageUp") next.z += 1;
    if (event.key === "PageDown") next.z -= 1;

    if (next.x !== state.x || next.y !== state.y || next.z !== state.z) {
      stopAutoPlayback();
      setState(next);
      event.preventDefault();
    }
  });

  if (zSlider) {
    zSlider.addEventListener("input", function () {
      stopAutoPlayback();
      setState({ x: state.x, y: state.y, z: Number(zSlider.value) });
    });
  }

  if (depthControl) {
    depthControl.addEventListener("pointerdown", function (event) {
      stopAutoPlayback();
      depthDragging = true;
      depthControl.setPointerCapture(event.pointerId);
      setDepthFromPointer(event);
      event.preventDefault();
    });

    depthControl.addEventListener("pointermove", function (event) {
      if (!depthDragging) {
        return;
      }
      setDepthFromPointer(event);
      event.preventDefault();
    });

    depthControl.addEventListener("pointerup", function (event) {
      depthDragging = false;
      if (depthControl.hasPointerCapture(event.pointerId)) {
        depthControl.releasePointerCapture(event.pointerId);
      }
    });

    depthControl.addEventListener("pointercancel", function () {
      depthDragging = false;
    });

    depthControl.addEventListener("keydown", function (event) {
      var nextZ = state.z;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") nextZ -= 1;
      if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown") nextZ += 1;
      if (event.key === "Home") nextZ = -2;
      if (event.key === "End") nextZ = 2;

      if (nextZ !== state.z) {
        stopAutoPlayback();
        setState({ x: state.x, y: state.y, z: nextZ });
        event.preventDefault();
      }
    });
  }

  methodButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var method = button.getAttribute("data-method-option");
      if (!methods[method] || method === state.method) {
        return;
      }
      state.method = method;
      methodButtons.forEach(function (option) {
        option.classList.toggle("is-active", option === button);
      });
      setState(state);
      preloadScene(method, state.scene);
    });
  });

  sceneButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var scene = button.getAttribute("data-scene-option");
      if (!scenes[scene] || scene === state.scene) {
        return;
      }
      state.scene = scene;
      sceneButtons.forEach(function (option) {
        option.classList.toggle("is-active", option === button);
      });
      setState(state);
      preloadScene(state.method, scene);
    });
  });

  image.addEventListener("dragstart", function (event) {
    event.preventDefault();
  });

  window.addEventListener("resize", function () {
    updateDepthDiagram(state.z);
  });

  window.addEventListener("pagehide", function () {
    stopAutoPlayback();
  });

  updateAutoControls();
  setState(state);
  startAutoPlayback();
  window.setTimeout(function () {
    preloadScene(state.method, state.scene);
  }, 250);
}
