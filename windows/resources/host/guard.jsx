// app.path can refer to the installation root or application file depending on host.
// Folder.startup identifies the executable directory in ExtendScript.
function ZiXingCheckHost(expectedMajor, expectedExecutable) {
    function normalized(path) { return String(path).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase(); }
    var expected = normalized(expectedExecutable);
    var directory = expected.substring(0, expected.lastIndexOf('/'));
    var installed = normalized(app.path.fsName);
    var startup = normalized(Folder.startup.fsName);
    var pathMatches = startup === directory || installed === expected ||
        installed === directory || expected.indexOf(installed + '/') === 0;
    if (parseInt(app.version, 10) !== expectedMajor || !pathMatches) {
        throw Error('连接的 Illustrator 不是打开字醒的版本，请关闭其他版本后重试。');
    }
}
