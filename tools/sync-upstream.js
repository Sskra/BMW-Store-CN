// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/**
 * Pulls cauliflowermossgrape/idrive7-apps's apps and build system into this
 * repository, keeps this repository's own two changes, and reports what
 * moved. Run by .github/workflows/sync-upstream.yml; runnable by hand:
 *
 *   node tools/sync-upstream.js                 apply (needs the tarball)
 *   node tools/sync-upstream.js --dry-run       list, change nothing
 *
 * What comes over: apps/* (every app the upstream has, new ones included) and
 * kit/*. What stays ours:
 *
 *   1. kit/tools/localize.py  package_version keeps app.json's version for a
 *      language build. The Store's repo-tree build wants
 *      <id>@<entry.version>.tgz in MGU_OUT (native/mgu-updater/js/build.js),
 *      and entry.version is app.json's, so the upstream's -<lang>.<rev> name
 *      is a build that never installs.
 *   2. mgu-repo.json  builds every app with --language zh-CN, and names the
 *      renderd and input gate the apps install beside themselves.
 *
 * The apps' sources are the upstream's as they are: --language zh-CN has
 * localize.py rewrite titles, buttons and settings from kit's word list at
 * build time, so a translated app.json here would only drift from theirs.
 *
 * A file that came over and that this repository had changed otherwise is
 * reported, not silently overwritten: run with --keep to leave it alone.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPO = 'cauliflowermossgrape/idrive7-apps';
const BRANCH = 'main';
const TMP = path.join(ROOT, '.sync-upstream');

/* The files this repository owns outright: copied over the upstream's after
 * the merge, always. Neither exists upstream: localize.py's package_version is
 * this repository's fix (a language build keeps app.json's version, or the
 * repo-tree build names a tarball the Store never installs), and mgu-repo.json
 * is where --language zh-CN comes from. Everything else is the upstream's as
 * it is - the Chinese comes out of the build, not out of edited sources. */
const KEEP = ['kit/tools/localize.py', 'mgu-repo.json'];

/* The upstream's, taken as they are. */
const TREES = ['apps', 'kit'];

/* Apps this repository has and the upstream does not: theirs stays entirely
 * ours, so the walk skips the folder. Empty: every app here comes from the
 * upstream. */
const OWN_APPS = [];

function log(msg) {
    process.stdout.write(msg + '\n');
}

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'user-agent': 'bmw-store-cn-sync' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return fetch(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`${url}: HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

/* A tar of the upstream at its branch head, unpacked under TMP. git archive
 * is not available for a remote, and a shallow clone of the whole history is
 * slower than the tarball for this. */
async function unpack() {
    fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(TMP, { recursive: true });
    const url = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`;
    log(`fetching ${url}`);
    const gz = await fetch(url);
    const tar = zlib.gunzipSync(gz);
    writeTar(tar, TMP);
    const dirs = fs.readdirSync(TMP).filter((n) => fs.statSync(path.join(TMP, n)).isDirectory());
    if (dirs.length !== 1) {
        throw new Error(`the tarball holds ${dirs.length} top folders, not one`);
    }
    return path.join(TMP, dirs[0]);
}

/* Enough of tar for a GitHub codeload archive: ustar, regular files and
 * folders, no long names (GitHub stays under 100 bytes) and no links in the
 * paths this script reads. */
function writeTar(buf, into) {
    let off = 0;
    while (off + 512 <= buf.length) {
        const header = buf.slice(off, off + 512);
        if (header.every((b) => b === 0)) {
            break;
        }
        const name = header.slice(0, 100).toString('utf8').replace(/\0.*$/, '');
        const prefix = header.slice(345, 500).toString('utf8').replace(/\0.*$/, '');
        const sizeField = header.slice(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
        const size = parseInt(sizeField, 8) || 0;
        const type = String.fromCharCode(header[156] || 48);
        const full = prefix ? `${prefix}/${name}` : name;
        off += 512;
        if (type === '0' || type === '\0' || type === '0') {
            const target = path.join(into, full);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, buf.slice(off, off + size));
        } else if (type === '5') {
            fs.mkdirSync(path.join(into, full), { recursive: true });
        }
        off += Math.ceil(size / 512) * 512;
    }
}

/* Every file of a tree, as paths relative to it, minus the apps this
 * repository has and the upstream does not. */
function walk(dir, base = dir, out = []) {
    if (!fs.existsSync(dir)) {
        return out;
    }
    for (const name of fs.readdirSync(dir).sort()) {
        const p = path.join(dir, name);
        const rel = path.relative(base, p).split(path.sep).join('/');
        if (/^apps\/[^/]+$/.test(rel) && OWN_APPS.indexOf(name) >= 0) {
            continue;
        }
        const st = fs.statSync(p);
        if (st.isDirectory()) {
            walk(p, base, out);
        } else if (st.isFile()) {
            out.push(rel);
        }
    }
    return out;
}

function same(a, b) {
    if (!fs.existsSync(a) || !fs.existsSync(b)) {
        return false;
    }
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    if (sa.size !== sb.size) {
        return false;
    }
    return fs.readFileSync(a).equals(fs.readFileSync(b));
}

/* Whether a repo path is inside an app the upstream does not have. */
function isOwnApp(rel) {
    return OWN_APPS.some((id) => rel === `apps/${id}` || rel.startsWith(`apps/${id}/`));
}

async function main() {
    const dry = process.argv.indexOf('--dry-run') >= 0;
    const keep = process.argv.indexOf('--keep') >= 0;
    const keepSet = new Set(KEEP);

    const src = await unpack();
    const ours = [];
    const added = [];
    const changed = [];
    const conflicts = [];
    const gone = [];

    for (const tree of TREES) {
        const theirs = walk(path.join(src, tree));
        const mine = walk(path.join(ROOT, tree));
        const theirSet = new Set(theirs.map((r) => `${tree}/${r}`));
        for (const rel of theirs) {
            const full = `${tree}/${rel}`;
            if (keepSet.has(full)) {
                continue;
            }
            const from = path.join(src, tree, rel);
            const to = path.join(ROOT, tree, rel);
            if (!fs.existsSync(to)) {
                added.push(full);
            } else if (!same(from, to)) {
                changed.push(full);
            } else {
                continue;
            }
            ours.push([from, to]);
        }
        for (const rel of mine) {
            const full = `${tree}/${rel}`;
            if (!theirSet.has(full) && !keepSet.has(full) && !isOwnApp(full)) {
                gone.push(full);
            }
        }
    }

    log(`upstream: ${added.length} new, ${changed.length} changed, ${gone.length} only here`);
    added.forEach((f) => log(`  + ${f}`));
    changed.forEach((f) => log(`  ~ ${f}`));
    gone.forEach((f) => log(`  - ${f} (kept: this repository only)`));

    if (keepSet.size) {
        log('kept as they are here: ' + KEEP.join(', '));
    }

    if (dry) {
        log('\n--dry-run: nothing written');
        return 0;
    }

    for (const [from, to] of ours) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
    }
    log(`\ncopied ${ours.length} files`);

    /* A changed path is one this repository also edited: say so and stop,
     * unless --keep was given, so a merge never loses a local fix quietly. */
    if (changed.length && !keep) {
        log('\nthose files changed here and upstream: review them, or run with --keep to take the upstream\'s');
        return 2;
    }
    fs.rmSync(TMP, { recursive: true, force: true });
    return 0;
}

main().then((code) => {
    process.exitCode = code;
}, (err) => {
    log(`sync-upstream: ${err && err.message}`);
    process.exitCode = 1;
});
