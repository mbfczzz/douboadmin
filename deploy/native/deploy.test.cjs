// Isolated deployment flow checks. No real root commands, services or network.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const windows = process.platform === "win32";
const bash =
  process.env.BASH_BIN ||
  (windows
    ? path.join(
        process.env.ProgramFiles || "C:/Program Files",
        "Git/bin/bash.exe",
      )
    : "bash");
fs.mkdirSync(path.join(root, ".runtime"), { recursive: true });
const area = fs.mkdtempSync(path.join(root, ".runtime/native-deploy-"));
const posix = windows
  ? execFileSync(bash, ["-c", 'cygpath -u "$1"', "test", area], {
      encoding: "utf8",
    }).trim()
  : area;
const source = fs.readFileSync(
  process.env.DEPLOY_TEST_SOURCE || path.join(__dirname, "deploy.sh"),
  "utf8",
);

// Pointer directories emulate symlink targets, including a missing or looped
// current link. This also works on Windows without administrator privileges.
const mocks = `
id() { echo 0; }
chown() { :; }
flock() { [[ "$SCENARIO" != locked ]]; }
curl() { [[ "$SCENARIO" != health-fail ]]; }
sleep() { :; }
ln() { printf '%s' "$2" > "$3"; }
mv() {
  mkdir -p "$3/bin"
  : > "$3/bin/doubo-api"
  command mv "$2" "$3/.target"
}
readlink() {
  if [[ -f "$2/.target" ]]; then
    target="$(cat "$2/.target")"
    [[ "$target" != "$2" ]] || return 1
    printf '%s' "$target"
  elif [[ "$1" == -f ]]; then
    printf '%s' "$2"
  else
    return 1
  fi
}
systemctl() {
  echo "$*" >> "$CASE_ROOT/calls"
  if [[ "$SCENARIO" == unloaded-units && "$1" == reset-failed ]]; then
    echo 'Unit not loaded' >&2
    return 1
  fi
  [[ ! ( "$SCENARIO" == migrate-fail && "$*" == 'start doubo-migrate' ) ]] || return 1
  [[ ! ( "$SCENARIO" == startup-fail && "$*" == 'restart doubo@serve doubo@worker' ) ]]
}
`;
fs.writeFileSync(path.join(area, "mocks.sh"), mocks);

for (const name of [
  "success",
  "custom-media",
  "first-success",
  "unloaded-units",
  "broken-current",
  "missing-env",
  "migrate-fail",
  "startup-fail",
  "health-fail",
  "locked",
  "first-fail",
]) {
  test(`native deployment: ${name}`, () => {
    const local = path.join(area, name);
    const base = `${posix}/${name}`;
    const release = `${base}/releases/new`;
    const previous = `${base}/app/releases/old`;
    function write(file, body = "fixture") {
      const target = path.join(local, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
    const script = source
      .replaceAll("/opt/doubo", `${base}/app`)
      .replaceAll("/srv/doubo", `${base}/releases`)
      .replaceAll("/etc/doubo", `${base}/etc/doubo`)
      .replaceAll("/etc/systemd/system", `${base}/etc/systemd/system`);
    write("releases/new/deploy/native/deploy.sh", script);
    for (const file of [
      "bin/doubo-api",
      "web/index.html",
      "web/assets/new.js",
      "REVISION",
      "media/design/icon.png",
      "media/model-icons/model.png",
      "media/brand/doubo.png",
      "deploy/native/doubo@.service",
      "deploy/native/doubo-migrate.service",
      "deploy/native/doubo.env.example",
    ])
      write(`releases/new/${file}`);
    write("app/shared/web/assets/old.js", "keep");
    write("app/shared/media/uploads/private.txt", "keep-private");
    fs.mkdirSync(path.join(local, "etc/systemd/system"), { recursive: true });
    const noPrevious = [
      "first-success",
      "unloaded-units",
      "first-fail",
    ].includes(name);
    if (!noPrevious) {
      write("app/releases/old/bin/doubo-api");
      write("app/current/bin/doubo-api");
      write(
        "app/current/.target",
        name === "broken-current" ? `${base}/app/current` : previous,
      );
    }
    if (name !== "missing-env")
      write(
        "etc/doubo/doubo.env",
        name === "custom-media"
          ? `ADMIN_PASSWORD=fixture-only\nMEDIA_DIR="${base}/srv-media"\r\n`
          : "ADMIN_PASSWORD=fixture-only",
      );
    const scenario = ["first-fail"].includes(name)
      ? "health-fail"
      : name === "custom-media"
        ? "success"
        : name;
    const run = spawnSync(bash, [`${release}/deploy/native/deploy.sh`], {
      encoding: "utf8",
      timeout: 20000,
      env: {
        ...process.env,
        BASH_ENV: `${posix}/mocks.sh`,
        CASE_ROOT: base,
        SCENARIO: scenario,
      },
    });
    assert.equal(run.error, undefined);
    const callFile = path.join(local, "calls");
    const calls = fs.existsSync(callFile)
      ? fs.readFileSync(callFile, "utf8")
      : "";
    const targetFile = path.join(local, "app/current/.target");
    if (
      [
        "success",
        "custom-media",
        "first-success",
        "unloaded-units",
        "broken-current",
      ].includes(name)
    ) {
      assert.equal(run.status, 0, run.stdout + run.stderr);
      // Built-in icons follow MEDIA_DIR so the API can serve them.
      const icons = name === "custom-media" ? "srv-media" : "app/shared/media";
      assert.ok(
        fs.existsSync(path.join(local, icons, "model-icons/model.png")),
        "model icons copied to " + icons,
      );
      assert.ok(
        fs.existsSync(path.join(local, icons, "brand/doubo.png")),
        "project logo copied to " + icons,
      );
      assert.equal(fs.readFileSync(targetFile, "utf8"), release);
      assert.ok(
        calls.indexOf("start doubo-migrate") <
          calls.indexOf("restart doubo@serve"),
      );
    } else {
      assert.notEqual(run.status, 0);
      if (["migrate-fail", "startup-fail", "health-fail"].includes(name)) {
        assert.equal(
          fs.readFileSync(targetFile, "utf8"),
          previous,
          run.stdout + run.stderr,
        );
        assert.ok(calls.endsWith("restart doubo@serve doubo@worker\n"));
      }
      if (["missing-env", "locked"].includes(name)) assert.equal(calls, "");
      if (name === "first-fail") {
        assert.equal(fs.readFileSync(targetFile, "utf8"), release);
        assert.ok(calls.endsWith("stop doubo@serve doubo@worker\n"));
        assert.ok(!run.stderr.includes("Previous application selected"));
      }
    }
    assert.equal(
      fs.readFileSync(path.join(local, "app/shared/web/assets/old.js"), "utf8"),
      "keep",
    );
    assert.equal(
      fs.readFileSync(
        path.join(local, "app/shared/media/uploads/private.txt"),
        "utf8",
      ),
      "keep-private",
    );
  });
}
