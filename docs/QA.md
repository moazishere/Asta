# Manual QA checklist

Run this on a **real Android phone and a real iPhone** before sharing a build. Tick each box per platform. Use two accounts (A and B) on two devices where noted. Simulators cannot test GPS, push or background behaviour.

| # | Check | Android | iPhone |
| --- | --- | :-: | :-: |
| | **Account** | | |
| 1 | Sign up with email and password, finish onboarding (username, body details, calorie goal) | ☐ | ☐ |
| 2 | Sign out returns to the welcome screen; sign back in | ☐ | ☐ |
| 3 | Sign in with Google (against the deployed server) | ☐ | ☐ |
| 4 | Kill the app and reopen: still signed in | ☐ | ☐ |
| 5 | Turn on airplane mode, reopen: a "can't reach the server" screen with Retry, not a crash or sign-out | ☐ | ☐ |
| | **Running** | | |
| 6 | Run tab asks for location, then (before the first run) explains "always" access | ☐ | ☐ |
| 7 | Start a run outdoors: distance, time, pace and the map route update | ☐ | ☐ |
| 8 | Lock the screen, put the phone in a pocket for 20 minutes while walking: the route and distance are correct afterwards | ☐ | ☐ |
| 9 | Pause and resume: time stops while paused; no straight line is drawn across the pause | ☐ | ☐ |
| 10 | Force-quit the app mid-run, reopen: "Unfinished run" offers Resume and Save | ☐ | ☐ |
| 11 | Finish a run in airplane mode: summary says "waiting to upload"; turn the network on, it becomes "Saved" | ☐ | ☐ |
| 12 | A run faster than a running pace (cycle or drive briefly) is flagged and does not count in challenges | ☐ | ☐ |
| 13 | Android only: a persistent "tracking your run" notification shows during a run; iPhone: blue status-bar indicator | ☐ | ☐ |
| | **History and stats** | | |
| 14 | Home weekly total, chart and run list agree with the run detail numbers | ☐ | ☐ |
| 15 | Run detail shows splits, route and calories; delete asks for confirmation and totals update | ☐ | ☐ |
| | **Food** | | |
| 16 | Search "hummus" and "حمص"; add 60 g to lunch; ring and totals update instantly | ☐ | ☐ |
| 17 | Create a custom food, quick-add calories, edit an amount, delete an entry; day total is always the sum of the rows | ☐ | ☐ |
| 18 | Switch to yesterday and back with the arrows | ☐ | ☐ |
| | **Friends** (A + B) | | |
| 19 | A finds B by exact username and sends a request; B's badge appears within seconds without refreshing | ☐ | ☐ |
| 20 | B accepts; both see each other with weekly distance; B opens A's profile and sees runs with a trimmed route | ☐ | ☐ |
| 21 | Share invite link from A, open it on B's phone: page opens the app (development/release build) | ☐ | ☐ |
| 22 | B blocks A: A can no longer find B; unblock works | ☐ | ☐ |
| | **Challenges** (A + B) | | |
| 23 | A creates a distance challenge starting now and invites B; B sees the invitation and joins | ☐ | ☐ |
| 24 | B finishes a run: A's leaderboard changes live, without pull-to-refresh | ☐ | ☐ |
| 25 | Ties: both at the same value, the one who got there first ranks higher | ☐ | ☐ |
| 26 | When the challenge ends, the winner is shown (set a 1-hour challenge or end it in the database) | ☐ | ☐ |
| 27 | Neither user can see the other's food or calories anywhere | ☐ | ☐ |
| | **Notifications** (release/development build) | | |
| 28 | The "Stay in the loop" prompt appears once, then the system permission dialog | ☐ | ☐ |
| 29 | A friend request, a challenge invitation, "X passed you" and "challenge ended" each arrive as a push, and tapping opens the right screen | ☐ | ☐ |
| 30 | Profile > Notifications: switching a type off stops that push | ☐ | ☐ |
| 31 | Sign out, then trigger a push for that account: the phone receives nothing | ☐ | ☐ |
| | **Polish and devices** | | |
| 32 | Small phone (e.g. iPhone SE): the active-run screen shows the controls without scrolling | ☐ | ☐ |
| 33 | Large phone and tablet-size font settings (Settings > Display > Font size): no text is cut off | ☐ | ☐ |
| 34 | Screen reader (TalkBack / VoiceOver): tabs, buttons, run controls and the leaderboard are announced sensibly | ☐ | ☐ |
| 35 | Keyboard never hides the field being typed in (sign-up, onboarding, add food) | ☐ | ☐ |
| 36 | iPhone on iOS 26: the tab bar is Liquid Glass and shrinks while scrolling | n/a | ☐ |
| 37 | A 30-minute run drains a reasonable amount of battery (note the percentage: ________) | ☐ | ☐ |
