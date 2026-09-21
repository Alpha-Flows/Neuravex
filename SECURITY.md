# Security

## Reporting something

Please report anything you find privately, before writing about it in public,
so there is a fixed version for people to move to.

- **GitHub:** open a draft advisory at
  <https://github.com/Alpha-Flows/neuravex/security/advisories/new>. This is
  private to you and the maintainers.
- If that is not available to you, open an issue saying only that you have
  found something and how to reach you — no details — and we will take it from
  there.

Please include what you did, what happened, which version you were on
(`package.json`), and how you were running it (desktop launcher, `npm start`,
Docker, behind a proxy). A proof of concept is welcome. Nothing is expected of
you in return, and there is no bounty.

We aim to acknowledge a report within three working days and to have either a
fix or an explanation of why it is not one within two weeks.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| Anything older | No |

Neuravex is a single-tenant application that people run on their own machines.
There is no update channel: a fix means a new tag to pull.

## The threat model, stated plainly

**There is no sign-in, and that is on purpose.** Neuravex is designed to be
reached from one browser on one machine — the owner's. It does not
authenticate, authorise or audit, and it does not distinguish one user from
another. Everything below follows from that:

- **The port is the boundary.** Anyone who can open
  `http://<host>:<port>/` can read, change, export and delete every site on
  that installation, and read every form submission visitors have sent. By
  default the server therefore binds `127.0.0.1` only. Setting `HOST` to
  anything else removes the only access control there is; the launcher says so
  in capitals when you do.
- **A reverse proxy is where access control goes.** If the builder is reachable
  over a network, the proxy has to authenticate it. `INSTALL.md` has a worked
  example. Exposing `/api/` past that authentication re-opens everything.
- **Content authors are trusted; content is not.** Anything that arrives
  through an imported archive, the MCP server or a paste is treated as hostile
  input: it is validated, sanitised and size-limited. Reports of a way past
  those are in scope.
- **An MCP client is as trusted as whatever it is reading.** The MCP server can
  create, rewrite, publish and delete sites. Text stored in a site is returned
  to the agent as data, but an agent that follows instructions it reads can be
  steered by a site somebody else wrote. Do not point an agent at this server
  and at untrusted material in the same session.

## In scope

Sanitiser bypasses (HTML, CSS, SVG), anything that gets past the Origin or
`Host` checks, path traversal, a way to make the server fetch or execute
something the operator did not ask for, denial of service from a single
ordinary request, and anything that leaks one installation's data to another
origin.

## Not in scope

The absence of authentication (see above), anything that requires a wider
`HOST` than the default, anything that requires local filesystem write access
the owner has already granted, and findings that assume the operator has
published the builder without a proxy that authenticates it.

## Where the known state is written down

`docs/SECURITY_REVIEW.md` is a full review of this codebase, with every
finding, how it was confirmed and what was done about it. `CHANGELOG.md`
records which release carries which fix.
