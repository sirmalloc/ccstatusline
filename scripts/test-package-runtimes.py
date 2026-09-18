#!/usr/bin/env python3
"""Exercise an npm tarball in real Node runtimes, including interactive PTYs."""

import argparse
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import struct
import subprocess
import tarfile
import tempfile
import termios
import time
import uuid


IMAGES = [
    "node:14.0.0-buster-slim",
    "node:14.21.3-bullseye-slim",
    "node:16.20.2-bullseye-slim",
    "node:18.20.8-bookworm-slim",
    "node:20-bookworm-slim",
    "node:21.7.3-bookworm-slim",
    "node:22.0.0-bookworm-slim",
    "node:22-bookworm-slim",
    "node:24-bookworm-slim",
]
GUIDE = "https://github.com/sirmalloc/ccstatusline/blob/main/docs/NODE-UPGRADE.md"
NOTICE = "ccstatusline requires Node.js 22+"
ENTRY = "/work/install/node_modules/.bin/ccstatusline"
ANSI = re.compile(r"\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]")


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def docker_command(image, work, interactive=False, name=None):
    command = ["docker", "run", "--rm", "--network", "none"]
    command.append("-it" if interactive else "-i")
    if name:
        command.extend(["--name", name])
    command.extend([
        "--mount", "type=bind,source=" + str(work) + ",target=/work",
        "-w", "/work",
        "-e", "CLAUDE_CONFIG_DIR=/work/claude",
        "-e", "npm_config_cache=/work/npm-cache",
        "-e", "npm_config_update_notifier=false",
        "-e", "CCSTATUSLINE_WIDTH=100",
        "-e", "TERM=xterm-256color",
        image,
    ])
    return command


def run(image, work, label, arguments, payload=None):
    name = "ccstatusline-smoke-" + uuid.uuid4().hex
    try:
        result = subprocess.run(
            docker_command(image, work, name=name) + arguments,
            input=payload, text=True, capture_output=True, timeout=60,
        )
    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)
        raise
    (work / (label + ".stdout")).write_text(result.stdout)
    (work / (label + ".stderr")).write_text(result.stderr)
    check(result.returncode == 0, label + " failed: " + result.stderr)
    return result


def interactive_test(image, work, supported):
    name = "ccstatusline-smoke-" + uuid.uuid4().hex
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 100, 0, 0))
    command = docker_command(image, work, interactive=True, name=name)
    process = subprocess.Popen(
        command + [ENTRY, "--config", "/work/settings.json"],
        stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
    )
    os.close(slave)
    output = bytearray()

    def read_available(timeout):
        if select.select([master], [], [], timeout)[0]:
            try:
                output.extend(os.read(master, 65536))
            except OSError as error:
                if error.errno != errno.EIO:
                    raise

    def wait_for(text, start=0):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            read_available(0.1)
            if text in ANSI.sub("", output[start:].decode("utf-8", errors="replace")):
                return
            if process.poll() is not None:
                break
        raise AssertionError("Interactive output did not contain: " + text)

    def press(keys, expected):
        start = len(output)
        os.write(master, keys)
        wait_for(expected, start)

    try:
        if supported:
            wait_for("Main Menu")
            press(b"\r", "Select Line to Edit Items")
            press(b"\r", "Edit Line 1")
            press(b"r", "(raw value)")
            press(b"\x13", "Configuration saved")
            os.write(master, b"\x03")
        else:
            wait_for(NOTICE)
        deadline = time.monotonic() + 15
        while process.poll() is None and time.monotonic() < deadline:
            read_available(0.1)
        check(process.poll() == 0, "Interactive command did not exit successfully")
        read_available(0)
        text = output.decode("utf-8", errors="replace")
        if supported:
            check(NOTICE not in text, "Supported runtime showed an upgrade notice")
            settings = json.loads((work / "settings.json").read_text())
            check(settings["lines"][0][0].get("rawValue") is True, "TUI did not save the widget edit")
        else:
            check(GUIDE in text, "Interactive upgrade guide URL is missing")
            check("Main Menu" not in text, "Unsupported runtime loaded the TUI")
    finally:
        (work / "interactive.ansi").write_bytes(output)
        if process.poll() is None:
            subprocess.run(["docker", "rm", "-f", name], capture_output=True)
            process.kill()
            process.wait()
        os.close(master)


