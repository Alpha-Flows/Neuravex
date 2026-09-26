# Releasing Neuravex

A release is a tag, `vX.Y.Z`, pushed to GitHub. From the push on, the release
workflow (`.github/workflows/release.yml`) does the checking and the packing,
and stops at a draft. This is what a maintainer does around it.

Neuravex had no release at all for its first months, and the first list of
what one needed found the version written in three places that disagreed, a
clone URL that said `YOUR_USERNAME`, and a launcher that had never been
started from an empty folder by anyone but its author. Each step below is
there because of one of those.

## Before the tag

1. **Start from an up-to-date `main`.**

   ```bash
   git switch main && git pull
   ```

2. **Choose the version.** Neuravex follows [Semantic
   Versioning](https://semver.org/spec/v2.0.0.html). Before 1.0, a new minor
   version (`0.2.0`) carries new features and anything a customer has to do
   something about when updating; a patch (`0.1.1`) carries fixes only.

3. **Set it,** in `package.json` and `package-lock.json` together:

   ```bash
   npm version X.Y.Z --no-git-tag-version
   ```

   The launchers, the MCP server, `/api/health` and the dashboard footer all
   read it from there.

4. **Write the changelog.** In `CHANGELOG.md`, rename `## [Unreleased]` to
   `## [X.Y.Z] - YYYY-MM-DD`, dated the day you will tag; put a new, empty
   `## [Unreleased]` above it; and add the version's link reference at the
   foot beside the others. That section becomes the release notes word for
   word, so read it as a customer would.

5. **Run everything.**

   ```bash
   npm run check
   ```

   Lint, the type check, the unit tests, the advisory gate, the changelog
   and version check, a production build and the browser suite, in that
   order, stopping at the first failure. `npm run check -- --quick` leaves
   out the build and the browser suite while you are still editing.

6. **Start a clean copy the way a customer will.** Pack what the tag will
   hold, unpack it somewhere empty, install it and run the smoke test:

   ```bash
   git archive --format=tar.gz --prefix=neuravex-X.Y.Z/ -o /tmp/neuravex-X.Y.Z.tar.gz HEAD
   mkdir -p /tmp/unpacked && tar -xzf /tmp/neuravex-X.Y.Z.tar.gz -C /tmp/unpacked
   cd /tmp/unpacked/neuravex-X.Y.Z && npm ci && npm run smoke
   ```

   The smoke test starts the launcher from nothing — `.env`, database, demo
   site, build — and checks that it answers, that a second copy finds the
   first, that a port another program holds is refused in words, that it
   stops cleanly, and that it says so when its server dies. It uses a
   database of its own, so it is safe to run in a working checkout too. The
   workflow runs it again on the real archive; running it here finds a
   problem before the tag is public. A machine that has never had Neuravex
   on it is the better test, when there is one to hand.

7. **Merge the version and the changelog** through a pull request, like any
   other change, and wait for CI.

## The tag

```bash
git switch main && git pull
git tag -a vX.Y.Z -m "Neuravex X.Y.Z"
git push origin vX.Y.Z
```

The workflow then:

1. checks that the tag, `package.json` and `CHANGELOG.md` agree, and stops
   if they do not (`node scripts/release.js verify vX.Y.Z`);
2. runs all of CI against the tag: lint, types, unit tests, build, the
   browser suite, the advisory gate and the launcher smoke test;
3. packs the tag as `neuravex-X.Y.Z.tar.gz` and `.zip`, with a `SHA256SUMS`;
4. unpacks the `.tar.gz` into an empty folder, runs `npm ci` there and runs
   the smoke test against it;
5. drafts a GitHub release with the three files attached and the changelog
   section as its notes.

Nothing is published by the workflow.

## After the workflow

1. Open the draft on the repository's Releases page. Read the notes; check
   that the three files are attached.
2. Publish it.
3. Follow `INSTALL.md` from the published archive, on a machine that has not
   had Neuravex on it, as far as opening a page in the editor.

## When something fails

A failure anywhere before "Draft the release" leaves nothing public except
the tag. Fix the cause on `main`, delete the tag and tag again:

```bash
git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z
```

Once a release has been **published**, never move or delete its tag:
someone may have installed it. Release the fix as the next patch version.

## Not covered by any of this

`docs/LAUNCH_CHECKLIST.md` lists what is still open before a first release.
One Blocker is no tool's to close: the German legal texts have to be read by
a qualified person, and the date and scope of that review recorded.
