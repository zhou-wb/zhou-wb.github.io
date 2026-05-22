document.addEventListener("DOMContentLoaded", function () {
  initComparisonViewer();
});

function initComparisonViewer() {
  var root = document.querySelector("[data-comparison-viewer]");
  if (!root) {
    return;
  }

  var images = {
    left: root.querySelector("[data-comparison-image='left']"),
    right: root.querySelector("[data-comparison-image='right']")
  };
  var frames = {
    left: images.left ? images.left.closest(".comparison-frame") : null,
    right: images.right ? images.right.closest(".comparison-frame") : null
  };
  var labels = {
    left: root.querySelector("[data-comparison-label='left']"),
    right: root.querySelector("[data-comparison-label='right']")
  };
  var methodSelects = {
    left: root.querySelector("[data-method-select='left']")
  };
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
  var sceneButtons = Array.prototype.slice.call(root.querySelectorAll("[data-scene-option]"));
  var xLabel = root.querySelector("[data-view-x]");
  var yLabel = root.querySelector("[data-view-y]");

  if (!images.left || !images.right || !pad || !eye) {
    return;
  }

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
      label: "Ground Truth (Mitsuba renderer)",
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
  var state = {
    leftMethod: "full",
    rightMethod: "mitsuba",
    scene: "lego_mirror",
    x: 0,
    y: 0,
    z: 0
  };
  var currentImagePaths = { left: "", right: "" };
  var dragging = false;
  var depthDragging = false;
  var wheelAccumulator = 0;
  var focusNearX = 6;
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
    if (!focusLens) {
      return;
    }

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

  function cacheEntry(path) {
    if (!cache[path]) {
      cache[path] = {
        image: null,
        loaded: false,
        failed: false
      };
    }
    return cache[path];
  }

  function markPathComplete(path, failed) {
    var entry = cacheEntry(path);
    entry.loaded = !failed;
    entry.failed = failed;
  }

  function isPathComplete(path) {
    var entry = cache[path];
    return !!(entry && (entry.loaded || entry.failed));
  }

  function setFrameLoading(frame, isLoading) {
    if (!frame) {
      return;
    }
    frame.classList.toggle("is-loading", isLoading);
    frame.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  function bindImageLoading(side) {
    images[side].addEventListener("load", function () {
      var targetPath = images[side].getAttribute("data-loading-src");
      if (targetPath) {
        markPathComplete(targetPath, false);
      }
      setFrameLoading(frames[side], false);
    });
    images[side].addEventListener("error", function () {
      var targetPath = images[side].getAttribute("data-loading-src");
      if (targetPath) {
        markPathComplete(targetPath, true);
      }
      setFrameLoading(frames[side], false);
    });
  }

  function setImageSource(side, path) {
    images[side].setAttribute("data-loading-src", path);
    if (images[side].getAttribute("src") !== path) {
      if (!isPathComplete(path)) {
        setFrameLoading(frames[side], true);
      }
      images[side].src = path;
    }
    if (isPathComplete(path) || (images[side].complete && images[side].naturalWidth > 0)) {
      markPathComplete(path, false);
      setFrameLoading(frames[side], false);
    } else {
      setFrameLoading(frames[side], true);
    }
  }

  function preloadPath(path) {
    var entry = cacheEntry(path);
    if (entry.image || entry.loaded || entry.failed) {
      return;
    }
    entry.image = new Image();
    entry.image.addEventListener("load", function () {
      entry.loaded = true;
    });
    entry.image.addEventListener("error", function () {
      entry.failed = true;
    });
    entry.image.src = path;
  }

  function preload(method, x, y, z) {
    preloadPath(imagePath(method, state.scene, x, y, z));
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
        preload(state.leftMethod, x, y, z);
        preload(state.rightMethod, x, y, z);
      }
    });
  }

  function gridCenterPercent(value) {
    return (((3 - value) + 0.5) / 7) * 100;
  }

  function updateSide(side) {
    var method = side === "left" ? state.leftMethod : state.rightMethod;
    var nextImagePath = imagePath(method, state.scene, state.x, state.y, state.z);

    if (currentImagePaths[side] !== nextImagePath) {
      setImageSource(side, nextImagePath);
      currentImagePaths[side] = nextImagePath;
    }

    images[side].alt = methods[method].label + " reconstruction of the " +
      scenes[state.scene] + " scene.";
    if (labels[side]) {
      labels[side].textContent = methods[method].label;
    }
    if (methodSelects[side]) {
      methodSelects[side].value = method;
    }
  }

  function setState(next) {
    state.x = clamp(next.x, -3, 3);
    state.y = clamp(next.y, -3, 3);
    state.z = clamp(next.z, -2, 2);

    updateSide("left");
    updateSide("right");
    eye.style.left = gridCenterPercent(state.x) + "%";
    eye.style.top = gridCenterPercent(state.y) + "%";
    updateEyeFocus(state.z);
    updateDepthDiagram(state.z);
    if (zSlider) {
      zSlider.value = state.z;
    }
    if (xLabel) {
      xLabel.textContent = angleLabel(state.x);
    }
    if (yLabel) {
      yLabel.textContent = angleLabel(state.y);
    }
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

  if (methodSelects.left) {
    methodSelects.left.addEventListener("change", function () {
      var method = methodSelects.left.value;
      if (!methods[method] || method === "mitsuba") {
        return;
      }
      state.leftMethod = method;
      setState(state);
      preloadScene(method, state.scene);
    });
  }

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
      preloadScene(state.leftMethod, scene);
      preloadScene(state.rightMethod, scene);
    });
  });

  Object.keys(images).forEach(function (side) {
    bindImageLoading(side);
    images[side].addEventListener("dragstart", function (event) {
      event.preventDefault();
    });
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
    preloadScene(state.leftMethod, state.scene);
    preloadScene(state.rightMethod, state.scene);
  }, 250);
}
