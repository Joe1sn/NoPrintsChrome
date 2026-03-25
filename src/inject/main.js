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
          downscalePerturb(self);                  // ====== 1. 分辨率扰动 ======
          const modified = perturb(self);          // ====== 2. 像素扰动 ======
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

  // ====== 新增：hook getImageData（关键）======
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
      "NVIDIA Corporation",
      "ATI Technologies Inc.",
      "CQUPT Anfa Labs"
    ];

    const renderers = [
      "Intel Iris OpenGL Engine",
      "NVIDIA GeForce GTX 1060",
      "NVIDIA GeForce RTX 6090Ti",
      "AMD Radeon Pro 560",
      "CQUPT Anfa Labs F1000"
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

  // ====== AudioContext 指纹混淆 ======
  (function () {
    // 固定 seed 保证会话内一致性
    const seed = Math.floor(Math.random() * 1e9);

    function deterministicRandom(index) {
      let n = seed * 73856093 ^ index * 19349663;
      return ((n % 1000) / 1000); // 0~1
    }

    // hook OfflineAudioContext.startRendering
    const origStartRendering = OfflineAudioContext.prototype.startRendering;

    OfflineAudioContext.prototype.startRendering = new Proxy(origStartRendering, {
      apply(target, self, args) {
        const promise = Reflect.apply(target, self, args);

        return promise.then(buffer => {
          if (!buffer || !buffer.getChannelData) return buffer;

          try {
            // 获取通道数据
            const channels = [];
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
              const data = buffer.getChannelData(ch);
              channels.push(new Float32Array(data)); // 深拷贝
            }

            // 应用确定性扰动（基于 seed 和 canvas ID）
            channels.forEach((data, chIndex) => {
              for (let i = 0; i < data.length; i++) {
                // 扰动幅度：±0.005~0.015 范围（增大3倍）
                const perturbAmount = (deterministicRandom(i + chIndex * 44100) - 0.5) * 0.02;
                data[i] += perturbAmount;
                // 保持数据在 [-1, 1] 范围内
                data[i] = Math.max(-1, Math.min(1, data[i]));
              }
            });

            // 创建新的 AudioBuffer 并填入扰动数据
            const audioContext = self;
            const newBuffer = audioContext.createBuffer(
              buffer.numberOfChannels,
              buffer.length,
              buffer.sampleRate
            );

            channels.forEach((data, chIndex) => {
              newBuffer.getChannelData(chIndex).set(data);
            });

            return newBuffer;
          } catch (e) {
            // 失败则返回原 buffer
            return buffer;
          }
        });
      }
    });

    // hook BaseAudioContext.createOscillator（修改频率微量）
    const origCreateOscillator = BaseAudioContext.prototype.createOscillator;

    BaseAudioContext.prototype.createOscillator = new Proxy(origCreateOscillator, {
      apply(target, self, args) {
        const osc = Reflect.apply(target, self, args);

        // 保存原始 frequency setter
        const freqDescriptor = Object.getOwnPropertyDescriptor(
          OscillatorNode.prototype,
          'frequency'
        );

        if (freqDescriptor && freqDescriptor.get) {
          // 如果是 getter/setter，无法直接重写，改为 hook start 方法
          const origStart = osc.start;
          osc.start = new Proxy(origStart, {
            apply(target, self, args) {
              // 在 start 时对频率做微小随机调整
              const perturbFreq = deterministicRandom(args[0] || 0) * 50 - 25; // ±25Hz（增大5倍）
              if (osc.frequency && typeof osc.frequency.value === 'number') {
                osc.frequency.value += perturbFreq;
              }
              return Reflect.apply(target, self, args);
            }
          });
        }

        return osc;
      }
    });

    // hook createDynamicsCompressor（修改压缩参数微量）
    const origCreateCompressor = BaseAudioContext.prototype.createDynamicsCompressor;

    BaseAudioContext.prototype.createDynamicsCompressor = new Proxy(origCreateCompressor, {
      apply(target, self, args) {
        const compressor = Reflect.apply(target, self, args);

        try {
          // 对压缩器参数进行微小随机调整（扰动幅度增大）
          const threshold = deterministicRandom(1) * 30 - 15; // ±15dB（增大3倍）
          const knee = deterministicRandom(2) * 30; // 0~30（增大3倍）
          const ratio = deterministicRandom(3) * 12 + 4; // 4~16（增大3倍）
          const attack = deterministicRandom(4) * 0.01; // 0~0.01s（增大5倍）
          const release = deterministicRandom(5) * 0.2 + 0.1; // 0.1~0.3s（增大4倍)

          if (compressor.threshold) compressor.threshold.value += threshold;
          if (compressor.knee) compressor.knee.value += knee;
          if (compressor.ratio) compressor.ratio.value += ratio;
          if (compressor.attack) compressor.attack.value += attack;
          if (compressor.release) compressor.release.value += release;
        } catch (e) {
          // 静默失败
        }

        return compressor;
      }
    });

    // hook AudioBuffer.getChannelData（返回扰动数据）
    const origGetChannelData = AudioBuffer.prototype.getChannelData;

    AudioBuffer.prototype.getChannelData = new Proxy(origGetChannelData, {
      apply(target, self, args) {
        const data = Reflect.apply(target, self, args);

        try {
          // 如果是来自 OfflineAudioContext，已在 startRendering 中处理过
          // 这里再额外做一次微小扰动以防直接读取
          if (data && data.length > 0) {
            const channelIndex = args[0] || 0;
            const result = new Float32Array(data);

            for (let i = 0; i < result.length; i++) {
              const perturbAmount = (deterministicRandom(i + channelIndex * self.length) - 0.5) * 0.008;
              result[i] += perturbAmount;
              result[i] = Math.max(-1, Math.min(1, result[i]));
            }

            return result;
          }
        } catch (e) {
          // 返回原数据
        }

        return data;
      }
    });

  })();

  // ====== Font Fingerprint Obfuscation ======
  (function () {
    'use strict';

    // Session 随机
    const SEED = crypto.getRandomValues(new Uint32Array(1))[0];

    const rand = (x = 1) => {
      const s = Math.sin(SEED + x) * 10000;
      return s - Math.floor(s);
    };

    const hash = str => {
      let h = 0;
      for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) + str.charCodeAt(i) | 0;
      }
      return h;
    };

    // 核心：字体存在性伪造
    const fontDecisionCache = new Map();

    const shouldFakeFont = (element) => {
      const font = element.style.fontFamily || '';

      if (!font) return false;

      if (!fontDecisionCache.has(font)) {
        // 每次访问随机决定哪些字体“存在”
        const decision = rand(hash(font)) > 0.5;
        fontDecisionCache.set(font, decision);
      }

      return fontDecisionCache.get(font);
    };

    // Hook offsetWidth / Height
    const patchOffset = (prop) => {
      const desc = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        prop
      );

      Object.defineProperty(HTMLElement.prototype, prop, {
        get: new Proxy(desc.get, {
          apply(target, self, args) {
            const value = Reflect.apply(target, self, args);

            try {
              if (shouldFakeFont(self)) {
                // 🎯 关键：制造“检测差异”
                return value + 1; // 强制不等
              }
            } catch (e) { }

            return value;
          }
        })
      });
    };

    patchOffset("offsetWidth");
    patchOffset("offsetHeight");

    // Hook getBoundingClientRect（防高级检测）
    const originalRect = Element.prototype.getBoundingClientRect;

    Element.prototype.getBoundingClientRect = new Proxy(originalRect, {
      apply(target, self, args) {
        const rect = Reflect.apply(target, self, args);

        if (shouldFakeFont(self)) {
          return new DOMRect(
            rect.x,
            rect.y,
            rect.width + 1,
            rect.height + 1
          );
        }

        return rect;
      }
    });
  })();

}