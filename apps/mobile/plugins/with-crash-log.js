// Config plugin: MainApplication writes uncaught native crashes (and the fatal JS errors React Native
// rethrows natively) to files/sonora-crash.txt before the app goes down; the app shows the text on
// the next start (src/platform/crash-log.ts).
const { withMainApplication } = require('expo/config-plugins');

const METHOD = `
  /** Writes uncaught crashes to files/sonora-crash.txt; the app shows them on the next start. */
  private fun installCrashLog() {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        java.io.File(filesDir, "sonora-crash.txt").writeText(
          "Native crash " + java.util.Date() + " (" + thread.name + ", Android " + android.os.Build.VERSION.RELEASE + ", " + android.os.Build.MODEL + ")\\n" +
            android.util.Log.getStackTraceString(error)
        )
      } catch (ignored: Throwable) {
      }
      previous?.uncaughtException(thread, error)
    }
  }
`;

module.exports = function withCrashLog(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (cfg.modResults.language !== 'kt' || src.includes('installCrashLog')) return cfg;
    if (!/super\.onCreate\(\)\n/.test(src)) throw new Error('with-crash-log: super.onCreate() not found in MainApplication');
    src = src.replace(/super\.onCreate\(\)\n/, 'super.onCreate()\n    installCrashLog()\n');
    const end = src.lastIndexOf('}');
    cfg.modResults.contents = src.slice(0, end) + METHOD + src.slice(end);
    return cfg;
  });
};
