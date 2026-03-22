(function () {

    // 每个页面一个随机种子（保证稳定但每次刷新不同）
    const seed = Math.floor(Math.random() * 1e9);

    function hash(str) {
        let h = seed;
        for (let i = 0; i < str.length; i++) {
            h = (h ^ str.charCodeAt(i)) * 16777619;
        }
        return h >>> 0;
    }

    function noise(x, y, channel) {
        const n = hash(x + "," + y + "," + channel);
        return (n % 3) - 1; // -1 ~ +1
    }

    function perturbImageData(imageData) {
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const px = (i / 4) % imageData.width;
            const py = Math.floor((i / 4) / imageData.width);

            data[i] += noise(px, py, 0); // R
            data[i + 1] += noise(px, py, 1); // G
            data[i + 2] += noise(px, py, 2); // B
            // alpha 不动
        }

        return imageData;
    }

    function hook(win) {
        try {
            const CanvasProto = win.HTMLCanvasElement.prototype;
            const ContextProto = win.CanvasRenderingContext2D.prototype;

            const origToDataURL = CanvasProto.toDataURL;
            const origGetImageData = ContextProto.getImageData;

            // 🟢 Hook getImageData
            ContextProto.getImageData = new Proxy(origGetImageData, {
                apply(target, thisArg, args) {
                    const img = Reflect.apply(target, thisArg, args);
                    return perturbImageData(img);
                }
            });

            // 🟢 Hook toDataURL
            CanvasProto.toDataURL = new Proxy(origToDataURL, {
                apply(target, thisArg, args) {

                    try {
                        const ctx = thisArg.getContext("2d");
                        if (ctx) {
                            const w = thisArg.width;
                            const h = thisArg.height;

                            const img = origGetImageData.call(ctx, 0, 0, w, h);
                            const newImg = perturbImageData(img);
                            ctx.putImageData(newImg, 0, 0);
                        }
                    } catch (e) { }

                    return Reflect.apply(target, thisArg, args);
                }
            });

            // 🟢 伪装 toString（防检测）
            function fakeToString(fn) {
                return function () {
                    return "function toDataURL() { [native code] }";
                };
            }

            CanvasProto.toDataURL.toString = fakeToString(origToDataURL);
            ContextProto.getImageData.toString = fakeToString(origGetImageData);

        } catch (e) { }
    }

    // 主页面
    hook(window);

    // iframe（动态）
    new MutationObserver(() => {
        document.querySelectorAll("iframe").forEach(f => {
            try {
                if (f.contentWindow) hook(f.contentWindow);
            } catch (e) { }
        });
    }).observe(document, { childList: true, subtree: true });

})();