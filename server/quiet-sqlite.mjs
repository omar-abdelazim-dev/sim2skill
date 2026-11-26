// node:sqlite is still flagged experimental; hide that one warning so server logs stay readable.
const emit = process.emitWarning;
if (!emit.__s2s) {
  process.emitWarning = function (warning, ...rest) {
    const text = typeof warning === 'string' ? warning : warning?.message;
    if (/SQLite is an experimental feature/i.test(text || '')) return;
    return emit.call(process, warning, ...rest);
  };
  process.emitWarning.__s2s = true;
}

