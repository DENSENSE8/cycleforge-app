# SUPERSEDED — do not execute this handoff

**This mission shipped, and its visual half has since been reversed.**

➡️ **Read [`fields-to-notion-header-hover-HANDOFF.md`](./fields-to-notion-header-hover-HANDOFF.md) instead.**

## Why this file is a stub

The original handoff ("retire chrome Fields → table top-right lip") **landed in
full**: `GridFieldsMenu` is deleted, the trailing-cluster guard bans chrome
Fields, every grid view mounts the column-display rail, and Reset lives in that
rail. Pasting it into a fresh session would send an agent hunting for chrome
mounts that no longer exist.

The **lip** half was then reversed on product direction: a permanent top-right
lip applies `pr-9` and an absolute `w-9` track, so it reserves layout on every
grid forever to host an occasional control. The replacement is a Notion-style
**hover-revealed overlay** that reserves nothing.

The body was replaced rather than left in place because a superseded handoff that
still reads as executable is the failure mode this stub exists to prevent — the
original text is in git history if the rationale is ever needed.
