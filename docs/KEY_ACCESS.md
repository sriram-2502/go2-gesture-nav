# Private AES-key access for a public repository

Keep code and student instructions public. Keep the lab robot's AES key in a
separate access-controlled location. Everyone can clone a public repository;
adding collaborators does not make selected files or branches private.

## Recommended lab arrangement

1. Publish this repository with placeholders and the hidden-input setup instructions.
2. Create a separate **private** repository, for example `go2-lab-access`, in the
   lab's GitHub organization, or use a lab-managed password-manager group.
3. Give approved students access to that private resource. In an organization,
   a student team can manage membership separately from public code write access.
4. Store the robot-to-key mapping and onboarding instructions there. Keep Unitree
   account passwords and cloud tokens out of student onboarding material.
5. Students obtain their assigned robot key and enter it into the local terminal
   as described in [the WebRTC guide](../webrtc/README.md). Neither public Python
   script contains the key.

The private repository option is straightforward for a small trusted cohort, but
clones retain the key in their history. A password manager avoids putting the key
in Git history and is preferable if the lab already has one. Removing a student's
access cannot erase a key they previously copied. When necessary, investigate
Unitree-supported key rotation/reprovisioning; rotation has not been verified here.

No remote repository, password-manager entry, or GitHub permission has been created
by this local reorganization. The repository name above is a suggestion.

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

The `unitree_ui` integration is still being designed. Do not embed the lab key in
JavaScript, static configuration, or a downloadable frontend bundle. A frontend
user can inspect values sent to their browser. Decide whether approved operators
will supply their own key locally or use an authenticated lab service before
building shared dashboard access.

## References

- [GitHub repository visibility](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories#about-repository-visibility)
- [GitHub secret types and their scopes](https://docs.github.com/en/code-security/reference/secret-security/secret-types)
