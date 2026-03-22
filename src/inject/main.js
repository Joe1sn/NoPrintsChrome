{
  const port = document.createElement('div');
  port.id = 'cc-blck-fp';
  port.dataset.enabled = 'true'; // ✅ 默认开启
  document.documentElement.appendChild(port);

  // ====== 固定 seed（关键）======
  const seed = Math.floor(Math.random() * 1e9);

  function rand(x, y, c) {
    let n = x * 73856093 ^ y * 19349663 ^ c * 83492791 ^ seed;
    return (n % 3) - 1; // -1 ~ 1
  }

  const perturb = (canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const { width, height } = canvas;

    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (e) {
      return null;
    }

    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % width;
      const y = ((i / 4) / width) | 0;

      data[i] += rand(x, y, 0);
      data[i + 1] += rand(x, y, 1);
      data[i + 2] += rand(x, y, 2);
    }

    return imageData;
  };

  // ====== 分辨率压缩扰动 ======
  const downscalePerturb = (canvas) => {
    const w = canvas.width;
    const h = canvas.height;

    // 压缩比例（可调）
    const scale = 0.9; // 0.7~0.95 建议

    const w2 = Math.max(1, Math.floor(w * scale));
    const h2 = Math.max(1, Math.floor(h * scale));

    const tmp = document.createElement('canvas');
    tmp.width = w2;
    tmp.height = h2;

    const tctx = tmp.getContext('2d');
    if (!tctx) return null;

    // 先缩小
    tctx.drawImage(canvas, 0, 0, w2, h2);

    // 再拉伸回原尺寸
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(tmp, 0, 0, w, h);

    return true;
  };

  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;

  HTMLCanvasElement.prototype.toDataURL = new Proxy(origToDataURL, {
    apply(target, self, args) {
      if (port.dataset.enabled === 'true') {
        try {
          const ctx = self.getContext('2d');
          if (!ctx) return Reflect.apply(target, self, args);

          const { width, height } = self;

          const original = ctx.getImageData(0, 0, width, height);

          // ====== 1. 分辨率扰动 ======
          downscalePerturb(self);

          // ====== 2. 像素扰动 ======
          const modified = perturb(self);
          if (modified) ctx.putImageData(modified, 0, 0);

          const result = Reflect.apply(target, self, args);

          ctx.putImageData(original, 0, 0);

          return result;
        } catch (e) { }
      }
      return Reflect.apply(target, self, args);
    }
  });

  const origToBlob = HTMLCanvasElement.prototype.toBlob;

  HTMLCanvasElement.prototype.toBlob = new Proxy(origToBlob, {
    apply(target, self, args) {
      if (port.dataset.enabled === 'true') {
        try {
          const ctx = self.getContext('2d');
          if (!ctx) return Reflect.apply(target, self, args);

          const { width, height } = self;

          const original = ctx.getImageData(0, 0, width, height);

          const modified = perturb(self);
          if (modified) ctx.putImageData(modified, 0, 0);

          const callback = args[0];

          args[0] = function (blob) {
            ctx.putImageData(original, 0, 0);
            callback(blob);
          };

        } catch (e) { }
      }
      return Reflect.apply(target, self, args);
    }
  });

  // ====== 🔥 新增：hook getImageData（关键）======
  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

  CanvasRenderingContext2D.prototype.getImageData = new Proxy(origGetImageData, {
    apply(target, self, args) {
      const img = Reflect.apply(target, self, args);

      if (document.getElementById('cc-blck-fp')?.dataset.enabled === 'true') {
        return perturb(self.canvas) || img;
      }

      return img;
    }
  });

  const origFillText = CanvasRenderingContext2D.prototype.fillText;
  const origFillRect = CanvasRenderingContext2D.prototype.fillRect;

  const SHIFT_X = 0.3;
  const SHIFT_Y = 0.2;

  CanvasRenderingContext2D.prototype.fillText = new Proxy(origFillText, {
    apply(target, self, args) {
      if (document.getElementById('cc-blck-fp')?.dataset.enabled === 'true') {
        args[1] += SHIFT_X;
        args[2] += SHIFT_Y;
      }
      return Reflect.apply(target, self, args);
    }
  });

  CanvasRenderingContext2D.prototype.fillRect = new Proxy(origFillRect, {
    apply(target, self, args) {
      if (document.getElementById('cc-blck-fp')?.dataset.enabled === 'true') {
        args[0] += SHIFT_X;
        args[1] += SHIFT_Y;
      }
      return Reflect.apply(target, self, args);
    }
  });

  {
    const observe = e => {
      if (e.source && e.data === 'inject-script-into-source') {
        try {
          e.source.HTMLCanvasElement.prototype.toBlob = HTMLCanvasElement.prototype.toBlob;
          e.source.HTMLCanvasElement.prototype.toDataURL = HTMLCanvasElement.prototype.toDataURL;

          e.source.addEventListener('message', observe);
          port.dataset.dirty = false;
        }
        catch (e) { }
      }
    };
    addEventListener('message', observe);
  }

  // ====== WebGL Renderer Spoof ======

  (function () {

    const seed = Math.floor(Math.random() * 1e9);

    function pick(arr) {
      return arr[seed % arr.length];
    }

    const vendors = [
      "Intel Inc.",
      "NVIDIA Corporation",
      "ATI Technologies Inc."
    ];

    const renderers = [
      "Intel Iris OpenGL Engine",
      "NVIDIA GeForce GTX 1060",
      "AMD Radeon Pro 560"
    ];

    const fakeVendor = pick(vendors);
    const fakeRenderer = pick(renderers);

    function hookGL(proto) {
      if (!proto) return;

      const orig = proto.getParameter;

      proto.getParameter = new Proxy(orig, {
        apply(target, self, args) {

          const param = args[0];

          // WebGL debug extension constants
          if (param === 37445) { // UNMASKED_VENDOR_WEBGL
            return fakeVendor;
          }

          if (param === 37446) { // UNMASKED_RENDERER_WEBGL
            return fakeRenderer;
          }

          return Reflect.apply(target, self, args);
        }
      });
    }

    hookGL(WebGLRenderingContext.prototype);
    hookGL(WebGL2RenderingContext && WebGL2RenderingContext.prototype);

  })();

  // ====== hook getExtension ======

  (function () {

    const orig = WebGLRenderingContext.prototype.getExtension;

    WebGLRenderingContext.prototype.getExtension = new Proxy(orig, {
      apply(target, self, args) {
        const name = args[0];

        if (name === "WEBGL_debug_renderer_info") {
          return {
            UNMASKED_VENDOR_WEBGL: 37445,
            UNMASKED_RENDERER_WEBGL: 37446
          };
        }

        return Reflect.apply(target, self, args);
      }
    });

  })();
}