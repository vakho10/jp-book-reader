---
description: Align one chapter of a book (Japanese ↔ English sentences) and build the book file
argument-hint: <book-id> <chapter-number>
---

Align chapter $2 of book `$1`, following `docs/adding-a-book.md` §2–4 exactly.

1. Run `npm run extract -- $1 $2`. Confirm the titles and paragraph counts look sane. If the
   chapter isn't in `books/$1/book.json`, stop and say so.
2. Read `work/$1/chNN.jp.txt` and `work/$1/chNN.en.txt` in full (NN = $2, zero-padded).
3. Write `books/$1/align/chNN.txt`: one group per line, every J and E id once, in order,
   with the smallest true groups. Keep the header comments.
4. Run `npm run check -- $1 $2`. Review **every** flagged group against the two dumps. Fix
   real misalignments, and leave free translations. Repeat until only free translations remain.
5. Run `npm run book -- $1` and confirm it succeeds.
6. Report in a few lines: group count, how many 1:1 vs merged groups, any `= -` groups and
   why, and what `check` still flags (by id only).

Never quote book sentences in your report. Use ids.
