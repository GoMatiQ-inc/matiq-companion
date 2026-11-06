function configureUpdates(app, emit, providedUpdater) {
  const state = {
    status: app.isPackaged ? "idle" : "development",
    version: app.getVersion(),
    message: app.isPackaged
      ? "Check for a published update."
      : "Updates are available in installed release builds.",
  };
  let updater;
  if (app.isPackaged) {
    updater = providedUpdater || require("electron-updater").autoUpdater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.on("checking-for-update", () =>
      change({ status: "checking", message: "Checking published releases…" }),
    );
    updater.on("update-available", (info) =>
      change({
        status: "available",
        availableVersion: info.version,
        message: `Version ${info.version} is ready to download.`,
      }),
    );
    updater.on("update-not-available", () =>
      change({
        status: "current",
        message: "You have the latest published version.",
      }),
    );
    updater.on("download-progress", (p) =>
      change({
        status: "downloading",
        percent: Math.round(p.percent),
        message: "Downloading update…",
      }),
    );
    updater.on("update-downloaded", () =>
      change({
        status: "downloaded",
        message: "Downloaded. Restart to update when you are ready.",
      }),
    );
    updater.on("error", (e) => change({ status: "error", message: e.message }));
  }
  function change(value) {
    Object.assign(state, value);
    emit({ type: "update", state });
  }
  return {
    state,
    check: async () => {
      if (!updater) throw Error(state.message);
      if (state.status === "installing")
        throw Error("The update is installing. Complete any system authorization prompt.");
      return updater.checkForUpdates();
    },
    download: async () => {
      if (state.status !== "available")
        throw Error("Check for an available update first.");
      change({ status: "downloading", percent: 0, message: "Downloading update…" });
      try {
        await updater.downloadUpdate();
      } catch (error) {
        change({ status: "error", message: error.message });
        throw error;
      }
      return state;
    },
    install: () => {
      if (state.status !== "downloaded")
        throw Error("Download the update first.");
      change({
        status: "installing",
        message: process.platform === "darwin"
          ? "Installing update. Complete any macOS authorization prompt; the app will restart."
          : "Installing update. The app will restart when installation finishes.",
      });
      try {
        updater.quitAndInstall(true, true);
      } catch (error) {
        change({ status: "error", message: error.message });
        throw error;
      }
    },
  };
}
module.exports = { configureUpdates };