def test_image(image, package, output_dir, version):
    work = output_dir / image.replace(":", "-").replace("/", "-")
    work.mkdir()
    shutil.copyfile(package, work / "package.tgz")
    settings = {"version": 4, "lines": [[{"id": "model", "type": "model", "color": "cyan"}]], "colorLevel": 0}
    (work / "settings.json").write_text(json.dumps(settings))
    original_settings = (work / "settings.json").read_bytes()
    payload = json.dumps({
        "model": {"id": "claude-opus-4-6", "display_name": "Opus 4.6"},
        "cwd": "/work", "workspace": {"current_dir": "/work"},
        "transcript_path": "/work/missing.jsonl",
    })
    pulled = subprocess.run(["docker", "pull", image], text=True, capture_output=True, timeout=180)
    (work / "pull.log").write_text(pulled.stdout + pulled.stderr)
    check(pulled.returncode == 0, "Could not pull " + image + ": " + pulled.stderr)
    runtime = run(image, work, "runtime", ["node", "-p", "process.versions.node + '/' + process.arch"]).stdout.strip()
    supported = int(runtime.split(".")[0]) >= 22
    run(image, work, "install", [
        "npm", "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund",
        "--package-lock=false", "--prefix", "/work/install", "/work/package.tgz",
    ])
    installed_version = run(image, work, "version", [ENTRY, "--version"])
    check(installed_version.stdout.strip() == version, "Incorrect packaged version")
    check(not installed_version.stderr, "Version command wrote to stderr")
    rendered = run(image, work, "render", [ENTRY, "--config", "/work/settings.json"], payload)
    check(not rendered.stderr, "Render wrote to stderr: " + rendered.stderr)
    if supported:
        check("Model: Opus 4.6" in rendered.stdout.replace("\u00a0", " "), "Normal model rendering is missing")
        check(NOTICE not in rendered.stdout, "Supported runtime showed an upgrade notice")
    else:
        check(NOTICE in rendered.stdout, "Status-line upgrade notice is missing")
        check("\x1b]8;;" + GUIDE + "\x1b\\" in rendered.stdout, "Clickable upgrade guide is missing")
        check(runtime.split("/")[0] in rendered.stdout, "Detected Node version is missing")
        for label, arguments in [
            ("hook", ["--hook"]),
            ("refresh", ["--internal-refresh-git-review-cache", "/work", "metadata", "/work/lock"]),
        ]:
            result = run(image, work, label, [ENTRY] + arguments, "{}")
            check(not result.stdout and not result.stderr, label + " must remain silent")
        # Prove the unsupported-runtime path never needs any modern bundle.
        # npm-created files may be root-owned on Linux Docker hosts, so change
        # them inside the container rather than relying on host permissions.
        run(image, work, "remove-chunks", ["node", "-e", """
            var fs = require('fs');
            var dist = '/work/install/node_modules/ccstatusline/dist/';
            fs.readdirSync(dist).forEach(function (name) {
                if (name.endsWith('.js') && name !== 'ccstatusline.js') {
                    fs.renameSync(dist + name, dist + name + '.disabled');
                }
            });
        """])
        result = run(image, work, "without-bundle", [ENTRY], payload)
        check(NOTICE in result.stdout and not result.stderr, "Fallback depends on the application bundle")
    interactive_test(image, work, supported)
    if supported:
        after = run(image, work, "render-after-save", [ENTRY, "--config", "/work/settings.json"], payload)
        check("Opus 4.6" in after.stdout.replace("\u00a0", " ") and "Model:" not in after.stdout, "Saved setting was not reloaded")
        check(not after.stderr, "Render after save wrote to stderr")
    else:
        check((work / "settings.json").read_bytes() == original_settings, "Fallback modified user settings")
        check(not (work / "claude").exists(), "Fallback wrote Claude settings")
    return {"image": image, "runtime": runtime, "mode": "full" if supported else "upgrade", "result": "passed"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path, help="Tarball created by npm pack")
    parser.add_argument("images", nargs="*", help="Docker image tags; defaults to the full Node matrix")
    parser.add_argument("--output-dir", type=Path, help="Directory for logs (defaults to a new temporary directory)")
    args = parser.parse_args()
    package = args.package.resolve()
    output_dir = (args.output_dir or Path(tempfile.mkdtemp(prefix="ccstatusline-runtimes-"))).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(package) as archive:
        version = json.load(archive.extractfile("package/package.json"))["version"]
    results = []
    print("Logs: " + str(output_dir), flush=True)
    for image in args.images or IMAGES:
        try:
            result = test_image(image, package, output_dir, version)
        except Exception as error:
            result = {"image": image, "result": "failed", "error": str(error)}
        results.append(result)
        print(json.dumps(result), flush=True)
        (output_dir / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    return 1 if any(result["result"] != "passed" for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
