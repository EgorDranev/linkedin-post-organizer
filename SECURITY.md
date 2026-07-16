# Security Policy

## Reporting a vulnerability

Please **do not open a public GitHub issue** for vulnerabilities involving:

- Authentication or session handling (email magic links, Clerk integration).
- Data isolation between accounts (reading, editing, deleting, exporting, or
  capturing into another user's library).
- Extension pairing tokens or capture credentials.

Instead, report privately through GitHub's security-advisory form for this
repository:

**<https://github.com/EgorDranev/linkedin-post-organizer/security/advisories/new>**

Include reproduction steps and the impact you observed. You will get a response
in the advisory thread, and a fix will be prioritized before any public
disclosure.

For non-sensitive bugs (UI glitches, capture selector breakage, build issues),
a normal issue at <https://github.com/EgorDranev/linkedin-post-organizer/issues> is the
right place.
