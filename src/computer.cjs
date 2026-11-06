const { app, desktopCapturer, screen } = require("electron");
const { createWorker } = require("tesseract.js");
const language = require("@tesseract.js-data/eng");
const { computerAccess } = require("./computer-access.cjs");
function createComputer(window) {
  let observation = null, focusWindow = null;
  return async (name, args, signal) => {
    if (signal?.aborted) throw Error("Task stopped.");
    const access = computerAccess();
    if (process.platform === "darwin" && name === "observe_screen" && access.screen !== "granted")
      throw Error("Enable Screen Recording in Settings → Computer access, approve MatiQ Companion in macOS and restart the app before observing.");
    if (process.platform === "darwin" && name !== "observe_screen" && access.input !== "granted")
      throw Error("Enable Accessibility for MatiQ Companion in Settings → Computer access before controlling other apps.");
    window.hide();
    if(process.platform === "darwin") app.hide();
    try {
      await new Promise((r) => setTimeout(r, 350));
      if (signal?.aborted) throw Error("Task stopped.");
      const display = screen.getPrimaryDisplay();
      if (name === "observe_screen") {
        observation = null;
        focusWindow = process.platform === "win32" ? require("./windows-computer.cjs").foregroundWindow() : null;
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: {
            width: Math.min(1920, display.size.width * display.scaleFactor),
            height: Math.min(1200, display.size.height * display.scaleFactor),
          },
        });
        const source = sources.find((s) => s.display_id === String(display.id));
        if (!source || source.thumbnail.isEmpty())
          throw Error(
            "Screen capture is unavailable. Grant screen-recording access and retry.",
          );
        const worker = await createWorker("eng", 1, {
          langPath: language.langPath,
          gzip: true,
          cacheMethod: "none",
        });
        let timer;
        try {
          const recognized = await Promise.race([
            worker.recognize(source.thumbnail.toPNG(), {}, { blocks: true }),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(Error("Screen reading timed out.")),
                25000,
              );
            }),
          ]);
          const size = source.thumbnail.getSize();
          const words = [];
          for (const b of recognized.data.blocks || [])
            for (const p of b.paragraphs || [])
              for (const l of p.lines || [])
                for (const w of l.words || [])
                  words.push({
                    text: w.text,
                    x: Math.round(
                      (((w.bbox.x0 + w.bbox.x1) / 2) * display.size.width) /
                        size.width,
                    ),
                    y: Math.round(
                      (((w.bbox.y0 + w.bbox.y1) / 2) * display.size.height) /
                        size.height,
                    ),
                    confidence: w.confidence,
                  });
          observation = {
            time: Date.now(),
            display: display.id,
            width: display.size.width,
            height: display.size.height,
          };
          return {
            ...observation,
            text: recognized.data.text.slice(0, 12000),
            words: words.slice(0, 300),
            note: "Coordinates are primary-screen logical pixels. OCR is imperfect; inspect before acting.",
          };
        } finally {
          clearTimeout(timer);
          await worker.terminate();
        }
      }
      if (
        !observation ||
        Date.now() - observation.time > 30000 ||
        observation.display !== display.id
      )
        throw Error(
          "Observe the screen again before computer actions; the last observation is missing or stale.",
        );
      if (name === "click_screen") {
        if (
          !Number.isFinite(args.x) || !Number.isFinite(args.y) ||
          args.x < 0 ||
          args.y < 0 ||
          args.x >= display.size.width ||
          args.y >= display.size.height
        )
          throw Error(
            "Choose coordinates inside the observed primary display.",
          );
      } else if (name === "type_text" && args.text.length > 4000) {
        throw Error("Type at most 4000 characters per action.");
      } else if (!["click_screen", "type_text", "press_key"].includes(name)) throw Error("Unknown computer action.");
      observation = null;
      if (process.platform === "win32") {
        await require("./windows-computer.cjs").windowsInput(name, args, display, signal, focusWindow);
      } else if (process.platform === "darwin") {
        await require("./mac-computer.cjs").macInput(name, args, display, signal);
      } else {
        const nut = require("@nut-tree-fork/nut-js");
        if (name === "click_screen") {
          await nut.mouse.setPosition(new nut.Point(display.bounds.x + args.x, display.bounds.y + args.y));
          await nut.mouse.click(nut.Button.LEFT);
        } else if (name === "type_text") {
          await nut.keyboard.type(args.text);
        } else {
          const keys = { Enter: nut.Key.Return, Escape: nut.Key.Escape, Tab: nut.Key.Tab, Backspace: nut.Key.Backspace, Left: nut.Key.Left, Right: nut.Key.Right, Up: nut.Key.Up, Down: nut.Key.Down };
          if (!Object.hasOwn(keys, args.key)) throw Error("Choose a supported key.");
          await nut.keyboard.pressKey(keys[args.key]);
          await nut.keyboard.releaseKey(keys[args.key]);
        }
      }
      // Native input is queued by the OS; let the foreground application receive it before restoring Companion's focus.
      await new Promise((resolve) => setTimeout(resolve, 200));
      observation = null;
      return {
        attempted: true,
        note: "Input dispatched. Observe again to verify the outcome; success in the target application is not implied.",
      };
    } finally {
      if(process.platform === "darwin") app.show();
      window.show();
      window.focus();
    }
  };
}
module.exports = { createComputer };
