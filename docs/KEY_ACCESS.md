# Private AES-key access for a public repository

Keep code and student instructions public. Keep the lab robot's AES key in a
separate access-controlled location. Everyone can clone a public repository;
adding collaborators does not make selected files or branches private.

## Recommended lab arrangement

1. Publish this repository with placeholders and the hidden-input setup instructions.
2. Use an institution-approved shared password vault for active robot secrets.
   Proton Pass migration is planned for this lab; the shared vault is not yet live.
3. Until migration, request the assigned robot's credentials privately from the
   instructor or maintainer. Public repository access does not grant robot access.
4. Store the robot-to-key mapping in the private inventory, then the vault. A
   private Git repository may hold access procedures and vault links, but keep
   plaintext secrets out of Git history. Keep account passwords and cloud tokens
   out of student onboarding material.
5. Students obtain their assigned robot key and enter it into the local terminal
   as described in [the WebRTC guide](CONNECTION.md). Neither public Python
   script contains the key.

Git clones retain committed keys in their history, even in a private repository.
A password manager avoids that form of secret distribution. Removing a student's
access cannot erase a key they previously copied. When necessary, investigate
Unitree-supported key rotation/reprovisioning; rotation has not been verified here.

The present setup uses an ignored local credentials inventory. This public guide
does not create a shared vault, distribute a key, or change GitHub permissions.

## Why not GitHub Actions secrets?

Actions secrets are available to workflow jobs; they are not distributed into a
student's local shell by cloning a repository. Do not build a workflow that prints
or uploads the AES key so students can download it. Codespaces secrets are a
different feature and apply inside Codespaces, not the local Windows terminal.
The current robot workflow runs on a laptop connected to the Go2 hotspot.

## Local files and the existing key

The original key-bearing README was preserved as
`private/README_webrtc_original.md` on the maintainer's machine. `private/`,
`archived/`, ZIP files, and `.env` files are ignored. Ignore rules prevent ordinary
Git staging; they do not encrypt files, affect already tracked files, or protect
files shared manually. These scripts do not automatically load `.env` files.

This folder had no Git repository when reorganized. Before publishing any other
copy with existing Git history, inspect that history for previously committed
keys. If a key was exposed publicly, removing it from today's README is insufficient;
contact the maintainer and investigate supported replacement with Unitree.

## Dashboard boundary

The local dashboard accepts an operator-supplied key. Do not embed the lab key in
JavaScript, static configuration, or a downloadable frontend bundle. A frontend
user can inspect values sent to their browser. The current workflow runs locally
on the authorized operator's computer; a shared hosted service would need a
separate authentication/access design. Clear cached UI keys on shared computers.

## References

- [GitHub repository visibility](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories#about-repository-visibility)
- [GitHub secret types and their scopes](https://docs.github.com/en/code-security/reference/secret-security/secret-types)
