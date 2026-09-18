#!/usr/bin/env node

// Keep this file dependency-free and compatible with Node 14.0.0. It is copied
// verbatim into dist, and must never statically import the application bundle.
var minimumNodeMajor = 22;
var nodeMajor = Number(process.versions.node.split('.')[0]);
var upgradeGuide = 'https://github.com/sirmalloc/ccstatusline/blob/main/docs/NODE-UPGRADE.md';
var args = process.argv.slice(2);

if (args.indexOf('--version') !== -1) {
    process.stdout.write('__PACKAGE_VERSION__\n');
} else if (process.versions.bun || nodeMajor >= minimumNodeMajor) {
    import('./ccstatusline-app.js').catch(function (error) {
        console.error(error);
        process.exitCode = 1;
    });
} else if (args.indexOf('--hook') === -1 && args.indexOf('--internal-refresh-git-review-cache') === -1) {
    var requirement = 'ccstatusline requires Node.js 22+ (running ' + process.versions.node + ')';
    var guideLink = '\x1b]8;;' + upgradeGuide + '\x1b\\Upgrade guide\x1b]8;;\x1b\\';

    if (process.stdin.isTTY) {
        process.stdout.write(requirement + '.\n\n'
            + 'Upgrade guide: ' + upgradeGuide + '\n\n'
            + 'Upgrade Node.js, then restart Claude Code from the updated terminal.\n'
            + 'Your ccstatusline settings have not been changed.\n');
    } else {
        // Claude displays stdout. Complete successfully so the upgrade notice
        // remains visible instead of turning into a failed status-line command.
        process.stdin.resume();
        process.stdin.on('end', function () {
            process.stdout.write(requirement + ' | ' + guideLink + '\n');
        });
    }
}
