const stamp = () => new Date().toISOString();
module.exports = {
  info: (...a) => console.log(stamp(), '[info]', ...a),
  warn: (...a) => console.warn(stamp(), '[warn]', ...a),
  error: (...a) => console.error(stamp(), '[error]', ...a),
};
